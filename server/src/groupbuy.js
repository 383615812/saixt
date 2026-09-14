import crypto from 'node:crypto';
import { db } from './db.js';
import { tx, getProduct, getMembership, grantMembership } from './commerce.js';

// 团购码字符集：去除易混淆字符（0/O/1/I/L）
const GB_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randChars(n) {
  return Array.from({ length: n }, () => GB_CHARS[crypto.randomInt(GB_CHARS.length)]).join('');
}

// 团购方案编号：GB + 日期 + 4 位随机，库内唯一
export function genGroupBuyCode() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  let code;
  do {
    code = `GB${ts}${randChars(4)}`;
  } while (db.prepare('SELECT id FROM group_buys WHERE code = ?').get(code));
  return code;
}

// 团购支付单号：GB 前缀 + 时间戳 + 4 位随机，库内唯一
// 前缀 GB 用于支付回调时与个人订单号（CZ 前缀）区分
export function genPayNo() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  let no;
  do {
    no = `GB${ts}${String(crypto.randomInt(100000000)).padStart(8, '0')}`;
  } while (db.prepare('SELECT id FROM group_buys WHERE pay_no = ?').get(no));
  return no;
}

// 团购兑换码：TYGB-XXXX-XXXX，库内唯一
export function genRedeemCode() {
  let code, tries = 0;
  do {
    code = `TYGB-${randChars(4)}-${randChars(4)}`;
    tries++;
  } while (db.prepare('SELECT id FROM group_buy_codes WHERE code = ?').get(code) && tries < 20);
  return code;
}

// ---------- 合作机构 ----------
export function createPartner({ name, type = 'school', contact = '', phone = '', school_code = null, createdBy = null }) {
  const nm = String(name || '').trim();
  if (!nm) throw new Error('机构名称不能为空');
  const t = ['school', 'institution'].includes(type) ? type : 'school';
  if (school_code) {
    const s = db.prepare('SELECT code FROM schools WHERE code = ?').get(school_code);
    if (!s) throw new Error('关联的招生院校不存在');
  }
  const info = db.prepare(
    `INSERT INTO partners (name, type, contact, phone, school_code, created_by)
     VALUES (?,?,?,?,?,?)`
  ).run(nm, t, contact || null, phone || null, school_code || null, createdBy || null);
  return db.prepare('SELECT * FROM partners WHERE id = ?').get(info.lastInsertRowid);
}

export function listPartners({ type, status, keyword } = {}) {
  const conds = [];
  const args = [];
  if (type) { conds.push('type = ?'); args.push(type); }
  if (status) { conds.push('status = ?'); args.push(status); }
  if (keyword) { conds.push('(name LIKE ? OR contact LIKE ? OR phone LIKE ?)'); const k = `%${keyword}%`; args.push(k, k, k); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM partners ${where} ORDER BY id DESC`).all(...args);
}

// ---------- 团购方案（含统计） ----------
// 状态派生：未兑换但已超过过期时间的码按已过期计（状态字段仅在兑换尝试时惰性更新，统计时需按 expire_at 折算）
const EXPIRED_SQL = "status = 'expired' OR (status = 'unused' AND expire_at IS NOT NULL AND expire_at <= datetime('now','localtime'))";
const UNUSED_SQL = "status = 'unused' AND (expire_at IS NULL OR expire_at > datetime('now','localtime'))";

function attachStats(gb) {
  if (!gb) return gb;
  const r = db.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN ${UNUSED_SQL} THEN 1 ELSE 0 END) AS unused,
       SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed,
       SUM(CASE WHEN ${EXPIRED_SQL} THEN 1 ELSE 0 END) AS expired
     FROM group_buy_codes WHERE group_buy_id = ?`
  ).get(gb.id);
  gb.codes_total = r.total || 0;
  gb.codes_unused = r.unused || 0;
  gb.codes_redeemed = r.redeemed || 0;
  gb.codes_expired = r.expired || 0;
  gb.remaining = r.unused || 0;
  return gb;
}

export function getGroupBuy(id) {
  const gb = db.prepare('SELECT * FROM group_buys WHERE id = ?').get(id);
  const g = attachStats(gb);
  if (g) {
    // 实际兑换进度（按码聚合）；待收款阶段无码则为空
    g.batches = groupBuyBatchStats(id);
    // 批次计划（建方案时录入，供待收款阶段展示）
    let plan = null;
    if (g.batches_meta) { try { plan = JSON.parse(g.batches_meta); } catch { plan = null; } }
    g.batches_plan = Array.isArray(plan) ? plan : null;
  }
  return g;
}

