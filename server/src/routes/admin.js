import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { isVip, getMembership, getBalance, addPoints, grantMembership } from '../commerce.js';
import { PAY_PROVIDER, providerReady } from '../payment.js';

const router = Router();

// 首次启动：把 .env 的 ADMIN_PHONES 种子为主管理员(role=main)，保证存在可用的持久超管
(function ensureMainAdmin() {
  const c = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c || 0;
  const mainCount = db.prepare("SELECT COUNT(*) AS c FROM admins WHERE role = 'main'").get().c || 0;
  if (mainCount > 0) return;
  const phones = (process.env.ADMIN_PHONES || '').split(',').map(s => s.trim()).filter(Boolean);
  const ins = db.prepare('INSERT OR IGNORE INTO admins(user_id, role) SELECT id, ? FROM users WHERE phone = ?');
  for (const p of phones) ins.run('main', p);
  const seeded = db.prepare("SELECT COUNT(*) AS c FROM admins WHERE role = 'main'").get().c || 0;
  if (c === 0 && seeded > 0) console.log(`[admin] 已从 ADMIN_PHONES 种子主管理员`);
  if (seeded === 0 && c === 0) console.warn('[admin] 未配置任何管理员：请在 .env 设置 ADMIN_PHONES 或通过主管理员后台添加');
})();

// 管理员鉴权：以 admins 表为准（role = main / admin）
function requireAdmin(req, res, next) {
  const me = db.prepare(
    'SELECT u.id, u.phone, a.role FROM users u JOIN admins a ON a.user_id = u.id WHERE u.id = ?'
  ).get(req.userId);
  if (!me || !me.role) return res.status(403).json({ code: 403, message: '无管理员权限' });
  req.adminRole = me.role;
  req.adminUser = me;
  next();
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// 参数取整并夹取到 [min,max]，非法回退 def
const clampInt = (v, min, max, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : def;
};

const ORDER_STATUS = ['paid', 'pending', 'cancelled'];

// 运营总览
router.get('/admin/overview', requireAuth, requireAdmin, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c || 0;
  const todayNew = db.prepare('SELECT COUNT(*) AS c FROM users WHERE date(created_at) = date(\'now\',\'localtime\')').get().c || 0;
  const weekNew = db.prepare('SELECT COUNT(*) AS c FROM users WHERE date(created_at) >= ?').get(daysAgo(7)).c || 0;

  const totalRecords = db.prepare('SELECT COUNT(*) AS c FROM practice_records').get().c || 0;
  const todayRecords = db.prepare('SELECT COUNT(*) AS c FROM practice_records WHERE date(created_at) = date(\'now\',\'localtime\')').get().c || 0;
  const todayActive = db.prepare('SELECT COUNT(DISTINCT user_id) AS c FROM practice_records WHERE date(created_at) = date(\'now\',\'localtime\')').get().c || 0;

  const vipCount = db.prepare("SELECT COUNT(*) AS c FROM memberships WHERE status = 'active'").get().c || 0;
  const vipActive = db.prepare("SELECT COUNT(*) AS c FROM memberships WHERE status = 'active' AND (expire_at IS NULL OR expire_at > datetime('now','localtime'))").get().c || 0;
  const orderPaid = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'paid'").get().c || 0;
  const orderRevenue = db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM orders WHERE status = 'paid'").get().s || 0;

  const aiToday = db.prepare("SELECT COALESCE(SUM(count),0) AS s FROM ai_usage WHERE date = date('now','localtime')").get().s || 0;
  const aiWeek = db.prepare('SELECT COALESCE(SUM(count),0) AS s FROM ai_usage WHERE date >= ?').get(daysAgo(7)).s || 0;

  const pointsIssued = db.prepare('SELECT COALESCE(SUM(change),0) AS s FROM point_logs WHERE change > 0').get().s || 0;
  const pointsSpent = db.prepare('SELECT COALESCE(SUM(-change),0) AS s FROM point_logs WHERE change < 0').get().s || 0;

  res.json({
    code: 0,
    data: {
      users: { total: totalUsers, todayNew, weekNew },
      activity: { todayRecords, todayActive },
      vip: { count: vipCount, active: vipActive, conversion: totalUsers ? Math.round((vipActive / totalUsers) * 1000) / 10 : 0 },
      orders: { paid: orderPaid, revenue: orderRevenue },
      ai: { today: aiToday, week: aiWeek },
      points: { issued: pointsIssued, spent: pointsSpent },
      pay: { provider: PAY_PROVIDER, ready: providerReady() }
    }
  });
});

