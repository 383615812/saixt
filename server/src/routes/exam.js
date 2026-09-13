import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { rateLimit } from '../rateLimit.js';
import { examMeta, examChapters, startExam, submitExam, getExam, listExams, ongoingExam } from '../exam.js';

const router = Router();

// 组卷/交卷限流：按用户每 60 秒最多 30 次
const examLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: '操作过于频繁，请稍后再试'
});

// 可组卷科目 / 题量时长预设 / 难度档
router.get('/exam/meta', requireAuth, (req, res) => {
  res.json({ code: 0, data: examMeta() });
});

// 某科目下可组卷的章节与题量（定向组卷用）
router.get('/exam/chapters', requireAuth, (req, res) => {
  const subject = String(req.query.subject || '').trim();
  if (!subject) return res.status(400).json({ code: 400, message: '请提供科目' });
  res.json({ code: 0, data: { chapters: examChapters(subject) } });
});

// 历史模考记录
router.get('/exam/history', requireAuth, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  res.json({ code: 0, data: listExams(req.userId, limit, offset) });
});

// 进行中的试卷（断点续考）
router.get('/exam/ongoing', requireAuth, (req, res) => {
  res.json({ code: 0, data: ongoingExam(req.userId) });
});

// 开始模考（组卷）
router.post('/exam/start', requireAuth, examLimiter, (req, res) => {
  try {
    const ex = startExam(req.userId, req.body || {});
    res.json({ code: 0, data: ex });
  } catch (e) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 试卷详情（考试中不含答案；已交卷含逐题解析）
router.get('/exam/:id', requireAuth, (req, res) => {
  const ex = getExam(req.userId, Number(req.params.id));
  if (!ex) return res.status(404).json({ code: 404, message: '考试不存在' });
  res.json({ code: 0, data: ex });
});

// 交卷（支持超时自动交卷），服务端评分
router.post('/exam/:id/submit', requireAuth, examLimiter, (req, res) => {
  const r = submitExam(req.userId, Number(req.params.id), (req.body || {}).answers);
  if (!r.ok) return res.status(r.code || 400).json({ code: r.code || 400, message: r.message });
  res.json({ code: 0, data: r.data });
});

export default router;
