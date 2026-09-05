import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.CHECK_BASE || 'http://localhost:5174/';
const OUT = 'E:/saixt/screenshots/viewports';
const phone = '13800000099', pwd = 'Test@123456';

// CHECK_VIEWPORTS 覆盖：格式 "name:WxH,name:WxH"，如 "iphone:375x812,laptop:1366x768"
const viewports = process.env.CHECK_VIEWPORTS
  ? process.env.CHECK_VIEWPORTS.split(',').map(s => {
      const [name, dim] = s.split(':');
      const [w, h] = dim.split('x').map(Number);
      return [name.trim(), { width: w, height: h }];
    })
  : [
      ['desktop', { width: 1920, height: 1080 }],
      ['tablet-land', { width: 1024, height: 768 }],
      ['tablet-port', { width: 768, height: 1024 }],
    ];

const pages = [
  ['home', '/'],
  ['login', '/login'],
  ['dashboard', '/dashboard'],
  ['practice', '/practice'],
  ['ai-practice', '/ai-practice'],
  ['ai-chat', '/ai'],
  ['plan', '/plan'],
  ['wrong-book', '/wrong-book'],
  ['knowledge-graph', '/knowledge-graph'],
  ['data-screen', '/data-screen'],
  ['blind-box', '/blind-box'],
  ['schools', '/schools'],
  ['bank', '/bank'],
  ['ranking', '/ranking'],
  ['review', '/review'],
  ['vip', '/vip'],
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];

for (const [vname, vp] of viewports) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'zh-CN' });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push('[console] ' + m.text().slice(0, 160)); });
  page.on('pageerror', e => consoleErrors.push('[pageerror] ' + String(e).slice(0, 160)));

  await page.goto(BASE + 'login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  try {
    await page.getByPlaceholder('请输入11位手机号').fill(phone);
    await page.getByPlaceholder('至少6位').fill(pwd);
    await page.locator('form button[type="submit"]').click({ timeout: 15000 });
    await page.waitForFunction(() => !!localStorage.getItem('saixt_token'), null, { timeout: 12000 });
    console.log(`${vname} LOGIN_OK`);
  } catch (e) {
    console.log(`${vname} LOGIN_FAIL: ` + e.message.slice(0, 120));
  }

  for (const [name, path] of pages) {
    try {
      await page.goto(BASE + path.replace(/^\//, ''), { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1600);
      const audit = await page.evaluate(() => {
        const doc = document.scrollingElement || document.documentElement;
        const iw = window.innerWidth;
        const ih = window.innerHeight;
        const ow = doc.scrollWidth - iw;

        // 水平溢出 & 越界元素（跳过 overflow-x:auto 容器的子元素）
        const clipped = [];
        const scrollContainers = new Set();
        for (const el of document.querySelectorAll('[style*="overflow"], [class]')) {
          const s = getComputedStyle(el);
          if (s.overflowX === 'auto' || s.overflowX === 'scroll') {
            for (const child of el.querySelectorAll('*')) scrollContainers.add(child);
          }
        }
        for (const el of document.querySelectorAll('body *')) {
          if (scrollContainers.has(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.right > iw + 2 || r.left < -2)) {
            const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 12);
            if (t && !clipped.some(c => c.t === t)) clipped.push({ t, w: Math.round(r.width), l: Math.round(r.left), r: Math.round(r.right), cls: (el.className || '').toString().slice(0, 24) });
          }
          if (clipped.length > 8) break;
        }

        // 触控目标（平板端检查）
        const smallTargets = [];
        if (window.innerWidth <= 1024) {
          for (const b of document.querySelectorAll('button, .btn, a.btn, [role="button"]')) {
            const r = b.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && r.height < 40 && r.width < 200) {
              const t = (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 10);
              smallTargets.push({ t, h: Math.round(r.height), cls: (b.className || '').toString().slice(0, 26) });
            }
          }
        }

        // 对比度检查：文本 vs 背景色（alpha 合成到页面底色）
        const pageBg = document.documentElement.classList.contains('page-dark') ? [10, 16, 35] : [255, 255, 255];
        const lowContrast = [];
        const textEls = document.querySelectorAll('p, span, a, h1, h2, h3, h4, h5, h6, label, .btn, button, td, th, li, div');
        for (const el of textEls) {
          if (lowContrast.length >= 8) break;
          if (!el.children.length && el.textContent.trim().length >= 2) {
            const s = getComputedStyle(el);
            const color = s.color;
            const bg = s.backgroundColor;
            if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
            const ratio = contrastRatio(parseColor(color), compositeAlpha(parseColor(bg), pageBg));
            if (ratio < 3.0) {
              const txt = el.textContent.trim().slice(0, 10);
              lowContrast.push({ txt, ratio: ratio.toFixed(2), color: color.slice(0, 20), bg: bg.slice(0, 20), cls: (el.className || '').toString().slice(0, 24) });
            }
          }
        }

        // 桌面端：检查内容区域是否过于狭窄（未利用宽屏）
        let narrowContent = null;
        if (window.innerWidth >= 1440) {
          const main = document.querySelector('main, .main, .container, .content, #app > div > div');
          if (main) {
            const r = main.getBoundingClientRect();
            const utilization = r.width / iw;
            if (utilization < 0.5 && r.width < 800) {
              narrowContent = { w: Math.round(r.width), util: (utilization * 100).toFixed(0) + '%' };
            }
          }
        }

        // 大面积空白检查（桌面端）
        let blankArea = null;
        if (window.innerWidth >= 1440) {
          const body = document.body;
          const br = body.getBoundingClientRect();
          const content = doc.scrollWidth;
          if (content < iw * 0.6) {
            blankArea = { contentW: content, viewportW: iw, util: ((content / iw) * 100).toFixed(0) + '%' };
          }
        }

        return {
          ow, clipped: clipped.slice(0, 6),
          smallTargets: smallTargets.slice(0, 8),
          lowContrast,
          narrowContent,
          blankArea,
        };

        function parseColor(str) {
          const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (m) return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];
          return [0, 0, 0, 1];
        }
        function compositeAlpha([r, g, b, a], bg) {
          if (a >= 0.99) return [r, g, b];
          const [br, bgg, bb] = bg || [255, 255, 255];
          return [Math.round(r * a + br * (1 - a)), Math.round(g * a + bgg * (1 - a)), Math.round(b * a + bb * (1 - a))];
        }
        function luminance([r, g, b]) {
          const a = [r, g, b].map(v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
        }
        function contrastRatio(c1, c2) {
          const l1 = luminance(c1), l2 = luminance(c2);
          return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        }
      });
      await page.screenshot({ path: `${OUT}/${vname}_${name}.png`, fullPage: false });
      report.push({
        v: vname, p: name,
        ow: audit.ow,
        clipped: audit.clipped,
        smallTargets: audit.smallTargets,
        lowContrast: audit.lowContrast,
        narrowContent: audit.narrowContent,
        blankArea: audit.blankArea,
        errors: consoleErrors.slice()
      });
      const flags = [];
      if (audit.ow > 0) flags.push(`溢出${audit.ow}px`);
      if (audit.clipped?.length) flags.push(`越界x${audit.clipped.length}`);
      if (audit.smallTargets?.length) flags.push(`小触控x${audit.smallTargets.length}`);
      if (audit.lowContrast?.length) flags.push(`低对比x${audit.lowContrast.length}`);
      if (audit.narrowContent) flags.push(`窄内容(${audit.narrowContent.util})`);
      if (audit.blankArea) flags.push(`空白多(${audit.blankArea.util})`);
      if (consoleErrors.length) flags.push(`错误x${consoleErrors.length}`);
      console.log(`${vname}/${name}: ${flags.join(' ') || 'ok'}`);
      consoleErrors.length = 0;
    } catch (e) {
      report.push({ v: vname, p: name, ow: 0, clipped: [], errors: [e.message.slice(0, 120)] });
      console.log(`FAIL ${vname}/${name}: ${e.message.slice(0, 90)}`);
    }
  }
  await ctx.close();
}
await browser.close();

