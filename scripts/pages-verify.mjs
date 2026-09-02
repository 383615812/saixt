import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9344;
mkdirSync('E:\\saixt\\screenshots', { recursive: true });

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=E:\\saixt\\screenshots\\edge-profile-pp2',
  'about:blank'
], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));

const pages = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
const page = pages.find(p => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
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
  if (s?.result?.data) { writeFileSync(`E:\\saixt\\screenshots\\pp2-${name}.png`, Buffer.from(s.result.data, 'base64')); console.log('saved pp2-' + name); }
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://localhost:5173/' });
await new Promise(r => setTimeout(r, 4000));

const phone = '138' + String(Date.now()).slice(-8);
let token = '';
try {
  const reg = await fetch('http://localhost:3000/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password: 'test123456', nickname: '页面巡检' })
  });
  const j = await reg.json();
  token = j?.data?.token || '';
} catch (e) {}
await evalJS(`localStorage.setItem('saixt_token', ${JSON.stringify(token)}); localStorage.setItem('saixt_user', JSON.stringify({nickname:'页面巡检'}));`);

async function visit(path, name, wait = 4500) {
  await send('Page.navigate', { url: 'http://localhost:5173' + path });
  await new Promise(r => setTimeout(r, wait));
  const info = await evalJS(`(function(){
    const body = document.body, d = document.documentElement;
    const cards = document.querySelectorAll('.card').length;
    const images = document.querySelectorAll('img').length;
    const broken = Array.from(document.querySelectorAll('img')).filter(i => !i.complete || i.naturalWidth === 0).length;
    return JSON.stringify({
      url: location.pathname,
      vw: window.innerWidth,
      hasHScroll: Math.max(d.scrollWidth, body.scrollWidth) > window.innerWidth + 1,
      cards,
      images,
      brokenImgs: broken
    });
  })()`);
  console.log(name, '=>', info);
  await shot(name);
}

await visit('/practice', 'practice');
await visit('/review', 'review');
await visit('/blind-box', 'blindbox');
await visit('/tasks', 'tasks');

ws.close();
edge.kill();
console.log('DONE');
process.exit(0);
