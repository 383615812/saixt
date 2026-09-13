import { db } from './db.js';
import { tx } from './commerce.js';
import { gradeAnswer, withImages, addDays } from './utils.js';

// 套卷模拟考试：仅取可自动评分的客观题组卷；答案为服务端评分，考试中不下发
const EXAM_TYPES = ['single', 'multiple', 'judge'];

// 题量 / 时长预设（时长单位：秒）
export const EXAM_PRESETS = [
  { key: 'quick', label: '小测', size: 10, durationSec: 15 * 60 },
  { key: 'standard', label: '标准', size: 20, durationSec: 30 * 60 },
  { key: 'intense', label: '强化', size: 30, durationSec: 45 * 60 },
  { key: 'full', label: '全真', size: 50, durationSec: 75 * 60 }
];

// 难度档：题干 difficulty 1/2/3
const DIFF_MAP = { '基础': [1], '中等': [2], '较难': [3], '综合': [1, 2, 3] };

function safeJson(s) {
  try { return JSON.parse(s); } catch { return []; }
}

function scheduleReview(uid, qid) {
  const existing = db.prepare('SELECT id FROM review_schedule WHERE user_id = ? AND question_id = ?').get(uid, qid);
  if (existing) db.prepare('UPDATE review_schedule SET stage = 0, next_due = ? WHERE id = ?').run(addDays(1), existing.id);
  else db.prepare('INSERT INTO review_schedule (user_id, question_id, stage, next_due) VALUES (?,?,0,?)').run(uid, qid, addDays(1));
}

// 可组卷的科目与题量（供前端选择）
export function examMeta() {
  const subjects = db.prepare(
    `SELECT subject, COUNT(*) AS c FROM questions
     WHERE type IN ('single','multiple','judge') AND subject IS NOT NULL AND subject <> ''
     GROUP BY subject ORDER BY c DESC`
  ).all();
  return {
    subjects: subjects.map(s => ({ subject: s.subject, count: s.c })),
    presets: EXAM_PRESETS,
    difficulties: Object.keys(DIFF_MAP)
  };
}

// 某科目下可组卷的章节与题量（供按章节定向组卷选择）
export function examChapters(subject) {
  return db.prepare(
    `SELECT chapter, COUNT(*) AS c FROM questions
     WHERE subject = ? AND type IN ('single','multiple','judge') AND chapter IS NOT NULL AND chapter <> ''
     GROUP BY chapter ORDER BY c DESC`
  ).all(subject);
}

// 章节过滤子句：chapters 为空数组表示不限章节
function chapterClause(chapters) {
  if (!chapters.length) return { sql: '', params: [] };
  return { sql: ` AND chapter IN (${chapters.map(() => '?').join(',')})`, params: chapters };
}

// 抽题：难度优先，同卷不重复；不足则放宽难度补齐（章节过滤始终保留）
function pickQuestionIds(subject, size, difficulty, chapters = []) {
  const diffs = DIFF_MAP[difficulty] || DIFF_MAP['综合'];
  const ph = diffs.map(() => '?').join(',');
  const cw = chapterClause(chapters);
  const seen = new Set();
  const ids = [];
  const push = rows => { for (const r of rows) { if (ids.length >= size) break; if (!seen.has(r.id)) { seen.add(r.id); ids.push(r.id); } } };
  push(db.prepare(
    `SELECT id FROM questions WHERE subject = ? AND type IN ('single','multiple','judge') AND difficulty IN (${ph})${cw.sql}
     ORDER BY RANDOM() LIMIT ?`
  ).all(subject, ...diffs, ...cw.params, size));
  if (ids.length < size) {
    push(db.prepare(
      `SELECT id FROM questions WHERE subject = ? AND type IN ('single','multiple','judge')${cw.sql}
       ORDER BY RANDOM() LIMIT ?`
    ).all(subject, ...cw.params, size * 2));
  }
  return ids;
}

