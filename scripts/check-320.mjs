import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9362;
const OUT = 'E:\\saixt\\screenshots';
mkdirSync(OUT, { recursive: true });

// 1) 注册测试用户并造数据
const phone = '132' + String(Date.now()).slice(-8);
let token = '';
const reg = await fetch(BASE + '/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone, password: 'test123456', nickname: '窄屏巡检' })
});
const regj = await reg.json();
token = regj?.data?.token || '';
console.log('registered:', phone, 'token len', token.length);

const db = new DatabaseSync('E:\\saixt\\server\\data\\saixt.db');
const qs = db.prepare(
  `SELECT id, answer FROM questions
   WHERE answer IS NOT NULL AND answer != '' AND type IN ('single','judge')
   ORDER BY RANDOM() LIMIT 40`
).all();
db.close();
console.log('seed questions:', qs.length);

for (let i = 0; i < qs.length; i++) {
  const q = qs[i];
  const ans = i % 10 < 6 ? String(q.answer).trim().toUpperCase() : 'X';
  try {
    await fetch(BASE + '/api/practice/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ question_id: q.id, answer: ans })
    });
  } catch (e) { /* 忽略单题失败 */ }
}
console.log('seeded practice records:', qs.length);

// 2) 无头浏览器巡检（320px 超窄屏）
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=E:\\saixt\\screenshots\\edge-profile-320',
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
    consoleErrors.push((m.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 160));
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
  if (s?.result?.data) { writeFileSync(`${OUT}\\t320-${name}.png`, Buffer.from(s.result.data, 'base64')); }
}

await send('Page.enable');
await send('Runtime.enable');

await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: 'http://localhost:5173/' });
await new Promise(r => setTimeout(r, 3000));
await evalJS(`localStorage.setItem('saixt_token', ${JSON.stringify(token)}); localStorage.setItem('saixt_user', JSON.stringify({ nickname: '窄屏巡检' }));`);

async function visit(path, name, wait = 4000) {
  await send('Page.navigate', { url: 'http://localhost:5173' + path });
  await new Promise(r => setTimeout(r, wait));
  const info = await evalJS(`(function(){
    const body = document.body, d = document.documentElement;
    const over = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
        const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 40) : el.tagName;
        over.push(el.tagName + '.' + cls + ' L' + Math.round(r.left) + ' R' + Math.round(r.right));
      }
    });
    return JSON.stringify({
      url: location.pathname,
      vw: window.innerWidth,
      h: Math.max(d.scrollHeight, body.scrollHeight),
      hasHScroll: Math.max(d.scrollWidth, body.scrollWidth) > window.innerWidth + 1,
      overCount: over.length,
      over: over.slice(0, 8)
    });
  })()`);
  console.log(name, '=>', info);
  await shot(name);
}

const narrowPages = [
  ['/', 'home'],
  ['/dashboard', 'dashboard'],
  ['/practice', 'practice'],
  ['/bank', 'bank'],
  ['/wrong-book', 'wrongbook'],
  ['/favorites', 'favorites'],
  ['/plan', 'plan'],
  ['/review', 'review'],
  ['/weekly-report', 'weeklyreport'],
  ['/achievements', 'achievements'],
  ['/ranking', 'ranking'],
  ['/schools', 'schools'],
  ['/tasks', 'tasks'],
  ['/remind', 'remind'],
  ['/data-screen', 'datascreen'],
  ['/knowledge-graph', 'knowledgegraph'],
  ['/blind-box', 'blindbox'],
  ['/ai', 'aichat']
];
for (const [p, n] of narrowPages) await visit(p, n);

console.log('consoleErrors:', JSON.stringify(consoleErrors, null, 2));
ws.close();
edge.kill();
console.log('DONE');
process.exit(0);
