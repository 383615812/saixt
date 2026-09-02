import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { withImages } from '../utils.js';

const router = Router();

// 收藏 / 取消收藏
router.post('/favorites/toggle', requireAuth, (req, res) => {
  const questionId = Number(req.body?.question_id);
  if (!questionId) return res.status(400).json({ code: 400, message: '缺少题目 ID' });

  const exists = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND question_id = ?').get(req.userId, questionId);
  if (exists) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND question_id = ?').run(req.userId, questionId);
    res.json({ code: 0, data: { favorited: false } });
  } else {
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, question_id) VALUES (?, ?)').run(req.userId, questionId);
    res.json({ code: 0, data: { favorited: true } });
  }
});

// 我的收藏列表
router.get('/favorites', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT q.id, q.subject, q.chapter, q.type, q.difficulty, q.stem, q.options, q.answer, q.analysis, q.source, q.image, q.images,
           f.created_at AS fav_time
    FROM favorites f
    JOIN questions q ON q.id = f.question_id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(req.userId);

  const list = rows.map(q => withImages({ ...q, options: JSON.parse(q.options) }));
  res.json({ code: 0, data: list });
});

export default router;
