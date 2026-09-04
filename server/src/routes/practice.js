import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { withImages, todayStr, addDays, gradeAnswer } from '../utils.js';
import { tx } from '../commerce.js';
import { rateLimit } from '../rateLimit.js';
import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';

const router = Router();

// 作答提交限流：按用户每 60 秒最多 60 次，防脚本批量灌数据
const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: '提交过于频繁，请稍后再试'
});

// 盲盒抽题限流：按用户每 60 秒最多 30 次，防脚本反复抽题刷稀有度
const drawLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: '抽题过于频繁，请稍后再试'
});

// 艾宾浩斯遗忘曲线复习间隔（天）：第 0~5 阶段
const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30];

// 答错时创建/重置遗忘曲线复习计划
function scheduleReview(uid, qid) {
  const existing = db.prepare('SELECT id FROM review_schedule WHERE user_id = ? AND question_id = ?').get(uid, qid);
  if (existing) {
    db.prepare('UPDATE review_schedule SET stage = 0, next_due = ? WHERE id = ?').run(addDays(1), existing.id);
  } else {
    db.prepare('INSERT INTO review_schedule (user_id, question_id, stage, next_due) VALUES (?,?,0,?)').run(uid, qid, addDays(1));
  }
}

// 提交单题作答
router.post('/submit', requireAuth, submitLimiter, (req, res) => {
  const { question_id, answer, selfCorrect } = req.body || {};
  const qid = Number(question_id);
  if (!Number.isInteger(qid) || qid <= 0) return res.status(400).json({ code: 400, message: '无效的题目 ID' });
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(qid);
  if (!q) return res.status(404).json({ code: 404, message: '题目不存在' });
  const ans = String(answer ?? '').slice(0, 50).trim();
  // 客观题未作答兜底拦截：鼓励作答，避免产生无意义的错误记录污染正确率
  if (q.type === 'multiple' || q.type === 'single' || q.type === 'judge') {
    if (!ans) {
      return res.status(400).json({ code: 400, message: q.type === 'multiple' ? '多选题请至少选择一个选项' : '请先选择答案再提交' });
    }
  }
  const correct = gradeAnswer(q, ans, selfCorrect);
  tx(() => {
    db.prepare('INSERT INTO practice_records (user_id, question_id, answer, is_correct) VALUES (?,?,?,?)')
      .run(req.userId, q.id, ans, correct ? 1 : 0);
    if (!correct) scheduleReview(req.userId, q.id);
    // 若该题是用户抽中的盲盒题，标记已作答，防止再经 /blind-box/submit 重复计分
    db.prepare('UPDATE blind_box_draws SET used = 1 WHERE user_id = ? AND question_id = ? AND used = 0')
      .run(req.userId, q.id);
  });
  res.json({
    code: 0,
    data: {
      correct,
      answer: q.answer,
      analysis: q.analysis,
      options: JSON.parse(q.options)
    }
  });
});

