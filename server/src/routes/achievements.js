import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { addPoints, tx } from '../commerce.js';

const router = Router();

export const CATALOG = [
  { key: 'first_checkin', name: '初次打卡', desc: '完成第一次学习打卡', icon: '🔥', tier: 'bronze', points: 10 },
  { key: 'checkin_7', name: '坚持一周', desc: '累计打卡 7 天', icon: '📅', tier: 'silver', points: 30 },
  { key: 'checkin_30', name: '月度达人', desc: '累计打卡 30 天', icon: '🗓', tier: 'gold', points: 100 },
  { key: 'practice_100', name: '初露锋芒', desc: '累计刷题 100 题', icon: '✏️', tier: 'bronze', points: 20 },
  { key: 'practice_500', name: '刷题达人', desc: '累计刷题 500 题', icon: '📚', tier: 'silver', points: 60 },
  { key: 'practice_1000', name: '刷题狂人', desc: '累计刷题 1000 题', icon: '🏆', tier: 'gold', points: 150 },
  { key: 'accuracy_80', name: '精准出击', desc: '正确率达到 80%', icon: '🎯', tier: 'silver', points: 50 },
  { key: 'exam_first', name: '首战告捷', desc: '完成第一次模拟考试', icon: '⏱', tier: 'bronze', points: 15 },
  { key: 'exam_90', name: '高分学霸', desc: '模拟考试得分 90 分以上', icon: '💯', tier: 'gold', points: 120 },
  { key: 'ai_first', name: '智能探索', desc: '完成第一次 AI 练习', icon: '🤖', tier: 'bronze', points: 10 },
  { key: 'ai_50', name: 'AI 达人', desc: '累计完成 50 道 AI 练习', icon: '✨', tier: 'silver', points: 60 },
  { key: 'fav_10', name: '收藏达人', desc: '收藏 10 道好题', icon: '⭐', tier: 'silver', points: 40 },
  { key: 'daily_all', name: '全勤标兵', desc: '一天内完成全部每日任务', icon: '🏅', tier: 'gold', points: 100 },
  { key: 'plan_gen', name: '规划大师', desc: '生成个性化学习计划', icon: '🗺', tier: 'silver', points: 40 },
  { key: 'analysis_use', name: '知己知彼', desc: '使用 AI 学情分析', icon: '🔍', tier: 'bronze', points: 10 }
];

