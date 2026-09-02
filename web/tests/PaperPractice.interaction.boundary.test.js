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

const submitAnswer = { 101: 'A', 102: 'B', 207: 'BC' }

function singlePaper() {
  return {
    paper_title: '薄弱专项套卷', total: 1,
    sections: [{
      subject: '信息技术', chapter: '数据与信息', qtype: 'single', accuracy: 40,
      questions: [{ id: 101, type: 'single', stem: '字符编码', options: ['A. ASCII', 'B. 二进制'], answer: 'A' }]
    }]
  }
}
function doublePaper() {
  return {
    paper_title: '薄弱专项套卷', total: 2,
    sections: [
      { subject: '信息技术', chapter: '数据与信息', qtype: 'single', accuracy: 40, questions: [
        { id: 101, type: 'single', stem: '字符编码', options: ['A. ASCII', 'B. 二进制'], answer: 'A' }] },
      { subject: '通用技术', chapter: '结构与设计', qtype: 'single', accuracy: 40, questions: [
        { id: 102, type: 'single', stem: '结构类型', options: ['A. 实体', 'B. 框架'], answer: 'B' }] }
    ]
  }
}
function multiPaper() {
  return {
    paper_title: '薄弱专项套卷', total: 1,
    sections: [{
      subject: '通用技术', chapter: '结构与设计', qtype: 'multi', accuracy: 40,
      questions: [{ id: 207, type: 'multi', stem: '以下正确的是', options: ['A. 甲', 'B. 乙', 'C. 丙'], answer: 'BC' }]
    }]
  }
}

async function startFlow(paper) {
  mocks.apiGet.mockResolvedValueOnce({ weak: [{ subject: '信息技术', chapter: '数据与信息', accuracy: 40, total: 2 }] })
  mocks.apiPost.mockImplementation((path, body) => {
    if (path === '/ai/paper') return Promise.resolve(paper)
    if (path === '/practice/submit') {
      return Promise.resolve({ correct: body.answer === submitAnswer[body.question_id], answer: body.answer })
    }
    return Promise.resolve({})
  })
  const wrapper = mount(PaperPractice, { global: { stubs: { QuotaBar: true } } })
  await flushPromises()
  await wrapper.find('.gen-btn').trigger('click')
  await vi.waitFor(() => {
    if (!wrapper.find('.ov-actions').exists()) throw new Error('套卷概览未出现')
    return true
  })
  await wrapper.find('.ov-actions .btn-primary').trigger('click') // 开始作答
  await flushPromises()
  return wrapper
}

describe('薄弱专项套卷交互边界值', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.toast.mockClear()
  })

  it('末题答错时按钮为「完成并查看成绩」，正确率与 AI 会话统计正确', async () => {
    const wrapper = await startFlow(doublePaper())

    // 第 1 题：答对（选 A）
    await wrapper.findAll('.option')[0].trigger('click')
    await wrapper.find('.q-btn').trigger('click')
    await flushPromises()
    await wrapper.find('.q-btn').trigger('click') // 下一题
    await flushPromises()

    // 第 2 题（末题）：答错（正确为 B，故意选 A）
    await wrapper.findAll('.option')[0].trigger('click')
    await wrapper.find('.q-btn').trigger('click')
    await flushPromises()

    const btn = wrapper.find('.q-btn')
    expect(btn.text()).toContain('完成并查看成绩')
    expect(btn.text()).not.toContain('🎉') // 非全对，不应出现全对文案

    await btn.trigger('click')
    await flushPromises()
    expect(mocks.apiPost).toHaveBeenCalledWith('/practice/ai-session', { subject: '综合', total: 2, correct: 1 })
    expect(wrapper.find('.finish-panel').text()).toContain('50%')
    wrapper.unmount()
  })

  it('未选任何选项时提交按钮禁用，选中后启用', async () => {
    const wrapper = await startFlow(singlePaper())
    expect(wrapper.find('.q-btn').attributes('disabled')).toBeDefined()
    await wrapper.findAll('.option')[0].trigger('click')
    expect(wrapper.find('.q-btn').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('多选题「漏选」边界：须全选才算对，返回答错且记录选中串', async () => {
    const wrapper = await startFlow(multiPaper())
    expect(wrapper.text()).toContain('多选题')
    expect(wrapper.text()).toContain('全部选对才算对')

    // 只选 B（漏选 C），正确为 BC → 答错
    await wrapper.findAll('.option')[1].trigger('click')
    await wrapper.find('.q-btn').trigger('click')
    await flushPromises()

    expect(mocks.apiPost).toHaveBeenCalledWith('/practice/submit', { question_id: 207, answer: 'B' })
    const btn = wrapper.find('.q-btn')
    expect(btn.text()).toContain('完成并查看成绩')
    expect(btn.text()).not.toContain('🎉')
    wrapper.unmount()
  })
})