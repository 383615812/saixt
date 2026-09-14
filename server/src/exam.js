import { db } from './db.js';
import { tx } from './commerce.js';
import { gradeAnswer, withImages, addDays } from './utils.js';

// 套卷模拟考试：客观题自动评分，主观题不进自动判分分母、交卷后由用户自评（方案 A）
const EXAM_TYPES = ['single', 'multiple', 'judge'];
const SUBJECTIVE_TYPES = ['subjective', 'essay', 'short_answer'];
// 自评档位 → 得分系数
export const SELF_GRADES = { full: 1, half: 0.5, none: 0 };
// 三档自评标识（'full'=会 / 'half'=部分会 / 'none'=不会）
function isSelfGrade(v) { return Object.prototype.hasOwnProperty.call(SELF_GRADES, String(v)); }

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

// 可组卷的科目与题量（供前端选择）；主观题单独给出可选项，便于前端提示
export function examMeta() {
  const subjects = db.prepare(
    `SELECT subject, COUNT(*) AS c FROM questions
     WHERE type IN ('single','multiple','judge') AND subject IS NOT NULL AND subject <> ''
     GROUP BY subject ORDER BY c DESC`
  ).all();
  const subjS = db.prepare(
    `SELECT subject, COUNT(*) AS c FROM questions
     WHERE type IN (${SUBJECTIVE_TYPES.map(() => '?').join(',')}) AND subject IS NOT NULL AND subject <> ''
     GROUP BY subject`
  ).all(...SUBJECTIVE_TYPES);
  const sMap = new Map(subjS.map(s => [s.subject, s.c]));
  return {
    subjects: subjects.map(s => ({ subject: s.subject, count: s.c, subjective: sMap.get(s.subject) || 0 })),
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

// 抽取主观题（与客观题分开抽，避免挤占客观题名额）
function pickSubjectiveIds(subject, size, chapters = []) {
  if (!size) return [];
  const cw = chapterClause(chapters);
  const ph = SUBJECTIVE_TYPES.map(() => '?').join(',');
  return db.prepare(
    `SELECT id FROM questions WHERE subject = ? AND type IN (${ph})${cw.sql}
     ORDER BY RANDOM() LIMIT ?`
  ).all(subject, ...SUBJECTIVE_TYPES, ...cw.params, size).map(r => r.id);
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
  const subjSet = new Set(safeJson(ex.subjective_ids).map(Number));
  const rows = ids.length
    ? db.prepare(`SELECT * FROM questions WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : [];
  const byId = new Map(rows.map(r => [r.id, r]));
  const submitted = ex.status === 'submitted';
  const answers = submitted && ex.answers ? safeJson(ex.answers) : {};
  const selfGrades = ex.self_grades ? safeJson(ex.self_grades) : {};
  const questions = [];
  const detail = [];
  for (const id of ids) {
    const q = byId.get(id);
    if (!q) continue;
    const isSubj = subjSet.has(Number(id));
    if (!submitted) {
      questions.push(rowToQuestion(q)); // 考试中：不下发答案
    } else {
      const mine = String(answers[String(id)] ?? answers[id] ?? '');
      // 主观题不自动判分：会/部分会视为掌握，未自评时按未掌握处理
      const sg = selfGrades[String(id)];
      const ok = isSubj ? (!!sg && SELF_GRADES[sg] >= 0.5) : (mine !== '' && gradeAnswer({ type: q.type, answer: q.answer }, mine));
      questions.push(rowToQuestion(q));
      detail.push({
        id: q.id, your: mine, answer: isSubj ? null : q.answer, correct: ok, analysis: q.analysis, type: q.type,
        subjective: isSubj, selfGrade: sg || null
      });
    }
  }
  return {
    id: ex.id, subject: ex.subject, difficulty: ex.difficulty, total: ex.total,
    duration_sec: ex.duration_sec, status: ex.status, score: ex.score, correct: ex.correct,
    used_sec: ex.used_sec, started_at: ex.started_at, submitted_at: ex.submitted_at,
    objTotal: ids.length - subjSet.size, subjTotal: subjSet.size,
    graded: !!ex.graded_at, pendingSelfGrade: submitted && subjSet.size > 0 && !ex.graded_at,
    questions, detail
  };
}

// 开始一场模考：组卷 → 落库（ongoing）；chapters 可选，传入章节名数组则定向组卷
// includeSubjective=true 时追加主观题（其分值不计入客观题自动判分，交卷后自评）
export function startExam(userId, { subject, size, durationSec, difficulty, chapters, includeSubjective } = {}) {
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

  // 主观题：默认每卷最多 3 题（占总题量约 1/3 以内），不足则静默不追加
  let subjIds = [];
  if (includeSubjective) {
    const want = Math.min(3, Math.max(1, Math.floor(ids.length / 3)));
    subjIds = pickSubjectiveIds(subj, want, chs);
  }
  const allIds = [...ids, ...subjIds];

  const info = db.prepare(
    `INSERT INTO mock_exams (user_id, subject, difficulty, question_ids, total, duration_sec, status, subjective_ids)
     VALUES (?,?,?,?,?,?,'ongoing',?)`
  ).run(userId, subj, diff, JSON.stringify(allIds), allIds.length, dur, JSON.stringify(subjIds));
  return getExam(userId, Number(info.lastInsertRowid));
}

// 交卷评分（幂等：已交卷的试卷拒绝重复提交），并写入 practice_sessions/records 以打通学情与错题本
export function submitExam(userId, examId, answers) {
  const ex = db.prepare('SELECT * FROM mock_exams WHERE id = ? AND user_id = ?').get(examId, userId);
  if (!ex) return { ok: false, code: 404, message: '考试不存在' };
  if (ex.status === 'submitted') return { ok: false, code: 409, message: '该试卷已交卷' };

  const ids = safeJson(ex.question_ids);
  const subjIds = safeJson(ex.subjective_ids);
  const subjSet = new Set(subjIds.map(Number));
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

  // 客观题分母：仅客观题参与自动判分；主观题交卷后由用户自评（方案 A）
  const objIds = ids.filter(id => !subjSet.has(Number(id)));
  let correct = 0, answered = 0;
  const detail = [];
  let sessionId;
  try {
    sessionId = tx(() => {
    // 幂等守卫：事务内条件更新状态，并发重复交卷时第二个请求影响 0 行 → 抛错回滚
    const flip = db.prepare("UPDATE mock_exams SET status = 'submitted' WHERE id = ? AND status = 'ongoing'").run(ex.id);
    if (!flip.changes) throw Object.assign(new Error('该试卷已交卷'), { code: 409 });
    const info = db.prepare('INSERT INTO practice_sessions (user_id, subject, mode, total, correct, score) VALUES (?,?,?,?,?,?)')
      .run(userId, ex.subject, 'exam', ids.length, 0, 0);
    const sid = Number(info.lastInsertRowid);
    const rec = db.prepare('INSERT INTO practice_records (user_id, question_id, answer, is_correct, session_id) VALUES (?,?,?,?,?)');
    for (const qid of ids) {
      const q = byId.get(qid);
      if (!q) continue;
      const mine = map[String(qid)] ?? '';
      const isSubj = subjSet.has(Number(qid));
      // 主观题：先记为未掌握（is_correct=0）但不进复习计划，待自评后再修正
      const ok = isSubj ? false : (mine !== '' && gradeAnswer({ type: q.type, answer: q.answer }, mine));
      if (!isSubj) { if (ok) correct++; if (mine !== '') answered++; }
      rec.run(userId, qid, mine, ok ? 1 : 0, sid);
      if (!isSubj && !ok && mine !== '') scheduleReview(userId, qid);
      detail.push({ id: qid, your: mine, answer: isSubj ? null : q.answer, correct: ok, analysis: q.analysis, type: q.type, subjective: isSubj });
    }
    const score = objIds.length ? Math.round((correct / objIds.length) * 100 * 10) / 10 : 0;
    db.prepare('UPDATE practice_sessions SET total = ?, correct = ?, score = ? WHERE id = ?').run(objIds.length, correct, score, sid);
    db.prepare(
      `UPDATE mock_exams SET correct = ?, score = ?, answers = ?, used_sec = ?, session_id = ?,
                             submitted_at = datetime('now','localtime')
       WHERE id = ?`
    ).run(correct, score, JSON.stringify(map), used, sid, ex.id);
    return sid;
    });
  } catch (e) {
    return { ok: false, code: e.code || 500, message: e.message || '交卷失败，请稍后重试' };
  }

  const score = objIds.length ? Math.round((correct / objIds.length) * 100 * 10) / 10 : 0;
  return {
    ok: true,
    data: {
      id: ex.id, session_id: sessionId, total: objIds.length, objTotal: objIds.length,
      subjTotal: subjIds.length, pendingSelfGrade: subjIds.length > 0,
      correct, score, answered,
      used_sec: used, duration_sec: ex.duration_sec, detail
    }
  };
}

// 主观题自评：grades = { [questionId]: 'full'|'half'|'none' }，合并后重算总分
// 自评只允许一次（graded_at 为空时）；最终分 = (客观题答对数 + 自评折算分) / 客观题数 * 100（主观题作加分项）
export function gradeSubjective(userId, examId, grades) {
  const ex = db.prepare('SELECT * FROM mock_exams WHERE id = ? AND user_id = ?').get(examId, userId);
  if (!ex) return { ok: false, code: 404, message: '考试不存在' };
  if (ex.status !== 'submitted') return { ok: false, code: 409, message: '请先交卷再自评' };
  if (ex.graded_at) return { ok: false, code: 409, message: '该试卷已完成自评' };

  const subjIds = safeJson(ex.subjective_ids).map(Number);
  if (!subjIds.length) return { ok: false, code: 400, message: '本卷没有主观题' };

  const sMap = {};
  if (grades && typeof grades === 'object') {
    for (const qid of subjIds) {
      const v = grades[String(qid)] ?? grades[qid];
      if (isSelfGrade(v)) sMap[String(qid)] = String(v);
    }
  }
  // 必须对全部主观题给出自评，避免漏评刷分
  if (Object.keys(sMap).length !== subjIds.length) {
    return { ok: false, code: 400, message: '请为每道主观题完成自评' };
  }

  const ids = safeJson(ex.question_ids).map(Number);
  const objIds = ids.filter(id => !subjIds.includes(id));
  const answers = ex.answers ? safeJson(ex.answers) : {};

  const rows = db.prepare(`SELECT id, type, answer FROM questions WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const byId = new Map(rows.map(r => [r.id, r]));

  let objCorrect = 0;
  for (const qid of objIds) {
    const q = byId.get(qid);
    if (!q) continue;
    const mine = String(answers[String(qid)] ?? '');
    if (mine !== '' && gradeAnswer({ type: q.type, answer: q.answer }, mine)) objCorrect++;
  }
  const selfScore = subjIds.reduce((a, qid) => a + (SELF_GRADES[sMap[String(qid)]] || 0), 0);

  // 主观题作加分项：最终分 = (客观题答对数 + 自评折算分) / 客观题数 * 100，满分可超 100
  const denom = objIds.length;
  const score = denom ? Math.round(((objCorrect + selfScore) / denom) * 100 * 10) / 10 : 0;

  tx(() => {
    const sid = ex.session_id || null;
    // 修正本卷主观题的 practice_records（优先按交卷会话精确匹配，避免误改其他练习记录）
    const upd = sid
      ? db.prepare('UPDATE practice_records SET is_correct = ? WHERE session_id = ? AND question_id = ?')
      : db.prepare('UPDATE practice_records SET is_correct = ? WHERE user_id = ? AND question_id = ? AND id = (SELECT MAX(id) FROM practice_records WHERE user_id = ? AND question_id = ?)');
    const rec = db.prepare('INSERT INTO practice_records (user_id, question_id, answer, is_correct, session_id) VALUES (?,?,?,?,?)');
    for (const qid of subjIds) {
      const ok = SELF_GRADES[sMap[String(qid)]] >= 0.5;
      const changed = sid
        ? upd.run(ok ? 1 : 0, sid, qid)
        : upd.run(ok ? 1 : 0, userId, qid, userId, qid);
      if (!changed.changes) rec.run(userId, qid, String(answers[String(qid)] ?? ''), ok ? 1 : 0, sid);
      // 自评为「不会」的主观题纳入错题本（无复习计划，避免主观题进遗忘曲线）
    }
    // 会话精确定位：用交卷时写入的 session_id，避免误更新同一用户的其他模考会话
    const ps = sid
      ? db.prepare('SELECT id FROM practice_sessions WHERE id = ? AND user_id = ?').get(sid, userId)
      : (ex.submitted_at
        ? db.prepare("SELECT id FROM practice_sessions WHERE user_id = ? AND mode = 'exam' ORDER BY id DESC LIMIT 1").get(userId)
        : null);
    if (ps) db.prepare('UPDATE practice_sessions SET correct = ?, score = ? WHERE id = ?').run(objCorrect, score, ps.id);
    // 客观题答对数保持 correct 不变；合并总分写回 score，供历史记录/成绩页展示
    db.prepare("UPDATE mock_exams SET score = ?, self_grades = ?, graded_at = datetime('now','localtime') WHERE id = ?")
      .run(score, JSON.stringify(sMap), ex.id);
  });

  return { ok: true, data: { id: ex.id, objCorrect, selfScore, subjTotal: subjIds.length, score } };
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
