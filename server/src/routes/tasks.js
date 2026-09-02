import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// 每日任务及完成情况
router.get('/tasks', requireAuth, (req, res) => {
  const uid = req.userId;
  const date = today();

  const checkin = db.prepare('SELECT 1 FROM checkins WHERE user_id = ? AND date = ?').get(uid, date);
  const practiced = db.prepare(
    `SELECT COUNT(*) AS c FROM practice_records WHERE user_id = ? AND date(created_at) = date('now','localtime')`
  ).get(uid).c || 0;
  const ai = db.prepare(
    `SELECT COUNT(*) AS c FROM practice_sessions WHERE user_id = ? AND mode = 'ai' AND date(created_at) = date('now','localtime')`
  ).get(uid).c || 0;
  const exam = db.prepare(
    `SELECT COUNT(*) AS c FROM practice_sessions WHERE user_id = ? AND mode = 'exam' AND date(created_at) = date('now','localtime')`
  ).get(uid).c || 0;
  const fav = db.prepare(
    `SELECT COUNT(*) AS c FROM favorites WHERE user_id = ? AND date(created_at) = date('now','localtime')`
  ).get(uid).c || 0;

  const tasks = [
    { key: 'checkin', name: '每日打卡', desc: '完成一次学习打卡，开启元气一天', target: 1, done: checkin ? 1 : 0, icon: '🔥', link: '/dashboard' },
    { key: 'practice', name: '刷题 20 道', desc: '今日完成 20 道练习题', target: 20, done: Math.min(practiced, 20), icon: '✎', link: '/practice' },
    { key: 'ai', name: 'AI 练习 1 组', desc: '完成一组 AI 智能练习', target: 1, done: Math.min(ai, 1), icon: '✦', link: '/ai-practice' },
    { key: 'exam', name: '模拟考试 1 次', desc: '完成一次模拟考试自测', target: 1, done: Math.min(exam, 1), icon: '⏱', link: '/practice?mode=exam' },
    { key: 'favorite', name: '收藏 1 题', desc: '收藏一道值得反复看的好题', target: 1, done: Math.min(fav, 1), icon: '★', link: '/bank' }
  ];

  const completed = tasks.filter(t => t.done >= t.target).length;
  const percent = Math.round((completed / tasks.length) * 100);

  res.json({ code: 0, data: { date, tasks, completed, total: tasks.length, percent } });
});

export default router;
