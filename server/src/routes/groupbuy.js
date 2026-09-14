import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import {
  createPartner, listPartners,
  createGroupBuy, listGroupBuys, getGroupBuy, closeGroupBuy,
  settleGroupBuy, cancelGroupBuy,
  listGroupBuyCodes, listGroupBuyBatchLabels, redeemCode, groupBuyStats
} from '../groupbuy.js';
import { createPayment, PAY_PROVIDER } from '../payment.js';
import { rateLimit } from '../rateLimit.js';

const router = Router();

// 兑换码接口限流：防脚本批量兑换/撞库（兑换即开通会员，必须限制频率）
const redeemLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: '兑换过于频繁，请稍后再试'
});

// 管理员鉴权：以 admins 表为准（role = main / admin）
function requireAdmin(req, res, next) {
  const me = db.prepare(
    'SELECT u.id, u.phone, a.role FROM users u JOIN admins a ON a.user_id = u.id WHERE u.id = ?'
  ).get(req.userId);
  if (!me || !me.role) return res.status(403).json({ code: 403, message: '无管理员权限' });
  req.adminRole = me.role;
  next();
}

const clampInt = (v, min, max, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : def;
};

// ---------- 统计概览 ----------
router.get('/groupbuy/stats', requireAuth, requireAdmin, (req, res) => {
  res.json({ code: 0, data: groupBuyStats() });
});

// ---------- 合作机构 ----------
router.get('/groupbuy/partners', requireAuth, requireAdmin, (req, res) => {
  const { type, status, keyword } = req.query;
  const list = listPartners({
    type: type ? String(type) : undefined,
    status: status ? String(status) : undefined,
    keyword: keyword ? String(keyword) : undefined
  });
  res.json({ code: 0, data: { list } });
});

