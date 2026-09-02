import { db } from './db.js';
import { todayStr } from './utils.js';
import crypto from 'node:crypto';

// 事务辅助：支持嵌套（外层管理 BEGIN/COMMIT，内层直接执行）。
// 用 BEGIN IMMEDIATE 提前获取写锁：读后写的事务若用 deferred BEGIN，
// 在并发写者先提交时会升级锁失败抛 SQLITE_BUSY，IMMEDIATE 从源头规避。
export function tx(fn) {
  const outer = !db.isTransaction;
  if (outer) db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    if (outer) db.exec('COMMIT');
    return r;
  } catch (e) {
    if (outer) db.exec('ROLLBACK');
    throw e;
  }
}

// ---------- 积分 ----------
export function getBalance(uid) {
  return db.prepare('SELECT balance FROM points WHERE user_id = ?').get(uid)?.balance || 0;
}

export function addPoints(uid, change, reason, ref = null) {
  if (!change) return getBalance(uid);
  tx(() => {
    db.prepare(`INSERT INTO points (user_id, balance) VALUES (?, ?)
                ON CONFLICT(user_id) DO UPDATE SET balance = balance + excluded.balance`)
      .run(uid, change);
    db.prepare('INSERT INTO point_logs (user_id, change, reason, ref) VALUES (?,?,?,?)')
      .run(uid, change, reason, ref);
  });
  return getBalance(uid);
}

// 扣减积分（余额不足返回 null）：单条 SQL 原子检查+扣减，杜绝并发超扣
export function spendPoints(uid, amount, reason, ref = null) {
  if (!amount || amount <= 0) return null;
  let ok = false;
  tx(() => {
    const info = db.prepare('UPDATE points SET balance = balance - ? WHERE user_id = ? AND balance >= ?')
      .run(amount, uid, amount);
    if (info.changes > 0) {
      db.prepare('INSERT INTO point_logs (user_id, change, reason, ref) VALUES (?,?,?,?)')
        .run(uid, -amount, reason, ref);
      ok = true;
    }
  });
  return ok ? getBalance(uid) : null;
}

// ---------- 会员 ----------
export function getMembership(uid) {
  const m = db.prepare('SELECT * FROM memberships WHERE user_id = ?').get(uid);
  if (!m) return null;
  const now = new Date();
  if (m.status === 'active' && m.expire_at && new Date(m.expire_at) < now) {
    db.prepare('UPDATE memberships SET status = ? WHERE user_id = ?').run('expired', uid);
    m.status = 'expired';
  }
  return m;
}

export function isVip(uid) {
  const m = getMembership(uid);
  return !!(m && m.status === 'active');
}

// 开通/续费会员：expire_at 若晚于当前到期则顺延
export function grantMembership(uid, { level = 'vip', months = 1, source = 'order' } = {}) {
  const now = new Date();
  const cur = getMembership(uid);
  let base = cur && cur.status === 'active' && cur.expire_at ? new Date(cur.expire_at) : now;
  if (base < now) base = now;
  base.setMonth(base.getMonth() + months);
  const expireAt = base.toISOString().slice(0, 19).replace('T', ' ');
  db.prepare(`INSERT INTO memberships (user_id, level, status, start_at, expire_at, source)
              VALUES (?,?,?,datetime('now','localtime'),?,?)
              ON CONFLICT(user_id) DO UPDATE SET
                level=excluded.level, status='active', expire_at=excluded.expire_at, source=excluded.source`)
    .run(uid, level, 'active', expireAt, source);
  return getMembership(uid);
}

// ---------- 邀请码 ----------
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function genInviteCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
  } while (db.prepare('SELECT id FROM users WHERE invite_code = ?').get(code));
  return code;
}

export function ensureInviteCode(uid) {
  const row = db.prepare('SELECT invite_code FROM users WHERE id = ?').get(uid);
  if (row?.invite_code) return row.invite_code;
  const code = genInviteCode();
  db.prepare('UPDATE users SET invite_code = ? WHERE id = ?').run(code, uid);
  return code;
}

// ---------- 邀请防刷 ----------
const INVITE_DAILY_LIMIT = 10; // 单个邀请人每日最多成功邀请数

// 邀请人今日已成功邀请数量
export function inviteCountToday(inviterId) {
  return db.prepare(
    `SELECT COUNT(*) AS c FROM invites WHERE inviter_id = ? AND date(created_at) = date('now','localtime')`
  ).get(inviterId).c || 0;
}

