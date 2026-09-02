// 目标达成进度的纯逻辑函数，供组件与单元测试复用

// 根据当前分与目标分计算达成百分比与配色层级：
// >=100 达成(done, 绿渐变) / >=60 过半(on, 绿) / <60 较低(low, 琥珀)
export function goalProgress(current, target) {
  const cur = Number(current)
  const t = Number(target)
  if (!cur || !t) return { pct: 0, tier: 'low' }
  const pct = Math.max(0, Math.min(100, Math.round((cur / t) * 100)))
  const tier = pct >= 100 ? 'done' : pct >= 60 ? 'on' : 'low'
  return { pct, tier }
}