export function listGroupBuys({ partnerId, status, keyword, limit = 100000, offset = 0 } = {}) {
  const conds = [];
  const args = [];
  if (partnerId != null) { conds.push('g.partner_id = ?'); args.push(partnerId); }
  if (status) { conds.push('g.status = ?'); args.push(status); }
  if (keyword) { conds.push('(g.code LIKE ? OR p.name LIKE ? OR g.product_name LIKE ?)'); const k = `%${keyword}%`; args.push(k, k, k); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const total = db.prepare(
    `SELECT COUNT(*) AS c FROM group_buys g JOIN partners p ON p.id = g.partner_id ${where}`
  ).get(...args).c || 0;
  const rows = db.prepare(
    `SELECT g.*, p.name AS partner_name, p.type AS partner_type
     FROM group_buys g JOIN partners p ON p.id = g.partner_id
     ${where} ORDER BY g.id DESC LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);
  return { list: rows.map(attachStats), total };
}

// 创建团购方案并批量生成兑换码（单事务内完成）
// batches: 可选，[{ label, count }] 按班级/专业分批发码；不传则按单一 quantity 整批发码
function nowLocal() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 内部：按方案（含批次计划）批量生成兑换码；仅在结算成功 / 免支付时调用
function generateCodesForGroupBuy(gb) {
  let plan = null;
  if (gb.batches_meta) { try { plan = JSON.parse(gb.batches_meta); } catch { plan = null; } }
  if (!Array.isArray(plan) || !plan.length) plan = null;
  const ins = db.prepare(
    `INSERT INTO group_buy_codes (group_buy_id, code, product_code, months, batch_label, status, expire_at)
     VALUES (?,?,?,?,?,?,?)`
  );
  const mo = gb.months || 1;
  if (plan) {
    for (const b of plan) {
      for (let i = 0; i < b.count; i++) ins.run(gb.id, genRedeemCode(), gb.product_code, mo, b.label, 'unused', gb.expire_at);
    }
  } else {
    for (let i = 0; i < gb.quantity; i++) ins.run(gb.id, genRedeemCode(), gb.product_code, mo, null, 'unused', gb.expire_at);
  }
}

// 创建团购方案：金额 > 0 时进入「待支付」，收款成功后才生成兑换码并生效；
// 金额为 0（免支付）时直接结算并生成码。
export function createGroupBuy({ partnerId, productCode, months, quantity, batches, unitPrice, expireAt, remark, createdBy }) {
  const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(partnerId);
  if (!partner || partner.status !== 'active') throw new Error('合作机构不存在或已停用');
  const product = getProduct(productCode);
  if (!product || !product.active) throw new Error('所选商品无效或已下架');

  const mo = months != null ? Math.trunc(Number(months)) : (product.months || 1);
  if (!Number.isFinite(mo) || mo < 1 || mo > 120) throw new Error('会员时长需为 1~120 个月');

  // 解析批次：优先 batches，否则回退到单一 quantity
  let normBatches = null;
  if (Array.isArray(batches) && batches.length) {
    normBatches = [];
    for (const b of batches) {
      const label = String(b?.label ?? '').trim();
      if (!label) throw new Error('批次名称不能为空');
      if (label.length > 50) throw new Error('批次名称过长（≤50 字）');
      const count = Math.trunc(Number(b?.count));
      if (!Number.isFinite(count) || count < 1 || count > 100000) throw new Error(`批次「${label}」数量需为 1~100000 张`);
      normBatches.push({ label, count });
    }
  }
  const qty = normBatches
    ? normBatches.reduce((s, b) => s + b.count, 0)
    : Math.trunc(Number(quantity));
  if (!Number.isFinite(qty) || qty < 1 || qty > 100000) throw new Error('团购数量需为 1~100000 张');

  const price = Math.trunc(Number(unitPrice));
  if (!Number.isFinite(price) || price < 0 || price > 100000000) throw new Error('团购单价格式不正确（0~100000000 元）');

  let expire = null;
  if (expireAt && String(expireAt).trim()) {
    const s = String(expireAt).trim();
    // 仅接受 日期 或 日期 时间 两种格式，避免脏数据写入
    if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(s)) throw new Error('过期时间格式应为 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS');
    expire = s.length === 10 ? s + ' 23:59:59' : s;
  }

  const code = genGroupBuyCode();
  const payNo = genPayNo();
  const totalAmount = price * qty;
  const free = totalAmount <= 0;
  let gbId;
  tx(() => {
    const info = db.prepare(
      `INSERT INTO group_buys (code, partner_id, product_code, product_name, months, unit_price, quantity, total_amount,
                               status, paid, pay_no, pay_method, paid_at, batches_meta, expire_at, remark, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      code, partnerId, productCode, product.name, mo, price, qty, totalAmount,
      free ? 'active' : 'pending', free ? 1 : 0, payNo,
      free ? 'free' : null, free ? nowLocal() : null,
      normBatches ? JSON.stringify(normBatches) : null, expire, remark || null, createdBy || null
    );
    gbId = info.lastInsertRowid;
    // 免支付方案直接发码；待支付方案在结算成功后才发码
    if (free) generateCodesForGroupBuy(db.prepare('SELECT * FROM group_buys WHERE id = ?').get(gbId));
  });
  return getGroupBuy(gbId);
}

