import { Router } from 'express';
import { db } from '../db.js';
import { signToken, hashPassword, verifyPassword, needsRehash, requireAuth } from '../auth.js';
import { ensureInviteCode, addPoints, bindInvite } from '../commerce.js';
import { rateLimit } from '../rateLimit.js';

const router = Router();

// 登录/注册限流：按 IP 每 10 分钟最多 20 次，防暴力破解
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: '尝试过于频繁，请 10 分钟后再试',
  keyFn: req => `ip:${req.ip}`
});

router.post('/register', authLimiter, (req, res) => {
  const { phone, password, nickname, invite_code } = req.body || {};
  if (!phone || !/^1\d{10}$/.test(phone)) return res.status(400).json({ code: 400, message: '请输入正确的手机号' });
  if (!password || password.length < 6) return res.status(400).json({ code: 400, message: '密码至少6位' });
  const exists = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (exists) return res.status(409).json({ code: 409, message: '该手机号已注册' });
  const ip = req.ip;
  const info = db.prepare('INSERT INTO users (phone, password, nickname, reg_ip) VALUES (?,?,?,?)')
    .run(phone, hashPassword(password), nickname || `考生${phone.slice(-4)}`, ip);
  const uid = Number(info.lastInsertRowid);
  db.prepare('INSERT OR IGNORE INTO user_profiles (user_id) VALUES (?)').run(uid);
  ensureInviteCode(uid);
  addPoints(uid, 20, '新用户注册奖励', 'register');

  // 邀请绑定：注册时携带邀请码则双方奖励（含防刷校验）
  if (invite_code && /^[A-Z2-9]{6}$/.test(String(invite_code).toUpperCase())) {
    const inviter = db.prepare('SELECT id FROM users WHERE invite_code = ?').get(String(invite_code).toUpperCase());
    if (inviter && inviter.id !== uid) {
      bindInvite(inviter.id, uid, String(invite_code).toUpperCase(), ip);
    }
  }

  res.json({ code: 0, data: { token: signToken(uid), user: { id: uid, phone, nickname: nickname || `考生${phone.slice(-4)}` } } });
});

router.post('/login', authLimiter, (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) return res.status(400).json({ code: 400, message: '请输入手机号和密码' });
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ code: 401, message: '手机号或密码错误' });
  // 旧版 SHA256 哈希登录成功后自动升级为 scrypt
  if (needsRehash(user.password)) {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(password), user.id);
  }
  res.json({ code: 0, data: { token: signToken(user.id), user: { id: user.id, phone: user.phone, nickname: user.nickname } } });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, phone, nickname, created_at FROM users WHERE id = ?').get(req.userId);
  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.userId);
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });
  res.json({ code: 0, data: { user, profile: profile || null } });
});

router.put('/profile', requireAuth, (req, res) => {
  const { target_school, target_score, hui_kao, hui_kao_scores, org } = req.body || {};
  // 输入长度/范围限制，防止脏数据入库
  const school = String(target_school || '').slice(0, 100) || null;
  const orgName = String(org || '').slice(0, 100) || null;
  const score = target_score == null ? null : Math.min(Math.max(Number(target_score) || 0, 0), 750);
  const hk = Array.isArray(hui_kao) ? hui_kao.slice(0, 20) : null;
  // hui_kao_scores 为 {科目: 等级} 对象（如 {语文:'A'}），与 stats/recommend 的 Object.values 读取口径一致
  const hkScores = (hui_kao_scores && typeof hui_kao_scores === 'object' && !Array.isArray(hui_kao_scores))
    ? Object.fromEntries(Object.entries(hui_kao_scores).slice(0, 20))
    : null;
  db.prepare(`INSERT INTO user_profiles (user_id, target_school, target_score, hui_kao, hui_kao_scores, org, updated_at)
              VALUES (?,?,?,?,?,?,datetime('now','localtime'))
              ON CONFLICT(user_id) DO UPDATE SET
                target_school=excluded.target_school, target_score=excluded.target_score,
                hui_kao=excluded.hui_kao, hui_kao_scores=excluded.hui_kao_scores,
                org=excluded.org, updated_at=excluded.updated_at`)
    .run(req.userId, school, score,
      hk ? JSON.stringify(hk) : null,
      hkScores ? JSON.stringify(hkScores) : null,
      orgName);
  res.json({ code: 0, message: '已保存' });
});

export default router;