// 提交整卷（模拟考试）
router.post('/session', requireAuth, submitLimiter, (req, res) => {
  const { subject, mode, answers } = req.body || {};
  if (!Array.isArray(answers)) return res.status(400).json({ code: 400, message: '缺少作答数据' });
  if (answers.length > 200) return res.status(400).json({ code: 400, message: '单次提交题目数不能超过200道' });
  const safeMode = ['exam', 'practice', 'redo', 'ai'].includes(mode) ? mode : 'exam';
  // 模拟考试至少 5 题，防止 1 题成卷刷高分成就
  if (safeMode === 'exam' && answers.length < 5) {
    return res.status(400).json({ code: 400, message: '模拟考试至少需要 5 道题' });
  }
  const safeSubject = String(subject || '综合').slice(0, 50);
  const stmt = db.prepare('INSERT INTO practice_records (user_id, question_id, answer, is_correct, session_id) VALUES (?,?,?,?,?)');
  // 事务包裹批量写入与 session 更新，任一异常整体回滚，避免半提交
  let correct = 0;
  let recorded = 0;
  const sessionId = tx(() => {
    const info = db.prepare('INSERT INTO practice_sessions (user_id, subject, mode, total, correct, score) VALUES (?,?,?,?,?,?)')
      .run(req.userId, safeSubject, safeMode, answers.length, 0, 0);
    const sid = Number(info.lastInsertRowid);
    const seen = new Set();
    for (const a of answers) {
      const qid = Number(a.question_id);
      // 校验题目 ID 为合法整数，且同一会话内去重，防止重复提交同一题灌数据
      if (!Number.isInteger(qid) || qid <= 0 || seen.has(qid)) continue;
      seen.add(qid);
      const q = db.prepare('SELECT id, answer, type FROM questions WHERE id = ?').get(qid);
      if (!q) continue;
      const userAns = String(a.answer ?? '').slice(0, 50);
      const ok = gradeAnswer(q, userAns);
      if (ok) correct++;
      else scheduleReview(req.userId, q.id);
      recorded++;
      stmt.run(req.userId, q.id, userAns, ok ? 1 : 0, sid);
    }
    const score = recorded ? Math.round((correct / recorded) * 100 * 10) / 10 : 0;
    db.prepare('UPDATE practice_sessions SET total = ?, correct = ?, score = ? WHERE id = ?').run(recorded, correct, score, sid);
    return sid;
  });
  res.json({ code: 0, data: { id: sessionId, total: recorded, correct, score: recorded ? Math.round((correct / recorded) * 100 * 10) / 10 : 0 } });
});

// 开始一次练习（专项/错题重练），计入"练习次数"
router.post('/start', requireAuth, (req, res) => {
  const { subject, mode } = req.body || {};
  const safeMode = mode === 'redo' ? 'redo' : 'practice';
  const info = db.prepare('INSERT INTO practice_sessions (user_id, subject, mode, total, correct, score) VALUES (?,?,?,0,0,0)')
    .run(req.userId, String(subject || '综合').slice(0, 50), safeMode);
  res.json({ code: 0, data: { id: Number(info.lastInsertRowid) } });
});

// 我的练习记录
router.get('/records', requireAuth, (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const total = db.prepare('SELECT COUNT(*) AS c FROM practice_records WHERE user_id = ?').get(req.userId).c || 0;
  const rows = db.prepare(
    `SELECT r.id, r.question_id, r.answer, r.is_correct, r.created_at, q.subject, q.stem, q.answer AS right_answer, q.image, q.images
     FROM practice_records r JOIN questions q ON q.id = r.question_id
     WHERE r.user_id = ? ORDER BY r.id DESC LIMIT ? OFFSET ?`
  ).all(req.userId, safeLimit, safeOffset).map(withImages);
  rows.total = total;
  rows.page = Math.floor(safeOffset / safeLimit) + 1;
  rows.pageSize = safeLimit;
  res.json({ code: 0, data: rows });
});

// 我的错题本（排除已掌握题目）
router.get('/wrong', requireAuth, (req, res) => {
  const { subject, chapter, limit, offset } = req.query;
  const hasPage = limit !== undefined || offset !== undefined;
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  let where = `WHERE r.user_id = ? AND r.is_correct = 0
       AND NOT EXISTS (SELECT 1 FROM wrong_mastered wm WHERE wm.user_id = r.user_id AND wm.question_id = q.id)`;
  const params = [req.userId];
  if (subject) { where += ' AND q.subject = ?'; params.push(subject); }
  if (chapter) { where += ' AND q.chapter = ?'; params.push(chapter); }
  const total = db.prepare(
    `SELECT COUNT(DISTINCT q.id) AS c FROM practice_records r JOIN questions q ON q.id = r.question_id ${where}`
  ).get(...params).c || 0;
  let sql = `SELECT q.id, q.subject, q.chapter, q.stem, q.options, q.answer, q.analysis, q.source, q.image, q.images
     FROM practice_records r JOIN questions q ON q.id = r.question_id
     ${where} GROUP BY q.id ORDER BY MAX(r.id) DESC`;
  if (hasPage) sql += ' LIMIT ? OFFSET ?';
  const rows = hasPage ? db.prepare(sql).all(...params, safeLimit, safeOffset) : db.prepare(sql).all(...params);
  const list = rows.map(r => withImages({ ...r, options: JSON.parse(r.options) }));
  list.total = total;
  list.page = hasPage ? Math.floor(safeOffset / safeLimit) + 1 : 1;
  list.pageSize = hasPage ? safeLimit : total;
  res.json({ code: 0, data: list });
});

