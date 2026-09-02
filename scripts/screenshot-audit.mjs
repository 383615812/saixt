import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9364;
const OUT = 'E:\\saixt\\screenshots\\audit';
mkdirSync(OUT, { recursive: true });

// 注册测试用户
const phone = '134' + String(Date.now()).slice(-8);
const reg = await fetch(BASE + '/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone, password: 'test123456', nickname: '视觉审计' })
});
const regj = await reg.json();
const token = regj?.data?.token || '';

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--window-size=1280,900', '--user-data-dir=E:\\saixt\\screenshots\\edge-audit', 'about:blank'
], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));

const pages = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
const page = pages.find(p => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
function send(method, params = {}) {
  return new Promise(res => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r?.result?.result?.value;
}
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (s?.result?.data) writeFileSync(`${OUT}\\${name}.png`, Buffer.from(s.result.data, 'base64'));
}
async function scrollTo(y) { await evalJS(`window.scrollTo(0, ${y}); true`); }
async function wait(ms) { await new Promise(r => setTimeout(r, ms)); }

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });

// 1) 首页（未登录）
await send('Page.navigate', { url: 'http://localhost:5173/' });
await wait(3500);
await scrollTo(0); await wait(900);
await shot('home-hero');
await scrollTo(1200); await wait(900); await shot('home-mid');
await scrollTo(2400); await wait(900); await shot('home-features');

// 2) 首页（已登录，注入 token）
await evalJS(`localStorage.setItem('saixt_token', ${JSON.stringify(token)}); localStorage.setItem('saixt_user', JSON.stringify({ nickname: '学习达人' })); true`);
await send('Page.navigate', { url: 'http://localhost:5173/' });
await wait(3500);
await scrollTo(0); await wait(900);
await shot('home-logged');

// 3) 登录页
await send('Page.navigate', { url: 'http://localhost:5173/login' });
await wait(2500);
await scrollTo(0); await wait(700);
await shot('login');

// 4) 个人中心
await send('Page.navigate', { url: 'http://localhost:5173/dashboard' });
await wait(3000);
await scrollTo(0); await wait(800); await shot('dashboard');
await scrollTo(900); await wait(800); await shot('dashboard-2');

ws.close();
edge.kill();
console.log('DONE saved to', OUT);
process.exit(0);