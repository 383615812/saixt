// 支付渠道就绪探测：检查当前支付渠道与配置完整性（用于定位"下单返回 pay_error"的根因）
// 用法: node scripts/pay-probe.mjs
// 说明: 基于 __dirname 自动加载 server/.env
import { PAY_PROVIDER, isDemo, providerReady } from '../src/payment.js';
import * as wechat from '../src/payment/wechat.js';
import * as alipay from '../src/payment/alipay.js';

console.log(`[PAY] 当前渠道: ${PAY_PROVIDER}`);
if (isDemo()) {
  console.log('[PAY] ⚠️ demo 模式：生产环境应禁用（设置 PAY_PROVIDER=wechat/alipay），否则任意登录用户可免费开通 VIP');
}
console.log(`[PAY] 渠道就绪(providerReady): ${providerReady() ? '✅ 参数完整，可接入真实支付' : '⚠️ 参数未配置完整（真实下单将返回 pay_error）'}`);
console.log(`[PAY] 微信支付 v3 配置: ${wechat.isConfigured() ? '✅ 完整' : '⛔ 缺失（需 appid / mchid / serialNo / apiV3Key / 商户私钥）'}`);
console.log(`[PAY] 支付宝配置: ${alipay.isConfigured() ? '✅ 完整' : '⛔ 缺失（需 appId / 应用私钥 / 支付宝公钥）'}`);
if (!providerReady() && !isDemo()) {
  console.log('[PAY] 💡 修复: 在 server/.env 填齐对应渠道参数后重启服务即可接入真实支付。');
}