router.post('/groupbuy/partners', requireAuth, requireAdmin, (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) return res.status(400).json({ code: 400, message: '机构名称不能为空' });
  try {
    const partner = createPartner({
      name,
      type: b.type,
      contact: b.contact,
      phone: b.phone,
      school_code: b.school_code || null,
      createdBy: req.userId
    });
    res.json({ code: 0, data: { partner, message: '已新增合作机构' } });
  } catch (e) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// ---------- 团购方案 ----------
router.get('/groupbuy/groupbuys', requireAuth, requireAdmin, (req, res) => {
  const { partner_id, status, keyword, page, limit } = req.query;
  const p = clampInt(page, 1, 1000000, 1);
  const l = clampInt(limit, 1, 100, 30);
  const r = listGroupBuys({
    partnerId: partner_id != null && partner_id !== '' ? Number(partner_id) : undefined,
    status: status ? String(status) : undefined,
    keyword: keyword ? String(keyword) : undefined,
    limit: l, offset: (p - 1) * l
  });
  res.json({ code: 0, data: { list: r.list, total: r.total, page: p, limit: l } });
});

router.post('/groupbuy/groupbuys', requireAuth, requireAdmin, (req, res) => {
  const b = req.body || {};
  const partnerId = Number(b.partner_id);
  if (!partnerId) return res.status(400).json({ code: 400, message: '请选择合作机构' });
  try {
    const gb = createGroupBuy({
      partnerId,
      productCode: b.product_code,
      months: b.months,
      quantity: b.quantity,
      batches: Array.isArray(b.batches) ? b.batches : undefined,
      unitPrice: b.unit_price,
      expireAt: b.expire_at,
      remark: b.remark,
      createdBy: req.userId
    });
    const batchTip = gb.batches && gb.batches.length > 1 ? `（分 ${gb.batches.length} 个批次）` : '';
    const tip = gb.paid ? `已创建团购方案，生成 ${gb.quantity} 张兑换码${batchTip}` : `已创建团购方案（待收款），收款后将生成 ${gb.quantity} 张兑换码${batchTip}`;
    res.json({ code: 0, data: { group_buy: gb, message: tip } });
  } catch (e) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

router.get('/groupbuy/groupbuys/:id', requireAuth, requireAdmin, (req, res) => {
  const gb = getGroupBuy(Number(req.params.id));
  if (!gb) return res.status(404).json({ code: 404, message: '团购方案不存在' });
  res.json({ code: 0, data: { group_buy: gb } });
});

// 团购码列表（分页 + 状态筛选 + 批次筛选）
router.get('/groupbuy/groupbuys/:id/codes', requireAuth, requireAdmin, (req, res) => {
  const { status, batch, page, limit } = req.query;
  const p = clampInt(page, 1, 1000000, 1);
  const l = clampInt(limit, 1, 500, 50);
  const offset = (p - 1) * l;
  const r = listGroupBuyCodes(Number(req.params.id), {
    status: status ? String(status) : undefined,
    batch: batch ? String(batch) : undefined,
    page: p, limit: l, offset
  });
  res.json({ code: 0, data: { ...r, page: p, limit: l } });
});

// 该方案下的批次名称（用于筛选下拉）
router.get('/groupbuy/groupbuys/:id/batches', requireAuth, requireAdmin, (req, res) => {
  res.json({ code: 0, data: { labels: listGroupBuyBatchLabels(Number(req.params.id)) } });
});

// 团购码导出 CSV（遵循筛选，不限分页）
router.get('/groupbuy/groupbuys/:id/codes/export', requireAuth, requireAdmin, (req, res) => {
  const { status, batch } = req.query;
  const r = listGroupBuyCodes(Number(req.params.id), {
    status: status ? String(status) : undefined,
    batch: batch ? String(batch) : undefined,
    limit: 100000, offset: 0
  });
  const idName = new Map(db.prepare('SELECT id, nickname FROM users').all().map(u => [u.id, u.nickname]));
  const idPhone = new Map(db.prepare('SELECT id, phone FROM users').all().map(u => [u.id, u.phone]));
  const statusTxt = { unused: '未兑换', redeemed: '已兑换', expired: '已过期' };
  const esc = s => { const v = s == null ? '' : String(s); const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
  const header = ['兑换码', '批次', '商品编码', '时长(月)', '状态', '兑换用户', '手机号', '兑换时间', '过期时间'];
  const lines = r.list.map(c => [
    c.code, c.batch_label || '', c.product_code, c.months, statusTxt[c.status] || c.status,
    c.redeemed_by ? (idName.get(c.redeemed_by) || '') : '',
    c.redeemed_by ? (idPhone.get(c.redeemed_by) || '') : '',
    c.redeemed_at || '', c.expire_at || ''
  ].map(esc).join(','));
  const csv = '﻿' + [header.join(','), ...lines].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="gb_codes_${req.params.id}.csv"`);
  res.send(csv);
});

// 关闭团购方案；可选一并作废未兑换的码
router.post('/groupbuy/groupbuys/:id/close', requireAuth, requireAdmin, (req, res) => {
  const gb = closeGroupBuy(Number(req.params.id), { expireCodes: !!req.body?.expireCodes });
  if (!gb) return res.status(404).json({ code: 404, message: '团购方案不存在' });
  res.json({ code: 0, data: { group_buy: gb, message: '团购方案已关闭' } });
});

// 发起在线支付：为待收款方案创建支付参数（二维码 / 支付链接）
router.post('/groupbuy/groupbuys/:id/pay', requireAuth, requireAdmin, async (req, res) => {
  const gb = getGroupBuy(Number(req.params.id));
  if (!gb) return res.status(404).json({ code: 404, message: '团购方案不存在' });
  if (gb.paid) return res.status(400).json({ code: 400, message: '方案已收款，无需重复支付' });
  if (gb.status !== 'pending') return res.status(400).json({ code: 400, message: '当前状态不可支付' });
  let pay = { provider: PAY_PROVIDER, pay_url: null, qr_code: null, pay_params: null };
  let payError = '';
  try {
    pay = await createPayment({ order_no: gb.pay_no, amount: gb.total_amount, description: `团购方案 ${gb.code} · ${gb.product_name || gb.product_code}` });
  } catch (e) {
    payError = e.message;
    console.error('[groupbuy] 创建支付失败:', e.message);
  }
  res.json({
    code: 0,
    data: {
      group_buy: gb,
      pay_no: gb.pay_no,
      amount: gb.total_amount,
      pay_provider: pay.provider,
      pay_url: pay.pay_url,
      qr_code: pay.qr_code,
      pay_error: payError || null
    }
  });
});

// 确认收款 / 结算：线下转账人工确认，或支付回调统一入口；结算后生成兑换码
router.post('/groupbuy/groupbuys/:id/settle', requireAuth, requireAdmin, (req, res) => {
  const method = String(req.body?.method || 'manual');
  try {
    const gb = settleGroupBuy(Number(req.params.id), { method });
    if (!gb) return res.status(404).json({ code: 404, message: '团购方案不存在' });
    res.json({ code: 0, data: { group_buy: gb, message: gb.paid ? '已确认收款，兑换码已生成' : '结算未完成' } });
  } catch (e) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 取消待收款方案
router.post('/groupbuy/groupbuys/:id/cancel', requireAuth, requireAdmin, (req, res) => {
  try {
    const gb = cancelGroupBuy(Number(req.params.id));
    if (!gb) return res.status(404).json({ code: 404, message: '团购方案不存在' });
    res.json({ code: 0, data: { group_buy: gb, message: '方案已取消' } });
  } catch (e) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// ---------- 学生端：团购码兑换 ----------
router.post('/groupbuy/redeem', requireAuth, redeemLimiter, async (req, res) => {
  const { code } = req.body || {};
  const r = redeemCode(code, req.userId);
  if (!r.ok) return res.status(r.code || 400).json({ code: r.code || 400, message: r.message, data: r.data });
  res.json({ code: 0, data: r.data, message: r.message });
});

export default router;
