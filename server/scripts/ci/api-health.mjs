// 前后端 API 健康门禁：对本地/任意后端发起只读冒烟，覆盖公共 + 登录态端点。
// 纯 node 内置(fetch)，无第三方依赖。用法：
//   node server/scripts/ci/api-health.mjs                # 默认连 http://localhost:3000/api
//   API_BASE=http://127.0.0.1:3000/api node ...          # 指定后端
//   TEST_PHONE=x TEST_PASSWORD=y node ...                # 指定登录账号（默认 13800000099/Test@123456）
// 公共端点预期 200；鉴权端点匿名访问预期 401（视为通过）。任一真实端点非 2xx 即退出非 0。
const BASE = process.env.API_BASE || 'http://localhost:3000/api';
const TEST_PHONE = process.env.TEST_PHONE || '13800000099';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Test@123456';

const r = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) {}
  const code = json && typeof json.code !== 'undefined' ? json.code : res.status;
  return { status: res.status, code };
};

let pass = 0, fail = 0;
const log = (ok, label, extra = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✓' : '✗'} ${label}${extra ? ` → ${extra}` : ''}`);
};
// 校验：期望 2xx；或(标记为 protected)匿名访问时恰好 401
const check = (label, r, { protected: isProtected = false } = {}) => {
  const ok = isProtected
    ? r.status === 401
    : r.status >= 200 && r.status < 300;
  log(ok, label, `HTTP ${r.status} code=${r.code}`);
};

console.log(`API 健康门禁 → ${BASE}\n[公共端点]`);
check('GET /health', await r('/health'));
check('GET /schools', await r('/schools'));
check('GET /schools/plans/search', await r('/schools/plans/search'));
check('GET /questions/meta', await r('/questions/meta'));
check('GET /questions/count', await r('/questions/count'));
check('GET /search', await r('/search'));
check('GET /ranking (匿名→401)', await r('/ranking'), { protected: true });
check('GET /recommend (匿名→401)', await r('/recommend'), { protected: true });

// 登录
const lgRes = await fetch(BASE + '/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: TEST_PHONE, password: TEST_PASSWORD }),
});
const lg = await lgRes.json().catch(() => null);
if (!(lg && lg.code === 0 && lg.data && lg.data.token)) {
  console.log(`✗ 登录失败(${TEST_PHONE})，跳过登录态端点`);
  process.exit(1);
}
const token = lg.data.token;
const A = (p) => r(p, { token });

console.log(`\n[登录态端点 · ${TEST_PHONE}]`);
check('GET /auth/me', await A('/auth/me'));
check('GET /stats/me', await A('/stats/me'));
check('GET /stats/mastery', await A('/stats/mastery'));
check('GET /stats/trend', await A('/stats/trend'));
check('GET /stats/dashboard', await A('/stats/dashboard'));
check('GET /questions/knowledge-graph', await A('/questions/knowledge-graph'));
check('GET /practice/sessions', await A('/practice/sessions'));
check('GET /practice/records', await A('/practice/records'));
check('GET /practice/wrong', await A('/practice/wrong'));
check('GET /practice/review/summary', await A('/practice/review/summary'));
check('GET /practice/review', await A('/practice/review'));
check('GET /practice/daily-status', await A('/practice/daily-status'));
check('GET /tasks', await A('/tasks'));
check('GET /achievements', await A('/achievements'));
check('GET /checkin/me', await A('/checkin/me'));
check('GET /daily', await A('/daily/'));
check('GET /favorites', await A('/favorites'));
check('GET /invite/me', await A('/invite/me'));
check('GET /membership/me', await A('/membership/me'));
check('GET /membership/orders', await A('/membership/orders'));
check('GET /points/me', await A('/points/me'));
check('GET /report/weekly', await A('/report/weekly'));
check('GET /report/weekly/history', await A('/report/weekly/history'));
check('GET /remind/settings', await A('/remind/settings'));
check('GET /remind/logs', await A('/remind/logs'));
check('GET /remind/due', await A('/remind/due'));
check('GET /ranking', await A('/ranking'));
check('GET /recommend', await A('/recommend'));
check('GET /ai/quota', await A('/ai/quota'));
check('GET /ai/plan/latest', await A('/ai/plan/latest'));
check('GET /ai/quick', await A('/ai/quick'));

console.log(`\n==== API 健康门禁：${pass} 通过, ${fail} 失败 ====`);
process.exit(fail ? 1 : 0);