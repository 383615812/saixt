import { describe, it, expect } from 'vitest'
import { accColor, formatCount, shouldFinish } from '../src/utils/quiz'

describe('accColor 掌握度配色', () => {
  it('≤40% 返回红色', () => {
    expect(accColor(0)).toMatch(/--red/)
    expect(accColor(40)).toMatch(/--red/)
  })
  it('41–50% 返回琥珀色', () => {
    expect(accColor(41)).toMatch(/--amber/)
    expect(accColor(50)).toMatch(/--amber/)
  })
  it('>50% 返回绿色（修复回归：原先 >50% 也会返回琥珀色）', () => {
    expect(accColor(51)).toMatch(/--green/)
    expect(accColor(60)).toMatch(/--green/)
    expect(accColor(100)).toMatch(/--green/)
  })
})

describe('formatCount 中文数字', () => {
  it('1–4 映射为中文数字', () => {
    expect(formatCount(1)).toBe('一')
    expect(formatCount(2)).toBe('二')
    expect(formatCount(3)).toBe('三')
    expect(formatCount(4)).toBe('四')
  })
  it('越界数字被夹紧到 1–4', () => {
    expect(formatCount(0)).toBe('一')
    expect(formatCount(9)).toBe('四')
  })
  it('空值回退为「一」', () => {
    expect(formatCount()).toBe('一')
  })
})

describe('shouldFinish 作答按钮决策（修复回归：最后一题误触发「下一题」导致空白屏）', () => {
  it('非最后一题时不应finish，应next', () => {
    expect(shouldFinish(0, 4)).toBe(false) // 0/2 三道题中的第1题
    expect(shouldFinish(1, 3)).toBe(false)
  })
  it('到达最后一题时必须finish', () => {
    expect(shouldFinish(2, 3)).toBe(true)
    expect(shouldFinish(3, 4)).toBe(true)
  })
  it('单题套卷的唯一题目即最后一题', () => {
    expect(shouldFinish(0, 1)).toBe(true)
  })
})