// 近 14 天趋势：3 次分组查询替代逐日 42 次查询
router.get('/admin/trend', requireAuth, requireAdmin, (req, res) => {
  const start = daysAgo(13);
  const regMap = new Map(db.prepare(
    `SELECT date(created_at) AS d, COUNT(*) AS c FROM users WHERE date(created_at) >= ? GROUP BY date(created_at)`
  ).all(start).map(r => [r.d, r.c]));
  const actMap = new Map(db.prepare(
    `SELECT date(created_at) AS d, COUNT(DISTINCT user_id) AS c FROM practice_records WHERE date(created_at) >= ? GROUP BY date(created_at)`
  ).all(start).map(r => [r.d, r.c]));
  const aiMap = new Map(db.prepare(
    `SELECT date AS d, COALESCE(SUM(count),0) AS s FROM ai_usage WHERE date >= ? GROUP BY date`
  ).all(start).map(r => [r.d, r.s]));
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = daysAgo(i);
    days.push({ date: d, reg: regMap.get(d) || 0, act: actMap.get(d) || 0, ai: aiMap.get(d) || 0 });
  }
  res.json({ code: 0, data: days });
});

// 用户列表：关键词搜索（手机号/昵称）+ 分页
router.get('/admin/users', requireAuth, requireAdmin, (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  const page = clampInt(req.query.page, 1, 1000000, 1);
  const limit = clampInt(req.query.limit, 1, 100, 20);
  const offset = (page - 1) * limit;

  const conds = [];
  const args = [];
  if (keyword) {
    conds.push('(u.phone LIKE ? OR u.nickname LIKE ?)');
    const like = `%${keyword}%`;
    args.push(like, like);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM users u ${where}`).get(...args).c || 0;
  const rows = db.prepare(
    `SELECT u.id, u.phone, u.nickname, u.created_at,
       (SELECT COUNT(*) FROM practice_records r WHERE r.user_id=u.id) AS records,
       (SELECT COALESCE(SUM(is_correct),0) FROM practice_records r WHERE r.user_id=u.id) AS correct,
       (SELECT COALESCE(balance,0) FROM points p WHERE p.user_id=u.id) AS points,
       (SELECT COUNT(*) FROM checkins c WHERE c.user_id=u.id) AS checkins
     FROM users u ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);

  const list = rows.map(r => ({ ...r, vip: isVip(r.id) }));
  res.json({ code: 0, data: { total, page, limit, list } });
});

// 用户详情：基础信息 + 会员 + 积分流水 + 订单 + AI 用量 + 学习统计
router.get('/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT id, phone, nickname, created_at FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ code: 404, message: '用户不存在' });

  const membership = getMembership(id);
  const logs = db.prepare(
    'SELECT change, reason, ref, created_at FROM point_logs WHERE user_id = ? ORDER BY id DESC LIMIT 30'
  ).all(id);
  const orders = db.prepare(
    'SELECT order_no, product_name, amount, status, pay_method, paid_at, created_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 30'
  ).all(id);
  const ai = db.prepare('SELECT kind, SUM(count) AS total FROM ai_usage WHERE user_id = ? GROUP BY kind').all(id);
  const rc = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(is_correct),0) ok FROM practice_records WHERE user_id = ?').get(id);
  const checkins = db.prepare('SELECT COUNT(*) c FROM checkins WHERE user_id = ?').get(id).c || 0;
  let favorites = 0;
  try { favorites = db.prepare('SELECT COUNT(*) c FROM favorites WHERE user_id = ?').get(id).c || 0; } catch (e) {}

  res.json({
    code: 0,
    data: {
      ...u,
      vip: !!(membership && membership.status === 'active'),
      membership,
      points: getBalance(id),
      logs,
      orders,
      ai,
      stats: {
        records: rc.c || 0,
        correct: rc.ok || 0,
        rate: rc.c ? Math.round((rc.ok / rc.c) * 1000) / 10 : 0,
        checkins,
        favorites
      }
    }
  });
});

