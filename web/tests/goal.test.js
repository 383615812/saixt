import { describe, it, expect } from 'vitest'
import { goalProgress } from '../src/utils/goal'

describe('goalProgress 目标达成进度与配色层级', () => {
  it('数据缺失时返回 0 与 low', () => {
    expect(goalProgress(0, 600)).toEqual({ pct: 0, tier: 'low' })
    expect(goalProgress(120, 0)).toEqual({ pct: 0, tier: 'low' })
    expect(goalProgress(undefined, undefined)).toEqual({ pct: 0, tier: 'low' })
  })
  it('<60% 归 low（琥珀色）', () => {
    expect(goalProgress(100, 600)).toEqual({ pct: 17, tier: 'low' })
    expect(goalProgress(120, 600).tier).toBe('low')
  })
  it('60–99% 归 on（绿色）', () => {
    expect(goalProgress(360, 600)).toEqual({ pct: 60, tier: 'on' })
    expect(goalProgress(400, 600).tier).toBe('on')
  })
  it('≥100% 归 done（达成，绿色渐变）且 pct 封顶 100', () => {
    expect(goalProgress(600, 600)).toEqual({ pct: 100, tier: 'done' })
    expect(goalProgress(700, 600)).toEqual({ pct: 100, tier: 'done' })
  })
  it('百分比参与四舍五入', () => {
    expect(goalProgress(1, 3)).toEqual({ pct: 33, tier: 'low' })
  })
})