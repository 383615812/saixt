import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, verifyToken } from '../auth.js';
import { getMembership, genOrderNo, markOrderPaid, listProducts, getProduct, tx } from '../commerce.js';
import { createPayment, handleNotify, notifyOk, notifyFail, providerReady, PAY_PROVIDER, isDemo } from '../payment.js';
import { rateLimit } from '../rateLimit.js';

const router = Router();

// 支付回调限流：按 IP 每 60 秒最多 60 次，防伪造回调刷开通
const notifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: '回调过于频繁，请稍后再试',
  keyFn: (req) => `pay:${req.ip}`
});

// 会员状态 + 权益
router.get('/membership/me', requireAuth, (req, res) => {
  const uid = req.userId;
  const m = getMembership(uid);
  const user = db.prepare('SELECT nickname FROM users WHERE id = ?').get(uid);
  res.json({
    code: 0,
    data: {
      vip: !!(m && m.status === 'active'),
      membership: m,
      nickname: user?.nickname || '',
      products: listProducts(),
      pay: { provider: PAY_PROVIDER, ready: providerReady() }
    }
  });
});

// 创建订单（同一用户旧的待支付订单作废，避免堆积）
router.post('/membership/order', requireAuth, async (req, res) => {
  const { product_code } = req.body || {};
  const product = getProduct(product_code);
  if (!product || !product.active) return res.status(400).json({ code: 400, message: '无效或已下架的商品' });

  const orderNo = genOrderNo();
  // 作废旧待支付订单 + 创建新订单在同一事务内，避免异常导致订单丢失
  tx(() => {
    db.prepare(`UPDATE orders SET status = 'cancelled' WHERE user_id = ? AND status = 'pending'`)
      .run(req.userId);
    db.prepare(`INSERT INTO orders (order_no, user_id, product_code, product_name, amount, status)
                VALUES (?,?,?,?,?,'pending')`)
      .run(orderNo, req.userId, product_code, product.name, product.price);
  });

  const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
  let pay = { provider: PAY_PROVIDER, pay_url: null, qr_code: null, pay_params: null };
  let payError = '';
  try {
    pay = await createPayment(order);
  } catch (e) {
    payError = e.message;
    console.error('[pay] 创建支付失败:', e.message);
  }

  res.json({
    code: 0,
    data: {
      order_no: orderNo,
      product: { code: product_code, name: product.name, price: product.price, months: product.months },
      pay_methods: ['wechat', 'alipay'],
      pay_provider: pay.provider,
      pay_url: pay.pay_url,
      qr_code: pay.qr_code,
      pay_error: payError || null
    }
  });
});

// 为已存在的待支付订单重新获取支付参数（刷新页面/二维码过期后重试）
router.post('/membership/order/:orderNo/pay', requireAuth, async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ?')
    .get(req.params.orderNo, req.userId);
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
  if (order.status !== 'pending') return res.status(400).json({ code: 400, message: '订单不可支付' });

  let pay = { provider: PAY_PROVIDER, pay_url: null, qr_code: null, pay_params: null };
  let payError = '';
  try {
    pay = await createPayment(order);
  } catch (e) {
    payError = e.message;
    console.error('[pay] 创建支付失败:', e.message);
  }
  res.json({ code: 0, data: { order_no: order.order_no, pay_provider: pay.provider, pay_url: pay.pay_url, qr_code: pay.qr_code, pay_error: payError || null } });
});

// 订单状态查询（前端支付后轮询确认结果）
router.get('/membership/order/:orderNo', requireAuth, (req, res) => {
  const row = db.prepare(
    `SELECT order_no, product_name, amount, status, pay_method, paid_at, created_at
     FROM orders WHERE order_no = ? AND user_id = ?`
  ).get(req.params.orderNo, req.userId);
  if (!row) return res.status(404).json({ code: 404, message: '订单不存在' });
  res.json({ code: 0, data: row });
});

// 取消订单
router.post('/membership/order/:orderNo/cancel', requireAuth, (req, res) => {
  const info = db.prepare(
    `UPDATE orders SET status = 'cancelled' WHERE order_no = ? AND user_id = ? AND status = 'pending'`
  ).run(req.params.orderNo, req.userId);
  if (!info.changes) return res.status(400).json({ code: 400, message: '订单不存在或不可取消' });
  res.json({ code: 0, message: '订单已取消' });
});

// 我的订单
router.get('/membership/orders', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT order_no, product_name, amount, status, pay_method, paid_at, created_at
     FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 20`
  ).all(req.userId);
  res.json({ code: 0, data: rows });
});

// 支付回调：微信/支付宝/演示统一入口
// 微信/支付宝回调由支付平台调用，需验签后置订单为已支付（幂等）
router.post('/membership/pay/notify/:method', notifyLimiter, async (req, res) => {
  const { method } = req.params;
  if (!['wechat', 'alipay', 'demo'].includes(method)) return notifyFail(res);
  try {
    // 演示渠道无支付平台验签，仅信任已登录的订单本人或管理员，防止他人伪造回调免费开通
    if (isDemo()) {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      const uid = verifyToken(token);
      if (!uid) return res.status(401).json({ code: 401, message: '未登录或登录已过期' });
      const order = db.prepare('SELECT user_id FROM orders WHERE order_no = ?').get((req.body || {}).order_no);
      if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
      const isAdmin = db.prepare('SELECT 1 FROM admins WHERE user_id = ?').get(uid);
      if (order.user_id !== uid && !isAdmin) return res.status(403).json({ code: 403, message: '无权操作该订单' });
    }
    const result = await handleNotify(req);
    if (!result) return notifyFail(res);
    // 金额校验：真实渠道回调金额必须与订单金额一致（防篡改/防错配）；demo 渠道无金额字段
    if (!isDemo()) {
      if (result.amount == null) return notifyFail(res);
      const orderRow = db.prepare('SELECT amount FROM orders WHERE order_no = ?').get(result.order_no);
      if (!orderRow) return notifyFail(res);
      if (Math.round(orderRow.amount * 100) !== result.amount) {
        console.error(`[pay] 回调金额不匹配: order=${result.order_no} expect=${orderRow.amount} got=${result.amount}`);
        return notifyFail(res);
      }
    }
    const order = markOrderPaid(result.order_no, method);
    if (!order) {
      // 订单不存在或已支付：已支付视为成功（幂等），不存在则失败；已取消订单被支付须返回失败以便平台退款/人工处理
      const exists = db.prepare('SELECT status FROM orders WHERE order_no = ?').get(result.order_no);
      if (!exists) return notifyFail(res);
      if (exists.status === 'cancelled') {
        console.error(`[pay] 回调命中已取消订单: order=${result.order_no}`);
        return notifyFail(res);
      }
    }
    return notifyOk(res);
  } catch (e) {
    console.error('[pay] 回调异常:', e.message);
    return notifyFail(res);
  }
});

export default router;
