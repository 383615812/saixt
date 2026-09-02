import { describe, it, expect } from 'vitest'
import { goalProgress } from '../src/utils/goal'

describe('goalProgress 百分比四舍五入边界', () => {
  it('59.5 四舍五入到 60 → on', () => {
    expect(goalProgress(119, 200)).toEqual({ pct: 60, tier: 'on' })
  })
  it('58.5 四舍五入到 59 → low', () => {
    expect(goalProgress(117, 200)).toEqual({ pct: 59, tier: 'low' })
  })
  it('99.5 四舍五入到 100 → done（达成）', () => {
    expect(goalProgress(199, 200)).toEqual({ pct: 100, tier: 'done' })
  })
})

describe('goalProgress 越界夹紧边界', () => {
  it('负当前分被夹紧为 0 而非负百分比', () => {
    expect(goalProgress(-5, 600)).toEqual({ pct: 0, tier: 'low' })
  })
  it('远超目标封顶为 100', () => {
    expect(goalProgress(99999, 600)).toEqual({ pct: 100, tier: 'done' })
  })
  it('恰好达到目标 100 → done', () => {
    expect(goalProgress(600, 600)).toEqual({ pct: 100, tier: 'done' })
  })
  it('字符串数字参数被正确转换', () => {
    expect(goalProgress('120', '600')).toEqual({ pct: 20, tier: 'low' })
  })
  it('缺参/零值回退为 0 与 low', () => {
    expect(goalProgress('', 600)).toEqual({ pct: 0, tier: 'low' })
    expect(goalProgress(NaN, 600)).toEqual({ pct: 0, tier: 'low' })
  })
})