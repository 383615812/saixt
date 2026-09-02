import { Router } from 'express';
import { db } from '../db.js';
import { verifyToken } from '../auth.js';
import { withImages } from '../utils.js';

const router = Router();
const DAILY_COUNT = 5;

// 每日推荐：登录用户优先薄弱章节，未登录随机
router.get('/', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const uid = verifyToken(token);

  let qs = [];
  if (uid) {
    const rows = db.prepare(`
      SELECT q.subject, q.chapter, COUNT(r.id) AS total, SUM(r.is_correct) AS correct
      FROM practice_records r JOIN questions q ON q.id = r.question_id
      WHERE r.user_id = ?
      GROUP BY q.subject, q.chapter
    `).all(uid);
    const weak = rows.filter(m => m.total >= 2 && (m.correct / m.total) < 0.6);
    if (weak.length) {
      const per = Math.max(1, Math.floor(DAILY_COUNT / weak.length));
      for (const w of weak) {
        const picked = db.prepare(
          `SELECT id, subject, chapter, type, difficulty, stem, options, source, image, images
           FROM questions WHERE subject = ? AND chapter = ? ORDER BY RANDOM() LIMIT ?`
        ).all(w.subject, w.chapter, per);
        qs.push(...picked);
      }
      qs = qs.slice(0, DAILY_COUNT);
    }
  }

  if (qs.length < DAILY_COUNT) {
    const need = DAILY_COUNT - qs.length;
    const ids = qs.map(q => q.id);
    let extra;
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      extra = db.prepare(
        `SELECT id, subject, chapter, type, difficulty, stem, options, source, image, images
         FROM questions WHERE id NOT IN (${ph}) ORDER BY RANDOM() LIMIT ?`
      ).all(...ids, need);
    } else {
      extra = db.prepare(
        `SELECT id, subject, chapter, type, difficulty, stem, options, source, image, images
         FROM questions ORDER BY RANDOM() LIMIT ?`
      ).all(need);
    }
    qs.push(...extra);
  }

  const today = new Date().toISOString().slice(0, 10);
  res.json({
    code: 0,
    data: {
      date: today,
      count: qs.length,
      questions: qs.map(q => withImages({ ...q, options: JSON.parse(q.options) }))
    }
  });
});

export default router;