// 调整用户积分：传 balance 绝对余额，或 change 增量（可为负）；余额不允许为负
router.post('/admin/users/:id/points', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ code: 404, message: '用户不存在' });

  const { balance, change, reason } = req.body || {};
  const cur = getBalance(id);
  const MAX_BALANCE = 100000000;
  let next;
  if (balance != null && balance !== '') {
    const b = Number(balance);
    if (!Number.isFinite(b)) return res.status(400).json({ code: 400, message: '积分余额格式不正确' });
    next = Math.min(Math.max(0, Math.trunc(b)), MAX_BALANCE);
  } else if (change != null && change !== '') {
    const c = Number(change);
    if (!Number.isFinite(c)) return res.status(400).json({ code: 400, message: '积分变动格式不正确' });
    next = Math.min(Math.max(0, cur + Math.trunc(c)), MAX_BALANCE);
  } else {
    return res.status(400).json({ code: 400, message: '请提供 balance 或 change' });
  }

  const diff = next - cur;
  if (diff === 0) return res.json({ code: 0, data: { balance: next, message: '积分余额未变化' } });
  addPoints(id, diff, String(reason || (diff > 0 ? '管理员发放' : '管理员扣减')));
  res.json({ code: 0, data: { balance: next, message: '积分已更新' } });
});

// 会员兑付：action=open 开通/续费（months，默认 1）；action=cancel 立即停用
router.post('/admin/users/:id/membership', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ code: 404, message: '用户不存在' });

  const { action } = req.body || {};
  if (action === 'open') {
    const months = clampInt(req.body.months, 1, 120, 1);
    grantMembership(id, { months, source: 'admin' });
    return res.json({ code: 0, data: { message: `已开通会员 ${months} 个月`, membership: getMembership(id) } });
  }
  if (action === 'cancel') {
    db.prepare("UPDATE memberships SET status = 'expired' WHERE user_id = ?").run(id);
    return res.json({ code: 0, data: { message: '会员已停用', membership: getMembership(id) } });
  }
  return res.status(400).json({ code: 400, message: 'action 需为 open 或 cancel' });
});

// 订单列表：关键词（订单号/昵称/手机号）+ 状态筛选 + 分页
router.get('/admin/orders', requireAuth, requireAdmin, (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  const status = String(req.query.status || '').trim();
  const page = clampInt(req.query.page, 1, 1000000, 1);
  const limit = clampInt(req.query.limit, 1, 100, 20);
  const offset = (page - 1) * limit;

  const conds = [];
  const args = [];
  if (status) {
    if (!ORDER_STATUS.includes(status)) return res.status(400).json({ code: 400, message: '无效的状态筛选' });
    conds.push('o.status = ?');
    args.push(status);
  }
  if (keyword) {
    conds.push('(o.order_no LIKE ? OR u.nickname LIKE ? OR u.phone LIKE ?)');
    const like = `%${keyword}%`;
    args.push(like, like, like);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM orders o JOIN users u ON u.id=o.user_id ${where}`).get(...args).c || 0;
  const list = db.prepare(
    `SELECT o.order_no, o.product_name, o.amount, o.status, o.pay_method, o.paid_at, o.created_at,
            u.nickname, u.phone
     FROM orders o JOIN users u ON u.id=o.user_id ${where}
     ORDER BY o.id DESC LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);

  res.json({ code: 0, data: { total, page, limit, list } });
});

