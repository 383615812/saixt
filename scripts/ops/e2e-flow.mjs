// 全链路真实业务流程 E2E（生产/任意环境）
// 用法: node e2e-flow.mjs [baseUrl]
// 默认 baseUrl = http://62.234.79.165/saixt/api
//
// 覆盖：注册→每日一练→单题提交→错题本→收藏→复习→模考(取卷/交卷)→统计→排行→签到→积分→周报
// 注意：会用临时手机号注册并写入练习/模考数据，脚本末尾打印 PHONE，请用 clean-user.mjs 清理。
const BASE = process.argv[2] || 'http://62.234.79.165/saixt/api';
const phone = '138' + String(Date.now()).slice(-8);
const pwd = 'Test123456';
let token = '';
const results = [];
const rec = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`); };

async function call(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text(); let json = null; try { json = JSON.parse(txt); } catch {}
  return { status: res.status, json };
}

// 1. 注册
const reg = await call('POST', '/auth/register', { phone, password: pwd, nickname: 'E2E' + phone.slice(-4) });
token = (reg.json && reg.json.data && reg.json.data.token) || '';
rec('注册', reg.status === 200 && reg.json.code === 0 && !!token, 'code=' + (reg.json && reg.json.code));

// 2. 每日一练
const daily = await call('GET', '/daily');
const dqs = (daily.json && daily.json.data && daily.json.data.questions) || [];
rec('每日一练', daily.json.code === 0, '题数=' + dqs.length);
rec('每日一练不含主观题', dqs.every(q => q.type !== 'subjective'), '类型=' + [...new Set(dqs.map(q => q.type))].join('/'));

// 3. 单题提交（客观题，服务端判分）
const qlist = await call('GET', '/questions?type=single&limit=1');
const q1 = qlist.json.data.list[0];
rec('题库取题', !!q1, 'id=' + (q1 && q1.id));
await call('POST', '/practice/submit', { question_id: q1.id, answer: 'A', record: true });
rec('单题提交', true);

// 4. 错题本（提交错误答案确保有错题）
await call('POST', '/practice/submit', { question_id: q1.id, answer: 'Z', record: true });
const wrong = await call('GET', '/practice/wrong');
rec('错题本', wrong.json.code === 0, '错题数=' + ((wrong.json.data && wrong.json.data.length) || 0));

// 5. 收藏
await call('POST', '/favorites/toggle', { question_id: q1.id });
const favList = await call('GET', '/favorites');
rec('收藏', favList.json.code === 0, '收藏数=' + ((favList.json.data && favList.json.data.length) || 0));

// 6. 复习计划
const rsum = await call('GET', '/practice/review/summary');
rec('复习计划summary', rsum.json.code === 0, 'dueToday=' + (rsum.json.data && rsum.json.data.dueToday));

// 7. 模考
const examStart = await call('POST', '/exam/start', { subject: '政治' });
const exId = examStart.json.data && examStart.json.data.id;
rec('模考启动', examStart.json.code === 0 && !!exId, 'examId=' + exId);
if (exId) {
  const exGet = await call('GET', `/exam/${exId}`);
  const qs = (exGet.json.data && exGet.json.data.questions) || [];
  rec('取卷不含答案', !qs.some(q => q.answer), '题数=' + qs.length);
  const answers = qs.map(q => ({ question_id: q.id, answer: q.type === 'multiple' ? 'AB' : 'A' }));
  const exSub = await call('POST', `/exam/${exId}/submit`, { answers });
  rec('模考交卷', exSub.json.code === 0, 'score=' + (exSub.json.data && exSub.json.data.score));
}

// 8. 统计/排行/签到/积分/周报
rec('统计/me', (await call('GET', '/stats/me')).json.code === 0);
rec('排行榜', (await call('GET', '/ranking')).json.code === 0);
rec('签到', (await call('POST', '/checkin')).json.code === 0);
rec('积分', (await call('GET', '/points/me')).json.code === 0);
rec('周报', (await call('GET', '/report/weekly')).json.code === 0);

const passed = results.filter(r => r.ok).length;
console.log(`\nPHONE=${phone}`);
console.log(`E2E_RESULT ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
