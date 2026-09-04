import { Router } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { tryConsumeAi, refundAi } from '../commerce.js';
import { callDeepSeek, isAiConfigured } from '../aiClient.js';
import { currentWeekRange } from '../utils.js';

const router = Router();
const __dir = path.dirname(fileURLToPath(import.meta.url));
const KNOW_DIR = path.resolve(__dir, '../../../data');

// 知识底座：subject(中文) -> chapter -> 考纲知识点文本（注入周报，让 AI 建议细化到具体考点）
const KB = {};
const KB_META = [
  ['数学', 'math_knowledge.json'],
  ['政治', 'pol_knowledge.json'],
  ['通用技术', 'ty_knowledge.json'],
  ['信息技术', 'xi_knowledge.json']
];
for (const [subj, file] of KB_META) {
  const p = path.join(KNOW_DIR, file);
  if (!existsSync(p)) continue;
  try { KB[subj] = JSON.parse(readFileSync(p, 'utf-8')); } catch (e) { console.error('[report] 知识底座加载失败:', file, e.message); }
}
const KB_ALIAS = {
  '通用技术': { '结构设计': '结构与设计', '流程设计': '流程与设计', '系统设计': '系统与设计', '控制设计': '控制与设计' },
  '信息技术': { '数据与信息': '专题01 数据、信息与知识', '程序设计基础': '专题04 Python程序设计基础' }
};
function knowledgeHint(subject, chapter, maxLen = 700) {
  const subjectKB = KB[subject];
  if (!subjectKB || !chapter) return '';
  let content = typeof subjectKB === 'string' ? subjectKB : subjectKB[chapter];
  if (!content) { const alias = KB_ALIAS[subject]?.[chapter]; content = alias ? subjectKB[alias] : ''; }
  if (!content) { const key = Object.keys(subjectKB).find(k => chapter && k && (chapter.includes(k) || k.includes(chapter))); content = key ? subjectKB[key] : ''; }
  if (!content) return '';
  content = String(content).trim();
  return content.length > maxLen ? content.slice(0, maxLen) + '\n……（按长度截断）' : content;
}
// 为薄弱章节批量汇总知识要点（"科目·章节（正确率%）" -> 注入内容）
function weeklyKnowledgeBlob(weakList, totalLen = 2400) {
  const parts = [];
  let used = 0;
  for (const item of weakList) {
    const m = /^(.+?)[·.](.+?)(（[0-9]+%）)?$/.exec(item.trim());
    if (!m) continue;
    const hint = knowledgeHint(m[1], m[2]);
    if (!hint) continue;
    const block = `【${m[1]} · ${m[2]}】\n${hint}`;
    if (used + block.length > totalLen) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n\n');
}

// AI 文本清洗：剥离 HTML/脚本标签，防 AI 输出经前端渲染产生存储型 XSS
function cleanAi(text) {
  return String(text || '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim();
}

// 计算某自然周的学习数据快照
function computeWeekData(uid, weekStart, weekEnd) {
  const trend = db.prepare(`
    SELECT date(created_at) AS d, COUNT(*) AS total, SUM(is_correct) AS correct
    FROM practice_records WHERE user_id = ? AND date(created_at) >= ? AND date(created_at) <= ?
    GROUP BY date(created_at) ORDER BY d
  `).all(uid, weekStart, weekEnd);

  const total = trend.reduce((s, r) => s + r.total, 0);
  const correct = trend.reduce((s, r) => s + (r.correct || 0), 0);
  const accuracy = total ? Math.round((correct / total) * 100) : 0;

  const bySubject = db.prepare(`
    SELECT q.subject, COUNT(r.id) AS total, SUM(r.is_correct) AS correct
    FROM practice_records r JOIN questions q ON q.id = r.question_id
    WHERE r.user_id = ? AND date(r.created_at) >= ? AND date(r.created_at) <= ?
    GROUP BY q.subject
  `).all(uid, weekStart, weekEnd).map(s => ({
    subject: s.subject,
    total: s.total,
    correct: s.correct || 0,
    accuracy: s.total ? Math.round(((s.correct || 0) / s.total) * 100) : 0
  }));

  const weak = db.prepare(`
    SELECT q.subject, q.chapter, COUNT(r.id) AS total, SUM(r.is_correct) AS correct
    FROM practice_records r JOIN questions q ON q.id = r.question_id
    WHERE r.user_id = ? AND date(r.created_at) >= ? AND date(r.created_at) <= ?
    GROUP BY q.subject, q.chapter
  `).all(uid, weekStart, weekEnd)
    .filter(m => m.total >= 2 && (m.correct / m.total) < 0.6)
    .map(m => `${m.subject}·${m.chapter}（${Math.round((m.correct / m.total) * 100)}%）`);

  const exams = db.prepare(`
    SELECT score, created_at FROM practice_sessions
    WHERE user_id = ? AND mode = 'exam' AND date(created_at) >= ? AND date(created_at) <= ?
    ORDER BY id DESC
  `).all(uid, weekStart, weekEnd);

  const aiSessions = db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS total, COALESCE(SUM(correct),0) AS correct
    FROM practice_sessions WHERE user_id = ? AND mode = 'ai' AND date(created_at) >= ? AND date(created_at) <= ?
  `).get(uid, weekStart, weekEnd);

  const checkinDays = db.prepare(`
    SELECT COUNT(*) AS c FROM checkins WHERE user_id = ? AND date >= ? AND date <= ?
  `).get(uid, weekStart, weekEnd).c || 0;

  const favCount = db.prepare(`
    SELECT COUNT(*) AS c FROM favorites WHERE user_id = ? AND date(created_at) >= ? AND date(created_at) <= ?
  `).get(uid, weekStart, weekEnd).c || 0;

  const analysisCount = db.prepare(`
    SELECT COUNT(*) AS c FROM ai_analysis WHERE user_id = ? AND date(created_at) >= ? AND date(created_at) <= ?
  `).get(uid, weekStart, weekEnd).c || 0;

  return {
    weekStart,
    weekEnd,
    trend,
    total,
    correct,
    accuracy,
    bySubject,
    weak,
    exams,
    aiSessions: {
      count: aiSessions.c || 0,
      total: aiSessions.total || 0,
      correct: aiSessions.correct || 0
    },
    checkinDays,
    favCount,
    analysisCount
  };
}

// 生成并存储某用户某自然周的周报快照（幂等：并发/重复调用以最新数据覆盖）
export function generateWeeklySnapshot(uid, weekStart, weekEnd) {
  const data = computeWeekData(uid, weekStart, weekEnd);
  db.prepare(`INSERT INTO weekly_reports (user_id, week_start, week_end, data) VALUES (?,?,?,?)
              ON CONFLICT(user_id, week_start) DO UPDATE SET week_end = excluded.week_end, data = excluded.data`)
    .run(uid, weekStart, weekEnd, JSON.stringify(data));
  const row = db.prepare('SELECT id FROM weekly_reports WHERE user_id = ? AND week_start = ?').get(uid, weekStart);
  return row ? row.id : null;
}

// 近 7 天学习数据聚合
router.get('/report/weekly', requireAuth, (req, res) => {
  const uid = req.userId;

  const trend = db.prepare(`
    SELECT date(created_at) AS d, COUNT(*) AS total, SUM(is_correct) AS correct
    FROM practice_records WHERE user_id = ? AND date(created_at) >= date('now','localtime','-6 days')
    GROUP BY date(created_at) ORDER BY d
  `).all(uid);

  const total = trend.reduce((s, r) => s + r.total, 0);
  const correct = trend.reduce((s, r) => s + (r.correct || 0), 0);
  const accuracy = total ? Math.round((correct / total) * 100) : 0;

  const bySubject = db.prepare(`
    SELECT q.subject, COUNT(r.id) AS total, SUM(r.is_correct) AS correct
    FROM practice_records r JOIN questions q ON q.id = r.question_id
    WHERE r.user_id = ? AND date(r.created_at) >= date('now','localtime','-6 days')
    GROUP BY q.subject
  `).all(uid).map(s => ({
    subject: s.subject,
    total: s.total,
    correct: s.correct || 0,
    accuracy: s.total ? Math.round(((s.correct || 0) / s.total) * 100) : 0
  }));

  const weak = db.prepare(`
    SELECT q.subject, q.chapter, COUNT(r.id) AS total, SUM(r.is_correct) AS correct
    FROM practice_records r JOIN questions q ON q.id = r.question_id
    WHERE r.user_id = ? AND date(r.created_at) >= date('now','localtime','-6 days')
    GROUP BY q.subject, q.chapter
  `).all(uid)
    .filter(m => m.total >= 2 && (m.correct / m.total) < 0.6)
    .map(m => `${m.subject}·${m.chapter}（${Math.round((m.correct / m.total) * 100)}%）`);

  const exams = db.prepare(`
    SELECT score, created_at FROM practice_sessions
    WHERE user_id = ? AND mode = 'exam' AND date(created_at) >= date('now','localtime','-6 days')
    ORDER BY id DESC
  `).all(uid);

  const aiSessions = db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS total, COALESCE(SUM(correct),0) AS correct
    FROM practice_sessions WHERE user_id = ? AND mode = 'ai' AND date(created_at) >= date('now','localtime','-6 days')
  `).get(uid);

  const checkinDays = db.prepare(`
    SELECT COUNT(*) AS c FROM checkins WHERE user_id = ? AND date >= date('now','localtime','-6 days')
  `).get(uid).c || 0;

  const favCount = db.prepare(`
    SELECT COUNT(*) AS c FROM favorites WHERE user_id = ? AND date(created_at) >= date('now','localtime','-6 days')
  `).get(uid).c || 0;

  const analysisCount = db.prepare(`
    SELECT COUNT(*) AS c FROM ai_analysis WHERE user_id = ? AND date(created_at) >= date('now','localtime','-6 days')
  `).get(uid).c || 0;

  // 上周（前 7 天）对比数据
  const lastTrend = db.prepare(`
    SELECT date(created_at) AS d, COUNT(*) AS total, SUM(is_correct) AS correct
    FROM practice_records WHERE user_id = ? AND date(created_at) >= date('now','localtime','-13 days') AND date(created_at) < date('now','localtime','-6 days')
    GROUP BY date(created_at) ORDER BY d
  `).all(uid);
  const lastTotal = lastTrend.reduce((s, r) => s + r.total, 0);
  const lastCorrect = lastTrend.reduce((s, r) => s + (r.correct || 0), 0);
  const lastAccuracy = lastTotal ? Math.round((lastCorrect / lastTotal) * 100) : 0;
  const lastCheckin = db.prepare(`
    SELECT COUNT(*) AS c FROM checkins WHERE user_id = ? AND date >= date('now','localtime','-13 days') AND date < date('now','localtime','-6 days')
  `).get(uid).c || 0;
  const lastExams = db.prepare(`
    SELECT COUNT(*) AS c FROM practice_sessions WHERE user_id = ? AND mode = 'exam'
      AND date(created_at) >= date('now','localtime','-13 days') AND date(created_at) < date('now','localtime','-6 days')
  `).get(uid).c || 0;

  const lastWeek = { total: lastTotal, accuracy: lastAccuracy, checkinDays: lastCheckin, examCount: lastExams };

  // 按需生成当前自然周快照，供历史周报使用（幂等）
  try {
    const { weekStart, weekEnd } = currentWeekRange();
    generateWeeklySnapshot(uid, weekStart, weekEnd);
  } catch (e) { console.error('[report] 周报快照生成失败:', e.message); }

  res.json({
    code: 0,
    data: {
      trend,
      total,
      correct,
      accuracy,
      bySubject,
      weak,
      exams,
      aiSessions: {
        count: aiSessions.c || 0,
        total: aiSessions.total || 0,
        correct: aiSessions.correct || 0
      },
      checkinDays,
      favCount,
      analysisCount,
      lastWeek
    }
  });
});