// 订单导出 CSV（遵循当前筛选条件，不限分页）
router.get('/admin/orders/export', requireAuth, requireAdmin, (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  const status = String(req.query.status || '').trim();
  const conds = [];
  const args = [];
  if (status && ORDER_STATUS.includes(status)) { conds.push('o.status = ?'); args.push(status); }
  if (keyword) {
    conds.push('(o.order_no LIKE ? OR u.nickname LIKE ? OR u.phone LIKE ?)');
    const like = `%${keyword}%`;
    args.push(like, like, like);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db.prepare(
    `SELECT o.order_no, o.product_name, o.amount, o.status, o.pay_method, o.paid_at, o.created_at,
            u.nickname, u.phone
     FROM orders o JOIN users u ON u.id=o.user_id ${where} ORDER BY o.id DESC LIMIT 2000`
  ).all(...args);

  const statusTxt = { paid: '已支付', pending: '待支付', cancelled: '已取消' };
  const methodTxt = { wechat: '微信支付', alipay: '支付宝' };
  const esc = s => { const v = s == null ? '' : String(s); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const header = ['订单号', '用户昵称', '手机号', '商品', '金额', '状态', '支付方式', '支付时间', '创建时间'];
  const lines = rows.map(o => [
    o.order_no, o.nickname, o.phone, o.product_name, o.amount,
    statusTxt[o.status] || o.status, methodTxt[o.pay_method] || o.pay_method, o.paid_at || '', o.created_at
  ].map(esc).join(','));
  const csv = '\uFEFF' + [header.join(','), ...lines].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="orders_${daysAgo(0)}.csv"`);
  res.send(csv);
});

// 商品列表（含已下架，用于后台管理）
router.get('/admin/products', requireAuth, requireAdmin, (req, res) => {
  const list = db.prepare('SELECT code, name, kind, price, months, active, sort, updated_at FROM products ORDER BY sort ASC, price ASC').all();
  res.json({ code: 0, data: { list } });
});

// 新增商品（编码唯一）
router.post('/admin/products', requireAuth, requireAdmin, (req, res) => {
  const body = req.body || {};
  const code = String(body.code || '').trim();
  if (!code) return res.status(400).json({ code: 400, message: '请填写商品编码' });
  if (!/^[a-z0-9_]+$/.test(code)) return res.status(400).json({ code: 400, message: '商品编码仅限小写字母/数字/下划线' });
  const name = String(body.name || '').trim();
  if (!name) return res.status(400).json({ code: 400, message: '请填写商品名称' });
  const price = Math.trunc(Number(body.price));
  if (!Number.isFinite(price) || price < 0 || price > 1000000) return res.status(400).json({ code: 400, message: '价格格式不正确（0~1000000 元）' });
  let months = null;
  if (body.months !== undefined && body.months !== null && body.months !== '') {
    months = Math.trunc(Number(body.months));
    if (!Number.isFinite(months) || months < 1 || months > 120) return res.status(400).json({ code: 400, message: '会员时长需为 1~120 个月' });
  }
  if (db.prepare('SELECT code FROM products WHERE code = ?').get(code)) {
    return res.status(400).json({ code: 400, message: '商品编码已存在' });
  }
  const kind = ['vip', 'points', 'course', 'other'].includes(String(body.kind || 'vip')) ? String(body.kind) : 'vip';
  const sort = Math.min(Math.max(Math.trunc(Number(body.sort) || 0), 0), 100000);
  db.prepare('INSERT INTO products (code, kind, name, price, months, active, sort) VALUES (?,?,?,?,?,?,?)')
    .run(code, kind, name, price, months, body.active === false ? 0 : 1, sort);
  res.json({ code: 0, data: { message: '已新增商品' } });
});

// 编辑商品（编码不可改；可改名称/价格/时长/排序/状态/类型）
router.patch('/admin/products/:code', requireAuth, requireAdmin, (req, res) => {
  const code = String(req.params.code);
  const cur = db.prepare('SELECT * FROM products WHERE code = ?').get(code);
  if (!cur) return res.status(404).json({ code: 404, message: '商品不存在' });
  const b = req.body || {};
  const sets = [];
  const args = [];
  const put = (col, v) => { sets.push(`${col} = ?`); args.push(v); };
  if (b.name !== undefined) { const n = String(b.name).trim(); if (!n) return res.status(400).json({ code: 400, message: '名称不能为空' }); put('name', n); }
  if (b.price !== undefined) {
    const p = Math.trunc(Number(b.price));
    if (!Number.isFinite(p) || p < 0 || p > 1000000) return res.status(400).json({ code: 400, message: '价格格式不正确' });
    put('price', p);
  }
  if (b.months !== undefined) {
    const mo = b.months === null || b.months === '' ? null : Math.trunc(Number(b.months));
    if (mo !== null && (!Number.isFinite(mo) || mo < 1 || mo > 120)) return res.status(400).json({ code: 400, message: '会员时长需为 1~120 个月' });
    put('months', mo);
  }
  if (b.active !== undefined) put('active', b.active ? 1 : 0);
  if (b.sort !== undefined) put('sort', Math.min(Math.max(Math.trunc(Number(b.sort) || 0), 0), 100000));
  if (b.kind !== undefined) {
    const k = String(b.kind);
    if (!['vip', 'points', 'course', 'other'].includes(k)) return res.status(400).json({ code: 400, message: '无效的商品类型' });
    put('kind', k);
  }
  if (b.name === undefined && b.price === undefined && b.months === undefined && b.active === undefined && b.sort === undefined && b.kind === undefined) {
    return res.status(400).json({ code: 400, message: '无更新字段' });
  }
  sets.push(`updated_at = datetime('now','localtime')`);
  const r = db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE code = ?`).run(...args, code);
  if (!r.changes) return res.status(404).json({ code: 404, message: '商品不存在' });
  res.json({ code: 0, data: { message: '已更新商品' } });
});

// 删除商品（仅主管理员；已有订单引用则禁止删除，需改为下架）
router.delete('/admin/products/:code', requireAuth, requireAdmin, (req, res) => {
  if (req.adminRole !== 'main') return res.status(403).json({ code: 403, message: '仅主管理员可删除商品' });
  const code = String(req.params.code);
  const cur = db.prepare('SELECT code FROM products WHERE code = ?').get(code);
  if (!cur) return res.status(404).json({ code: 404, message: '商品不存在' });
  const ref = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE product_code = ?').get(code).c || 0;
  const pendingRef = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE product_code = ? AND status = 'pending'").get(code).c || 0;
  if (ref > 0) {
    if (pendingRef > 0) return res.status(400).json({ code: 400, message: '该商品有待支付订单，请先取消订单或改为下架' });
    db.prepare('UPDATE products SET active = 0, updated_at = datetime(\'now\',\'localtime\') WHERE code = ?').run(code);
    return res.json({ code: 0, data: { message: '该商品已有历史订单，已改为下架以保留记录' } });
  }
  db.prepare('DELETE FROM products WHERE code = ?').run(code);
  res.json({ code: 0, data: { message: '已删除商品' } });
});

// 管理员列表（含当前登录者角色）
router.get('/admin/admins', requireAuth, requireAdmin, (req, res) => {
  const list = db.prepare(
    `SELECT a.user_id, u.phone, u.nickname, a.role, a.created_at
     FROM admins a JOIN users u ON u.id = a.user_id
     ORDER BY (a.role = 'main') DESC, a.id`
  ).all();
  res.json({ code: 0, data: { list, current: { userId: req.userId, role: req.adminRole } } });
});

// 添加管理员（仅主管理员可操作；按手机号添加为普通管理员）
router.post('/admin/admins', requireAuth, requireAdmin, (req, res) => {
  if (req.adminRole !== 'main') return res.status(403).json({ code: 403, message: '仅主管理员可添加管理员' });
  const phone = String(req.body?.phone || '').trim();
  if (!phone) return res.status(400).json({ code: 400, message: '请填写手机号' });
  const user = db.prepare('SELECT id, nickname FROM users WHERE phone = ?').get(phone);
  if (!user) return res.status(404).json({ code: 404, message: '未找到该手机号的用户' });
  if (user.id === req.userId) return res.status(400).json({ code: 400, message: '不能添加自己' });
  const exists = db.prepare('SELECT role FROM admins WHERE user_id = ?').get(user.id);
  if (exists) return res.status(400).json({ code: 400, message: '该用户已是管理员' });
  db.prepare('INSERT INTO admins(user_id, role, created_by) VALUES (?,?,?)').run(user.id, 'admin', req.userId);
  res.json({ code: 0, data: { message: `已将 ${user.nickname} 设为管理员` } });
});

// 移除管理员（仅主管理员可操作；主管理员与本人不可移除）
router.delete('/admin/admins/:userId', requireAuth, requireAdmin, (req, res) => {
  if (req.adminRole !== 'main') return res.status(403).json({ code: 403, message: '仅主管理员可移除管理员' });
  const userId = Number(req.params.userId);
  if (userId === req.userId) return res.status(400).json({ code: 400, message: '不能移除自己' });
  const target = db.prepare('SELECT role FROM admins WHERE user_id = ?').get(userId);
  if (!target) return res.status(404).json({ code: 404, message: '该用户不是管理员' });
  if (target.role === 'main') return res.status(400).json({ code: 400, message: '主管理员不可移除' });
  db.prepare('DELETE FROM admins WHERE user_id = ?').run(userId);
  res.json({ code: 0, data: { message: '已移除管理员' } });
});

export default router;