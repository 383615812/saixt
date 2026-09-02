import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { formatDate, createCache } from '../utils.js';
import { CATALOG } from './achievements.js';

const router = Router();

// 平台级聚合（题目/用户/作答/分布）读多写少，60s 短时缓存，
// 避免看板每次刷新都全表扫码；用户级统计仍实时计算。
const dashboardCache = createCache(60_000);

function computePlatformDashboard() {
  const totalQuestions = db.prepare('SELECT COUNT(*) AS c FROM questions').get().c;
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const totalPracticeRecords = db.prepare('SELECT COUNT(*) AS c FROM practice_records').get().c;
  const totalSchools = db.prepare('SELECT COUNT(*) AS c FROM schools').get().c;
  const totalAiQuestions = db.prepare("SELECT COUNT(*) AS c FROM questions WHERE source = 'AI生成'").get().c;

  const overview = { totalQuestions, totalUsers, totalPracticeRecords, totalSchools, totalAiQuestions };

  const subjectRows = db.prepare('SELECT subject, type, COUNT(*) AS cnt FROM questions GROUP BY subject, type ORDER BY subject, type').all();
  const subjectMap = {};
  for (const r of subjectRows) {
    if (!subjectMap[r.subject]) subjectMap[r.subject] = { subject: r.subject, total: 0, single: 0, multiple: 0, judge: 0, subjective: 0 };
    subjectMap[r.subject].total += r.cnt;
    if (r.type === 'single') subjectMap[r.subject].single = r.cnt;
    else if (r.type === 'multiple') subjectMap[r.subject].multiple = r.cnt;
    else if (r.type === 'judge') subjectMap[r.subject].judge = r.cnt;
    else if (r.type === 'subjective') subjectMap[r.subject].subjective = r.cnt;
  }
  const subjectStats = Object.values(subjectMap);

  const diffRows = db.prepare('SELECT difficulty, COUNT(*) AS cnt FROM questions WHERE difficulty IS NOT NULL GROUP BY difficulty ORDER BY difficulty').all();
  const difficultyDist = { 1: { level: 1, label: '基础', count: 0 }, 2: { level: 2, label: '中等', count: 0 }, 3: { level: 3, label: '较难', count: 0 } };
  for (const r of diffRows) {
    if (difficultyDist[r.difficulty]) difficultyDist[r.difficulty].count = r.cnt;
  }

  const typeRows = db.prepare('SELECT type, COUNT(*) AS cnt FROM questions WHERE type IS NOT NULL GROUP BY type ORDER BY cnt DESC').all();
  const typeDist = {};
  for (const r of typeRows) typeDist[r.type] = r.cnt;

  const days = 14;
  const trendRows = db.prepare(
    `SELECT date(created_at) AS d, COUNT(*) AS total, SUM(is_correct) AS correct
     FROM practice_records WHERE created_at >= date('now','localtime', ?) GROUP BY date(created_at) ORDER BY d`
  ).all(`-${days - 1} days`);
  const byDate = {};
  for (const r of trendRows) byDate[r.d] = { total: r.total, correct: r.correct || 0 };
  const userTrend = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const item = byDate[key] || { total: 0, correct: 0 };
    userTrend.push({ date: key, total: item.total, correct: item.correct, accuracy: item.total ? Math.round((item.correct / item.total) * 100) : 0 });
  }

  return { overview, subjectStats, difficultyDist, typeDist, userTrend };
}

