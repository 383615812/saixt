// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PaperPractice from '../src/views/PaperPractice.vue'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toast: vi.fn(),
  push: vi.fn()
}))

vi.mock('../src/api', () => ({
  api: { get: mocks.apiGet, post: mocks.apiPost },
  getUser: vi.fn()
}))
vi.mock('../src/toast', () => ({ toast: mocks.toast }))
vi.mock('../src/useTypewriter', async () => {
  const { ref } = await import('vue')
  return { useTypewriter: () => ({ text: ref(''), typing: ref(false), type: vi.fn() }) }
})
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))

// 每题正确答案：101->A，102->B
const submitAnswer = { 101: 'A', 102: 'B' }

function twoQuestionPaper() {
  return {
    paper_title: '薄弱专项套卷',
    total: 2,
    sections: [
      { subject: '信息技术', chapter: '数据与信息', qtype: 'single', accuracy: 40, questions: [
        { id: 101, type: 'single', stem: '字符编码', options: ['A. ASCII', 'B. 二进制'], answer: 'A' }
      ]},
      { subject: '通用技术', chapter: '结构与设计', qtype: 'single', accuracy: 40, questions: [
        { id: 102, type: 'single', stem: '结构类型', options: ['A. 实体', 'B. 框架'], answer: 'B' }
      ]}
    ]
  }
}

function oneQuestionPaper() {
  return {
    paper_title: '薄弱专项套卷',
    total: 1,
    sections: [
      { subject: '信息技术', chapter: '数据与信息', qtype: 'single', accuracy: 40, questions: [
        { id: 201, type: 'single', stem: '字符编码', options: ['A. ASCII', 'B. 二进制'], answer: 'A' }
      ]}
    ]
  }
}

function mockPaperFlow(paper) {
  mocks.apiGet.mockResolvedValueOnce({ weak: [{ subject: '信息技术', chapter: '数据与信息', accuracy: 40, total: 2 }] })
  mocks.apiPost.mockImplementation((path, body) => {
    if (path === '/ai/paper') return Promise.resolve(paper)
    if (path === '/practice/submit') {
      return Promise.resolve({ correct: body.answer === submitAnswer[body.question_id], answer: body.answer })
    }
    return Promise.resolve({})
  })
}

function mountPage() {
  return mount(PaperPractice, { global: { stubs: { QuotaBar: true } } })
}

async function setUpAndGenerate(paper) {
  mockPaperFlow(paper)
  const wrapper = mountPage()
  await flushPromises()
  await wrapper.find('.gen-btn').trigger('click')
  // 生成完成后会延迟约 400ms 切到套卷概览
  await vi.waitFor(() => {
    if (!wrapper.find('.ov-actions').exists()) throw new Error('套卷概览未出现')
    return true
  })
  return wrapper
}

describe('薄弱专项套卷逐题作答交互', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.toast.mockClear()
  })

  it('最后一题触发「完成」，而非「下一题」（回归：原按钮误导航到空白屏）', async () => {
    const wrapper = await setUpAndGenerate(twoQuestionPaper())

    // 开始作答
    await wrapper.find('.ov-actions .btn-primary').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('第 1 / 2 题')

    // 第 1 题：选 A，提交，按钮应为「下一题」并前进
    await wrapper.findAll('.option')[0].trigger('click')
    await wrapper.find('.q-btn').trigger('click')
    await flushPromises()
    const btn1 = wrapper.find('.q-btn')
    expect(btn1.text()).toContain('下一题')
    expect(btn1.text()).not.toContain('完成')
    expect(mocks.apiPost).toHaveBeenCalledWith('/practice/submit', { question_id: 101, answer: 'A' })
    await btn1.trigger('click')
    await flushPromises()

    // 第 2 题（最后一题）：选 B，提交后按钮应为「完成」而不是「下一题」
    expect(wrapper.text()).toContain('第 2 / 2 题')
    await wrapper.findAll('.option')[1].trigger('click')
    await wrapper.find('.q-btn').trigger('click')
    await flushPromises()
    const btn2 = wrapper.find('.q-btn')
    expect(btn2.text()).toContain('完成')
    expect(btn2.text()).not.toContain('下一题')

    // 点击「完成」→ 触发 finish()：展示完成面板，并记录 AI 练习会话
    await btn2.trigger('click')
    await flushPromises()
    expect(wrapper.find('.finish-panel').exists()).toBe(true)
    expect(mocks.apiPost).toHaveBeenCalledWith('/practice/ai-session', { subject: '综合', total: 2, correct: 2 })

    wrapper.unmount()
  })

  it('单题套卷首题即最后一题，按钮直接为「完成」', async () => {
    const wrapper = await setUpAndGenerate(oneQuestionPaper())
    await wrapper.find('.ov-actions .btn-primary').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('第 1 / 1 题')
    await wrapper.findAll('.option')[0].trigger('click')
    await wrapper.find('.q-btn').trigger('click')
    await flushPromises()

    const btn = wrapper.find('.q-btn')
    expect(btn.text()).toContain('完成')
    expect(btn.text()).not.toContain('下一题')
    expect(mocks.apiPost).toHaveBeenCalledWith('/practice/submit', { question_id: 201, answer: 'A' })

    wrapper.unmount()
  })

  it('薄弱章节概览与自动勾选最薄弱章节', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      weak: [
        { subject: '信息技术', chapter: '数据与信息', accuracy: 35, total: 2 },
        { subject: '通用技术', chapter: '结构与设计', accuracy: 55, total: 2 }
      ]
    })
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('检测到 2 个薄弱章节')
    // 最薄弱章节默认勾选（weak-item 带 chosen 类）
    const items = wrapper.findAll('.weak-item')
    expect(items.length).toBe(2)
    expect(items[0].classes()).toContain('chosen')
    wrapper.unmount()
  })
})