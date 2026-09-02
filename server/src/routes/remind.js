import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { todayStr } from '../utils.js';
import { rateLimit } from '../rateLimit.js';

const router = Router();

// 测试发送限流：按用户每天最多 5 次，防刷库/压制真实提醒
const testLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 5,
  message: '测试发送过于频繁，请明天再试'
});

// 严格布尔解析：兼容 true/1/'1'/'true'，字符串 'false' 视为关闭
function parseBool(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}

// 当前到期待复习错题数（真实数据）
export function getDueCount(uid) {
  const today = todayStr();
  const row = db.prepare(`
    SELECT COUNT(*) AS c FROM review_schedule rs
    WHERE rs.user_id = ? AND rs.next_due <= ? AND NOT EXISTS (
      SELECT 1 FROM wrong_mastered wm WHERE wm.user_id = rs.user_id AND wm.question_id = rs.question_id
    )
  `).get(uid, today);
  return row.c || 0;
}

// 生成真实提醒内容
export function buildReminderContent(uid, due) {
  const user = db.prepare('SELECT nickname FROM users WHERE id = ?').get(uid);
  const name = user?.nickname || '同学';
  return `【云南春招学习提醒】${name}，你有 ${due} 道错题到了复习时间。及时复习记得更牢，点击前往：${config.baseUrl}/review`;
}

// 记录一条提醒
export function logReminder(uid, type, content) {
  const info = db.prepare('INSERT INTO reminder_logs (user_id, type, content) VALUES (?,?,?)').run(uid, type, content);
  return Number(info.lastInsertRowid);
}

// 获取提醒设置
router.get('/remind/settings', requireAuth, (req, res) => {
  const p = db.prepare('SELECT email, remind_email, remind_sms, remind_time FROM user_profiles WHERE user_id = ?').get(req.userId);
  res.json({
    code: 0,
    data: {
      email: p?.email || '',
      remind_email: p?.remind_email ? 1 : 0,
      remind_sms: p?.remind_sms ? 1 : 0,
      remind_time: p?.remind_time || '19:00'
    }
  });
});

// 保存提醒设置
router.put('/remind/settings', requireAuth, (req, res) => {
  const { email, remind_email, remind_sms, remind_time } = req.body || {};
  const mail = String(email || '').trim();
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    return res.status(400).json({ code: 400, message: '邮箱格式不正确' });
  }
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(remind_time || '')) ? remind_time : '19:00';
  db.prepare(`INSERT INTO user_profiles (user_id, email, remind_email, remind_sms, remind_time, updated_at)
              VALUES (?,?,?,?,?,datetime('now','localtime'))
              ON CONFLICT(user_id) DO UPDATE SET
                email=excluded.email, remind_email=excluded.remind_email, remind_sms=excluded.remind_sms,
                remind_time=excluded.remind_time, updated_at=excluded.updated_at`)
    .run(req.userId, mail || null, parseBool(remind_email) ? 1 : 0, parseBool(remind_sms) ? 1 : 0, time);
  res.json({ code: 0, message: '提醒设置已保存' });
});

// 测试发送：生成真实提醒内容并记录
router.post('/remind/test', requireAuth, testLimiter, (req, res) => {
  const { channel } = req.body || {};
  if (!['email', 'sms'].includes(channel)) return res.status(400).json({ code: 400, message: '渠道不正确' });
  const p = db.prepare('SELECT email, remind_email, remind_sms FROM user_profiles WHERE user_id = ?').get(req.userId);
  const due = getDueCount(req.userId);
  const content = buildReminderContent(req.userId, due);
  const id = logReminder(req.userId, channel, content);
  const target = channel === 'email' ? (p?.email || '未填写邮箱') : '手机号（短信网关未配置）';
  res.json({
    code: 0,
    data: {
      id,
      channel,
      content,
      due,
      target,
      delivered: false,
      note: '当前环境未接入真实邮件/短信网关，提醒内容已生成并记录，接入网关后即可自动发送'
    }
  });
});

// 提醒记录
router.get('/remind/logs', requireAuth, (req, res) => {
  const { limit = 20, offset = 0 } = req.query;
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const total = db.prepare('SELECT COUNT(*) AS c FROM reminder_logs WHERE user_id = ?').get(req.userId).c || 0;
  const rows = db.prepare('SELECT id, type, content, created_at FROM reminder_logs WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(req.userId, safeLimit, safeOffset);
  rows.total = total;
  rows.page = Math.floor(safeOffset / safeLimit) + 1;
  rows.pageSize = safeLimit;
  res.json({ code: 0, data: rows });
});

// 当前到期复习数量
router.get('/remind/due', requireAuth, (req, res) => {
  res.json({ code: 0, data: { dueToday: getDueCount(req.userId) } });
});

export default router;
