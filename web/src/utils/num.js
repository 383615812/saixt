// 数字转中文小写（用于序数/倍数等 UI 文案，如 3→三、12→十二、30→三十）
const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const CN_UNITS = ['', '十', '百', '千']

function _cn(n) {
  if (n === 0) return '零'
  let s = ''
  let unit = 0
  while (n > 0) {
    const d = n % 10
    if (d === 0) {
      // 连续零只保留一个
      if (s && !s.startsWith('零')) s = '零' + s
    } else {
      s = CN_DIGITS[d] + CN_UNITS[unit] + s
    }
    n = Math.floor(n / 10)
    unit++
  }
  // 十位为 1 时省略"一十"写作"十"（如 15 → 十五）
  if (s.startsWith('一十')) s = s.slice(1)
  return s
}

export function numToCn(n) {
  const v = Math.floor(Number(n) || 0)
  if (v < 0) return '-' + _cn(-v)
  if (v >= 10000) return String(v) // 万以上保留数字，避免文案过长
  return _cn(v)
}

export function ordinalCn(n) {
  return '第' + numToCn(n)
}

export function toCn(str) {
  // 将字符串中的独立整数替换为中文写法（用于"3 月"→"三月"、"7 天"→"七天"、"14 天"→"十四天"）
  return String(str).replace(/(\d+)/g, (m) => numToCn(+m))
}