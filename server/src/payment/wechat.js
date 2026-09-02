import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { config } from '../config.js';

const API_BASE = 'https://api.mch.weixin.qq.com';

function getPrivateKey() {
  if (config.wechat.privateKey) return crypto.createPrivateKey(config.wechat.privateKey);
  if (config.wechat.privateKeyPath && existsSync(config.wechat.privateKeyPath)) {
    return crypto.createPrivateKey(readFileSync(config.wechat.privateKeyPath, 'utf-8'));
  }
  return null;
}

export function isConfigured() {
  return !!(config.wechat.appid && config.wechat.mchid && config.wechat.serialNo
    && config.wechat.apiV3Key && getPrivateKey());
}

// 微信支付 v3 请求签名：RSA-SHA256 对 {method}\n{url}\n{ts}\n{nonce}\n{body}\n 签名
function authHeader(method, urlPath, body) {
  const privateKey = getPrivateKey();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(message, 'utf8'), privateKey).toString('base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.wechat.mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.wechat.serialNo}"`;
}

async function request(method, urlPath, bodyObj) {
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  const resp = await fetch(API_BASE + urlPath, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': authHeader(method, urlPath, body)
    },
    body: body || undefined
  });
  const text = await resp.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* 非 JSON 响应 */ }
  if (!resp.ok) {
    throw new Error(`微信支付请求失败(${resp.status}): ${data.message || text || '未知错误'}`);
  }
  return data;
}

// Native 扫码支付：返回 code_url（二维码内容）
export async function createNative(order) {
  if (!isConfigured()) throw new Error('微信支付参数未配置完整');
  const data = await request('POST', '/v3/pay/transactions/native', {
    appid: config.wechat.appid,
    mchid: config.wechat.mchid,
    description: order.product_name,
    out_trade_no: order.order_no,
    notify_url: `${config.baseUrl}/api/membership/pay/notify/wechat`,
    amount: { total: Math.round(order.amount * 100), currency: 'CNY' }
  });
  return { provider: 'wechat', pay_url: null, qr_code: data.code_url || null, pay_params: null };
}

// 回调资源解密：AES-256-GCM，密钥为 API v3 Key
function decryptResource(resource) {
  const key = Buffer.from(config.wechat.apiV3Key, 'utf8');
  const buf = Buffer.from(resource.ciphertext, 'base64');
  const authTag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(resource.nonce, 'utf8'));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(resource.associated_data || '', 'utf8'));
  return JSON.parse(decipher.update(data, null, 'utf8') + decipher.final('utf8'));
}

// 处理微信支付回调：解密并校验，返回 { order_no, paid, amount }；失败返回 null
export function handleNotify(req) {
  const resource = req.body?.resource;
  if (!resource?.ciphertext) return null;
  // 时间窗防重放：回调请求头 Wechatpay-Timestamp 与当前时间偏差超过 10 分钟即拒绝。
  // （加密层 AES-GCM 认证标签已保证 resource 只能被微信官方加密，此处补充防历史回调重放。）
  const ts = Number(req.headers['wechatpay-timestamp'] || 0);
  if (!ts || Math.abs(Date.now() - ts * 1000) > 10 * 60 * 1000) {
    console.error('[wechat] 回调时间戳异常，疑似重放:', ts, '| now:', Math.floor(Date.now() / 1000));
    return null;
  }
  try {
    const decrypted = decryptResource(resource);
    if (decrypted.trade_state !== 'SUCCESS') return null;
    return { order_no: decrypted.out_trade_no, paid: true, amount: decrypted.amount?.total ?? null };
  } catch (e) {
    console.error('[wechat] 回调验签/解密失败:', e.message);
    return null;
  }
}
