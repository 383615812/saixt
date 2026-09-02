/**
 * 智能出题（AiPractice /ai-practice）前端端到端冒烟脚本
 *
 * 用途：验证"选择科目 -> AI 生成 -> 题目渲染 -> 作答提交"全链路。
 * 修复要点（对比旧自动化）：科目/题型 chip 用"未选中(.on)才点击"的幂等选中，
 *   避免把已选中的 chip 再点一下而切换成空科目（导致后端 400「请选择科目」）。
 *
 * 运行（需先安装依赖）：
 *   cd E:\saixt\e2e
 *   npm i
 *   npx playwright install chromium          # 首次
 *   node ai-practice.e2e.mjs
 *
 * 可选环境变量：
 *   SAIXT_BASE     站点根（默认 http://62.234.79.165/saixt）
 *   SAIXT_PHONE    手机号（默认 13800000099）
 *   SAIXT_PASSWORD 密码（默认 Test@123456）
 *   仅当 --generate 时才真正点击"生成"，避免每次冒烟都消耗配额；默认改成校验表单可选。
 */
import { chromium } from 'playwright'

const BASE =
  (process.env.SAIXT_BASE || 'http://62.234.79.165/saixt').replace(/\/+$/, '') + '/'
const PHONE = process.env.SAIXT_PHONE || '13800000099'
const PASSWORD = process.env.SAIXT_PASSWORD || 'Test@123456'
const GENERATE = process.argv.includes('--generate')

const SUBJECT = '信息技术'

// 幂等选中：chip 已选中(.on)则不点，未选中才点并断言选中态，杜绝"再点一下切回空"
async function ensureChipOn(page, label) {
  const chip = page.locator('button.chip:not(.weak-chip)', { hasText: label }).first()
  await chip.waitFor({ state: 'visible', timeout: 20000 })
  const cls = (await chip.getAttribute('class')) || ''
  if (!cls.includes(' on')) {
    await chip.click()
    await page.waitForFunction(
      (t) => {
        const el = [...document.querySelectorAll('button.chip:not(.weak-chip)')].find((b) =>
          b.textContent.includes(t)
        )
        return el && el.className.includes(' on')
      },
      label,
      { timeout: 6000 }
    )
  }
  const cls2 = await chip.getAttribute('class')
  if (!cls2.includes(' on')) throw new Error(`「${label}」经幂等选中后仍未选中`)
}

const consoleErrors = []
const pageErrors = []

async function run() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('@vite/client') && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  try {
    // 显式登录：/login 是独立路由，受保护页未登录会强制跳到这里
    await page.goto(BASE + 'login', { waitUntil: 'networkidle', timeout: 60000 })
    const phoneInput = page.locator('input[placeholder="请输入11位手机号"]')
    await phoneInput.waitFor({ state: 'visible', timeout: 20000 })
    await page.fill('input[placeholder="请输入11位手机号"]', PHONE)
    await page.fill('input[placeholder="至少6位"]', PASSWORD)
    await page.click('button.submit')
    await page.waitForFunction(() => localStorage.getItem('saixt_token'), null, { timeout: 15000 })
    console.log('✓ 已登录（token 已写入 localStorage）')

    // 进入智能出题页
    await page.goto(BASE + 'ai-practice', { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForSelector('button.chip:not(.weak-chip)', { timeout: 20000 })
    console.log('✓ 进入 /ai-practice，科目选项已加载')

    // 根因修复：确保科目真正选中（先看是否已是 on，避免误点切换）
    await ensureChipOn(page, SUBJECT)
    console.log(`✓ 科目「${SUBJECT}」确认处于选中态（.chip.on）`)

    // 题型 = 单选题；题数 = 2
    await ensureChipOn(page, '单选题')
    await ensureChipOn(page, '2 题')
    console.log('✓ 题型=单选题、题数=2 已确认选中')

    if (!GENERATE) {
      console.log('ℹ 未传 --generate，跳过实际生成（避免消耗 AI 配额）。加 --generate 才会真正出题作答。')
      return { pass: true, skippedGenerate: true }
    }

    // 生成
    await page.click('button:has-text("开始生成")')
    await page.waitForSelector('.gen-bar', { timeout: 1500 }).catch(() => {})
    console.log('✓ 已点击“开始生成”，等待 AI 出题…')

    // 越权兜底：可能配额用尽 -> 期待题目卡或"已用完"提示
    const qCard = page.locator('.question-card .q-stem')
    try {
      await qCard.first().waitFor({ state: 'visible', timeout: 60000 })
    } catch (e) {
      const genNote = await page.locator('.gen-note').textContent().catch(() => '')
      const toast = await page.locator('.toast').textContent().catch(() => '')
      if (genNote.includes('共') || !/用完|用尽/.test(toast)) {
        throw new Error(`AI 题目未渲染。gen-note="${genNote}" toast="${toast}"`)
      }
      return { pass: true, quotaExhausted: true, toast }
    }

    // 断言题目卡片
    await page.locator('.gen-note:has-text("共")').first().waitFor({ timeout: 10000 })
    const note = (await page.locator('.gen-note').first().textContent()) || ''
    const stem = (await qCard.first().textContent()) || ''
    const optCount = await page.locator('.question-card .option').count()
    console.log(`✓ 生成完成：${note.trim()}；首题题干="${stem.slice(0, 60)}…"；选项数=${optCount}`)

    // 作答：选首选项 -> 提交 -> 校验结果区
    await page.locator('.question-card .option').first().click()
    await page.click('.q-actions button:has-text("提交答案")')
    const result = await page.locator('.question-card .result').first().waitFor({ timeout: 15000 })
    const resultText = (await result.textContent()) || ''
    if (!/正确答案：/.test(resultText)) throw new Error('作答后未见"正确答案"反馈')
    console.log(`✓ 作答提交成功，${/回答正确/.test(resultText) ? '回答正确' : '回答错误'}（${resultText.slice(0, 40)}…）`)

    return { pass: true, note, stem, optCount }
  } catch (err) {
    const fs = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const shotDir = dirname(process.argv[1])
    fs.mkdirSync(join(shotDir, '..', 'screenshots'), { recursive: true })
    await page.screenshot({ path: join(shotDir, '..', 'screenshots', 'ai-practice-fail.png'), fullPage: true }).catch(() => {})
    const body = await page.locator('body').innerText().catch(() => '')
    err.message += `\n[页面文本前600字] ${body.replace(/\s+/g, ' ').slice(0, 600)}`
    err.message += `\n[已保存截图 ${join(shotDir, '..', 'screenshots', 'ai-practice-fail.png')}]`
    throw err
  } finally {
    await browser.close()
  }
}

run()
  .then((r) => {
    console.log('\n== 结果 ==')
    console.log(JSON.stringify(r, null, 2))
    if (!r.pass) process.exit(1)
  })
  .catch((e) => {
    console.error('\n== 失败 ==')
    console.error(e && e.stack ? e.stack : String(e))
    console.error('consoleErrors=', consoleErrors)
    console.error('pageErrors=', pageErrors)
    process.exit(1)
  })