// 错题本导出 PDF
router.get('/wrong/export', requireAuth, (req, res) => {
  const uid = req.userId;
  const { subject } = req.query;

  // 获取用户信息
  const user = db.prepare('SELECT nickname FROM users WHERE id = ?').get(uid);
  const nickname = user?.nickname || '同学';

  // 获取错题，并带上用户在最近一次错答中的作答，便于对照复习
  let sql = `SELECT q.id, q.subject, q.chapter, q.stem, q.options, q.answer, q.analysis, q.type,
     (SELECT r2.answer FROM practice_records r2 WHERE r2.user_id = r.user_id AND r2.question_id = q.id
       ORDER BY r2.id DESC LIMIT 1) AS my_answer
     FROM practice_records r JOIN questions q ON q.id = r.question_id
     WHERE r.user_id = ? AND r.is_correct = 0
       AND NOT EXISTS (SELECT 1 FROM wrong_mastered wm WHERE wm.user_id = r.user_id AND wm.question_id = q.id)`;
  const params = [uid];
  if (subject) { sql += ' AND q.subject = ?'; params.push(subject); }
  sql += ' GROUP BY q.id ORDER BY q.subject, q.chapter, q.id';
  const rows = db.prepare(sql).all(...params);

  // 按科目分组
  const bySubject = {};
  for (const r of rows) {
    if (!bySubject[r.subject]) bySubject[r.subject] = [];
    bySubject[r.subject].push(r);
  }

  // 创建 PDF
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  // 设置响应头
  const filename = encodeURIComponent(`错题本_${nickname}_${new Date().toISOString().slice(0,10)}.pdf`);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);

  doc.pipe(res);

  // 注册中文字体
  const fontPath = 'C:\\Windows\\Fonts\\simhei.ttf';
  if (existsSync(fontPath)) {
    doc.registerFont('zh', fontPath);
    doc.font('zh');
  }

  // ========== 封面 ==========
  doc.fontSize(28).fillColor('#333').text('错题本', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(14).fillColor('#666').text('云南春招智能学习平台', { align: 'center' });
  doc.moveDown(2);

  doc.fontSize(12).fillColor('#444');
  doc.text(`学生姓名：${nickname}`);
  doc.text(`导出时间：${new Date().toLocaleString('zh-CN')}`);
  doc.text(`错题总数：${rows.length} 道`);
  doc.text(`涉及科目：${Object.keys(bySubject).length} 科`);

  doc.moveDown(1);
  // 各科统计
  for (const [sub, list] of Object.entries(bySubject)) {
    doc.text(`  · ${sub}：${list.length} 道`);
  }

  doc.addPage();

  // ========== 题目内容 ==========
  let qNum = 1;
  const typeLabels = { single: '单选题', multiple: '多选题', judge: '判断题', subjective: '主观题' };

  for (const [sub, list] of Object.entries(bySubject)) {
    // 科目标题
    doc.fontSize(16).fillColor('#607dff')
       .text(`${sub}（共 ${list.length} 题）`);
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2)
       .strokeColor('#607dff').lineWidth(1).stroke();
    doc.moveDown(1);

    for (const q of list) {
      // 检查剩余空间，不够则换页
      if (doc.y > 700) {
        doc.addPage();
      }

      // 题号 + 题型
      doc.fontSize(11).fillColor('#333')
         .text(`第 ${qNum} 题  [${typeLabels[q.type] || q.type}]  ${q.chapter || ''}`, { continued: false });
      qNum++;

      // 题干
      doc.fontSize(11).fillColor('#222').moveDown(0.3);
      const stem = q.stem.replace(/<[^>]+>/g, '');
      doc.text(stem, { lineGap: 3 });
      doc.moveDown(0.3);

      // 选项
      if (q.options) {
        try {
          const opts = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
          if (Array.isArray(opts) && opts.length) {
            for (const opt of opts) {
              const cleanOpt = String(opt).replace(/<[^>]+>/g, '');
              doc.fontSize(10).fillColor('#444')
                 .text(`  ${cleanOpt}`, { lineGap: 2 });
            }
            doc.moveDown(0.2);
          }
        } catch (e) { /* 忽略 */ }
      }

      // 我的作答（对照复习）
      if (q.my_answer !== undefined && q.my_answer !== null && q.my_answer !== '') {
        doc.fontSize(10).fillColor('#e11d48').moveDown(0.1)
           .text(`✕ 我的作答：${q.my_answer}`, { lineGap: 2 });
      }

      // 正确答案
      doc.fontSize(10).fillColor('#10b981')
         .text(`✓ 正确答案：${q.answer || '无'}`, { lineGap: 2 });

      // 解析
      if (q.analysis) {
        const ana = q.analysis.replace(/<[^>]+>/g, '');
        doc.fontSize(10).fillColor('#666').moveDown(0.1);
        doc.text(`解析：${ana}`, { lineGap: 2 });
      }

      // 分隔线
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y)
         .strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      doc.moveDown(0.5);
    }

    doc.addPage();
  }

  // 结尾页
  doc.fontSize(14).fillColor('#607dff').text('加油！', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(11).fillColor('#666').text('及时复习错题，查漏补缺，稳步提升！', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#999').text('云南春招智能学习平台 · 错题本导出', { align: 'center' });

  doc.end();
});

