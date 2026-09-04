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

export function mapQuestions(rows) {
  return rows.map(withImages);
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
