import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9365;
const OUT = 'E:\\saixt\\screenshots\\audit2';
mkdirSync(OUT, { recursive: true });

// 注册并造数据
const phone = '135' + String(Date.now()).slice(-8);
const reg = await fetch(BASE + '/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone, password: 'test123456', nickname: '页面审计' })
});
const regj = await reg.json();
const token = regj?.data?.token || '';
console.log('registered', phone);

const db = new DatabaseSync('E:\\saixt\\server\\data\\saixt.db');
const qs = db.prepare(
  `SELECT id, answer FROM questions WHERE answer IS NOT NULL AND answer != '' AND type IN ('single','judge') ORDER BY RANDOM() LIMIT 50`
).all();
db.close();
for (let i = 0; i < qs.length; i++) {
  const ans = i % 10 < 6 ? String(qs[i].answer).trim().toUpperCase() : 'X';
  try {
    await fetch(BASE + '/api/practice/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ question_id: qs[i].id, answer: ans })
    });
  } catch (e) {}
}
console.log('seeded', qs.length);

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--window-size=1280,900', '--user-data-dir=E:\\saixt\\screenshots\\edge-audit2', 'about:blank'
], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));
const pages = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
const page = pages.find(p => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { return new Promise(res => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJS(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r?.result?.result?.value; }
async function shot(name) { const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); if (s?.result?.data) writeFileSync(`${OUT}\\${name}.png`, Buffer.from(s.result.data, 'base64')); }
async function scrollTo(y) { await evalJS(`window.scrollTo(0,${y});true`); }
const wait = ms => new Promise(r => setTimeout(r, ms));

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5173/' });
await wait(3000);
await evalJS(`localStorage.setItem('saixt_token', ${JSON.stringify(token)}); localStorage.setItem('saixt_user', JSON.stringify({ nickname: '页面审计' })); true`);

async function visit(path, name) {
  await send('Page.navigate', { url: 'http://localhost:5173' + path });
  await wait(3500);
  await scrollTo(0); await wait(800); await shot(name);
}

await visit('/dashboard', 'dashboard-top');
await scrollTo(600); await wait(700); await shot('dashboard-mid');
await visit('/bank', 'bank-top');
await visit('/wrong-book', 'wrongbook');
await visit('/favorites', 'favorites');
await visit('/plan', 'plan');
await visit('/review', 'review');
await visit('/tasks', 'tasks');
await visit('/achievements', 'achievements');
await visit('/weekly-report', 'weeklyreport');
await visit('/ranking', 'ranking');

ws.close(); edge.kill();
console.log('DONE', OUT);
process.exit(0);