// 盲盒刷题 - 抽取随机题目（带稀有度）
router.get('/blind-box/draw', requireAuth, drawLimiter, (req, res) => {
  const { subject } = req.query;
  const uid = req.userId;

  // 稀有度权重配置
  const rarities = [
    { level: 1, name: '普通', color: '#9ca3af', weight: 60, difficulty: 1, score: 10 },
    { level: 2, name: '稀有', color: '#3b82f6', weight: 25, difficulty: 2, score: 25 },
    { level: 3, name: '史诗', color: '#8b5cf6', weight: 12, difficulty: 3, score: 50 },
    { level: 4, name: '传说', color: '#f59e0b', weight: 3, difficulty: 3, score: 100 }
  ];

  // 若已有未作答的抽题，直接返回该题，防止反复抽题刷高稀有度
  const pending = db.prepare(`
    SELECT q.id, q.subject, q.chapter, q.type, q.stem, q.options, q.answer, q.analysis, q.difficulty, q.source,
           q.image, q.images, d.rarity_score
    FROM blind_box_draws d JOIN questions q ON q.id = d.question_id
    WHERE d.user_id = ? AND d.used = 0
    ORDER BY d.id DESC LIMIT 1
  `).get(uid);
  if (pending) {
    const opts = pending.options ? JSON.parse(pending.options) : [];
    const { answer, analysis, rarity_score, ...safeQuestion } = pending;
    const rarity = rarities.find(r => r.score === rarity_score) || rarities[0];
    return res.json({
      code: 0,
      data: {
        question: withImages({ ...safeQuestion, options: opts }),
        rarity: { level: rarity.level, name: rarity.name, color: rarity.color, score: rarity.score }
      }
    });
  }

  // 加权随机选稀有度
  const totalWeight = rarities.reduce((s, r) => s + r.weight, 0);
  let rand = Math.random() * totalWeight;
  let selectedRarity = rarities[0];
  for (const r of rarities) {
    rand -= r.weight;
    if (rand <= 0) { selectedRarity = r; break; }
  }

  // 按稀有度和科目筛选题目（仅客观题，主观题自判可被利用刷分，故排除）
  const conds = [];
  const args = [];
  if (subject) { conds.push('subject = ?'); args.push(subject); }
  conds.push('difficulty = ?');
  args.push(selectedRarity.difficulty);
  conds.push("type != 'subjective'");

  // 排除用户已经答对过的题（增加新鲜感）
  conds.push(`id NOT IN (
    SELECT question_id FROM practice_records WHERE user_id = ? AND is_correct = 1
  )`);
  args.push(uid);

  const where = `WHERE ${conds.join(' AND ')}`;
  // 随机取一道（ORDER BY RANDOM 单查询，避免 COUNT+OFFSET 的双查询与选择偏差）
  let question = db.prepare(
    `SELECT id, subject, chapter, type, stem, options, answer, analysis, difficulty, source, image, images
     FROM questions ${where} ORDER BY RANDOM() LIMIT 1`
  ).get(...args);

  // 如果该难度没符合条件的题，放宽条件（同样排除主观题）
  if (!question) {
    const conds2 = [];
    const args2 = [];
    if (subject) { conds2.push('subject = ?'); args2.push(subject); }
    conds2.push("type != 'subjective'");
    const where2 = conds2.length ? `WHERE ${conds2.join(' AND ')}` : '';
    question = db.prepare(
      `SELECT id, subject, chapter, type, stem, options, answer, analysis, difficulty, source, image, images
       FROM questions ${where2} ORDER BY RANDOM() LIMIT 1`
    ).get(...args2);
    // 降级稀有度
    if (question) {
      selectedRarity = rarities[0];
    }
  }

  if (!question) {
    return res.status(404).json({ code: 404, message: '暂无可抽的题目' });
  }

  // 解析 options
  const opts = question.options ? JSON.parse(question.options) : [];

  // 服务端固化本次抽题的稀有度分数，提交时据此计分，防止客户端篡改
  db.prepare('INSERT INTO blind_box_draws (user_id, question_id, rarity_score) VALUES (?,?,?)')
    .run(uid, question.id, selectedRarity.score);

  // 抽题阶段不下发答案与解析，避免泄露；答后由 submit 接口返回权威判分
  const { answer, analysis, ...safeQuestion } = question;

  res.json({
    code: 0,
    data: {
      question: withImages({ ...safeQuestion, options: opts }),
      rarity: {
        level: selectedRarity.level,
        name: selectedRarity.name,
        color: selectedRarity.color,
        score: selectedRarity.score
      }
    }
  });
});