function rowToQuestion(q, { withAnswer = false } = {}) {
  const out = {
    id: q.id, subject: q.subject, chapter: q.chapter, type: q.type, difficulty: q.difficulty,
    stem: q.stem, options: safeJson(q.options), images: withImages(q).images
  };
  if (withAnswer) { out.answer = q.answer; out.analysis = q.analysis; }
  return out;
}

export function getExam(userId, examId) {
  const ex = db.prepare('SELECT * FROM mock_exams WHERE id = ? AND user_id = ?').get(examId, userId);
  if (!ex) return null;
  const ids = safeJson(ex.question_ids);
  const rows = ids.length
    ? db.prepare(`SELECT * FROM questions WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : [];
  const byId = new Map(rows.map(r => [r.id, r]));
  const submitted = ex.status === 'submitted';
  const answers = submitted && ex.answers ? safeJson(ex.answers) : {};
  const questions = [];
  const detail = [];
  for (const id of ids) {
    const q = byId.get(id);
    if (!q) continue;
    if (!submitted) {
      questions.push(rowToQuestion(q)); // 考试中：不下发答案
    } else {
      const mine = String(answers[String(id)] ?? answers[id] ?? '');
      const ok = mine !== '' && gradeAnswer({ type: q.type, answer: q.answer }, mine);
      questions.push(rowToQuestion(q));
      detail.push({ id: q.id, your: mine, answer: q.answer, correct: ok, analysis: q.analysis, type: q.type });
    }
  }
  return {
    id: ex.id, subject: ex.subject, difficulty: ex.difficulty, total: ex.total,
    duration_sec: ex.duration_sec, status: ex.status, score: ex.score, correct: ex.correct,
    used_sec: ex.used_sec, started_at: ex.started_at, submitted_at: ex.submitted_at,
    questions, detail
  };
}

// 开始一场模考：组卷 → 落库（ongoing）；chapters 可选，传入章节名数组则定向组卷
export function startExam(userId, { subject, size, durationSec, difficulty, chapters } = {}) {
  const subj = String(subject || '').trim();
  if (!subj) throw new Error('请选择考试科目');
  const preset = EXAM_PRESETS.find(p => p.size === Number(size));
  const n = Math.min(Math.max(Number(size) || (preset ? preset.size : 20), 5), 100);
  const dur = Math.min(Math.max(Number(durationSec) || (preset ? preset.durationSec : n * 90), 60), 4 * 3600);
  const diff = Object.keys(DIFF_MAP).includes(difficulty) ? difficulty : '综合';
  const chs = Array.isArray(chapters)
    ? [...new Set(chapters.map(c => String(c).trim()).filter(Boolean))].slice(0, 50)
    : [];
  if (chs.length && chs.length !== chapters.length) throw new Error('章节名称不能为空');

  const cw = chapterClause(chs);
  const avail = db.prepare(
    `SELECT COUNT(*) AS c FROM questions WHERE subject = ? AND type IN ('single','multiple','judge')${cw.sql}`
  ).get(subj, ...cw.params).c || 0;
  if (avail < 5) throw new Error(chs.length ? '所选章节可用题目不足，请减少章节数量或调整范围' : '该科目可用客观题不足，暂无法组卷');

  const ids = pickQuestionIds(subj, Math.min(n, avail), diff, chs);
  if (ids.length < 5) throw new Error(chs.length ? '所选章节可用题目不足，请减少章节数量或调整范围' : '该科目可用客观题不足，暂无法组卷');

  const info = db.prepare(
    `INSERT INTO mock_exams (user_id, subject, difficulty, question_ids, total, duration_sec, status)
     VALUES (?,?,?,?,?,?,'ongoing')`
  ).run(userId, subj, diff, JSON.stringify(ids), ids.length, dur);
  return getExam(userId, Number(info.lastInsertRowid));
}

// 交卷评分（幂等：已交卷的试卷拒绝重复提交），并写入 practice_sessions/records 以打通学情与错题本
export function submitExam(userId, examId, answers) {
  const ex = db.prepare('SELECT * FROM mock_exams WHERE id = ? AND user_id = ?').get(examId, userId);
  if (!ex) return { ok: false, code: 404, message: '考试不存在' };
  if (ex.status === 'submitted') return { ok: false, code: 409, message: '该试卷已交卷' };

  const ids = safeJson(ex.question_ids);
  const map = {};
  if (Array.isArray(answers)) {
    for (const a of answers) {
      const qid = Number(a && a.question_id);
      if (Number.isInteger(qid) && qid > 0) map[String(qid)] = String(a.answer ?? '').slice(0, 50);
    }
  }
  const startedMs = new Date(String(ex.started_at).replace(' ', 'T')).getTime();
  const used = Number.isFinite(startedMs) ? Math.max(0, Math.round((Date.now() - startedMs) / 1000)) : null;

  const rows = ids.length
    ? db.prepare(`SELECT id, type, answer, analysis FROM questions WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : [];
  const byId = new Map(rows.map(r => [r.id, r]));

  let correct = 0, answered = 0;
  const detail = [];
  const sessionId = tx(() => {
    const info = db.prepare('INSERT INTO practice_sessions (user_id, subject, mode, total, correct, score) VALUES (?,?,?,?,?,?)')
      .run(userId, ex.subject, 'exam', ids.length, 0, 0);
    const sid = Number(info.lastInsertRowid);
    const rec = db.prepare('INSERT INTO practice_records (user_id, question_id, answer, is_correct, session_id) VALUES (?,?,?,?,?)');
    for (const qid of ids) {
      const q = byId.get(qid);
      if (!q) continue;
      const mine = map[String(qid)] ?? '';
      const ok = mine !== '' && gradeAnswer({ type: q.type, answer: q.answer }, mine);
      if (ok) correct++;
      if (mine !== '') answered++;
      rec.run(userId, qid, mine, ok ? 1 : 0, sid);
      if (!ok && mine !== '') scheduleReview(userId, qid);
      detail.push({ id: qid, your: mine, answer: q.answer, correct: ok, analysis: q.analysis, type: q.type });
    }
    const score = ids.length ? Math.round((correct / ids.length) * 100 * 10) / 10 : 0;
    db.prepare('UPDATE practice_sessions SET total = ?, correct = ?, score = ? WHERE id = ?').run(ids.length, correct, score, sid);
    db.prepare(
      `UPDATE mock_exams SET status = 'submitted', correct = ?, score = ?, answers = ?, used_sec = ?,
                             submitted_at = datetime('now','localtime')
       WHERE id = ?`
    ).run(correct, score, JSON.stringify(map), used, ex.id);
    return sid;
  });

  const score = ids.length ? Math.round((correct / ids.length) * 100 * 10) / 10 : 0;
  return {
    ok: true,
    data: {
      id: ex.id, session_id: sessionId, total: ids.length, correct, score, answered,
      used_sec: used, duration_sec: ex.duration_sec, detail
    }
  };
}

// 历史模考记录（已交卷）
export function listExams(userId, limit = 20, offset = 0) {
  const total = db.prepare("SELECT COUNT(*) AS c FROM mock_exams WHERE user_id = ? AND status = 'submitted'").get(userId).c || 0;
  const list = db.prepare(
    `SELECT id, subject, difficulty, total, correct, score, duration_sec, used_sec, submitted_at, started_at
     FROM mock_exams WHERE user_id = ? AND status = 'submitted' ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(userId, limit, offset);
  return { list, total };
}

// 进行中的试卷（用于断点续考）
export function ongoingExam(userId) {
  const row = db.prepare("SELECT id FROM mock_exams WHERE user_id = ? AND status = 'ongoing' ORDER BY id DESC LIMIT 1").get(userId);
  return row ? getExam(userId, row.id) : null;
}
