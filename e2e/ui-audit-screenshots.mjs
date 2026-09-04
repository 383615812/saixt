import { chromium } from 'playwright';
import fs from 'fs';

const BASE = (process.env.SAIXT_BASE || 'http://localhost:5173').replace(/\/+$/, '') + '/';
const OUT = process.env.SHOT_DIR || 'E:/saixt/screenshots/ui-audit';
const PHONE = process.env.SAIXT_PHONE || '13800000099';
const PWD = process.env.SAIXT_PWD || 'Test@123456';

const pages = [
  ['home', '/'],
  ['login', '/login'],
  ['dashboard', '/dashboard'],
  ['practice', '/practice'],
  ['ai-practice', '/ai-practice'],
  ['plan', '/plan'],
  ['blind-box', '/blind-box'],
  ['volunteer', '/volunteer'],
  ['schools', '/schools'],
  ['wrong-book', '/wrong-book'],
  ['points', '/points'],
  ['data-screen', '/data-screen'],
];

const viewports = [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: viewports[0][1], locale: 'zh-CN' });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 200)); });
page.on('pageerror', e => errors.push('[pageerror] ' + String(e).slice(0, 200)));

// 登录
await page.goto(BASE + 'login', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
try {
  await page.getByPlaceholder('请输入11位手机号').fill(PHONE);
  await page.getByPlaceholder('至少6位').fill(PWD);
  await page.locator('form button[type="submit"]').click({ timeout: 15000 });
  await page.waitForFunction(() => !!localStorage.getItem('saixt_token'), null, { timeout: 12000 });
  console.log('LOGIN_OK');
} catch (e) {
  console.log('LOGIN_FAIL: ' + e.message.slice(0, 150));
}

for (const [name, path] of pages) {
  try {
    await page.goto(BASE + path.replace(/^\//, ''), { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${name}_desktop.png`, fullPage: false });
    console.log('SHOT ' + name + '_desktop');
  } catch (e) {
    console.log('SHOT_FAIL ' + name + ': ' + e.message.slice(0, 100));
  }
}
await ctx.close();

// 移动端
const ctx2 = await browser.newContext({ viewport: viewports[1][1], locale: 'zh-CN', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page2 = await ctx2.newPage();
page2.on('console', m => { if (m.type() === 'error') errors.push('[m-console] ' + m.text().slice(0, 200)); });
page2.on('pageerror', e => errors.push('[m-pageerror] ' + String(e).slice(0, 200)));
await page2.goto(BASE + 'login', { waitUntil: 'networkidle' });
await page2.waitForTimeout(2000);
try {
  await page2.getByPlaceholder('请输入11位手机号').fill(PHONE);
  await page2.getByPlaceholder('至少6位').fill(PWD);
  await page2.locator('form button[type="submit"]').click({ timeout: 15000 });
  await page2.waitForFunction(() => !!localStorage.getItem('saixt_token'), null, { timeout: 12000 });
  console.log('M_LOGIN_OK');
} catch (e) {
  console.log('M_LOGIN_FAIL: ' + e.message.slice(0, 150));
}
for (const [name, path] of pages) {
  try {
    await page2.goto(BASE + path.replace(/^\//, ''), { waitUntil: 'networkidle', timeout: 15000 });
    await page2.waitForTimeout(1200);
    await page2.screenshot({ path: `${OUT}/${name}_mobile.png` });
    console.log('SHOT ' + name + '_mobile');
  } catch (e) {
    console.log('SHOT_FAIL ' + name + ': ' + e.message.slice(0, 100));
  }
}
await ctx2.close();
await browser.close();

console.log('ERRORS: ' + errors.length);
errors.slice(0, 15).forEach(e => console.log('  ' + e));
