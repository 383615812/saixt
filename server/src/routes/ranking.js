import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { createCache } from '../utils.js';

const router = Router();

// 榜单数据为读多写少、允许轻微过期的聚合结果，做 30s 短时缓存，
// 避免每次翻榜都全表 GROUP BY。用户"我的排名"仍按自身 ID 实时计算。
const rankingCache = createCache(30_000);

// 排行榜：按累计答对题数排序（真实刷题记录），支持分页与并列排名
router.get('/', requireAuth, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  // 全部有作答用户的聚合结果（表级扫码只在小窗口内执行一次）
  const all = rankingCache.get('all', () => db.prepare(
    `SELECT u.id AS user_id, u.nickname,
            COUNT(r.id) AS total,
            SUM(r.is_correct) AS correct
     FROM practice_records r
     JOIN users u ON u.id = r.user_id
     GROUP BY u.id
     HAVING total > 0
     ORDER BY correct DESC, total ASC`
  ).all());

  const total_users = all.length;

  // 分页切片
  const rows = all.slice(offset, offset + limit);

  // 并列排名：答对数相同则名次相同（1,2,2,4）
  const list = [];
  let prevCorrect = null;
  let prevRank = 0;
  rows.forEach((r, i) => {
    const rank = r.correct === prevCorrect ? prevRank : offset + i + 1;
    prevCorrect = r.correct;
    prevRank = rank;
    list.push({
      rank,
      user_id: r.user_id,
      nickname: r.nickname,
      total: r.total,
      correct: r.correct,
      accuracy: r.total ? Math.round((r.correct / r.total) * 1000) / 10 : 0
    });
  });

  // 当前用户排名：答对数严格多于我的用户数 + 1（并列同名次）
  // 个人累计量走 user_id 索引直查，再在缓存的全量聚合里计数，避免全表聚合
  let mine = null;
  const myRow = db.prepare(
    `SELECT COUNT(r.id) AS total, SUM(r.is_correct) AS correct
     FROM practice_records r WHERE r.user_id = ?`
  ).get(req.userId);
  if (myRow && myRow.total > 0) {
    const better = all.filter(r => r.correct > myRow.correct).length;
    const user = db.prepare('SELECT nickname FROM users WHERE id = ?').get(req.userId);
    mine = {
      rank: better + 1,
      user_id: req.userId,
      nickname: user?.nickname || '',
      total: myRow.total,
      correct: myRow.correct,
      accuracy: myRow.total ? Math.round((myRow.correct / myRow.total) * 1000) / 10 : 0
    };
  }

  res.json({ code: 0, data: { list, mine, total_users } });
});

export default router;