// AI 周报总结
router.post('/report/weekly/ai', requireAuth, async (req, res) => {
  if (!isAiConfigured()) return res.json({ code: 0, data: { reply: null, configured: false } });
  const uid = req.userId;
  const c = tryConsumeAi(uid, 'analysis');
  if (!c.ok) return res.status(403).json({ code: 403, message: '今日免费 AI 次数已用完，开通 VIP 会员可无限使用', data: { quotaExceeded: true } });

  const trend = db.prepare(`
    SELECT date(created_at) AS d, COUNT(*) AS total, SUM(is_correct) AS correct
    FROM practice_records WHERE user_id = ? AND date(created_at) >= date('now','localtime','-6 days')
    GROUP BY date(created_at) ORDER BY d
  `).all(uid);
  const total = trend.reduce((s, r) => s + r.total, 0);
  const correct = trend.reduce((s, r) => s + (r.correct || 0), 0);
  const accuracy = total ? Math.round((correct / total) * 100) : 0;

  const bySubject = db.prepare(`
    SELECT q.subject, COUNT(r.id) AS total, SUM(r.is_correct) AS correct
    FROM practice_records r JOIN questions q ON q.id = r.question_id
    WHERE r.user_id = ? AND date(r.created_at) >= date('now','localtime','-6 days')
    GROUP BY q.subject
  `).all(uid);

  const weak = db.prepare(`
    SELECT q.subject, q.chapter, COUNT(r.id) AS total, SUM(r.is_correct) AS correct
    FROM practice_records r JOIN questions q ON q.id = r.question_id
    WHERE r.user_id = ? AND date(r.created_at) >= date('now','localtime','-6 days')
    GROUP BY q.subject, q.chapter
  `).all(uid)
    .filter(m => m.total >= 2 && (m.correct / m.total) < 0.6)
    .map(m => `${m.subject}·${m.chapter}（${Math.round((m.correct / m.total) * 100)}%）`);
  // 注入薄弱章节考纲要点，让周报建议从"章节名"细化到"具体考点"
  const weakKnowledge = weeklyKnowledgeBlob(weak);

  const exams = db.prepare(`
    SELECT score FROM practice_sessions
    WHERE user_id = ? AND mode = 'exam' AND date(created_at) >= date('now','localtime','-6 days')
    ORDER BY id DESC LIMIT 3
  `).all(uid);

  const checkinDays = db.prepare(`
    SELECT COUNT(*) AS c FROM checkins WHERE user_id = ? AND date >= date('now','localtime','-6 days')
  `).get(uid).c || 0;

  const prompt = `请为一位云南省春季招生考生生成一份本周（近 7 天）学习周报总结。
本周数据：
- 累计刷题 ${total} 道，正确率 ${accuracy}%
- 每日刷题量：${trend.map(t => `${t.d}:${t.total}题`).join('、') || '无'}
- 各科目：${bySubject.map(s => `${s.subject} ${s.total}题/${s.total ? Math.round((s.correct || 0) / s.total * 100) : 0}%`).join('、') || '无'}
- 薄弱知识点：${weak.length ? weak.join('、') : '暂无'}
${weakKnowledge ? `\n薄弱章节对应的考纲要点（请在建议中据此点出具体考点）：\n${weakKnowledge}\n` : ''}
- 模拟考试：${exams.map(e => `${e.score}分`).join('、') || '暂无'}
- 打卡 ${checkinDays} 天

要求输出（简体中文，结构清晰）：
1. 【本周概览】用 2-3 句话总结本周学习情况。
2. 【数据亮点】指出做得好的 1-2 个方面。
3. 【存在问题】指出 1-2 个需要改进的地方。
4. 【下周建议】给出 2-3 条具体可执行的下周学习建议。`;

  try {
    const reply = await callDeepSeek([
      { role: 'system', content: '你是一位资深的云南省春季招生考试辅导老师，擅长分析学生学习数据并给出专业建议。回答使用简体中文，语气亲切鼓励，结构清晰。' },
      { role: 'user', content: prompt }
    ], { temperature: 0.6, max_tokens: 1000 });
    if (!reply) {
      refundAi(uid, 'analysis', c.kind);
      return res.status(502).json({ code: 502, message: 'AI 未返回有效内容' });
    }
    res.json({ code: 0, data: { reply: cleanAi(reply), configured: true } });
  } catch (err) {
    refundAi(uid, 'analysis', c.kind);
    console.error('[report] AI 周报异常:', err.message);
    res.status(502).json({ code: 502, message: 'AI 服务连接失败，请稍后重试' });
  }
});

