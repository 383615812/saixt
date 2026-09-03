// 触控按压反馈验证：在多个视口驱动 Edge，按住可点卡片，断言涟漪(::after)洗色 + 按压缩放生效，并截图
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9389;
const OUT = 'E:\\saixt\\screenshots\\ui-press';
mkdirSync(OUT, { recursive: true });

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--window-size=390,844', '--user-data-dir=E:\\saixt\\screenshots\\edge-ui-press', 'about:blank'
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
    consoleErrors.push((m.params?.exceptionDetails?.text || '') + ' ' + (m.params?.exceptionDetails?.exception?.description || ''));
  }
};
function send(method, params = {}) { return new Promise(res => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJS(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r?.result?.result?.value; }
async function shot(name) { const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); if (s?.result?.data) writeFileSync(`${OUT}\\${name}.png`, Buffer.from(s.result.data, 'base64')); }
const wait = ms => new Promise(r => setTimeout(r, ms));

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');

// 注册测试用户用于登录态页面（vip 套餐卡需登录态渲染）
const phone = '138' + String(Date.now()).slice(-8);
const reg = await fetch('http://localhost:3000/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone, password: 'test123456', nickname: '按压巡检' })
}).catch(() => null);
const regj = await (reg && reg.json());
const token = regj?.data?.token || '';
await send('Page.navigate', { url: 'http://localhost:5173/' });
await wait(1500);
await evalJS(`localStorage.setItem('saixt_token', ${JSON.stringify(token)}); localStorage.setItem('saixt_user', JSON.stringify({ nickname: '按压巡检' })); true`);

const results = [];
async function verifyPress(path, sel, name, width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 1000 });
  await send('Page.navigate', { url: 'http://localhost:5173' + path });
  await wait(3000);
  await evalJS('window.scrollTo(0,0);true');
  await wait(200);
  const before = consoleErrors.length;
  // 找到目标并滚动至可见，返回中心坐标
  await evalJS(`(function(){
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    window.__tappable = el;
    return true;
  })()`);
  await wait(700);
  const r = await evalJS(`(function(){
    const el = window.__tappable; if (!el) return null;
    const b = el.getBoundingClientRect();
    if (b.top < -20 || b.top > window.innerHeight - 20) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const b2 = el.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(b2.left + b2.width/2), y: Math.round(b2.top + b2.height/2) });
  })()`);
  if (!r) { results.push({ path, sel, width, ok: false, reason: 'target-not-found' }); console.log(`[SKIP] ${width} ${sel}: 目标未渲染`); return; }
  const { x, y } = JSON.parse(r);
  // 按住
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await wait(60);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await wait(180);
  const pressed = await evalJS(`(function(){
    const el = window.__tappable; if (!el) return null;
    const c = getComputedStyle(el);
    const after = getComputedStyle(el, '::after');
    return JSON.stringify({ transform: c.transform, wash: after.opacity, washBg: after.backgroundImage.slice(0,40) });
  })()`);
  // 按住状态截图（保持当前滚动与按压位置，勿在此改视口以免重排回滚）
  await shot(`${name}.${width}x${height}.pressed`);
  // 松开
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await wait(260);
  const released = await evalJS(`(function(){ const el=window.__tappable; if(!el) return null; return getComputedStyle(el).transform; })()`);
  const errs = consoleErrors.slice(before);
  const p = JSON.parse(pressed);
  // transform 非 none 即按压缩放生效；wash 透明度>0 即涟漪生效（released 会因点击导航/hover 残影而多样，仅作日志不作门禁）
  const isRest = t => !t || t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
  const scaleOk = p.transform && !isRest(p.transform);
  const washOk = Number(p.wash) > 0;
  const releaseOk = !released || isRest(released) || /matrix\(1, 0, 0, 1, -?\d+, 0\)/.test(released);
  const ok = scaleOk && washOk && !errs.length;
  results.push({ path, sel, width, ok, scale: p.transform, wash: p.wash, released, errs: errs.length });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${path} @${width} ${sel} :: scale=${p.transform} wash=${p.wash} released=${releaseOk} errors=${errs.length}`);
}

await verifyPress('/', '.bo-item', 'home-bo-item', 360, 780);
await verifyPress('/', '.bo-item', 'home-bo-item', 768, 900);
await verifyPress('/schools', '.school-card', 'schools-card', 360, 780);
await verifyPress('/vip', '.plan-card', 'vip-plan', 360, 780);
await verifyPress('/vip', '.plan-card', 'vip-plan', 1200, 820);

ws.close(); edge.kill();
const pass = results.filter(r => r.ok).length;
console.log(`\n===== ${pass}/${results.length} PASS =====`);
const fails = results.filter(r => !r.ok);
if (fails.length) { console.log('失败项：'); fails.forEach(f => console.log(f)); }
process.exit(fails.length ? 1 : 0);