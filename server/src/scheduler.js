import { db } from './db.js';
import { generateWeeklySnapshot } from './routes/report.js';
import { getDueCount, buildReminderContent, logReminder } from './routes/remind.js';
import { todayStr, currentWeekRange } from './utils.js';
import { tx } from './commerce.js';

// 日志表归档策略：每月 1 日清理/归档过期数据，防止表无限增长
// - practice_records：超 3 年归档到 practice_records_archive（保留历史，主表保持轻量）
// - point_logs：超 1 年删除（余额存于 points 表，不受影响）
// - ai_usage：超 90 天删除（仅当日配额生效）
// - reminder_logs / ai_analysis：超 180 天删除
function cleanupOldData() {
  const now = new Date();
  if (now.getDate() !== 1) return;
  try {
    // 归档 INSERT 与 DELETE 放在同一事务内，且用 INSERT OR IGNORE 防主键冲突，
    // 避免崩溃后归档永久卡死
    tx(() => {
      const archived = db.prepare(`
        INSERT OR IGNORE INTO practice_records_archive (id, user_id, question_id, answer, is_correct, session_id, created_at)
        SELECT id, user_id, question_id, answer, is_correct, session_id, created_at
        FROM practice_records WHERE date(created_at) < date('now','localtime','-1095 days')
      `).run();
      if (archived.changes > 0) {
        db.prepare(`DELETE FROM practice_records WHERE date(created_at) < date('now','localtime','-1095 days')`).run();
        console.log(`[cleanup] practice_records 归档 ${archived.changes} 条`);
      }
    });
    const pointLogs = db.prepare(`DELETE FROM point_logs WHERE date(created_at) < date('now','localtime','-365 days')`).run();
    if (pointLogs.changes) console.log(`[cleanup] point_logs 清理 ${pointLogs.changes} 条`);
    const aiUsage = db.prepare(`DELETE FROM ai_usage WHERE date < date('now','localtime','-90 days')`).run();
    if (aiUsage.changes) console.log(`[cleanup] ai_usage 清理 ${aiUsage.changes} 条`);
    const remindLogs = db.prepare(`DELETE FROM reminder_logs WHERE date(created_at) < date('now','localtime','-180 days')`).run();
    if (remindLogs.changes) console.log(`[cleanup] reminder_logs 清理 ${remindLogs.changes} 条`);
    const aiAnalysis = db.prepare(`DELETE FROM ai_analysis WHERE date(created_at) < date('now','localtime','-180 days')`).run();
    if (aiAnalysis.changes) console.log(`[cleanup] ai_analysis 清理 ${aiAnalysis.changes} 条`);
  } catch (e) {
    console.error('[cleanup] 归档失败:', e.message);
  }
}

// 到期复习提醒：在用户设定的提醒时间后 1 小时内，为有到期错题且开启提醒的用户生成提醒（每天一次）
function checkReminders() {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const today = todayStr();
  const users = db.prepare(`
    SELECT user_id, email, remind_email, remind_sms, remind_time FROM user_profiles
    WHERE (remind_email = 1 OR remind_sms = 1) AND remind_time IS NOT NULL
  `).all();

  let count = 0;
  for (const u of users) {
    const [h, m] = String(u.remind_time || '19:00').split(':').map(Number);
    const target = (h || 19) * 60 + (m || 0);
    if (cur < target || cur > target + 60) continue;

    const already = db.prepare(
      'SELECT COUNT(*) AS c FROM reminder_logs WHERE user_id = ? AND date(created_at) = ?'
    ).get(u.user_id, today).c || 0;
    if (already > 0) continue;

    const due = getDueCount(u.user_id);
    if (due <= 0) continue;

    const content = buildReminderContent(u.user_id, due);
    if (u.remind_email) logReminder(u.user_id, 'email', content);
    if (u.remind_sms) logReminder(u.user_id, 'sms', content);
    count++;
    console.log(`[scheduler] 已生成复习提醒 user=${u.user_id} due=${due} 渠道=${u.remind_email ? '邮件' : ''}${u.remind_sms ? '短信' : ''}`);
  }
  if (count) console.log(`[scheduler] 本轮共生成 ${count} 位用户的复习提醒`);
}

// 每周日 22 点后自动为本周有学习记录的用户生成周报快照
const timers = [];
export function startScheduler() {
  const check = () => {
    const now = new Date();
    const isSundayNight = now.getDay() === 0 && now.getHours() >= 22;
    if (!isSundayNight) return;

    const { weekStart, weekEnd } = currentWeekRange();
    const users = db.prepare(`
      SELECT DISTINCT user_id FROM practice_records WHERE date(created_at) >= ? AND date(created_at) <= ?
      UNION SELECT DISTINCT user_id FROM checkins WHERE date >= ? AND date <= ?
    `).all(weekStart, weekEnd, weekStart, weekEnd);

    let count = 0;
    for (const u of users) {
      try {
        generateWeeklySnapshot(u.user_id, weekStart, weekEnd);
        count++;
      } catch (e) {
        console.error('[scheduler] 周报生成失败 user=' + u.user_id, e.message);
      }
    }
    console.log(`[scheduler] 已自动生成 ${count} 份周报（${weekStart} ~ ${weekEnd}）`);
  };

  check();
  timers.push(setInterval(check, 60 * 60 * 1000));
  checkReminders();
  timers.push(setInterval(checkReminders, 30 * 60 * 1000));
  cleanupOldData();
  timers.push(setInterval(cleanupOldData, 24 * 60 * 60 * 1000));
}

// 优雅关闭时停止全部定时任务
export function stopScheduler() {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
}