// 结算团购方案（幂等）：确认收款 → 按批次计划生成兑换码 → 方案生效
// method: manual(线下/人工确认) | wechat | alipay | demo | free
export function settleGroupBuy(id, { method = 'manual' } = {}) {
  const gb = db.prepare('SELECT * FROM group_buys WHERE id = ?').get(id);
  if (!gb) return null;
  if (gb.paid) return getGroupBuy(id); // 幂等：已结算直接返回
  if (gb.status === 'cancelled') throw new Error('方案已取消，无法结算');
  if (gb.status === 'closed') throw new Error('方案已关闭，无法结算');
  tx(() => {
    const info = db.prepare(
      `UPDATE group_buys SET paid = 1, pay_method = ?, paid_at = ?, status = 'active'
       WHERE id = ? AND paid = 0`
    ).run(method, nowLocal(), id);
    if (info.changes > 0) generateCodesForGroupBuy(db.prepare('SELECT * FROM group_buys WHERE id = ?').get(id));
  });
  return getGroupBuy(id);
}

// 按支付单号查团购方案（支付回调时用于区分个人订单）
export function getGroupBuyByPayNo(payNo) {
  return db.prepare('SELECT * FROM group_buys WHERE pay_no = ?').get(payNo);
}

// 取消待支付的团购方案
export function cancelGroupBuy(id) {
  const gb = db.prepare('SELECT * FROM group_buys WHERE id = ?').get(id);
  if (!gb) return null;
  if (gb.paid) throw new Error('方案已收款，无法取消');
  db.prepare("UPDATE group_buys SET status = 'cancelled' WHERE id = ? AND paid = 0").run(id);
  return getGroupBuy(id);
}

// 团购方案按批次（班级/专业）的兑换进度统计
export function groupBuyBatchStats(gbId) {
  const rows = db.prepare(
    `SELECT
       COALESCE(batch_label, '（未分组）') AS batch_label,
       COUNT(*) AS total,
       SUM(CASE WHEN ${UNUSED_SQL} THEN 1 ELSE 0 END) AS unused,
       SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed,
       SUM(CASE WHEN ${EXPIRED_SQL} THEN 1 ELSE 0 END) AS expired
     FROM group_buy_codes WHERE group_buy_id = ? GROUP BY batch_label ORDER BY batch_label`
  ).all(gbId);
  return rows.map(r => ({
    batch_label: r.batch_label,
    total: r.total || 0,
    unused: r.unused || 0,
    redeemed: r.redeemed || 0,
    expired: r.expired || 0,
    remaining: r.unused || 0,
    conversion: r.total ? Math.round((r.redeemed || 0) / r.total * 1000) / 10 : 0
  }));
}

// 关闭团购方案；可选一并作废未兑换的码
export function closeGroupBuy(id, { expireCodes = false } = {}) {
  const gb = db.prepare('SELECT * FROM group_buys WHERE id = ?').get(id);
  if (!gb) return null;
  tx(() => {
    db.prepare("UPDATE group_buys SET status = 'closed' WHERE id = ?").run(id);
    if (expireCodes) {
      db.prepare("UPDATE group_buy_codes SET status = 'expired' WHERE group_buy_id = ? AND status = 'unused'").run(id);
    }
  });
  return getGroupBuy(id);
}

