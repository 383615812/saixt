import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { getBalance, spendPoints, isVip, addAiTopup, tx } from '../commerce.js';

const router = Router();

// 积分总览：余额 + 今日可获取 + 流水 + 兑换商品
router.get('/points/me', requireAuth, (req, res) => {
  const uid = req.userId;
  const balance = getBalance(uid);
  const { limit = 30, offset = 0 } = req.query;
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  // 今日已获取
  const todayGain = db.prepare(
    `SELECT COALESCE(SUM(change),0) AS s FROM point_logs
     WHERE user_id = ? AND change > 0 AND date(created_at) = date('now','localtime')`
  ).get(uid).s || 0;

  // 流水（分页）
  const logTotal = db.prepare('SELECT COUNT(*) AS c FROM point_logs WHERE user_id = ?').get(uid).c || 0;
  const logs = db.prepare(
    `SELECT change, reason, ref, created_at FROM point_logs
     WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(uid, safeLimit, safeOffset);
  logs.total = logTotal;
  logs.page = Math.floor(safeOffset / safeLimit) + 1;
  logs.pageSize = safeLimit;

  res.json({ code: 0, data: { balance, todayGain, logs, exchanges: EXCHANGES } });
});

// 积分兑换商品目录：积分 → AI 次数包
const EXCHANGES = {
  ai_chat_5: { name: 'AI 答疑 5 次', desc: 'AI 智能答疑次数，不限科目', cost: 100, kind: 'chat', count: 5 },
  ai_chat_20: { name: 'AI 答疑 20 次', desc: 'AI 智能答疑次数，不限科目', cost: 360, kind: 'chat', count: 20 },
  ai_generate_3: { name: 'AI 练习 3 组', desc: 'AI 生成同类练习题 3 组', cost: 150, kind: 'generate', count: 3 },
  ai_generate_10: { name: 'AI 练习 10 组', desc: 'AI 生成同类练习题 10 组', cost: 450, kind: 'generate', count: 10 }
};

// 积分兑换 AI 次数包（免费用户每日额度用完后，可消耗兑换的次数包继续使用）
router.post('/points/exchange', requireAuth, (req, res) => {
  const { product } = req.body || {};
  const item = EXCHANGES[product];
  if (!item) return res.status(400).json({ code: 400, message: '无效的兑换商品' });
  if (isVip(req.userId)) return res.status(400).json({ code: 400, message: 'VIP 会员已享无限 AI，无需兑换' });

  // 扣积分与加次数包在同一事务内，避免扣分成功但未到账
  const bal = tx(() => {
    const b = spendPoints(req.userId, item.cost, `兑换${item.name}`, product);
    if (b === null) return null;
    addAiTopup(req.userId, item.kind, item.count);
    return b;
  });
  if (bal === null) return res.status(400).json({ code: 400, message: '积分不足' });
  res.json({ code: 0, data: { balance: bal, message: `已兑换「${item.name}」` } });
});

export default router;
