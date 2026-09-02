import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9388;
const OUT = 'E:\\saixt\\screenshots\\ui-verify';
mkdirSync(OUT, { recursive: true });

// 注册测试用户
const phone = '137' + String(Date.now()).slice(-8);
const reg = await fetch(BASE + '/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone, password: 'test123456', nickname: 'UI巡检' })
});
const regj = await reg.json();
const token = regj?.data?.token || '';
console.log('registered', phone, token ? 'token-ok' : 'NO-TOKEN');

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--window-size=1280,900', '--user-data-dir=E:\\saixt\\screenshots\\edge-ui-verify', 'about:blank'
], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));
const pages = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
const page = pages.find(p => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map();
const consoleErrors = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') {
    const t = m.params?.exceptionDetails?.text || '';
    const d = m.params?.exceptionDetails?.exception?.description || '';
    consoleErrors.push((t + ' ' + d).slice(0, 300));
  }
  if (m.method === 'Log.entryAdded' && m.params?.entry?.level === 'error') {
    consoleErrors.push((m.params.entry.text || '').slice(0, 300));
  }
};
function send(method, params = {}) { return new Promise(res => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJS(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r?.result?.result?.value; }
async function shot(name) { const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); if (s?.result?.data) writeFileSync(`${OUT}\\${name}.png`, Buffer.from(s.result.data, 'base64')); }
const wait = ms => new Promise(r => setTimeout(r, ms));

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5173/' });
await wait(3000);
await evalJS(`localStorage.setItem('saixt_token', ${JSON.stringify(token)}); localStorage.setItem('saixt_user', JSON.stringify({ nickname: 'UI巡检' })); true`);

const results = [];
async function visit(path, name, waitMs = 3500) {
  const errBefore = consoleErrors.length;
  await send('Page.navigate', { url: 'http://localhost:5173' + path });
  await wait(waitMs);
  await evalJS('window.scrollTo(0,0);true'); await wait(600);
  const info = await evalJS(`(function(){
    const body = document.body, d = document.documentElement;
    const broken = Array.from(document.querySelectorAll('img')).filter(i => !i.complete || i.naturalWidth === 0).length;
    return JSON.stringify({
      url: location.pathname,
      vw: window.innerWidth,
      hasHScroll: Math.max(d.scrollWidth, body.scrollWidth) > window.innerWidth + 1,
      cards: document.querySelectorAll('.card').length,
      imgs: document.querySelectorAll('img').length,
      brokenImgs: broken
    });
  })()`);
  const errs = consoleErrors.slice(errBefore);
  results.push({ name, path, info: JSON.parse(info), errs });
  console.log(name, '=>', info, errs.length ? '| ERRORS: ' + errs.join(' ;; ') : '| clean');
  await shot(name);
}

await visit('/ai', 'ai-chat');
await visit('/ai-practice', 'ai-practice');
await visit('/blind-box', 'blindbox');
await visit('/points', 'points');
await visit('/invite', 'invite');
await visit('/vip', 'vip');
await visit('/remind', 'remind');
await visit('/achievements', 'achievements');
await visit('/admin', 'admin');
await visit('/knowledge-graph', 'kg');
await visit('/dashboard', 'dashboard');

ws.close(); edge.kill();
console.log('\n===== 汇总 =====');
let fail = 0;
for (const r of results) {
  const h = r.info.hasHScroll ? 'HSCROLL!' : 'ok';
  const b = r.info.brokenImgs ? `brokenImgs=${r.info.brokenImgs}` : 'imgs-ok';
  const e = r.errs.length ? `errors=${r.errs.length}` : 'no-errors';
  const flag = (r.info.hasHScroll || r.info.brokenImgs || r.errs.length) ? 'FAIL' : 'PASS';
  if (flag === 'FAIL') fail++;
  console.log(`[${flag}] ${r.name} (${r.path}) ${h} ${b} ${e}`);
}
console.log(`\n${results.length - fail}/${results.length} PASS`);
process.exit(0);