// 盲盒刷题 - 提交答案并计分
router.post('/blind-box/submit', requireAuth, submitLimiter, (req, res) => {
  const { question_id, answer, selfCorrect } = req.body || {};
  const uid = req.userId;
  const qid = Number(question_id);
  if (!Number.isInteger(qid) || qid <= 0) return res.status(400).json({ code: 400, message: '无效的题目 ID' });
  if (answer === undefined) return res.status(400).json({ code: 400, message: '缺少参数' });

  // 校验题目必须由当前用户抽中且尚未作答，使用服务端固化的稀有度分数，防止客户端篡改/重复提交
  const draw = db.prepare(
    'SELECT id, rarity_score FROM blind_box_draws WHERE user_id = ? AND question_id = ? AND used = 0 ORDER BY id DESC LIMIT 1'
  ).get(uid, qid);
  if (!draw) return res.status(403).json({ code: 403, message: '请先抽取本题后再作答' });

  // 获取题目
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(qid);
  if (!q) return res.status(404).json({ code: 404, message: '题目不存在' });

  // 判断答案是否正确（统一判分口径：单选/判断精确匹配、多选排序比对、主观题自判）
  const isCorrect = gradeAnswer(q, answer, selfCorrect);

  // 服务端维护连击：答对 +1，答错归零
  const comboState = db.prepare('SELECT combo FROM blind_box_state WHERE user_id = ?').get(uid);
  const prevCombo = comboState ? comboState.combo : 0;

  tx(() => {
    db.prepare(
      'INSERT INTO practice_records (user_id, question_id, answer, is_correct) VALUES (?,?,?,?)'
    ).run(uid, qid, String(answer).slice(0, 50), isCorrect ? 1 : 0);
    // 如果答错，加入错题复习计划
    if (!isCorrect) scheduleReview(uid, qid);
    // 标记本次抽题已作答，防止同一抽题重复计分
    db.prepare('UPDATE blind_box_draws SET used = 1 WHERE id = ?').run(draw.id);
    const newCombo = isCorrect ? prevCombo + 1 : 0;
    db.prepare(
      'INSERT INTO blind_box_state (user_id, combo, updated_at) VALUES (?,?,datetime(\'now\',\'localtime\')) ' +
      'ON CONFLICT(user_id) DO UPDATE SET combo = excluded.combo, updated_at = excluded.updated_at'
    ).run(uid, newCombo);
  });

  // 计算得分（连击加成，最高 2 倍），稀有度分数取自服务端固化值
  const comboBonus = Math.min(2, 1 + prevCombo * 0.1);
  const earnedScore = isCorrect ? Math.round(draw.rarity_score * comboBonus) : 0;
  const newCombo = isCorrect ? prevCombo + 1 : 0;

  res.json({
    code: 0,
    data: {
      is_correct: isCorrect,
      correct_answer: q.answer,
      analysis: q.analysis,
      earned_score: earnedScore,
      new_combo: newCombo,
      combo_bonus: Math.round(comboBonus * 100) / 100
    }
  });
});