// 团购码列表（分页 + 状态筛选 + 批次筛选）
export function listGroupBuyCodes(gbId, { status, batch, page = 1, limit = 50, offset = 0 } = {}) {
  const args = [gbId];
  let where = 'WHERE c.group_buy_id = ?';
  if (status) { where += ' AND c.status = ?'; args.push(status); }
  if (batch) {
    if (batch === '__none__') { where += ' AND c.batch_label IS NULL'; }
    else { where += ' AND c.batch_label = ?'; args.push(batch); }
  }
  const total = db.prepare(`SELECT COUNT(*) AS c FROM group_buy_codes c ${where}`).get(...args).c || 0;
  const list = db.prepare(
    `SELECT c.id, c.code, c.product_code, c.months, c.batch_label, c.status, c.redeemed_by, c.redeemed_at, c.expire_at, c.created_at,
            u.nickname AS redeemed_nickname, u.phone AS redeemed_phone
     FROM group_buy_codes c LEFT JOIN users u ON u.id = c.redeemed_by
     ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);
  return { total, list };
}

// 该团购方案下出现的全部批次名称（用于前端筛选下拉）
export function listGroupBuyBatchLabels(gbId) {
  return db.prepare(
    `SELECT DISTINCT COALESCE(batch_label, '（未分组）') AS batch_label
     FROM group_buy_codes WHERE group_buy_id = ? ORDER BY batch_label`
  ).all(gbId).map(r => r.batch_label);
}

// 兑换码（学生端）：校验 → 原子兑换 → 开通会员
export function redeemCode(rawCode, uid) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return { ok: false, code: 400, message: '请输入团购码' };
  const row = db.prepare('SELECT * FROM group_buy_codes WHERE code = ?').get(code);
  if (!row) return { ok: false, code: 404, message: '团购码不存在，请核对后重试' };
  if (row.status === 'redeemed') {
    const byMe = row.redeemed_by === uid;
    return { ok: false, code: 409, message: byMe ? '该团购码已被您兑换' : '该团购码已被他人兑换', data: { by_other: !byMe } };
  }
  if (row.status === 'expired') return { ok: false, code: 410, message: '该团购码已过期' };

  const now = new Date();
  if (row.expire_at && new Date(row.expire_at) < now) {
    tx(() => db.prepare("UPDATE group_buy_codes SET status = 'expired' WHERE id = ?").run(row.id));
    return { ok: false, code: 410, message: '该团购码已过期' };
  }

  const gb = db.prepare('SELECT * FROM group_buys WHERE id = ?').get(row.group_buy_id);
  if (!gb) return { ok: false, code: 409, message: '该团购活动不存在' };
  if (gb.status === 'pending') return { ok: false, code: 409, message: '该团购方案尚未完成收款，暂不可兑换' };
  if (gb.status === 'cancelled') return { ok: false, code: 409, message: '该团购方案已取消，无法兑换' };
  if (gb.status !== 'active') return { ok: false, code: 409, message: '该团购活动已关闭，无法兑换' };

  let ok = false;
  tx(() => {
    const info = db.prepare(
      "UPDATE group_buy_codes SET status = 'redeemed', redeemed_by = ?, redeemed_at = datetime('now','localtime') WHERE id = ? AND status = 'unused'"
    ).run(uid, row.id);
    if (info.changes > 0) {
      db.prepare('UPDATE group_buys SET redeemed = redeemed + 1 WHERE id = ?').run(gb.id);
      grantMembership(uid, { months: row.months || gb.months || 1, source: 'groupbuy' });
      db.prepare('UPDATE memberships SET source_ref = ? WHERE user_id = ?').run(row.code, uid);
      ok = true;
    }
  });
  if (!ok) return { ok: false, code: 409, message: '该团购码已被兑换' };
  return { ok: true, code: 0, message: '兑换成功，VIP 会员已开通', data: { membership: getMembership(uid) } };
}

// 团购整体统计（运营看板）
export function groupBuyStats() {
  const partners = db.prepare("SELECT COUNT(*) AS c FROM partners WHERE status = 'active'").get().c || 0;
  const campaigns = db.prepare("SELECT COUNT(*) AS c FROM group_buys WHERE status = 'active'").get().c || 0;
  const pending = db.prepare("SELECT COUNT(*) AS c FROM group_buys WHERE status = 'pending'").get().c || 0;
  const seats = db.prepare('SELECT COALESCE(SUM(quantity),0) AS s, COALESCE(SUM(redeemed),0) AS r, COALESCE(SUM(total_amount),0) AS a FROM group_buys').get();
  const paidRow = db.prepare("SELECT COALESCE(SUM(total_amount),0) AS a FROM group_buys WHERE paid = 1").get();
  const vipViaGroup = db.prepare("SELECT COUNT(*) AS c FROM memberships WHERE source = 'groupbuy'").get().c || 0;
  return {
    partners,
    campaigns,
    campaigns_pending: pending,
    seats_total: seats.s || 0,
    seats_redeemed: seats.r || 0,
    seats_remaining: (seats.s || 0) - (seats.r || 0),
    revenue: seats.a || 0,
    revenue_paid: paidRow.a || 0,
    vip_via_group: vipViaGroup
  };
}
