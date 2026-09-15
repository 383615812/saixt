// 边界/异常路径攻击测试：畸形输入能否打崩接口或让请求静默挂起。
//
// 设计要点：
// - 核心断言是「有响应」(!aborted && status > 0)，而非「status < 500」。
//   reason: 部分接口 5xx 是协议要求（如微信回调故障应答须非 JSON 且 5xx），
//           AI 接口 5xx 可能是上游余额/故障。真正的缺陷是「完全无响应/超时挂起」。
// - 用 AbortController 设超时：超时即判定挂起 —— 这是本轮抓出 504 缺陷的关键手段。
//
// 用法：node scripts/ops/edge-attack.mjs [baseUrl]
//   默认打生产 http://62.234.79.165/saixt/api
//   结束时打印 PHONE=<测试号>，请用 clean-user.mjs 清理。

const BASE = process.argv[2] || 'http://62.234.79.165/saixt/api';
const phone = '132' + String(Date.now()).slice(-8);
let token = '';
const results = [];

function rec(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`);
}

async function call(method, path, body, { noAuth = false, timeoutMs = 15000 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token && !noAuth) headers.Authorization = 'Bearer ' + token;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + path, {
      method, headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ac.signal
    });
    const txt = await res.text();
    let json = null; try { json = JSON.parse(txt); } catch {}
    return { status: res.status, json, raw: txt, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, raw: e.name === 'AbortError' ? 'TIMEOUT' : e.message, ms: Date.now() - t0, aborted: true };
  } finally { clearTimeout(timer); }
}

// 只要「有响应」即通过（不挂起 = 没有静默异常）
function alive(name, r, extra) {
  const ok = !r.aborted && r.status > 0;
  rec(name, ok, `status=${r.status} ms=${r.ms}${extra ? ' ' + extra : ''}${r.aborted ? '  <<< 挂起!' : ''}`);
  return r;
}

const reg = await call('POST', '/auth/register', {
  phone, password: 'Test123456', nickname: 'Edge' + phone.slice(-4)
}, { noAuth: true });
token = reg.json?.data?.token || '';
console.log('注册: ' + (token ? 'OK' : 'FAIL: ' + String(reg.raw).slice(0, 100)) + '\n');

console.log('===== 1. 空/畸形 body（曾致 async 路由静默挂起 504）=====');
for (const [n, b] of [
  ['{}', {}], ['undefined', undefined], ['null', null],
  ['无关字段', { foo: 1 }], ['关键字段=null', { product_code: null }],
  ['关键字段=对象', { product_code: {} }], ['关键字段=数组', { product_code: [] }]
]) {
  alive(`POST /membership/order ${n}`, await call('POST', '/membership/order', b, { timeoutMs: 10000 }));
}

console.log('\n===== 2. 数值边界：Infinity / 科学计数 / 负值 =====');
for (const p of [
  '/questions?offset=1e309', '/questions?limit=1e309', '/questions?offset=-1e309',
  '/questions?limit=Infinity', '/schools?offset=1e309', '/schools?limit=1e309',
  '/ranking?offset=1e309', '/points/me?offset=Infinity',
  '/practice/records?offset=1e309', '/exam/history?offset=1e309',
  '/remind/logs?offset=1e309', '/report/weekly/history?limit=1e309',
  '/stats/me?range=1e309'
]) {
  const r = await call('GET', p, undefined, { timeoutMs: 10000 });
  rec(`GET ${p}`, !r.aborted && r.status < 500, `status=${r.status} ms=${r.ms}`);
}

console.log('\n===== 3. ID 畸形 =====');
for (const p of [
  '/exam/1e309', '/exam/-1', '/exam/1.5', '/exam/999999999999999999999',
  '/report/weekly/1e309', '/report/weekly/-1',
  '/sessions/1e309', '/sessions/-1',
  '/questions/1e309', '/questions/1.5'
]) {
  const r = await call('GET', p, undefined, { timeoutMs: 10000 });
  rec(`GET ${p}`, !r.aborted && r.status < 500, `status=${r.status} ms=${r.ms}`);
}

console.log('\n===== 4. 非数字入参直接进 SQL 的路径（绑定类型崩溃面）=====');
for (const [n, b] of [
  ['product 对象', { product: {} }], ['product 数组', { product: [] }],
  ['product null', { product: null }], ['空 body', {}]
]) {
  alive(`POST /points/exchange ${n}`, await call('POST', '/points/exchange', b, { timeoutMs: 10000 }));
}
for (const [n, b] of [
  ['order_no 对象', { order_no: {} }], ['order_no 数组', { order_no: [] }],
  ['order_no null', { order_no: null }], ['缺省', {}]
]) {
  // 注意：微信渠道下此接口 500+"FAIL" 是协议要求，只断言「有响应」
  alive(`POST /membership/pay/notify/wechat ${n}`, await call('POST', '/membership/pay/notify/wechat', b, { timeoutMs: 20000 }));
}

console.log('\n===== 5. 注入 / 超长 / 编码 =====');
// 注入类入参的正确预期是「安全降级」：参数化查询会把它当普通字符串，
// 返回 200 + 空结果（而非 4xx）。绝不能 500，也绝不能真的执行注入。
{
  const r = await call('GET', "/questions?keyword=" + encodeURIComponent("%' OR '1'='1"));
  const injected = (r.json?.data?.total || 0) > 0 && (r.json?.data?.list || []).length > 0;
  rec("keyword 注入被安全参数化", !r.aborted && r.status < 500 && !injected,
    `status=${r.status} total=${r.json?.data?.total}`);
}
{
  // 超长 keyword 不应 5xx
  const r = await call('GET', '/questions?keyword=' + 'x'.repeat(50000), undefined, { timeoutMs: 15000 });
  rec('超长 keyword(5万字符)', !r.aborted && r.status < 500, `status=${r.status} ms=${r.ms}`);
}
for (const [n, b] of [
  ['answer=null', { question_id: 1, answer: null }],
  ['answer=对象', { question_id: 1, answer: {} }],
  ['无 body', undefined]
]) {
  const r = await call('POST', '/practice/submit', b, { timeoutMs: 10000 });
  rec(`POST /practice/submit ${n}`, !r.aborted && r.status < 500, `status=${r.status} ms=${r.ms}`);
}

console.log('\n===== 6. 并发压力：不得挂起 =====');
const c1 = await Promise.all(Array.from({ length: 12 }, () => call('POST', '/membership/order', {}, { timeoutMs: 15000 })));
rec('12并发 空下单', c1.every(r => !r.aborted && r.status > 0), '状态集=' + [...new Set(c1.map(r => r.status))].join(','));
const c2 = await Promise.all(Array.from({ length: 12 }, () => call('GET', '/questions?offset=1e309', undefined, { timeoutMs: 15000 })));
rec('12并发 分页边界', c2.every(r => !r.aborted && r.status > 0), '状态集=' + [...new Set(c2.map(r => r.status))].join(','));
const c3 = await Promise.all(Array.from({ length: 10 }, () => call('GET', '/points/me', undefined, { timeoutMs: 15000 })));
rec('10并发 points/me', c3.every(r => !r.aborted && r.status > 0), '状态集=' + [...new Set(c3.map(r => r.status))].join(','));

console.log('\nPHONE=' + phone);
console.log('EDGE_RESULT ' + results.filter(r => r.ok).length + '/' + results.length + ' passed');
const failed = results.filter(r => !r.ok);
if (failed.length) { console.log('\n失败项：'); failed.forEach(f => console.log('  - ' + f.name)); }