// 个人学习统计（个人中心）
router.get('/me', requireAuth, (req, res) => {
  const uid = req.userId;

  const total = db.prepare('SELECT COUNT(*) AS c FROM practice_records WHERE user_id = ?').get(uid).c;
  const correct = db.prepare('SELECT COUNT(*) AS c FROM practice_records WHERE user_id = ? AND is_correct = 1').get(uid).c;
  const wrong = total - correct;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;

  const sessions = db.prepare('SELECT COUNT(*) AS c FROM practice_sessions WHERE user_id = ?').get(uid).c;
  const lastSession = db.prepare('SELECT * FROM practice_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(uid);

  const bySubject = db.prepare(
    `SELECT q.subject, COUNT(*) AS total, SUM(r.is_correct) AS correct
     FROM practice_records r JOIN questions q ON q.id = r.question_id
     WHERE r.user_id = ? GROUP BY q.subject`
  ).all(uid).map(s => ({ subject: s.subject, total: s.total, correct: s.correct || 0 }));

  // 预测得分（职业技能 300 分制）：按综合正确率估算
  const predict = {
    info_tech: Math.round(150 * (bySubject.find(s => s.subject === '信息技术')?.correct || 0) /
      Math.max(1, (bySubject.find(s => s.subject === '信息技术')?.total || 1))),
    general_tech: Math.round(150 * (bySubject.find(s => s.subject === '通用技术')?.correct || 0) /
      Math.max(1, (bySubject.find(s => s.subject === '通用技术')?.total || 1))),
    total: 0
  };
  predict.total = predict.info_tech + predict.general_tech;

  // 文化素质折算分（会考等级 → 300 分制，A=300/B=267/C=233/D=200，平台估算，以官方公布为准）
  const gradeScore = { A: 90, B: 80, C: 70, D: 60 };
  const profile = db.prepare('SELECT hui_kao_scores FROM user_profiles WHERE user_id = ?').get(uid);
  let cultural = null;
  let huiKaoScores = null;
  if (profile?.hui_kao_scores) {
    try {
      huiKaoScores = JSON.parse(profile.hui_kao_scores);
      const grades = Object.values(huiKaoScores).map(g => gradeScore[String(g).toUpperCase()]).filter(v => v != null);
      if (grades.length) {
        // 平均等级分（满分 90）折算到 300 分制：avg * 300 / 90
        cultural = Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10 / 3);
      }
    } catch (e) { /* 忽略解析失败 */ }
  }

  // 总分测算 = 文化素质折算 + 职业技能预测
  const totalScore = cultural != null ? cultural + predict.total : null;

  res.json({
    code: 0,
    data: {
      total, correct, wrong, accuracy, sessions, lastSession, bySubject, predict,
      cultural, huiKaoScores, totalScore
    }
  });
});

