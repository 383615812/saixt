// 导入 env.js 确保 .env 已加载（幂等，模块缓存只执行一次）
import './env.js';

export const config = {
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  // 站点对外地址（用于生成支付回调地址，上线后填备案域名，如 https://www.example.com）
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  // 支付渠道：demo（模拟）| wechat（微信支付 v3）| alipay（支付宝）
  payProvider: process.env.PAY_PROVIDER || 'demo',
  wechat: {
    appid: process.env.WECHAT_APPID || '',
    mchid: process.env.WECHAT_MCH_ID || '',
    serialNo: process.env.WECHAT_SERIAL_NO || '',
    apiV3Key: process.env.WECHAT_API_V3_KEY || '',
    // 商户私钥：二选一，优先内联 PEM，其次证书文件路径
    privateKey: process.env.WECHAT_PRIVATE_KEY || '',
    privateKeyPath: process.env.WECHAT_PRIVATE_KEY_PATH || ''
  },
  alipay: {
    appId: process.env.ALIPAY_APP_ID || '',
    privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
    publicKey: process.env.ALIPAY_PUBLIC_KEY || '',
    gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do'
  }
};