// 校验邀请是否触发防刷规则；返回错误信息或 null
export function checkInviteFraud(inviterId, inviteeId, ip) {
  if (inviteCountToday(inviterId) >= INVITE_DAILY_LIMIT) {
    return '今日邀请已达上限，请明天再试';
  }
  // 同 IP 自邀检测：邀请人注册 IP 与被邀请人当前 IP 相同，视为自刷
  const inviter = db.prepare('SELECT reg_ip FROM users WHERE id = ?').get(inviterId);
  if (ip && inviter?.reg_ip && ip === inviter.reg_ip) {
    return '不能邀请自己注册的账号';
  }
  // 同 IP 多账号：同一 IP 已为该邀请人绑定过其他账号，视为批量注册刷奖励
  if (ip) {
    const sameIp = db.prepare(
      `SELECT 1 FROM invites i JOIN users u ON u.id = i.invitee_id
       WHERE i.inviter_id = ? AND u.reg_ip = ? LIMIT 1`
    ).get(inviterId, ip);
    if (sameIp) return '同一设备/网络请勿重复注册领取奖励';
  }
  return null;
}

// 绑定邀请并发放奖励（含防刷校验，事务内完成）；返回 { ok, message }
export function bindInvite(inviterId, inviteeId, code, ip = null) {
  const err = checkInviteFraud(inviterId, inviteeId, ip);
  if (err) return { ok: false, message: err };
  let done = false;
  tx(() => {
    const info = db.prepare('INSERT OR IGNORE INTO invites (inviter_id, invitee_id, code, redeem_ip) VALUES (?,?,?,?)')
      .run(inviterId, inviteeId, code, ip);
    if (info.changes > 0) {
      addPoints(inviterId, 50, '邀请好友成功', `invite:${inviteeId}`);
      addPoints(inviteeId, 20, '使用邀请码奖励', `invite:${inviterId}`);
      done = true;
    }
  });
  return done ? { ok: true, message: '邀请绑定成功，双方已获得积分奖励' } : { ok: false, message: '已绑定过邀请码' };
}

// ---------- 订单 ----------
export function genOrderNo() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `CZ${ts}${String(crypto.randomInt(10000)).padStart(4, '0')}`;
}

// 订单支付成功回调（真实支付渠道回调时调用）
// 原子状态流转：仅 pending 可置为 paid，重复回调不重复开通会员
export function markOrderPaid(orderNo, payMethod = 'wechat') {
  let order = null;
  tx(() => {
    const info = db.prepare(`UPDATE orders SET status = 'paid', pay_method = ?, paid_at = datetime('now','localtime')
                             WHERE order_no = ? AND status = 'pending'`)
      .run(payMethod, orderNo);
    if (!info.changes) return;
    order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
    // 按商品类型分发权益：仅 vip 商品开通会员，其他类型商品不自动开通（避免误发会员）
    const product = getProduct(order.product_code);
    if (product?.kind === 'vip') {
      const months = product.months || 1;
      grantMembership(order.user_id, { months, source: 'order' });
    } else {
      console.warn(`[pay] 非会员商品已支付但未开通会员: order=${orderNo} kind=${product?.kind}`);
    }
  });
  return order;
}

// ---------- 商品目录 ----------
export const PRODUCTS = {
  vip_month: { name: 'VIP 会员 · 月卡', months: 1, price: 29 },
  vip_quarter: { name: 'VIP 会员 · 季卡', months: 3, price: 79 },
  vip_year: { name: 'VIP 会员 · 年卡', months: 12, price: 199 }
};

// 列出商品：优先读 products 表（后台可配置），表为空则回退内置目录
export function listProducts(includeInactive = false) {
  const rows = db.prepare(
    `SELECT code, name, kind, price, months, active, sort FROM products ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort ASC, price ASC`
  ).all();
  if (rows.length) return rows;
  return Object.entries(PRODUCTS).map(([code, p]) => ({ code, ...p, kind: 'vip', active: 1, sort: 0 }));
}

// 获取单个商品（库与内置兼容）；下架商品返回 active=0 供业务拒单
export function getProduct(code) {
  const r = db.prepare('SELECT code, name, kind, price, months, active, sort FROM products WHERE code = ?').get(code);
  if (r) return r;
  const p = PRODUCTS[code];
  return p ? { code, ...p, kind: 'vip', active: 1, sort: 0 } : null;
}

