// 套卷/练习作答的纯逻辑函数，供组件与单元测试复用

// 薄弱/掌握度配色：≤40% 红、41–50% 琥珀、>50% 绿
export function accColor(accuracy) {
  if (accuracy <= 40) return 'var(--red, #e11d48)'
  if (accuracy <= 50) return 'var(--amber, #d97706)'
  return 'var(--green, #0da678)'
}

// 章节数量中文数字（限 1–4 章，向下取整、越界夹紧）
export function formatCount(n) {
  const i = Math.min(Math.max(Math.floor(Number(n)) || 1, 1), 4) - 1
  return '一二三四'[i] || n
}

// 作答按钮决策：到达最后一题应触达「完成」，否则「下一题」
export function shouldFinish(current, total) {
  return current >= total - 1
}