// 标记错题已掌握（错题重练答对后调用，从错题本移除）
router.post('/mastered', requireAuth, (req, res) => {
  const { question_id } = req.body || {};
  const qid = Number(question_id);
  if (!Number.isInteger(qid) || qid <= 0) return res.status(400).json({ code: 400, message: '缺少题目 ID' });
  // 前置条件：该用户必须答对过该题才允许标记掌握，防止随意清空错题本/复习队列
  const correctRecord = db.prepare(
    'SELECT 1 FROM practice_records WHERE user_id = ? AND question_id = ? AND is_correct = 1 LIMIT 1'
  ).get(req.userId, qid);
  if (!correctRecord) return res.status(403).json({ code: 403, message: '请先答对该题后再标记掌握' });
  tx(() => {
    db.prepare('INSERT OR IGNORE INTO wrong_mastered (user_id, question_id) VALUES (?,?)')
      .run(req.userId, qid);
    db.prepare('DELETE FROM review_schedule WHERE user_id = ? AND question_id = ?').run(req.userId, qid);
  });
  res.json({ code: 0, data: { mastered: true } });
});

// 复习到期轻量摘要（顶部通知徽标用）
router.get('/review/summary', requireAuth, (req, res) => {
  const uid = req.userId;
  const today = todayStr();
  const dueToday = db.prepare(`
    SELECT COUNT(*) AS c FROM review_schedule rs
    WHERE rs.user_id = ? AND rs.next_due <= ? AND NOT EXISTS (
      SELECT 1 FROM wrong_mastered wm WHERE wm.user_id = rs.user_id AND wm.question_id = rs.question_id
    )
  `).get(uid, today).c || 0;
  const dueWeek = db.prepare(`
    SELECT COUNT(*) AS c FROM review_schedule rs
    WHERE rs.user_id = ? AND rs.next_due <= ? AND NOT EXISTS (
      SELECT 1 FROM wrong_mastered wm WHERE wm.user_id = rs.user_id AND wm.question_id = rs.question_id
    )
  `).get(uid, addDays(7)).c || 0;
  res.json({ code: 0, data: { dueToday, dueWeek } });
});