console.log('\n===== 汇总 =====');
let bad = 0;
for (const r of report) {
  const flags = [];
  if (r.ow > 0) flags.push(`溢出${r.ow}px`);
  if (r.clipped?.length) flags.push(`越界x${r.clipped.length}`);
  if (r.smallTargets?.length) flags.push(`小触控x${r.smallTargets.length}`);
  if (r.lowContrast?.length) flags.push(`低对比x${r.lowContrast.length}`);
  if (r.narrowContent) flags.push(`窄内容(${r.narrowContent.util})`);
  if (r.blankArea) flags.push(`空白多(${r.blankArea.util})`);
  if (r.errors?.length) flags.push(`错误x${r.errors.length}`);
  if (flags.length) {
    bad++;
    console.log(`[!] ${r.v}/${r.p}: ${flags.join(' ')}`);
    (r.clipped || []).forEach(c => console.log(`    越界 "${c.t}" w=${c.w} l=${c.l} r=${c.r} [${c.cls}]`));
    (r.smallTargets || []).forEach(t => console.log(`    钮 ${t.h}px "${t.t}" [${t.cls}]`));
    (r.lowContrast || []).forEach(c => console.log(`    对比 ${c.ratio}:1 "${c.txt}" color=${c.color} bg=${c.bg} [${c.cls}]`));
    (r.errors || []).forEach(e => console.log('    错误 ' + e));
  } else {
    console.log(`[ok] ${r.v}/${r.p}`);
  }
}
console.log(`\n异常: ${bad}/${report.length}`);
