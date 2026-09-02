import { config } from './config.js';
import * as wechat from './payment/wechat.js';
import * as alipay from './payment/alipay.js';

export const PAY_PROVIDER = config.payProvider;

export function isDemo() {
  return PAY_PROVIDER === 'demo';
}

// 校验当前支付渠道参数是否配置完整（供启动时提示与前端展示）
export function providerReady() {
  if (PAY_PROVIDER === 'wechat') return wechat.isConfigured();
  if (PAY_PROVIDER === 'alipay') return alipay.isConfigured();
  return true;
}

// 创建支付：返回 { provider, pay_url, qr_code, pay_params }
export async function createPayment(order) {
  if (PAY_PROVIDER === 'wechat') return wechat.createNative(order);
  if (PAY_PROVIDER === 'alipay') return alipay.createPagePay(order);
  return { provider: 'demo', pay_url: null, qr_code: null, pay_params: null };
}

// 处理支付回调：返回 { order_no, paid }；未识别或验签失败返回 null
export async function handleNotify(req) {
  if (PAY_PROVIDER === 'wechat') return wechat.handleNotify(req);
  if (PAY_PROVIDER === 'alipay') return alipay.handleNotify(req);
  const { order_no } = req.body || {};
  if (!order_no) return null;
  return { order_no, paid: true, amount: null };
}

// 回调成功/失败的响应格式（微信/支付宝要求特定格式）
export function notifyOk(res) {
  if (PAY_PROVIDER === 'wechat') return res.json({ code: 'SUCCESS', message: '成功' });
  if (PAY_PROVIDER === 'alipay') return res.send('success');
  return res.json({ code: 0, message: '支付成功' });
}

export function notifyFail(res) {
  if (PAY_PROVIDER === 'wechat') return res.status(500).json({ code: 'FAIL', message: '处理失败' });
  if (PAY_PROVIDER === 'alipay') return res.send('failure');
  return res.status(400).json({ code: 400, message: '回调处理失败' });
}
