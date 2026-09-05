// 第一个导入：先加载 .env，保证所有依赖 process.env 的模块（含 auth.js 的 JWT 密钥）拿到真实值
import './env.js';

import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

import authRoutes from './routes/auth.js';
import questionRoutes from './routes/questions.js';
import practiceRoutes from './routes/practice.js';
import schoolRoutes from './routes/schools.js';
import statsRoutes from './routes/stats.js';
import aiRoutes from './routes/ai.js';
import recommendRoutes from './routes/recommend.js';
import rankingRoutes from './routes/ranking.js';
import checkinRoutes from './routes/checkin.js';
import favoritesRoutes from './routes/favorites.js';
import dailyRoutes from './routes/daily.js';
import taskRoutes from './routes/tasks.js';
import achievementRoutes from './routes/achievements.js';
import reportRoutes from './routes/report.js';
import remindRoutes from './routes/remind.js';
import membershipRoutes from './routes/membership.js';
import pointsRoutes from './routes/points.js';
import inviteRoutes from './routes/invite.js';
import adminRoutes from './routes/admin.js';
import searchRoutes from './routes/search.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { PAY_PROVIDER, providerReady } from './payment.js';

// 生产环境禁止 demo 支付模式：demo 下任意登录用户可自开通 VIP，属高危漏洞
if (PAY_PROVIDER === 'demo' && process.env.NODE_ENV === 'production') {
  console.error('[saixt-server] 严重错误: 生产环境禁止使用 demo 支付模式（任意登录用户可免费开通 VIP）。请设置 PAY_PROVIDER=wechat 或 alipay 并配置对应参数。');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// 反向代理下的真实客户端 IP 识别：Nginx 等一层代理设 TRUST_PROXY=1，两层=2……
// 不设则 req.ip 取自 TCP 对端（即代理地址），会导致按 IP 限流（登录/注册）被共享误伤，也让暴力防护失效。
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy === 'true') app.set('trust proxy', true);
else if (trustProxy === 'false') app.set('trust proxy', false);
else if (trustProxy != null && trustProxy !== '' && !Number.isNaN(Number(trustProxy))) app.set('trust proxy', Number(trustProxy));

app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',').map(s => s.trim()) || ['http://localhost:5173'],
  credentials: true
}));
// 生产环境未显式配置 CORS_ORIGIN 时给出行提示，避免误放仅允许本机
if (!process.env.CORS_ORIGIN && process.env.NODE_ENV === 'production') {
  console.warn('[saixt-server] 警告: 生产环境未设置 CORS_ORIGIN，跨域仅允许 http://localhost:5173，请配置真实前端域名。');
}
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// 轻量请求日志（排除健康检查与静态资源），生产排查留存访问来源与耗时
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path === '/api/health' || req.path.startsWith('/qimages') || req.path.includes('.')) return;
    console.log(`[req] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// 健康检查：区分绿/存活性（进程在）与就绪性（数据库可读写，供负载均衡摘除故障节点）
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
  } catch (e) {
    return res.status(503).json({ code: 503, message: '数据库不可用', error: e.message });
  }
  res.json({ code: 0, message: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/recommend', recommendRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api', checkinRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api', favoritesRoutes);
app.use('/api', taskRoutes);
app.use('/api', achievementRoutes);
app.use('/api', reportRoutes);
app.use('/api', remindRoutes);
app.use('/api', membershipRoutes);
app.use('/api', pointsRoutes);
app.use('/api', inviteRoutes);
app.use('/api', adminRoutes);
app.use('/api/search', searchRoutes);

// 静态托管题库图片资源
const publicDir = join(__dirname, '..', 'public');
if (existsSync(publicDir)) {
  app.use('/qimages', express.static(join(publicDir, 'qimages'), { fallthrough: true }));
}

// 静态托管前端构建产物（若存在）
const webDist = join(__dirname, '..', '..', 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(join(webDist, 'index.html')));
}

app.use((req, res) => res.status(404).json({ code: 404, message: '接口不存在' }));
app.use((err, req, res, next) => {
  // 响应头已发送时不能再写 body，交由默认处理避免二次抛异常
  if (res.headersSent) return next(err);
  // body-parser 等中间件抛出的错误自带 status（如畸形 JSON → 400），优先返回正确状态码
  const status = Number.isInteger(err?.status) ? err.status : (Number.isInteger(err?.statusCode) ? err.statusCode : 500);
  if (status >= 500) console.error('[saixt-server] 未捕获异常:', err?.stack || err);
  else console.warn(`[saixt-server] 请求错误 ${status}: ${err?.message || ''}`);
  res.status(status).json({ code: status, message: status >= 500 ? '服务器内部错误' : '请求参数格式错误' });
});

const server = app.listen(PORT, () => {
  console.log(`[saixt-server] 已启动 env=${process.env.NODE_ENV || 'development'} port=${PORT}`);
  console.log(`[saixt-server] 站点地址: ${process.env.BASE_URL || 'http://localhost:' + PORT}`);
  console.log(`[saixt-server] 健康检查: ${process.env.BASE_URL || 'http://localhost:' + PORT}/api/health`);
  console.log(`[saixt-server] 支付渠道: ${PAY_PROVIDER}${PAY_PROVIDER === 'demo' ? '（模拟支付，配置 PAY_PROVIDER=wechat/alipay 接入真实支付）' : (providerReady() ? '（参数已配置）' : '（参数未配置完整，请检查 .env）')}`);
  startScheduler();
});

// 优雅关闭：先停 HTTP，再停定时任务，最后关闭数据库句柄
function shutdown(signal) {
  console.log(`[saixt-server] 收到 ${signal}，正在优雅关闭...`);
  server.close(() => {
    try { stopScheduler(); } catch {}
    try { db.close(); } catch {}
    console.log('[saixt-server] 已关闭');
    process.exit(0);
  });
  // 兜底：10 秒内未完成则强制退出，避免进程挂死
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