// 历史周报列表
router.get('/report/weekly/history', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, week_start, week_end, created_at, data, ai_summary FROM weekly_reports
    WHERE user_id = ? ORDER BY week_start DESC LIMIT 20
  `).all(req.userId);
  res.json({
    code: 0,
    data: rows.map(r => {
      let d;
      try { d = JSON.parse(r.data); } catch { d = { total: 0, accuracy: 0, checkinDays: 0, exams: [] }; }
      return {
        id: r.id,
        week_start: r.week_start,
        week_end: r.week_end,
        created_at: r.created_at,
        total: d.total,
        accuracy: d.accuracy,
        checkinDays: d.checkinDays,
        examCount: (d.exams || []).length,
        hasAi: !!r.ai_summary
      };
    })
  });
});

// 历史周报详情
router.get('/report/weekly/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM weekly_reports WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.userId);
  if (!row) return res.status(404).json({ code: 404, message: '周报不存在' });
  let data;
  try { data = JSON.parse(row.data); } catch { data = null; }
  if (!data) return res.status(500).json({ code: 500, message: '周报数据损坏' });
  res.json({ code: 0, data: { ...row, data } });
});

// 历史周报 AI 总结（按需生成并缓存）
router.post('/report/weekly/:id/ai', requireAuth, async (req, res) => {
  if (!isAiConfigured()) return res.json({ code: 0, data: { reply: null, configured: false } });
  const row = db.prepare('SELECT * FROM weekly_reports WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.userId);
  if (!row) return res.status(404).json({ code: 404, message: '周报不存在' });
  if (row.ai_summary) return res.json({ code: 0, data: { reply: row.ai_summary, configured: true } });
  const c = tryConsumeAi(req.userId, 'analysis');
  if (!c.ok) return res.status(403).json({ code: 403, message: '今日免费 AI 次数已用完，开通 VIP 会员可无限使用', data: { quotaExceeded: true } });
  let d;
  try { d = JSON.parse(row.data); } catch { return res.status(500).json({ code: 500, message: '周报数据损坏' }); }

  const prompt = `请为一位云南省春季招生考生生成 ${d.weekStart} 至 ${d.weekEnd} 这一周的学习周报总结。
本周数据：
- 累计刷题 ${d.total} 道，正确率 ${d.accuracy}%
- 每日刷题量：${d.trend.map(t => `${t.d}:${t.total}题`).join('、') || '无'}
- 各科目：${d.bySubject.map(s => `${s.subject} ${s.total}题/${s.total ? Math.round((s.correct || 0) / s.total * 100) : 0}%`).join('、') || '无'}
- 薄弱知识点：${d.weak.length ? d.weak.join('、') : '暂无'}
- 模拟考试：${d.exams.map(e => `${e.score}分`).join('、') || '暂无'}
- 打卡 ${d.checkinDays} 天

要求输出（简体中文，结构清晰）：
1. 【本周概览】用 2-3 句话总结本周学习情况。
2. 【数据亮点】指出做得好的 1-2 个方面。
3. 【存在问题】指出 1-2 个需要改进的地方。
4. 【下周建议】给出 2-3 条具体可执行的下周学习建议。`;

  try {
    const reply = await callDeepSeek([
      { role: 'system', content: '你是一位资深的云南省春季招生考试辅导老师，擅长分析学生学习数据并给出专业建议。回答使用简体中文，语气亲切鼓励，结构清晰。' },
      { role: 'user', content: prompt }
    ], { temperature: 0.6, max_tokens: 1000 });
    if (!reply) {
      refundAi(req.userId, 'analysis', c.kind);
      return res.status(502).json({ code: 502, message: 'AI 未返回有效内容' });
    }
    const clean = cleanAi(reply);
    db.prepare('UPDATE weekly_reports SET ai_summary = ? WHERE id = ?').run(clean, row.id);
    res.json({ code: 0, data: { reply: clean, configured: true } });
  } catch (err) {
    refundAi(req.userId, 'analysis', c.kind);
    console.error('[report] AI 历史周报异常:', err.message);
    res.status(502).json({ code: 502, message: 'AI 服务连接失败，请稍后重试' });
  }
});

export default router;
