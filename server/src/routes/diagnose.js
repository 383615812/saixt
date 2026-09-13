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
  // 正向建议（仅在无明显待办时鼓励）
  if (suggestions.every(s => s.level === 'success') || suggestions.length === 0) {
    if (accuracy >= 75 && total >= 20) {
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
      suggestions
    }
  });
});

export default router;