// 遗忘曲线复习概览 + 待复习列表
router.get('/review', requireAuth, (req, res) => {
  const uid = req.userId;
  const today = todayStr();

  const due = db.prepare(`
    SELECT q.id, q.subject, q.chapter, q.stem, q.options, q.answer, q.analysis, q.source, q.image, q.images,
           rs.stage, rs.next_due, rs.created_at AS first_wrong
    FROM review_schedule rs JOIN questions q ON q.id = rs.question_id
    WHERE rs.user_id = ? AND rs.next_due <= ? AND NOT EXISTS (
      SELECT 1 FROM wrong_mastered wm WHERE wm.user_id = rs.user_id AND wm.question_id = q.id
    )
    ORDER BY rs.next_due ASC, rs.stage DESC
  `).all(uid, today);

  const dueToday = due.filter(r => r.next_due === today).length;
  const dueTomorrow = due.filter(r => r.next_due === addDays(1)).length;
  const dueWeek = due.filter(r => r.next_due <= addDays(7)).length;

  // 复习日历：一次分组查询替代逐日 14 次查询
  const calRows = db.prepare(`
    SELECT rs.next_due AS d, COUNT(*) AS c FROM review_schedule rs
    WHERE rs.user_id = ? AND rs.next_due BETWEEN ? AND ? AND NOT EXISTS (
      SELECT 1 FROM wrong_mastered wm WHERE wm.user_id = rs.user_id AND wm.question_id = rs.question_id
    )
    GROUP BY rs.next_due
  `).all(uid, addDays(-7), addDays(6));
  const calMap = new Map(calRows.map(r => [r.d, r.c]));
  const calendar = [];
  for (let i = -7; i <= 6; i++) {
    const d = addDays(i);
    calendar.push({ date: d, count: calMap.get(d) || 0, isToday: d === today });
  }

  const stages = db.prepare(
    'SELECT stage, COUNT(*) AS c FROM review_schedule WHERE user_id = ? GROUP BY stage ORDER BY stage'
  ).all(uid);
  const masteredCount = db.prepare('SELECT COUNT(*) AS c FROM wrong_mastered WHERE user_id = ?').get(uid).c || 0;

  res.json({
    code: 0,
    data: {
      due: due.map(r => withImages({ ...r, options: JSON.parse(r.options) })),
      dueToday,
      dueTomorrow,
      dueWeek,
      total: due.length,
      calendar,
      stages,
      masteredCount
    }
  });
});

