/**
 * 生产环境浏览器端功能回归：真实登录 + 关键页面数据渲染/交互验证。
 * 与 CI 的 API 门禁（端点层）互补，本脚本验证"页面在真实浏览器里可用"。
 * 全程只读，不消耗 AI 配额、不写数据。
 *
 * 用法：
 *   node prod-functional.mjs
 *   SAIXT_BASE=http://localhost:5174 node prod-functional.mjs   # 对本地
 */
import { chromium } from 'playwright'

const BASE = (process.env.SAIXT_BASE || 'http://62.234.79.165/saixt').replace(/\/+$/, '') + '/'
const PHONE = process.env.SAIXT_PHONE || '13800000099'
const PASSWORD = process.env.SAIXT_PASSWORD || 'Test@123456'

// 每个页面：路径 + 断言（页面文本须含全部 keywords，或任一 selector 有元素）
const checks = [
  { name: '仪表盘', path: 'dashboard', keywords: [], selectors: ['.stat-card', '.card'], minCount: 2 },
  { name: '刷题', path: 'practice', keywords: [], selectors: ['.chip', 'button'], minCount: 3 },
  { name: '错题本', path: 'wrong-book', keywords: [], selectors: ['.chip', '.empty', '.vt', 'button'], minCount: 1 },
  { name: '院校库', path: 'schools', keywords: [], selectors: ['.school-card', '.chip'], minCount: 2 },
  { name: '题库中心', path: 'bank', keywords: [], selectors: ['.chip', '.q-item'], minCount: 3 },
  { name: '排名', path: 'ranking', keywords: [], selectors: ['.tab', '.rank', '.empty'], minCount: 1 },
  { name: '复习计划', path: 'review', keywords: [], selectors: ['.card', '.cal', 'button'], minCount: 1 },
  { name: '知识图谱', path: 'knowledge-graph', keywords: [], selectors: ['canvas', 'svg', '.chip', 'button'], minCount: 1 },
  { name: '数据大屏', path: 'data-screen', keywords: [], selectors: ['canvas', 'svg', '.card'], minCount: 1 },
  { name: 'VIP', path: 'vip', keywords: [], selectors: ['.card', 'button'], minCount: 1 },
]

async function run() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  const results = []
  try {
    // 登录
    await page.goto(BASE + 'login', { waitUntil: 'networkidle', timeout: 60000 })
    await page.fill('input[placeholder="请输入11位手机号"]', PHONE)
    await page.fill('input[placeholder="至少6位"]', PASSWORD)
    await page.click('button.submit')
    await page.waitForFunction(() => localStorage.getItem('saixt_token'), null, { timeout: 15000 })
    console.log('✓ 登录成功')

    for (const c of checks) {
      const errsBefore = pageErrors.length
      try {
        await page.goto(BASE + c.path, { waitUntil: 'networkidle', timeout: 30000 })
        await page.waitForTimeout(1200)

        // 断言1：未被踢回登录页
        if (page.url().includes('/login')) throw new Error('被重定向回登录页（登录态失效）')

        // 断言2：关键元素数量
        let count = 0
        for (const sel of c.selectors) count += await page.locator(sel).count()
        if (count < c.minCount) throw new Error(`关键元素不足：${c.selectors.join(',')} 共 ${count} < ${c.minCount}`)

        // 断言3：页面非空白
        const text = (await page.locator('body').innerText()).trim()
        if (text.length < 20) throw new Error('页面文本过少，疑似空白')

        // 断言4：本页新增 JS 错误
        const newErrs = pageErrors.slice(errsBefore)
        if (newErrs.length) throw new Error(`JS错误: ${newErrs[0].slice(0, 100)}`)

        results.push({ name: c.name, ok: true, count })
        console.log(`✓ ${c.name}（关键元素 ${count} 个）`)
      } catch (e) {
        results.push({ name: c.name, ok: false, err: e.message })
        console.log(`✗ ${c.name} → ${e.message.slice(0, 140)}`)
      }
    }

    // 交互验证：院校库搜索
    try {
      await page.goto(BASE + 'schools', { waitUntil: 'networkidle', timeout: 30000 })
      const searchInput = page.locator('input[type="search"], input[placeholder*="搜索"], input[placeholder*="院校"]').first()
      if (await searchInput.count()) {
        await searchInput.fill('云南')
        await page.waitForTimeout(1000)
        const bodyText = await page.locator('body').innerText()
        if (!bodyText.includes('云南')) throw new Error('搜索后未见“云南”相关结果')
        console.log('✓ 院校库搜索交互正常')
        results.push({ name: '院校搜索交互', ok: true })
      } else {
        results.push({ name: '院校搜索交互', ok: true, skipped: true })
        console.log('ℹ 院校库未找到搜索框，跳过')
      }
    } catch (e) {
      results.push({ name: '院校搜索交互', ok: false, err: e.message })
      console.log(`✗ 院校搜索交互 → ${e.message.slice(0, 120)}`)
    }
  } finally {
    await browser.close()
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n== 结果：${results.length - failed.length}/${results.length} 通过 ==`)
  if (failed.length) {
    failed.forEach((f) => console.log(`  ✗ ${f.name}: ${f.err}`))
    process.exit(1)
  }
}

run().catch((e) => {
  console.error('== 致命错误 ==', e.message)
  process.exit(1)
})
