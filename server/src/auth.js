import crypto from 'node:crypto';

// 生产环境必须通过 SAIXT_SECRET 注入强密钥；未配置时启动生成随机密钥（重启后旧令牌失效）
const SECRET = process.env.SAIXT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SAIXT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    // 生产禁止用临时密钥：一旦漏配，重启即全量登出，且密钥不可复现
    console.error('[saixt-server] 严重错误: 生产环境必须配置 SAIXT_SECRET（用于 JWT 签名），请设置后重新启动。');
    process.exit(1);
  }
  console.warn('[saixt-server] 警告: 未配置 SAIXT_SECRET，已生成临时随机密钥，重启后所有登录态将失效。生产环境请设置 SAIXT_SECRET。');
}
const TOKEN_TTL = 30 * 24 * 3600 * 1000; // 30天

export function signToken(userId) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (expect !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

// scrypt 参数：N=16384 内存约 16MB，单次约几十毫秒，配合登录限流可防暴力破解
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

export function hashPassword(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pwd, salt, SCRYPT_KEYLEN, SCRYPT_OPTS).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

// 校验密码：兼容旧版 SHA256 哈希（登录成功后由调用方升级为 scrypt）
export function verifyPassword(pwd, stored) {
  if (!stored) return false;
  if (stored.startsWith('scrypt$')) {
    const [tag, salt, hash] = stored.split('$');
    if (tag !== 'scrypt' || !salt || !hash) return false;
    const calc = crypto.scryptSync(pwd, salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
    const a = Buffer.from(hash, 'hex');
    return a.length === calc.length && crypto.timingSafeEqual(a, calc);
  }
  return crypto.createHash('sha256').update(pwd + SECRET).digest('hex') === stored;
}

// 是否为旧版 SHA256 哈希（需要升级）
export function needsRehash(stored) {
  return !!stored && !stored.startsWith('scrypt$');
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const uid = verifyToken(token);
  if (!uid) return res.status(401).json({ code: 401, message: '未登录或登录已过期' });
  req.userId = uid;
  next();
}