// 复习答题：答对推进遗忘阶段，答错重置；主观题由用户自判（correct 字段）
router.post('/review/submit', requireAuth, submitLimiter, (req, res) => {
  const { question_id, answer, correct: selfCorrect } = req.body || {};
  const qid = Number(question_id);
  if (!Number.isInteger(qid) || qid <= 0) return res.status(400).json({ code: 400, message: '无效的题目 ID' });
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(qid);
  if (!q) return res.status(404).json({ code: 404, message: '题目不存在' });
  const ans = String(answer ?? '').slice(0, 50);
  const correct = gradeAnswer(q, ans, selfCorrect);

  // 作答记录 + 复习阶段推进放入同一事务，避免半提交
  let mastered = false;
  let stage = 0;
  tx(() => {
    db.prepare('INSERT INTO practice_records (user_id, question_id, answer, is_correct) VALUES (?,?,?,?)')
      .run(req.userId, q.id, ans, correct ? 1 : 0);

    const rs = db.prepare('SELECT id, stage FROM review_schedule WHERE user_id = ? AND question_id = ?').get(req.userId, q.id);
    stage = rs ? rs.stage : 0;
    if (correct) {
      if (rs) {
        const nextStage = rs.stage + 1;
        if (nextStage >= REVIEW_INTERVALS.length) {
          db.prepare('INSERT OR IGNORE INTO wrong_mastered (user_id, question_id) VALUES (?,?)').run(req.userId, q.id);
          db.prepare('DELETE FROM review_schedule WHERE id = ?').run(rs.id);
          mastered = true;
        } else {
          db.prepare('UPDATE review_schedule SET stage = ?, next_due = ? WHERE id = ?')
            .run(nextStage, addDays(REVIEW_INTERVALS[nextStage]), rs.id);
          stage = nextStage;
        }
      }
    } else {
      if (rs) {
        db.prepare('UPDATE review_schedule SET stage = 0, next_due = ? WHERE id = ?').run(addDays(1), rs.id);
        stage = 0;
      } else {
        scheduleReview(req.userId, q.id);
      }
    }
  });

  res.json({
    code: 0,
    data: {
      correct,
      answer: q.answer,
      analysis: q.analysis,
      options: JSON.parse(q.options),
      stage,
      mastered,
      next_due: mastered ? null : addDays(REVIEW_INTERVALS[stage])
    }
  });
});

// 记录 AI 练习会话成绩（用于任务统计与历史）
// 会话由 /ai/paper 生成时服务端创建，此处仅允许更新成绩，防止客户端伪造 total/correct 刷成就/任务
router.post('/ai-session', requireAuth, (req, res) => {
  const { correct } = req.body || {};
  const pending = db.prepare(
    "SELECT id, total FROM practice_sessions WHERE user_id = ? AND mode = 'ai' AND correct = 0 ORDER BY id DESC LIMIT 1"
  ).get(req.userId);
  if (!pending) return res.status(403).json({ code: 403, message: '无进行中的 AI 练习会话' });
  const c = Math.min(Math.max(Number(correct) || 0, 0), pending.total);
  const score = pending.total ? Math.round((c / pending.total) * 100 * 10) / 10 : 0;
  db.prepare('UPDATE practice_sessions SET correct = ?, score = ? WHERE id = ?').run(c, score, pending.id);
  res.json({ code: 0, data: { ok: true } });
});

// 每日一练完成状态（今日答题 >= 20 题视为完成，与每日任务阈值一致）
router.get('/daily-status', requireAuth, (req, res) => {
  const row = db.prepare(
    `SELECT COUNT(*) AS c FROM practice_records WHERE user_id = ? AND date(created_at) = date('now','localtime')`
  ).get(req.userId);
  const c = row.c || 0;
  res.json({ code: 0, data: { answeredToday: c, done: c >= 20 } });
});

// 我的模拟考试记录
router.get('/sessions', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT id, subject, mode, total, correct, score, created_at
     FROM practice_sessions WHERE user_id = ? AND mode = 'exam'
     ORDER BY id DESC LIMIT 50`
  ).all(req.userId);
  res.json({ code: 0, data: rows });
});

// 模拟考试详情（回顾答题明细）
router.get('/sessions/:id', requireAuth, (req, res) => {
  const session = db.prepare('SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.userId);
  if (!session) return res.status(404).json({ code: 404, message: '考试记录不存在' });
  const records = db.prepare(
    `SELECT r.question_id, r.answer AS user_answer, r.is_correct,
            q.subject, q.chapter, q.stem, q.options, q.answer AS right_answer, q.analysis, q.image, q.images
     FROM practice_records r JOIN questions q ON q.id = r.question_id
     WHERE r.user_id = ? AND r.session_id = ? ORDER BY r.id`
  ).all(req.userId, session.id);
  res.json({ code: 0, data: { ...session, records: records.map(r => withImages({ ...r, options: JSON.parse(r.options) })) } });
});

export default router;