// 知识点掌握度（按章节统计）
router.get('/mastery', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT q.subject, q.chapter,
           COUNT(r.id) AS total,
           SUM(r.is_correct) AS correct
    FROM practice_records r
    JOIN questions q ON q.id = r.question_id
    WHERE r.user_id = ?
    GROUP BY q.subject, q.chapter
    ORDER BY q.subject, q.chapter
  `).all(req.userId);

  const list = rows.map(r => ({
    subject: r.subject,
    chapter: r.chapter,
    total: r.total,
    correct: r.correct || 0,
    accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0
  }));

  // 薄弱章节（做过且正确率 < 60%）
  const weak = list.filter(x => x.total >= 2 && x.accuracy < 60);

  res.json({ code: 0, data: { list, weak } });
});

// 学习趋势（近 14 天每日答题量与正确率）
router.get('/trend', requireAuth, (req, res) => {
  const days = 14;
  const rows = db.prepare(`
    SELECT date(created_at) AS d, COUNT(*) AS total, SUM(is_correct) AS correct
    FROM practice_records WHERE user_id = ? AND created_at >= date('now','localtime', ?)
    GROUP BY date(created_at) ORDER BY d
  `).all(req.userId, `-${days - 1} days`);

  const byDate = {};
  for (const r of rows) byDate[r.d] = { total: r.total, correct: r.correct || 0 };

  const list = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const item = byDate[key] || { total: 0, correct: 0 };
    list.push({
      date: key,
      total: item.total,
      correct: item.correct,
      accuracy: item.total ? Math.round((item.correct / item.total) * 100) : 0
    });
  }

  res.json({ code: 0, data: { list } });
});

// 大屏统计
router.get('/dashboard', requireAuth, (req, res) => {
  const uid = req.userId;

  // 平台级部分（overview/subjectStats/difficultyDist/typeDist/userTrend）走 60s 缓存
  const {
    overview, subjectStats, difficultyDist, typeDist, userTrend
  } = dashboardCache.get('platform', computePlatformDashboard);

  // 6. topSubjects: 用户个人正确率最高的3个科目和最低的3个科目
  const userSubjectRows = db.prepare(`
    SELECT q.subject, COUNT(*) AS total, SUM(r.is_correct) AS correct
    FROM practice_records r
    JOIN questions q ON q.id = r.question_id
    WHERE r.user_id = ?
    GROUP BY q.subject
  `).all(uid);

  const userSubjectList = userSubjectRows
    .map(s => ({
      subject: s.subject,
      total: s.total,
      correct: s.correct || 0,
      accuracy: s.total ? Math.round((s.correct / s.total) * 100) : 0
    }))
    .filter(s => s.total >= 1);

  const sortedByAccuracy = [...userSubjectList].sort((a, b) => b.accuracy - a.accuracy);
  const topSubjects = {
    top3: sortedByAccuracy.slice(0, 3),
    bottom3: sortedByAccuracy.slice(-3).reverse()
  };

  // 7. masteryHeatmap: 用户个人各科目各章节掌握度
  const masteryRows = db.prepare(`
    SELECT q.subject, q.chapter,
           COUNT(r.id) AS total,
           SUM(r.is_correct) AS correct
    FROM practice_records r
    JOIN questions q ON q.id = r.question_id
    WHERE r.user_id = ?
    GROUP BY q.subject, q.chapter
    ORDER BY q.subject, q.chapter
  `).all(uid);

  const masteryHeatmap = masteryRows.map(r => ({
    subject: r.subject,
    chapter: r.chapter,
    total: r.total,
    correct: r.correct || 0,
    accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0
  }));

  // 8. achievements: 用户已获得成就数/总数，各等级数量
  const totalAchievements = CATALOG.length;
  const totalByTier = { bronze: 0, silver: 0, gold: 0 };
  for (const a of CATALOG) totalByTier[a.tier]++;

  const earnedKeys = db.prepare('SELECT key FROM achievements WHERE user_id = ?').all(uid).map(r => r.key);
  const earnedCount = earnedKeys.length;
  const earnedByTier = { bronze: 0, silver: 0, gold: 0 };
  for (const a of CATALOG) {
    if (earnedKeys.includes(a.key)) earnedByTier[a.tier]++;
  }

  const achievements = {
    earned: earnedCount,
    total: totalAchievements,
    byTier: {
      bronze: { earned: earnedByTier.bronze, total: totalByTier.bronze },
      silver: { earned: earnedByTier.silver, total: totalByTier.silver },
      gold: { earned: earnedByTier.gold, total: totalByTier.gold }
    }
  };

  // 9. weeklyCompare: 用户本周 vs 上周数据对比
  // 本周：周一到今天
  const now = new Date();
  const dayOfWeek = now.getDay() || 7; // 周日=0 -> 7
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - (dayOfWeek - 1));
  thisWeekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
  lastWeekEnd.setHours(23, 59, 59, 999);

  const thisWeekStartStr = formatDate(thisWeekStart);
  const lastWeekStartStr = formatDate(lastWeekStart);
  const lastWeekEndStr = formatDate(lastWeekEnd);

  // 本周练习数据
  const thisWeekPractice = db.prepare(`
    SELECT COUNT(*) AS total, SUM(is_correct) AS correct
    FROM practice_records
    WHERE user_id = ? AND date(created_at) >= ?
  `).get(uid, thisWeekStartStr);

  // 上周练习数据
  const lastWeekPractice = db.prepare(`
    SELECT COUNT(*) AS total, SUM(is_correct) AS correct
    FROM practice_records
    WHERE user_id = ? AND date(created_at) >= ? AND date(created_at) <= ?
  `).get(uid, lastWeekStartStr, lastWeekEndStr);

  // 本周打卡天数
  const thisWeekCheckins = db.prepare(`
    SELECT COUNT(*) AS c FROM checkins WHERE user_id = ? AND date >= ?
  `).get(uid, thisWeekStartStr).c;

  // 上周打卡天数
  const lastWeekCheckins = db.prepare(`
    SELECT COUNT(*) AS c FROM checkins WHERE user_id = ? AND date >= ? AND date <= ?
  `).get(uid, lastWeekStartStr, lastWeekEndStr).c;

  // 本周模拟考试次数
  const thisWeekExams = db.prepare(`
    SELECT COUNT(*) AS c FROM practice_sessions WHERE user_id = ? AND mode = 'exam' AND date(created_at) >= ?
  `).get(uid, thisWeekStartStr).c;

  // 上周模拟考试次数
  const lastWeekExams = db.prepare(`
    SELECT COUNT(*) AS c FROM practice_sessions WHERE user_id = ? AND mode = 'exam' AND date(created_at) >= ? AND date(created_at) <= ?
  `).get(uid, lastWeekStartStr, lastWeekEndStr).c;

  const thisWeekTotal = thisWeekPractice.total || 0;
  const thisWeekCorrect = thisWeekPractice.correct || 0;
  const lastWeekTotal = lastWeekPractice.total || 0;
  const lastWeekCorrect = lastWeekPractice.correct || 0;

  const weeklyCompare = {
    thisWeek: {
      total: thisWeekTotal,
      correct: thisWeekCorrect,
      accuracy: thisWeekTotal ? Math.round((thisWeekCorrect / thisWeekTotal) * 100) : 0,
      checkinDays: thisWeekCheckins,
      examCount: thisWeekExams
    },
    lastWeek: {
      total: lastWeekTotal,
      correct: lastWeekCorrect,
      accuracy: lastWeekTotal ? Math.round((lastWeekCorrect / lastWeekTotal) * 100) : 0,
      checkinDays: lastWeekCheckins,
      examCount: lastWeekExams
    }
  };

  res.json({
    code: 0,
    data: {
      overview,
      subjectStats,
      difficultyDist,
      typeDist,
      userTrend,
      topSubjects,
      masteryHeatmap,
      achievements,
      weeklyCompare
    }
  });
});

export default router;
