<template>
  <div class="radar-wrap">
    <svg :viewBox="`0 0 ${size} ${size}`" class="radar-svg" role="img" :aria-label="title">
      <!-- 网格多边形 -->
      <g v-for="level in [25, 50, 75, 100]" :key="level">
        <polygon
          :points="polygonPoints(level)"
          :fill="level === 100 ? 'none' : 'rgba(100, 116, 139, 0.04)'"
          :stroke="level === 100 ? 'var(--rule)' : 'rgba(100, 116, 139, 0.14)'"
          stroke-width="1"
        />
      </g>
      <!-- 轴线 -->
      <line
        v-for="(d, i) in data"
        :key="'axis' + i"
        :x1="cx" :y1="cy"
        :x2="point(d.value, i).x" :y2="point(d.value, i).y"
        stroke="rgba(100, 116, 139, 0.14)"
        stroke-width="1"
      />
      <!-- 数据多边形：保留极淡的靛蓝填充以呼应主题，让分科色点的色彩成为视觉焦点 -->
      <polygon
        :points="dataPoints"
        fill="rgba(79, 95, 240, 0.12)"
        stroke="var(--accent)"
        stroke-width="2"
        stroke-linejoin="round"
        class="radar-poly"
      />
      <!-- 数据点（含放大点击热区） -->
      <circle
        v-for="(d, i) in data"
        :key="'hit' + i"
        :cx="point(d.value, i).x"
        :cy="point(d.value, i).y"
        r="22"
        fill="transparent"
        class="radar-hit"
        @click="onSelect(d)"
      />
      <circle
        v-for="(d, i) in data"
        :key="'dot' + i"
        :cx="point(d.value, i).x"
        :cy="point(d.value, i).y"
        r="4"
        :fill="d.color || 'var(--accent)'"
        stroke="#fff"
        stroke-width="1.5"
        class="radar-dot"
        @click="onSelect(d)"
      />
      <!-- 标签：按各自角宽楔形自动截断，并横向夹紧避免越界或相邻重叠 -->
      <text
        v-for="(d, i) in data"
        :key="'label' + i"
        :x="labels[i].x"
        :y="labels[i].y"
        text-anchor="middle"
        class="radar-label"
        @click="onSelect(d)"
      >{{ labels[i].text }}</text>
    </svg>
    <div v-if="data.length" class="radar-legend">
      <span v-for="(d, i) in data" :key="'lg' + i" class="radar-legend-item">
        <span class="legend-dot" :style="{ background: d.color || 'var(--accent)' }"></span>
        <span class="legend-label">{{ d.label }}</span>
        <strong>{{ d.value }}%</strong>
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] }, // [{ label, value, color }]
  size: { type: Number, default: 360 },
  title: { type: String, default: '' }
})

const emit = defineEmits(['select'])

function onSelect(d) {
  emit('select', d)
}

const cx = computed(() => props.size / 2)
const cy = computed(() => props.size / 2)
const radius = computed(() => props.size / 2 - 52)

function angle(i) {
  const n = props.data.length || 1
  return -Math.PI / 2 + (i * 2 * Math.PI) / n
}

function point(value, i) {
  const r = (radius.value * Math.min(100, Math.max(0, value))) / 100
  return { x: cx.value + r * Math.cos(angle(i)), y: cy.value + r * Math.sin(angle(i)) }
}

function polygonPoints(level) {
  return props.data.map((_, i) => {
    const p = point(level, i)
    return `${p.x},${p.y}`
  }).join(' ')
}

const dataPoints = computed(() =>
  props.data.map((d, i) => {
    const p = point(d.value, i)
    return `${p.x},${p.y}`
  }).join(' ')
)

// 标签渲染：每个轴按等分角宽分配一个"楔形"，标签宽度被限制在楔形内，
// 从而在结构上保证相邻标签互不重叠；同时横向夹紧到视图内避免越界。
const FONT_PX = 11 // 估算标签字号（CJK 字符≈一个字高，拉丁字符略窄）
function textWidth(s) {
  let w = 0
  for (const ch of s) w += ch.charCodeAt(0) > 255 ? FONT_PX : FONT_PX * 0.56
  return w
}

const labels = computed(() => {
  const n = props.data.length
  if (!n) return []
  // 两个相邻中心点之间的角宽对应一条"安全间隔"，取 0.85 留出呼吸空间
  const r = radius.value + 20
  const safeHalfAng = (Math.PI / n) * 0.85
  const maxHalf = r * safeHalfAng
  const minX = 2
  const maxX = props.size - 2

  return props.data.map((d, i) => {
    const a = angle(i)
    // 截断文字，使半宽不超过分配的楔形半角
    let text = d.label
    while (text.length && textWidth(text) / 2 > maxHalf) {
      text = text.slice(0, -1)
    }
    if (text !== d.label) text = text.slice(0, Math.max(3, text.length - 1)) + '…'
    const w = textWidth(text)
    const padX = Math.min(4, (props.size - minX - maxX) / 2)
    let x = cx.value + r * Math.cos(a)
    x = Math.max(minX + w / 2 + padX, Math.min(maxX - w / 2 - padX, x))
    const y = cy.value + r * Math.sin(a) + 4
    return { text, x, y }
  })
})
</script>

<style scoped>
.radar-wrap { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.radar-svg { width: 100%; max-width: 440px; height: auto; }
.radar-poly { filter: drop-shadow(0 2px 6px rgba(79, 95, 240, 0.18)); }
.radar-label { font-size: 12px; fill: var(--muted); font-weight: 600; paint-order: stroke; stroke: #fff; stroke-width: 3px; stroke-linejoin: round; cursor: pointer; pointer-events: all; transition: fill 0.2s var(--ease); }
.radar-label:hover { fill: var(--accent); }
.radar-dot { cursor: pointer; transition: fill 0.15s var(--ease), r 0.15s var(--ease); }
.radar-dot:hover { fill: var(--accent-2); }
.radar-hit { cursor: pointer; pointer-events: all; }
.radar-legend { display: flex; flex-wrap: wrap; gap: 8px 16px; justify-content: center; }
.radar-legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.82rem; color: var(--muted); padding: 4px 10px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--rule-soft); }
.legend-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.legend-label { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.radar-legend-item strong { color: var(--ink); font-variant-numeric: tabular-nums; }
@media (max-width: 480px) {
  .radar-label { font-size: 0.7rem; }
}
</style>
