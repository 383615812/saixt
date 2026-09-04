import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:5174/';
const OUT = 'E:/saixt/screenshots/mobile-check';
const phone = '13800000099', pwd = 'Test@123456';

const pages = [
  ['home', '/'],
  ['login', '/login'],
  ['dashboard', '/dashboard'],
  ['practice', '/practice'],
  ['ai-practice', '/ai-practice'],
  ['ai-chat', '/ai-chat'],
  ['plan', '/plan'],
  ['wrong-book', '/wrong-book'],
  ['knowledge-graph', '/knowledge-graph'],
  ['data-screen', '/data-screen'],
  ['blind-box', '/blind-box'],
  ['schools', '/schools'],
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' });
const page = await ctx.newPage();
const issues = [];
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push('[console] ' + m.text().slice(0, 180)); });
page.on('pageerror', e => consoleErrors.push('[pageerror] ' + String(e).slice(0, 180)));

// 登录
await page.goto(BASE + 'login', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
try {
  await page.getByPlaceholder('请输入11位手机号').fill(phone);
  await page.getByPlaceholder('至少6位').fill(pwd);
  await page.locator('form button[type="submit"]').click({ timeout: 15000 });
  await page.waitForFunction(() => !!localStorage.getItem('saixt_token'), null, { timeout: 12000 });
  console.log('LOGIN_OK');
} catch (e) {
  console.log('LOGIN_FAIL: ' + e.message.slice(0, 150));
}

const results = [];
for (const [name, path] of pages) {
  const rec = { name, path, overflow: false, overflowW: 0, minFont: 999, smallFonts: [], smallTargets: [] };
  try {
    await page.goto(BASE + path.replace(/^\//, ''), { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1800);
    const audit = await page.evaluate(() => {
      const doc = document.scrollingElement || document.documentElement;
      const iw = window.innerWidth;
      const overflowW = doc.scrollWidth - iw;
      // 字体抽查：正文文本节点最小字号
      const smallFonts = [];
      const all = document.querySelectorAll('body *');
      for (const el of all) {
        if (!el.children.length && el.textContent.trim().length >= 2) {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < 12.5) {
            const txt = el.textContent.trim().slice(0, 12);
            if (!smallFonts.some(s => s.txt === txt && s.fs === fs)) smallFonts.push({ txt, fs, cls: (el.className || '').toString().slice(0, 30) });
            if (smallFonts.length > 6) break;
          }
        }
      }
      // 触控目标抽查：按钮类元素 <44px
      const smallTargets = [];
      const btns = document.querySelectorAll('button, .btn, a.btn, [role="button"]');
      for (const b of btns) {
        const r = b.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.height < 44 && r.width < 200) {
          const txt = (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 10);
          smallTargets.push({ txt, w: Math.round(r.width), h: Math.round(r.height), cls: (b.className || '').toString().slice(0, 30) });
        }
      }
      return { overflowW, smallFonts: smallFonts.slice(0, 5), smallTargets: smallTargets.slice(0, 8) };
    });
    rec.overflow = audit.overflowW > 0;
    rec.overflowW = audit.overflowW;
    rec.smallFonts = audit.smallFonts;
    rec.smallTargets = audit.smallTargets;
    await page.screenshot({ path: `${OUT}/${name}_390.png` });
    results.push(rec);
    console.log(`AUDIT ${name}: overflow=${audit.overflowW}px smallFont=${audit.smallFonts.length} smallTarget=${audit.smallTargets.length}`);
  } catch (e) {
    rec.error = e.message.slice(0, 120);
    results.push(rec);
    console.log(`FAIL ${name}: ${e.message.slice(0, 100)}`);
  }
}

await browser.close();

console.log('\n===== 汇总 =====');
let bad = 0;
for (const r of results) {
  const flags = [];
  if (r.error) flags.push('ERROR');
  if (r.overflow) flags.push(`溢出${r.overflowW}px`);
  if (r.smallFonts?.length) flags.push(`小字体x${r.smallFonts.length}`);
  if (r.smallTargets?.length) flags.push(`小触控x${r.smallTargets.length}`);
  if (flags.length) { bad++; console.log(`[!] ${r.name}: ${flags.join(' ')}`); }
  else console.log(`[ok] ${r.name}`);
  (r.smallFonts || []).forEach(s => console.log(`     字 ${s.fs}px "${s.txt}" [${s.cls}]`));
  (r.smallTargets || []).forEach(t => console.log(`     钮 ${t.h}px "${t.txt}" [${t.cls}]`));
}
console.log(`\n异常页面: ${bad}/${results.length}  控制台错误: ${consoleErrors.length}`);
consoleErrors.slice(0, 10).forEach(e => console.log('  ' + e));
