// 题目序列化辅助：将 image/images 字段统一为 images 数组，并规范为 qimages/ 前缀
function normImg(p) {
  let s = String(p || '').replace(/^\/+/, '');
  if (!s.startsWith('qimages/')) s = 'qimages/' + s;
  return s;
}

export function withImages(row) {
  if (!row) return row;
  const out = { ...row };
  let arr = [];
  if (out.images) {
    try { arr = JSON.parse(out.images); } catch { arr = []; }
  }
  if (!arr.length && out.image) arr = [out.image];
  out.images = arr.filter(Boolean).map(normImg);
  return out;
}

// 安全 JSON 解析：库内/外部字段（如题目 options）若损坏为非 JSON 字符串，
// 直接 JSON.parse 会让题目列表/收藏/错题本/复习/AI 组卷等多个接口抛 500 影响全体用户。
// 此处对 null/undefined 与解析异常都回退默认值，保证单条脏数据不会拖垮整个接口。
export function safeJson(s, fallback = []) {
  if (s === null || s === undefined) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

export function mapQuestions(rows) {
  return rows.map(withImages);
}

// 题型枚举规范化：全站唯一合法值为 single/multiple/judge/subjective。
// 历史上导入脚本写入过 'subj'（主观题缩写）、'multi'（多选缩写）等非法值，
// 会导致题型筛选落空、前端不渲染、统计口径错乱。此处统一归一，未知值兜底为 single。
const TYPE_ALIASES = {
  subj: 'subjective', subjective: 'subjective', essay: 'subjective', short: 'subjective',
  multi: 'multiple', multiple: 'multiple', multi_choice: 'multiple',
  single: 'single', choice: 'single', radio: 'single',
  judge: 'judge', truefalse: 'judge', tf: 'judge'
};
export function normalizeType(t) {
  const key = String(t ?? '').trim().toLowerCase();
  return TYPE_ALIASES[key] || 'single';
}

// 安全整数解析（分页 limit/offset 等）：把用户输入钳制到 [min, max] 区间。
// 关键防护：Number('1e309') === Infinity，若只用 Math.max(Number(x)||d, min) 会把
// Infinity 直接绑进 SQLite 的 LIMIT/OFFSET → 抛错 500。此处用 Number.isFinite 兜底。
export function clampInt(v, min, max, fallback) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

// 安全字符串解析：把任意用户输入（undefined / null / 对象 / 数组 / 数字）统一为字符串，
// 供 SQLite 参数绑定使用。node:sqlite 只接受 null / number / string / bigint / Buffer，
// 直接绑定 undefined 或对象会抛 ERR_INVALID_ARG_TYPE 导致接口 500
// （如 getProduct(undefined)）。此处兜底为 ''，业务侧再按空值判非法即可。
export function safeStr(v) {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  return '';
}

// 昵称等「展示用短文本」归一：只接受字符串/数字，去控制字符与零宽字符、压缩空白、截断超长。
// 仅靠 safeStr 不够——它不设长度上限，而昵称入参曾无任何校验：
// 实测生产库里存在昵称长度 100000 的脏数据（register 直接落 `nickname || 默认值`），
// 会让排行榜/邀请/个人中心等所有下发昵称的接口响应膨胀到上百 KB，并在前端撑破布局。
// 非字符串（对象/数组/null/undefined）一律回落 ''，由调用方决定默认值，避免存进 "[object Object]"。
export function safeName(v, max = 24) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v)
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// 异步路由包装器：Express 4 不会自动捕获 async handler 的 Promise 拒绝，
// 一旦 async 处理器内部抛错（如 SQLite 绑定类型错误），请求将永远挂起无响应，
// nginx 侧表现为 504 Gateway Time-out。此处统一 catch 并透传给错误中间件，
// 保证任何异常都能转成规范的 4xx/5xx JSON 响应而非静默超时。
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ---------- 日期工具：统一 YYYY-MM-DD 格式化 ----------

export function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayStr() {
  return formatDate(new Date());
}

// 相对今天偏移 days 天（可正可负）
export function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

// 通用 TTL 缓存：对读多写少、允许轻微过期的聚合结果做短时缓存，
// 避免排行榜/看板等高频接口每次都触发表级聚合扫码。数据仍为真实查询结果，仅可能轻微滞后。
export function createCache(ttlMs = 60_000) {
  const store = new Map();
  return {
    get(key, compute) {
      const now = Date.now();
      const hit = store.get(key);
      if (hit && now - hit.t < ttlMs) return hit.v;
      const v = compute();
      store.set(key, { t: now, v });
      return v;
    }
  };
}

// 对指定日期字符串偏移 days 天
export function addDaysTo(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

// 当前自然周（周一 ~ 周日）
export function currentWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { weekStart: formatDate(monday), weekEnd: formatDate(sunday) };
}

// ---------- 判分工具：统一各端点的答案判定口径 ----------
// 单选/判断：精确匹配；多选：字母排序后比对（顺序无关）；主观题：必须显式自判，未自判不视为正确
// selfCorrect 兼容 true / 1 / 'true' / '1' 等前端可能传来的各种类型
export function gradeAnswer(q, answer, selfCorrect) {
  if (q.type === 'subjective') {
    return selfCorrect === true || selfCorrect === 1 || selfCorrect === 'true' || selfCorrect === '1';
  }
  // 客观题答案规范化：只保留字母，去空白/标点/数字，避免 "ABC"、"A、B"、"a1" 等脏输入产生误判
  const norm = s => String(s ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  const ans = norm(answer);
  const right = norm(q.answer);
  if (q.type === 'multiple') return ans.length > 0 && ans.split('').sort().join('') === right.split('').sort().join('');
  return ans.length > 0 && ans === right;
}

// ---------- 院校地区推断：从校名提取所在的云南地州 ----------
// 供院校库列表与志愿推荐共用，保证两处口径一致。
// 云南省级院校多数位于昆明，少数已知院校手动修正；列表仅含云南省 16 个地州，不含任何省外地区。
const REGIONS = ['昆明', '曲靖', '玉溪', '楚雄', '大理', '丽江', '保山', '昭通', '普洱', '临沧', '红河', '文山', '西双版纳', '德宏', '怒江', '迪庆'];
const REGION_OVERRIDE = {
  '云南能源职业技术学院': '曲靖',
  '云南工业信息职业学院': '曲靖',
  '云南现代职业技术学院': '楚雄',
  '云南锡业职业技术学院': '红河',
  '云南三鑫职业技术学院': '文山'
};
export function schoolRegion(name) {
  for (const r of REGIONS) if (name.includes(r)) return r;
  if (name.includes('云南')) {
    for (const [key, val] of Object.entries(REGION_OVERRIDE)) if (name.includes(key)) return val;
    return '昆明';
  }
  return '其他';
}