// ---------- AI 配额 ----------
export const AI_QUOTA = {
  free: { chat: 10, generate: 3, plan: 1, analysis: 1, explain: 5 },
  vip: { chat: Infinity, generate: Infinity, plan: Infinity, analysis: Infinity, explain: Infinity }
};

// 查询某类 AI 今日剩余次数；返回 { total, used, left, unlimited, topup }
export function aiQuota(uid, kind) {
  const vip = isVip(uid);
  const total = vip ? Infinity : (AI_QUOTA.free[kind] ?? 0);
  const used = db.prepare('SELECT count FROM ai_usage WHERE user_id = ? AND date = ? AND kind = ?')
    .get(uid, todayStr(), kind)?.count || 0;
  const topup = aiTopup(uid, kind);
  return {
    total,
    used,
    left: total === Infinity ? Infinity : Math.max(total - used, 0) + topup,
    unlimited: total === Infinity,
    topup
  };
}

// 积分兑换的次数包余额
export function aiTopup(uid, kind) {
  return db.prepare('SELECT count FROM ai_topup WHERE user_id = ? AND kind = ?').get(uid, kind)?.count || 0;
}

export function addAiTopup(uid, kind, n) {
  db.prepare(`INSERT INTO ai_topup (user_id, kind, count) VALUES (?,?,?)
              ON CONFLICT(user_id, kind) DO UPDATE SET count = count + excluded.count`)
    .run(uid, kind, n);
  return aiTopup(uid, kind);
}

// 原子扣减次数包：仅当余额 > 0 时减 1，避免并发/越界扣成负数
function consumeAiTopup(uid, kind) {
  const info = db.prepare('UPDATE ai_topup SET count = count - 1 WHERE user_id = ? AND kind = ? AND count > 0')
    .run(uid, kind);
  return info.changes > 0;
}

// 记录一次 AI 使用；优先消耗积分兑换的次数包，其次消耗每日免费额度；返回剩余次数
export function consumeAi(uid, kind) {
  if (isVip(uid)) return aiQuota(uid, kind); // VIP 无限，不消耗任何额度
  if (consumeAiTopup(uid, kind)) return aiQuota(uid, kind);
  db.prepare(`INSERT INTO ai_usage (user_id, date, kind, count) VALUES (?,?,?,1)
              ON CONFLICT(user_id, date, kind) DO UPDATE SET count = count + 1`)
    .run(uid, todayStr(), kind);
  return aiQuota(uid, kind);
}

// 校验配额是否可用；不可用返回 false
export function canUseAi(uid, kind) {
  const q = aiQuota(uid, kind);
  return q.unlimited || q.left > 0;
}

// 原子地「检查 + 扣减」一次配额：单条 SQL 完成，杜绝检查与扣减之间的并发窗口。
// 返回 { ok, kind }，kind 标记本次消耗来源（vip/topup/usage），供失败回滚 refundAi 使用。
export function tryConsumeAi(uid, kind) {
  if (isVip(uid)) return { ok: true, kind: 'vip' };
  if (consumeAiTopup(uid, kind)) return { ok: true, kind: 'topup' };
  const total = AI_QUOTA.free[kind] ?? 0;
  const info = db.prepare(`INSERT INTO ai_usage (user_id, date, kind, count) VALUES (?,?,?,1)
              ON CONFLICT(user_id, date, kind) DO UPDATE SET count = count + 1 WHERE count < ?`)
    .run(uid, todayStr(), kind, total);
  if (info.changes > 0) return { ok: true, kind: 'usage' };
  return { ok: false, kind: null };
}

// 回滚一次配额（AI 调用失败时归还），按消耗来源精确回滚
export function refundAi(uid, kind, usedKind) {
  if (usedKind === 'vip') {
    // VIP 无限额度，无需回滚
    return;
  } else if (usedKind === 'topup') {
    db.prepare('UPDATE ai_topup SET count = count + 1 WHERE user_id = ? AND kind = ?').run(uid, kind);
  } else if (usedKind === 'usage') {
    db.prepare('UPDATE ai_usage SET count = count - 1 WHERE user_id = ? AND date = ? AND kind = ? AND count > 0')
      .run(uid, todayStr(), kind);
  }
}
