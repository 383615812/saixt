import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { todayStr } from '../utils.js';

const router = Router();

// 学情诊断：聚合练习/模考/复习数据，输出总览、科目掌握、薄弱章节、趋势与今日建议。
// 所有统计均来自 practice_records（练习与模考交卷都会回写该表）与 mock_exams / review_schedule，
// 与既有 /stats、/paper、/remind 同源但聚焦「诊断 + 行动建议」，避免重复造页面。
router.get('/diagnose', requireAuth, (req, res) => {
  const uid = req.userId;

  // —— 总览 ——
  const pc = db.prepare('SELECT COUNT(*) AS total, SUM(is_correct) AS correct FROM practice_records WHERE user_id = ?').get(uid);
  const total = pc.total || 0;
  const correct = pc.correct || 0;
  const wrong = total - correct;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;

  // —— 分科目掌握 ——
  const subjRows = db.prepare(
    `SELECT q.subject, COUNT(*) AS total, SUM(r.is_correct) AS correct
     FROM practice_records r JOIN questions q ON q.id = r.question_id
     WHERE r.user_id = ? GROUP BY q.subject`
  ).all(uid);
  const bySubject = subjRows.map(s => ({
    subject: s.subject,
    total: s.total,
    correct: s.correct || 0,
    accuracy: s.total ? Math.round((s.correct / s.total) * 100) : 0
  })).sort((a, b) => a.accuracy - b.accuracy);

  // —— 薄弱章节（做过且正确率偏低、样本量足够）——
  const chRows = db.prepare(
    `SELECT q.subject, q.chapter, COUNT(*) AS total, SUM(r.is_correct) AS correct
     FROM practice_records r JOIN questions q ON q.id = r.question_id
     WHERE r.user_id = ? AND q.chapter IS NOT NULL AND q.chapter <> ''
     GROUP BY q.subject, q.chapter`
  ).all(uid);
  const weakChapters = chRows
    .map(r => ({
      subject: r.subject,
      chapter: r.chapter,
      total: r.total,
      correct: r.correct || 0,
      accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0
    }))
    .filter(x => x.total >= 3 && x.accuracy < 65)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 12);

  // —— 近 14 天趋势 ——
  const days = 14;
  const trendRows = db.prepare(
    `SELECT date(created_at) AS d, COUNT(*) AS total, SUM(is_correct) AS correct
     FROM practice_records WHERE user_id = ? AND created_at >= date('now','localtime', ?)
     GROUP BY date(created_at)`
  ).all(uid, `-${days - 1} days`);
  const byDate = {};
  for (const r of trendRows) byDate[r.d] = { total: r.total, correct: r.correct || 0 };
  const trend = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const it = byDate[key] || { total: 0, correct: 0 };
    trend.push({ date: key, total: it.total, correct: it.correct, accuracy: it.total ? Math.round((it.correct / it.total) * 100) : 0 });
  }

  // —— 模考节奏 ——
  const examRow = db.prepare(
    `SELECT COUNT(*) AS c, MAX(submitted_at) AS lastAt FROM mock_exams WHERE user_id = ? AND status = 'submitted'`
  ).get(uid);
  const examCount = examRow.c || 0;
  let daysSinceLast = null;
  if (examRow.lastAt) {
    const t = new Date(String(examRow.lastAt).replace(' ', 'T')).getTime();
    if (Number.isFinite(t)) {
      daysSinceLast = Math.max(0, Math.floor((Date.now() - t) / 86400000));
    }
  }

  // —— 到期复习 ——
  const dueToday = db.prepare(
    `SELECT COUNT(*) AS c FROM review_schedule rs
     WHERE rs.user_id = ? AND rs.next_due <= ? AND NOT EXISTS (
       SELECT 1 FROM wrong_mastered wm WHERE wm.user_id = rs.user_id AND wm.question_id = rs.question_id
     )`
  ).get(uid, todayStr()).c || 0;

  // —— 错题本（当前待巩固 = 答错且未移出的去重题目）+ 累计移出 ——
  const wrongBookPending = db.prepare(
    `SELECT COUNT(DISTINCT q.id) AS c
     FROM practice_records r JOIN questions q ON q.id = r.question_id
     WHERE r.user_id = ? AND r.is_correct = 0
       AND NOT EXISTS (SELECT 1 FROM wrong_mastered wm WHERE wm.user_id = r.user_id AND wm.question_id = q.id)`
  ).get(uid).c || 0;
  const masteredCount = db.prepare('SELECT COUNT(*) AS c FROM wrong_mastered WHERE user_id = ?').get(uid).c || 0;

  // —— 错题冲刺（mode='sprint' 的完赛会话，与周报同口径）——
  const sprintOf = (where, args) => {
    const r = db.prepare(
      `SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS total, COALESCE(SUM(correct),0) AS correct
       FROM practice_sessions WHERE user_id = ? AND mode = 'sprint' ${where}`
    ).get(uid, ...args);
    return {
      count: r.c || 0,
      total: r.total || 0,
      correct: r.correct || 0,
      accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0
    };
  };
  const sprintAll = sprintOf('', []);
  const sprintWeek = sprintOf("AND date(created_at) >= date('now','localtime','-6 days')", []);

  // —— 近 30 天错题清除趋势 ——
  // 重建每日「待巩固错题」数量：pending(D) = 首次答错日 ≤ D 的题目数 − 其中已移出日 ≤ D 的题目数
  // （与 /practice/wrong 的「答错且未移出」口径一致；移出后再次答错也仍视为已移出）
  const WT_DAYS = 30;
  const fwRows = db.prepare(
    `SELECT question_id, MIN(date(created_at)) AS d
     FROM practice_records WHERE user_id = ? AND is_correct = 0 GROUP BY question_id`
  ).all(uid);
  const mstRows = db.prepare(
    `SELECT question_id, MIN(date(created_at)) AS d
     FROM wrong_mastered WHERE user_id = ? GROUP BY question_id`
  ).all(uid);

  const wtIndex = new Map();
  const wtSeries = [];
  for (let i = WT_DAYS - 1; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    wtIndex.set(key, wtSeries.length);
    wtSeries.push({ date: key, added: 0, mastered: 0, pending: 0 });
  }
  const wtStart = wtSeries[0].date;
  const fwSet = new Set(fwRows.map(r => r.question_id));
  let cumFW = 0;   // 窗口前已首次答错的题目数
  let cumMst = 0;  // 窗口前已移出（且曾答错）的题目数
  const addByDay = new Array(WT_DAYS).fill(0);
  const mstByDay = new Array(WT_DAYS).fill(0);
  for (const r of fwRows) {
    const idx = wtIndex.get(r.d);
    if (idx === undefined) { if (r.d < wtStart) cumFW++; continue; }
    addByDay[idx]++;
  }
  for (const r of mstRows) {
    if (!fwSet.has(r.question_id)) continue; // 无答错记录的移出不计入错题本口径
    const idx = wtIndex.get(r.d);
    if (idx === undefined) { if (r.d < wtStart) cumMst++; continue; }
    mstByDay[idx]++;
  }
  for (let i = 0; i < WT_DAYS; i++) {
    cumFW += addByDay[i];
    cumMst += mstByDay[i];
    wtSeries[i].added = addByDay[i];
    wtSeries[i].mastered = mstByDay[i];
    wtSeries[i].pending = Math.max(0, cumFW - cumMst);
  }
  const wtAdded = addByDay.reduce((a, b) => a + b, 0);
  const wtMastered = mstByDay.reduce((a, b) => a + b, 0);

  // —— 合成今日建议（按优先级排序，level: warn/info/success）——
  const suggestions = [];
  if (examCount === 0) {
    suggestions.push({ level: 'warn', text: '你还没有模考记录，先来一场套卷模考摸底自己的水平', action: { label: '去模考', to: '/mock-exam' } });
  } else if (daysSinceLast != null && daysSinceLast >= 7) {
    suggestions.push({ level: 'warn', text: `已 ${daysSinceLast} 天没模考，建议本周来一场模考检验最近的学习效果`, action: { label: '去模考', to: '/mock-exam' } });
  }
  if (weakChapters.length) {
    suggestions.push({ level: 'warn', text: `检测到 ${weakChapters.length} 个薄弱章节（正确率低于 65%），建议专项突破`, action: { label: '去专项突破', to: '/paper' } });
  }
  if (dueToday > 0) {
    suggestions.push({ level: 'info', text: `有 ${dueToday} 道错题到了复习时间，及时复习记得更牢`, action: { label: '去复习', to: '/review' } });
  }
  // 错题本待巩固较多，且近 7 天没做过冲刺 → 建议集中清除
  if (wrongBookPending >= 10 && sprintWeek.count === 0) {
    suggestions.push({
      level: 'info',
      text: `错题本还有 ${wrongBookPending} 道待巩固，来一轮「错题冲刺」连续清除更高效`,
      action: { label: '去错题冲刺', to: '/wrong-book' }
    });
  }
  // 正向建议（仅在无明显待办时鼓励）
  if (suggestions.every(s => s.level === 'success') || suggestions.length === 0) {
    if (wtMastered >= 3) {
      suggestions.push({ level: 'success', text: `近 30 天已清除 ${wtMastered} 道错题，错题本正在变薄，继续保持`, action: { label: '去错题本', to: '/wrong-book' } });
    } else if (accuracy >= 75 && total >= 20) {
      suggestions.push({ level: 'success', text: `整体正确率 ${accuracy}%，保持得不错，继续按计划推进`, action: { label: '去刷题', to: '/practice' } });
    } else if (total === 0) {
      suggestions.push({ level: 'info', text: '还没有练习数据，从在线刷题或一套模考开始吧', action: { label: '去刷题', to: '/practice' } });
    } else {
      suggestions.push({ level: 'info', text: '坚持每天练习与模考，薄弱点会越来越少', action: { label: '去刷题', to: '/practice' } });
    }
  }

  res.json({
    code: 0,
    data: {
      overall: { total, correct, wrong, accuracy },
      bySubject,
      weakChapters,
      trend,
      exam: { examCount, lastExamAt: examRow.lastAt || null, daysSinceLast },
      dueToday,
      wrongBook: { pending: wrongBookPending, mastered: masteredCount },
      wrongTrend: {
        days: WT_DAYS,
        series: wtSeries,
        added: wtAdded,
        mastered: wtMastered,
        net: wtMastered - wtAdded
      },
      sprint: { ...sprintAll, week: sprintWeek },
      suggestions
    }
  });
});

export default router;
