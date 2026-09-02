import { describe, it, expect } from 'vitest'
import { accColor, formatCount, shouldFinish } from '../src/utils/quiz'

describe('accColor 配色分界边界值', () => {
  it('40 是红/琥珀两档的分界', () => {
    expect(accColor(40)).toMatch(/--red/)
    expect(accColor(40.1)).toMatch(/--amber/)
  })
  it('50 是琥珀/绿两档的分界', () => {
    expect(accColor(50)).toMatch(/--amber/)
    expect(accColor(50.1)).toMatch(/--green/)
  })
  it('极小/极大值均被夹紧', () => {
    expect(accColor(-10)).toMatch(/--red/)
    expect(accColor(1e9)).toMatch(/--green/)
  })
})

describe('formatCount 数字边界值（向下取整 + 越界夹紧）', () => {
  it('0 与负数夹紧为「一」', () => {
    expect(formatCount(0)).toBe('一')
    expect(formatCount(-3)).toBe('一')
  })
  it('超过 4 夹紧为「四」', () => {
    expect(formatCount(5)).toBe('四')
    expect(formatCount(99)).toBe('四')
  })
  it('小数向下取整（原实现会对小数算出 undefined）', () => {
    expect(formatCount(1.9)).toBe('一')
    expect(formatCount(2.1)).toBe('二')
    expect(formatCount(4.5)).toBe('四')
  })
  it('空值/NaN 回退为「一」', () => {
    expect(formatCount()).toBe('一')
    expect(formatCount(null)).toBe('一')
  })
})

describe('shouldFinish 末题判定边界值', () => {
  it('末题为 current === total-1', () => {
    expect(shouldFinish(0, 1)).toBe(true)
    expect(shouldFinish(1, 2)).toBe(true)
    expect(shouldFinish(2, 3)).toBe(true)
  })
  it('最后一个「非末题」为 current === total-2', () => {
    expect(shouldFinish(0, 2)).toBe(false)
    expect(shouldFinish(1, 3)).toBe(false)
    expect(shouldFinish(8, 10)).toBe(false)
  })
  it('大套卷末题', () => {
    expect(shouldFinish(9, 10)).toBe(true)
  })
})