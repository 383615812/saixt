import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { addPoints, tx } from '../commerce.js';
import { todayStr, addDaysTo } from '../utils.js';

const router = Router();

// 今日打卡
router.post('/checkin', requireAuth, (req, res) => {
  const date = todayStr();
  let reward = null;
  // 打卡记录 + 积分发放在同一事务内，避免并发下重复发放或记录与积分不一致
  tx(() => {
    const info = db.prepare('INSERT OR IGNORE INTO checkins (user_id, date) VALUES (?, ?)').run(req.userId, date);
    if (info.changes > 0) {
      reward = 10;
      addPoints(req.userId, reward, '每日打卡奖励', date);
    }
  });
  res.json({ code: 0, data: { date, checked: true, reward } });
});

// 我的打卡记录
router.get('/checkin/me', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT date FROM checkins WHERE user_id = ? ORDER BY date').all(req.userId);
  const dates = new Set(rows.map(r => r.date));
  const today = todayStr();

  // 连续打卡天数（从今天或昨天往前数）
  let streak = 0;
  let cursor = dates.has(today) ? today : addDaysTo(today, -1);
  while (dates.has(cursor)) {
    streak++;
    cursor = addDaysTo(cursor, -1);
  }

  // 本月打卡天数
  const monthPrefix = today.slice(0, 7);
  const monthCount = rows.filter(r => r.date.startsWith(monthPrefix)).length;

  // 最近 10 周热力图数据
  const heatmap = [];
  for (let i = 9; i >= 0; i--) {
    const start = addDaysTo(today, -i * 7 - 6);
    const week = [];
    for (let j = 0; j < 7; j++) {
      const d = addDaysTo(start, j);
      week.push({ date: d, checked: dates.has(d), isToday: d === today });
    }
    heatmap.push(week);
  }

  res.json({
    code: 0,
    data: {
      checkedToday: dates.has(today),
      streak,
      total: rows.length,
      monthCount,
      heatmap
    }
  });
});

export default router;