function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// 计算并发放成就
router.get('/achievements', requireAuth, (req, res) => {
  const uid = req.userId;

  // 刷题类成就按去重后的题目数统计，防止重复提交同一题灌水
  const total = db.prepare('SELECT COUNT(DISTINCT question_id) AS c FROM practice_records WHERE user_id = ?').get(uid).c || 0;
  const correct = db.prepare('SELECT COUNT(DISTINCT question_id) AS c FROM practice_records WHERE user_id = ? AND is_correct = 1').get(uid).c || 0;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const checkinCount = db.prepare('SELECT COUNT(*) AS c FROM checkins WHERE user_id = ?').get(uid).c || 0;
  const examCount = db.prepare("SELECT COUNT(*) AS c FROM practice_sessions WHERE user_id = ? AND mode = 'exam'").get(uid).c || 0;
  const bestExam = db.prepare("SELECT MAX(score) AS s FROM practice_sessions WHERE user_id = ? AND mode = 'exam'").get(uid).s || 0;
  const aiCount = db.prepare("SELECT COUNT(*) AS c FROM practice_sessions WHERE user_id = ? AND mode = 'ai'").get(uid).c || 0;
  const aiTotal = db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM practice_sessions WHERE user_id = ? AND mode = 'ai'").get(uid).s || 0;
  const favCount = db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?').get(uid).c || 0;
  const planCount = db.prepare('SELECT COUNT(*) AS c FROM study_plans WHERE user_id = ?').get(uid).c || 0;

  // 是否某一天完成全部每日任务（近 30 天）
  let dailyAll = false;
  const days = db.prepare(`
    SELECT date(created_at) AS d FROM practice_records WHERE user_id = ? AND date(created_at) >= date('now','localtime','-29 days') GROUP BY d
  `).all(uid).map(r => r.d);
  for (const d of days) {
    const p = db.prepare('SELECT COUNT(*) AS c FROM practice_records WHERE user_id = ? AND date(created_at) = ?').get(uid, d).c || 0;
    const ai = db.prepare("SELECT COUNT(*) AS c FROM practice_sessions WHERE user_id = ? AND mode = 'ai' AND date(created_at) = ?").get(uid, d).c || 0;
    const ex = db.prepare("SELECT COUNT(*) AS c FROM practice_sessions WHERE user_id = ? AND mode = 'exam' AND date(created_at) = ?").get(uid, d).c || 0;
    const fav = db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ? AND date(created_at) = ?').get(uid, d).c || 0;
    const ck = db.prepare('SELECT 1 FROM checkins WHERE user_id = ? AND date = ?').get(uid, d);
    if (p >= 20 && ai >= 1 && ex >= 1 && fav >= 1 && ck) { dailyAll = true; break; }
  }

  const earnedMap = {
    first_checkin: checkinCount >= 1,
    checkin_7: checkinCount >= 7,
    checkin_30: checkinCount >= 30,
    practice_100: total >= 100,
    practice_500: total >= 500,
    practice_1000: total >= 1000,
    accuracy_80: total >= 20 && accuracy >= 80,
    exam_first: examCount >= 1,
    exam_90: bestExam >= 90,
    ai_first: aiCount >= 1,
    ai_50: aiTotal >= 50,
    fav_10: favCount >= 10,
    daily_all: dailyAll,
    plan_gen: planCount >= 1,
    analysis_use: db.prepare('SELECT 1 FROM ai_analysis WHERE user_id = ?').get(uid) ? true : false
  };

  // 记录新获得的成就（首次获得发放积分）：以 INSERT OR IGNORE 的 changes 原子判定，
  // 并用事务包裹「记录成就 + 发放积分」，避免并发重复发分或只记成就不发分
  const insert = db.prepare('INSERT OR IGNORE INTO achievements (user_id, key) VALUES (?,?)');
  const earnedAt = {};
  tx(() => {
    for (const a of CATALOG) {
      if (earnedMap[a.key]) {
        const info = insert.run(uid, a.key);
        if (info.changes > 0 && a.points) addPoints(uid, a.points, `成就「${a.name}」`, a.key);
        const row = db.prepare('SELECT earned_at FROM achievements WHERE user_id = ? AND key = ?').get(uid, a.key);
        earnedAt[a.key] = row ? row.earned_at : null;
      }
    }
  });

  const list = CATALOG.map(a => {
    const prog = {
      first_checkin: [Math.min(checkinCount, 1), 1],
      checkin_7: [Math.min(checkinCount, 7), 7],
      checkin_30: [Math.min(checkinCount, 30), 30],
      practice_100: [Math.min(total, 100), 100],
      practice_500: [Math.min(total, 500), 500],
      practice_1000: [Math.min(total, 1000), 1000],
      accuracy_80: [Math.min(accuracy, 80), 80],
      exam_first: [Math.min(examCount, 1), 1],
      exam_90: [Math.min(bestExam, 90), 90],
      ai_first: [Math.min(aiCount, 1), 1],
      ai_50: [Math.min(aiTotal, 50), 50],
      fav_10: [Math.min(favCount, 10), 10],
      daily_all: [0, 1],
      plan_gen: [Math.min(planCount, 1), 1],
      analysis_use: [0, 1]
    }[a.key] || [0, 1];
    return {
      ...a,
      earned: !!earnedMap[a.key],
      earned_at: earnedAt[a.key] || null,
      progress: prog[0],
      progress_target: prog[1]
    };
  });

  const earnedCount = list.filter(a => a.earned).length;
  res.json({ code: 0, data: { list, earnedCount, total: list.length, percent: Math.round((earnedCount / list.length) * 100) } });
});

export default router;
