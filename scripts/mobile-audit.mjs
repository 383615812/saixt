import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9370;
const OUT = 'E:\\saixt\\screenshots';
mkdirSync(OUT, { recursive: true });

// 1) 注册并造数据
const phone = '132' + String(Date.now()).slice(-8);
let token = '';
const reg = await fetch(BASE + '/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone, password: 'test123456', nickname: '移动巡检' })
});
const regj = await reg.json();
token = regj?.data?.token || '';
console.log('registered:', phone);

// 造练习记录（30 题，60% 正确率）
const db = new DatabaseSync('E:\\saixt\\server\\data\\saixt.db');
const qs = db.prepare(
  `SELECT id, answer FROM questions
   WHERE answer IS NOT NULL AND answer != '' AND type IN ('single','judge')
   ORDER BY RANDOM() LIMIT 30`
).all();
db.close();
for (let i = 0; i < qs.length; i++) {
  const ans = i % 10 < 6 ? String(qs[i].answer).trim().toUpperCase() : 'Z';
  try {
    await fetch(BASE + '/api/practice/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ question_id: qs[i].id, answer: ans })
    });
  } catch (e) {}
}
// 打卡、收藏、模拟考试（各做一点让页面有内容）
try { await fetch(BASE + '/api/checkin', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }); } catch (e) {}
try {
  await fetch(BASE + '/api/favorites/toggle', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ question_id: qs[0].id })
  });
} catch (e) {}
console.log('seeded practice:', qs.length);

// 2) 启动无头浏览器
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=E:\\saixt\\screenshots\\edge-profile-mobile-audit',
  'about:blank'
], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));

const pages = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
const page = pages.find(p => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push((m.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 200));
  }
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push('exception:' + (m.params.exceptionDetails?.text || ''));
};
function send(method, params = {}) {
  return new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r?.result?.result?.value;
}
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  if (s?.result?.data) { writeFileSync(`${OUT}\\m-${name}.png`, Buffer.from(s.result.data, 'base64')); }
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: 'http://localhost:5173/' });
await new Promise(r => setTimeout(r, 3000));
await evalJS(`localStorage.setItem('saixt_token', ${JSON.stringify(token)}); localStorage.setItem('saixt_user', JSON.stringify({ nickname: '移动巡检' }));`);

const allPages = [
  ['/', 'home'],
  ['/practice', 'practice'],
  ['/bank', 'bank'],
  ['/wrong-book', 'wrongbook'],
  ['/favorites', 'favorites'],
  ['/ai', 'aichat'],
  ['/ai-practice', 'aipractice'],
  ['/plan', 'plan'],
  ['/review', 'review'],
  ['/weekly-report', 'weeklyreport'],
  ['/achievements', 'achievements'],
  ['/ranking', 'ranking'],
  ['/schools', 'schools'],
  ['/tasks', 'tasks'],
  ['/remind', 'remind'],
  ['/dashboard', 'dashboard'],
  ['/data-screen', 'datascreen'],
  ['/knowledge-graph', 'knowledgegraph'],
  ['/blind-box', 'blindbox']
];

const results = [];
for (const [path, name] of allPages) {
  await send('Page.navigate', { url: 'http://localhost:5173' + path });
  await new Promise(r => setTimeout(r, 4000));
  const info = JSON.parse(await evalJS(`(function(){
    const d = document.documentElement, b = document.body;
    const sw = Math.max(d.scrollWidth, b.scrollWidth);
    return JSON.stringify({
      path: location.pathname,
      vw: window.innerWidth,
      scrollW: sw,
      hasHScroll: sw > window.innerWidth + 1,
      overflowPx: Math.max(0, sw - window.innerWidth),
      h: Math.max(d.scrollHeight, b.scrollHeight),
      title: document.title
    });
  })()`));
  results.push(info);
  console.log(`${name.padEnd(14)} => vw=${info.vw} sw=${info.scrollW} overflow=${info.overflowPx}px h=${info.h}`);
  await shot(name);
}

console.log('\n=== 横向溢出页面 ===');
const overflowPages = results.filter(r => r.hasHScroll);
if (overflowPages.length === 0) console.log('  全部正常，无横向溢出');
else overflowPages.forEach(r => console.log(`  ${r.path}: ${r.overflowPx}px 溢出`));

console.log('\n=== 控制台错误 ===');
console.log(consoleErrors.length ? consoleErrors.join('\n') : '无');

ws.close();
edge.kill();
console.log('\nDONE');
process.exit(0);
