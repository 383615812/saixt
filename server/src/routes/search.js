import { Router } from 'express';
import { db } from '../db.js';
import { withImages } from '../utils.js';

const router = Router();

// 全局搜索：题目 + 院校 + 专业（真实数据，不返回答案）
router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ code: 0, data: { questions: [], schools: [], plans: [] } });
  const like = `%${q}%`;

  const questions = db.prepare(
    `SELECT id, subject, chapter, type, difficulty, stem, source FROM questions
     WHERE stem LIKE ? OR source LIKE ? ORDER BY id LIMIT 10`
  ).all(like, like);

  const schools = db.prepare(
    `SELECT code, name, plans, majors, tuition_range FROM schools
     WHERE name LIKE ? OR code LIKE ? ORDER BY plans DESC LIMIT 8`
  ).all(like, like);

  const plans = db.prepare(
    `SELECT DISTINCT major_name, school_name, school_code FROM plans
     WHERE major_name LIKE ? ORDER BY plan DESC LIMIT 8`
  ).all(like);

  res.json({ code: 0, data: { questions: questions.map(withImages), schools, plans } });
});

export default router;
