// 生产首屏性能体检：移动端视口实测加载指标 + 资源清单
import { chromium } from 'playwright'

const BASE = process.env.SAIXT_BASE || 'http://62.234.79.165/saixt/'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
})
const page = await ctx.newPage()

const resources = []
page.on('response', (res) => {
  const url = res.url()
  if (!url.startsWith(BASE.replace(/\/$/, ''))) return
  resources.push({ url: url.replace(BASE, ''), size: Number(res.headers()['content-length'] || 0), type: res.request().resourceType() })
})

const t0 = Date.now()
await page.goto(BASE + 'login', { waitUntil: 'load', timeout: 60000 })
const loadTime = Date.now() - t0

// 等待首屏渲染稳定
await page.waitForTimeout(1500)
const domReady = await page.evaluate(() => Math.round(performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart))

// 登录页首屏指标
const metrics = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0]
  const paint = performance.getEntriesByType('paint')
  return {
    ttfb: Math.round(nav.responseStart),
    domInteractive: Math.round(nav.domInteractive),
    domComplete: Math.round(nav.domComplete),
    fcp: Math.round(paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0),
    transferKB: Math.round(performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
  }
})

console.log('== 登录页首屏（390px 移动端，无缓存）==')
console.log(`TTFB: ${metrics.ttfb}ms | DOM Interactive: ${metrics.domInteractive}ms | DOM Complete: ${metrics.domComplete}ms`)
console.log(`FCP: ${metrics.fcp}ms | 总传输: ${metrics.transferKB}KB | wall-clock load: ${loadTime}ms`)

console.log('\n== 资源清单（按大小）==')
resources.sort((a, b) => b.size - a.size)
for (const r of resources.slice(0, 12)) {
  console.log(`  ${(r.size / 1024).toFixed(0).padStart(5)}KB  ${r.type.padEnd(7)} ${r.url.slice(0, 70)}`)
}
const totalKB = Math.round(resources.reduce((s, r) => s + r.size, 0) / 1024)
console.log(`\n首屏资源合计: ${totalKB}KB（${resources.length} 个请求）`)

await browser.close()
