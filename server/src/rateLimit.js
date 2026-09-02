// 轻量内存限流：固定窗口计数，按 key 隔离，防止暴力破解与刷接口
const buckets = new Map();

// 定时清理过期桶，避免内存无限增长
setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of buckets) {
    if (now >= rec.resetAt) buckets.delete(key);
  }
}, 60 * 1000).unref();

export function rateLimit({ windowMs = 60000, max = 60, message = '请求过于频繁，请稍后再试', keyFn } = {}) {
  return (req, res, next) => {
    // req.ip 在 IPv4 下可能以 ::ffff: 前缀的 IPv4-mapped 形式返回，统一口径
    // 防止同一客户端交替 v4/v4-mapped 表现绕过按 IP 限流
    const ip = String(req.ip || '').replace(/^::ffff:/, '');
    const key = keyFn ? keyFn(req) : (req.userId ? `u:${req.userId}` : `ip:${ip}`);
    const now = Date.now();
    let rec = buckets.get(key);
    if (!rec || now >= rec.resetAt) {
      rec = { count: 0, resetAt: now + windowMs };
      buckets.set(key, rec);
    }
    rec.count++;
    if (rec.count > max) {
      const retryAfter = Math.ceil((rec.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ code: 429, message, retryAfter });
    }
    next();
  };
}
