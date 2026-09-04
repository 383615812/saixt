import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { ensureInviteCode, bindInvite } from '../commerce.js';

const router = Router();

// 我的邀请信息：邀请码 + 邀请记录 + 累计奖励
router.get('/invite/me', requireAuth, (req, res) => {
  const uid = req.userId;
  const code = ensureInviteCode(uid);
  const user = db.prepare('SELECT nickname FROM users WHERE id = ?').get(uid);

  const list = db.prepare(`
    SELECT i.invitee_id, u.nickname, u.created_at AS registered_at, i.created_at
    FROM invites i JOIN users u ON u.id = i.invitee_id
    WHERE i.inviter_id = ? ORDER BY i.id DESC
  `).all(uid);

  const totalReward = db.prepare(
    `SELECT COALESCE(SUM(change),0) AS s FROM point_logs WHERE user_id = ? AND reason LIKE '邀请%'`
  ).get(uid).s || 0;

  const bound = db.prepare('SELECT inviter_id FROM invites WHERE invitee_id = ?').get(uid);

  res.json({ code: 0, data: { code, nickname: user?.nickname || '', count: list.length, totalReward, list, my_inviter_id: bound?.inviter_id || null } });
});

// 使用邀请码（注册后绑定，双方各得积分）
router.post('/invite/redeem', requireAuth, (req, res) => {
  const { code } = req.body || {};
  if (!code || !/^[A-Z2-9]{6}$/.test(String(code).toUpperCase())) {
    return res.status(400).json({ code: 400, message: '邀请码格式不正确' });
  }
  const uid = req.userId;
  const inviter = db.prepare('SELECT id FROM users WHERE invite_code = ?').get(String(code).toUpperCase());
  if (!inviter) return res.status(404).json({ code: 404, message: '邀请码不存在' });
  if (inviter.id === uid) return res.status(400).json({ code: 400, message: '不能使用自己的邀请码' });

  const bound = db.prepare('SELECT 1 FROM invites WHERE invitee_id = ?').get(uid);
  if (bound) return res.status(400).json({ code: 400, message: '已绑定过邀请码' });

  const result = bindInvite(inviter.id, uid, String(code).toUpperCase(), req.ip);
  if (!result.ok) return res.status(400).json({ code: 400, message: result.message });
  res.json({ code: 0, data: { message: result.message } });
});

export default router;
