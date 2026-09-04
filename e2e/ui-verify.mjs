import { chromium } from 'playwright';

const BASE = 'http://localhost:5173/';
const phone = '13800000099', pwd = 'Test@123456';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();

await page.goto(BASE + 'login', { waitUntil: 'networkidle' });
await page.getByPlaceholder('请输入11位手机号').fill(phone);
await page.getByPlaceholder('至少6位').fill(pwd);
await page.locator('form button[type="submit"]').click();
await page.waitForFunction(() => !!localStorage.getItem('saixt_token'), null, { timeout: 12000 });

// 首页 ghost 按钮边框
await page.goto(BASE, { waitUntil: 'networkidle' });
const ghost = await page.locator('.btn-ghost').first().evaluate(el => {
  const s = getComputedStyle(el);
  return { borderColor: s.borderColor, borderWidth: s.borderWidth, height: el.offsetHeight };
});
console.log('HOME .btn-ghost:', JSON.stringify(ghost));

// 控制台 wm-item
await page.goto(BASE + 'dashboard', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const wm = await page.locator('.wm-item').first().evaluate(el => {
  const s = getComputedStyle(el);
  return { height: el.offsetHeight, minHeight: s.minHeight, borderColor: s.borderColor, padding: s.padding };
});
console.log('DASH .wm-item:', JSON.stringify(wm));

// Plan 按钮层级
await page.goto(BASE + 'plan', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const plan = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.plan-actions .btn')];
  return btns.map(b => ({ text: b.textContent.trim().replace(/\s+/g, ' ').slice(0, 12), cls: b.className }));
});
console.log('PLAN buttons:', JSON.stringify(plan, null, 1));

await browser.close();
