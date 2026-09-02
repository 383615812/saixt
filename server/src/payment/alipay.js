import crypto from 'node:crypto';
import { config } from '../config.js';

export function isConfigured() {
  return !!(config.alipay.appId && config.alipay.privateKey && config.alipay.publicKey);
}

// 待签名内容：除 sign 外所有非空参数按 key 升序拼接 k=v&...
function buildSignContent(params) {
  return Object.keys(params)
    .filter(k => k !== 'sign' && params[k] !== '' && params[k] !== null && params[k] !== undefined)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
}

function sign(params) {
  const content = buildSignContent(params);
  const privateKey = crypto.createPrivateKey(config.alipay.privateKey);
  return crypto.sign('RSA-SHA256', Buffer.from(content, 'utf8'), privateKey).toString('base64');
}

export function verifySign(params) {
  const signature = params.sign;
  if (!signature) return false;
  const content = buildSignContent(params);
  try {
    const publicKey = crypto.createPublicKey(config.alipay.publicKey);
    return crypto.verify('RSA-SHA256', Buffer.from(content, 'utf8'), publicKey, Buffer.from(signature, 'base64'));
  } catch (e) {
    console.error('[alipay] 验签失败:', e.message);
    return false;
  }
}

function buildParams(order, method) {
  const params = {
    app_id: config.alipay.appId,
    method,
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
    version: '1.0',
    notify_url: `${config.baseUrl}/api/membership/pay/notify/alipay`,
    return_url: `${config.baseUrl}/#/vip?order=${order.order_no}`,
    biz_content: JSON.stringify({
      out_trade_no: order.order_no,
      total_amount: Number(order.amount).toFixed(2),
      subject: order.product_name,
      product_code: method === 'alipay.trade.wap.pay' ? 'QUICK_WAP_WAY' : 'FAST_INSTANT_TRADE_PAY'
    })
  };
  params.sign = sign(params);
  return params;
}

// 电脑网站支付：返回可跳转的支付 URL
export async function createPagePay(order) {
  if (!isConfigured()) throw new Error('支付宝参数未配置完整');
  const params = buildParams(order, 'alipay.trade.page.pay');
  const query = Object.keys(params).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  return { provider: 'alipay', pay_url: `${config.alipay.gateway}?${query}`, qr_code: null, pay_params: null };
}

// 处理支付宝回调：验签并校验交易状态，返回 { order_no, paid, amount }；失败返回 null
export function handleNotify(req) {
  const params = req.body || {};
  if (!params.out_trade_no || !params.sign) return null;
  if (!verifySign(params)) {
    console.error('[alipay] 回调验签失败');
    return null;
  }
  const status = params.trade_status;
  if (status !== 'TRADE_SUCCESS' && status !== 'TRADE_FINISHED') return null;
  const amount = params.total_amount ? Math.round(Number(params.total_amount) * 100) : null;
  return { order_no: params.out_trade_no, paid: true, amount };
}
