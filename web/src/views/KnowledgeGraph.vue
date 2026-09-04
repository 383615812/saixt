<template>
  <div class="graph-page">
    <div class="graph-header">
      <div class="gh-left">
        <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2a2.5 2.5 0 0 0-2.3 3.5A2.5 2.5 0 0 0 4 8v1.5a2.5 2.5 0 0 0 2.5 2.5H8v5.5a2.5 2.5 0 1 0 5 0V8h2.5a2.5 2.5 0 0 0 2.5-2.5V5a2.5 2.5 0 0 0-2.5-2.5H9.5z"/><path d="M14.5 2a2.5 2.5 0 0 1 2.3 3.5A2.5 2.5 0 0 1 19.5 8v1.5a2.5 2.5 0 0 1-2.5 2.5H15"/><path d="M2 22h20"/></svg>知识点关联图谱</h2>
        <p>探索各科目章节之间的知识关联，构建完整知识体系</p>
      </div>
      <div class="gh-right">
        <div class="subject-selector">
          <span class="ss-label">科目：</span>
          <select v-model="currentSubject" @change="loadGraph" class="ss-select">
            <option value="">全部科目</option>
            <option v-for="s in subjectList" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <button v-if="masteryLoaded" class="gw-toggle" :class="{ on: weakOnly }" @click="weakOnly = !weakOnly" :title="weakOnly ? '回到全部章节' : '只显示正确率不足 60% 的薄弱章节'">
          <span class="gw-dot"></span>
          {{ weakOnly ? '显示全部' : '只看薄弱' }}{{ weakCount ? ` · ${weakCount}` : '' }}
        </button>
      </div>
    </div>

    <div class="graph-container">
      <div v-if="loading" class="graph-loading">
        <div class="gl-loader"></div>
        <p>图谱加载中...</p>
      </div>
      <div v-else-if="loadFailed" class="graph-empty">
        <div class="ge-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg></div>
        <p>图谱加载失败，请检查网络后重试</p>
        <button class="ge-retry" @click="loadGraph">点击重试</button>
      </div>
      <div v-else-if="!nodes.length" class="graph-empty">
        <div class="ge-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="3"/><circle cx="19" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="M7.5 7.5 10.5 15.5"/><path d="M16.5 7.5 13.5 15.5"/><path d="M7.5 8v8"/><path d="M16.5 8v8"/></svg></div>
        <p>暂无知识点数据</p>
      </div>
      <div v-else ref="chartEl" class="chart-canvas"></div>

      <!-- 图谱控制栏 -->
      <div class="graph-controls">
        <button class="gc-btn" title="放大" @click="zoomChart(1.2)">＋</button>
        <button class="gc-btn" title="缩小" @click="zoomChart(0.8)">－</button>
        <button class="gc-btn" title="重置视图" @click="resetView">⟲</button>
        <button class="gc-btn" title="重新加载" @click="loadGraph">↻</button>
      </div>

      <!-- 节点统计 -->
      <div class="graph-stats">
        <span>{{ visibleNodes.length }} 个知识点</span>
        <span class="gs-dot"></span>
        <span>{{ visibleLinks.length }} 条关联</span>
      </div>
    </div>

    <!-- 节点详情面板 -->
    <transition name="slide">
      <div v-if="selectedNode" class="detail-panel">
        <div class="dp-header">
          <h3>{{ selectedNode.name }}</h3>
          <button class="dp-close" @click="selectedNode = null">✕</button>
        </div>
        <div class="dp-body">
          <div class="dp-row">
            <span class="dp-label">所属科目</span>
            <span class="dp-value">{{ selectedNode.subject }}</span>
          </div>
          <div class="dp-row">
            <span class="dp-label">题目数量</span>
            <span class="dp-value highlight">{{ selectedNode.count }} 题</span>
          </div>
          <div v-if="selectedMastery" class="dp-row">
            <span class="dp-label">掌握度</span>
            <span class="dp-value" :class="selectedMastery.weak ? 'm-green' : selectedMastery.total >= 2 ? 'm-green' : ''">
              <span :class="masteryBadge(selectedMastery)">{{ selectedMastery.accuracy }}%</span>
              <span class="dp-sub">（{{ selectedMastery.correct }}/{{ selectedMastery.total }} 题）{{ selectedMastery.weak ? '薄弱' : selectedMastery.total >= 2 ? '已掌握' : '' }}</span>
            </span>
          </div>
          <div class="dp-row">
            <span class="dp-label">关联章节</span>
            <span class="dp-value">{{ relatedNodes.length }} 个</span>
          </div>
          <div class="dp-section">
            <div class="dp-sec-title">关联章节</div>
            <div class="dp-related">
              <div 
                v-for="r in relatedNodes.slice(0, 8)" 
                :key="r.id" 
                class="dp-related-item"
                @click="focusNode(r.id)"
              >
                <span class="dr-name">{{ r.name }}</span>
                <span class="dr-strength">
                  <span class="dr-bar"><span :style="{ width: Math.min(100, r.value / maxLinkValue * 100) + '%' }"></span></span>
                  <span class="dr-num">{{ r.value }}</span>
                </span>
              </div>
            </div>
          </div>
          <div class="dp-actions">
            <button v-if="selectedMastery && selectedMastery.weak" class="btn btn-ghost dp-btn" @click="goAiPractice">AI 专项补强 →</button>
            <button class="btn btn-primary dp-btn" @click="goPractice">去刷题 →</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 图例 -->
    <div class="legend-panel">
      <div class="lp-title">图谱说明</div>
      <div class="lp-item">
        <span class="lp-dot node"></span>
        <span>节点 = 章节，大小 = 题量</span>
      </div>
      <div class="lp-item">
        <span class="lp-line line-similarity"></span>
        <span>实线 = 知识相似</span>
      </div>
      <div class="lp-item">
        <span class="lp-line line-teaching"></span>
        <span>虚线 = 教学承接（专题 N → N+1）</span>
      </div>
      <div class="lp-item">
        <span class="lp-line line-bridge"></span>
        <span>点线 = 连通桥接</span>
      </div>
      <template v-if="masteryLoaded">
        <div class="lp-divider"></div>
        <div class="lp-item">
          <span class="lp-ring ring-weak"></span>
          <span>红圈 = 薄弱章节（<60%）</span>
        </div>
        <div class="lp-item">
          <span class="lp-ring ring-ok"></span>
          <span>绿圈 = 已掌握（≥60%）</span>
        </div>
      </template>
      <div class="lp-item">
        <span class="lp-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>拖拽节点可调整位置，滚轮缩放</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { api, getUser } from '../api.js'
import { useRouter } from 'vue-router'

const router = useRouter()

const loading = ref(false)
const loadFailed = ref(false)
const nodes = ref([])
const links = ref([])
const currentSubject = ref('')
const subjectList = ref([])
const selectedNode = ref(null)
const chartEl = ref(null)
let chartInstance = null

// 掌握度联动：选中章节的正确率/题数，weakOnly 只看薄弱章节
const masteryMap = ref({})
const masteryLoaded = ref(false)
const weakOnly = ref(false)

const weakCount = computed(() => Object.values(masteryMap.value).filter(m => m && m.weak).length)

const selectedMastery = computed(() => {
  if (!selectedNode.value) return null
  return masteryMap.value[`${selectedNode.value.subject}||${selectedNode.value.chapter}`] || null
})

// 只看薄弱时，节点收缩为薄弱章节、连线仅在两者都可见时保留
const visibleNodes = computed(() => {
  if (!weakOnly.value || !masteryLoaded.value) return nodes.value
  return nodes.value.filter(n => {
    const m = masteryMap.value[`${n.subject}||${n.chapter}`]
    return m && m.weak
  })
})
const visibleLinks = computed(() => {
  if (!weakOnly.value) return links.value
  const ids = new Set(visibleNodes.value.map(n => n.id))
  return links.value.filter(l => ids.has(l.source) && ids.has(l.target))
})

function nodeMastery(n) {
  if (!masteryLoaded.value) return null
  return masteryMap.value[`${n.subject}||${n.chapter}`] || null
}

function masteryBadge(m) {
  return m && m.weak ? 'badge-weak' : 'badge-ok'
}

async function loadMastery() {
  if (!getUser()) { masteryLoaded.value = false; masteryMap.value = {}; return }
  try {
    const data = await api.get('/stats/mastery')
    const map = {}
    for (const it of data.list || []) {
      const weak = it.total >= 2 && it.accuracy < 60
      map[`${it.subject}||${it.chapter}`] = {
        accuracy: it.accuracy, total: it.total, correct: it.correct, weak
      }
    }
    masteryMap.value = map
    masteryLoaded.value = true
  } catch (e) {
    // 掌握度接口失败静默降级，不打断图谱浏览
    masteryLoaded.value = false
    masteryMap.value = {}
  }
  if (loading.value || !nodes.value.length) return
  await nextTick()
  renderChart()
}

const maxLinkValue = computed(() => {
  if (!links.value.length) return 10
  return Math.max(...links.value.map(l => l.value))
})

const relatedNodes = computed(() => {
  if (!selectedNode.value) return []
  const id = selectedNode.value.id
  const related = []
  links.value.forEach(l => {
    if (l.source === id) {
      const target = nodes.value.find(n => n.id === l.target)
      if (target) related.push({ ...target, value: l.value })
    } else if (l.target === id) {
      const source = nodes.value.find(n => n.id === l.source)
      if (source) related.push({ ...source, value: l.value })
    }
  })
  return related.sort((a, b) => b.value - a.value)
})

async function loadSubjects() {
  try {
    const meta = await api.get('/questions/meta')
    subjectList.value = (meta.subjects || []).map(s => s.subject)
  } catch (e) {
    console.error('加载科目列表失败:', e)
  }
}

async function loadGraph() {
  loading.value = true
  loadFailed.value = false
  try {
    const path = currentSubject.value 
      ? `/questions/knowledge-graph?subject=${encodeURIComponent(currentSubject.value)}`
      : '/questions/knowledge-graph'
    const data = await api.get(path)
    nodes.value = data.nodes || []
    links.value = data.links || []
    selectedNode.value = null
  } catch (e) {
    console.error('加载图谱失败:', e)
    loadFailed.value = true
  } finally {
    loading.value = false
  }
  await nextTick()
  renderChart()
}

function renderChart() {
  if (!chartEl.value || !window.echarts) return
  if (chartInstance) chartInstance.dispose()

  chartInstance = window.echarts.init(chartEl.value)

  const isMobile = window.innerWidth <= 768

  // 计算节点大小范围
  const base = visibleNodes.value
  const counts = base.map(n => n.count || 1)
  const maxCount = Math.max(...counts, 1)
  const minCount = Math.min(...counts, 1)

  // 科目配色
  const subjectColors = {}
  const palette = ['#4f5ff0', '#7c3aed', '#0da678', '#d97706', '#0891b2', '#e11d48', '#65a30d', '#ea580c', '#64748b', '#0d9488', '#a16207']
  const subjects = [...new Set(base.map(n => n.subject))]
  subjects.forEach((s, i) => {
    subjectColors[s] = palette[i % palette.length]
  })

  const graphNodes = base.map(n => {
    const sizeRatio = minCount === maxCount ? 0.5 : ((n.count || 1) - minCount) / (maxCount - minCount)
    const baseSize = isMobile ? 22 : 30
    const sizeRange = isMobile ? 28 : 40
    const size = baseSize + sizeRatio * sizeRange
    const labelShow = isMobile ? size > 28 : size > 34
    const labelFontSize = isMobile ? 13 : 13
    const labelWidth = isMobile ? 78 : 88
    const m = nodeMastery(n)
    // 掌握度描边：薄弱=红、已掌握(≥60%且≥2题)=绿，否则恢复默认浅边
    const ringColor = m ? (m.weak ? '#f43f5e' : m.total >= 2 ? '#22c55e' : 'rgba(255,255,255,0.3)') : 'rgba(255,255,255,0.3)'
    const ringWidth = m && (m.weak || m.total >= 2) ? (isMobile ? 3 : 4) : (isMobile ? 1.5 : 2)
    return {
      id: n.id,
      name: n.chapter || n.name,
      value: n.count,
      symbolSize: size,
      category: n.subject,
      itemStyle: {
        color: subjectColors[n.subject] || '#4f5ff0',
        borderColor: ringColor,
        borderWidth: ringWidth,
        shadowBlur: isMobile ? 6 : 10,
        shadowColor: m && m.weak ? '#f43f5e' : (subjectColors[n.subject] || '#4f5ff0')
      },
      label: {
        show: labelShow,
        fontSize: labelFontSize,
        color: '#e2e8f0',
        width: labelWidth,
        overflow: 'break',
        lineHeight: 13,
        distance: isMobile ? 6 : 10,
        backgroundColor: 'rgba(5, 10, 24, 0.72)',
        borderRadius: 4,
        padding: isMobile ? [1, 3] : [2, 4],
        formatter: (p) => p.name || ''
      },
      _fullData: n
    }
  })

  // 三类关系边样式：文本相似(实线靛蓝) / 教学承接(虚线橙) / 连通桥接(点线灰)
  const edgeStyle = {
    similarity: { type: 'solid', color: 'rgba(79, 95, 240, 0.5)', label: '知识相似' },
    teaching: { type: 'dashed', color: '#d97706', label: '教学承接' },
    bridge: { type: 'dotted', color: 'rgba(148, 163, 184, 0.6)', label: '连通桥接' }
  }
  const graphLinks = visibleLinks.value.map(l => {
    const st = edgeStyle[l.kind] || edgeStyle.similarity
    const base = Math.max(1, l.value / 3)
    return {
      source: l.source,
      target: l.target,
      value: l.value,
      kind: l.kind || 'similarity',
      lineStyle: {
        width: st.type === 'teaching' ? Math.max(base, 2.4) : base,
        color: st.color,
        type: st.type,
        curveness: 0.15
      }
    }
  })

  const categories = subjects.map(s => ({
    name: s,
    itemStyle: { color: subjectColors[s] }
  }))

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: 'rgba(10, 15, 30, 0.9)',
      borderColor: 'rgba(79, 95, 240, 0.3)',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        if (params.dataType === 'node') {
          const d = params.data._fullData
          let tip = `<strong>${d.chapter}</strong><br/>科目：${d.subject}<br/>题量：${d.count} 题`
          const m = nodeMastery(d)
          if (m) tip += `<br/>掌握度：${m.accuracy}%（${m.correct}/${m.total} 题）${m.weak ? '<br/><span style="color:#f43f5e">薄弱，建议优先补强</span>' : m.total >= 2 ? '<br/><span style="color:#22c55e">掌握良好</span>' : ''}`
          return tip
        } else if (params.dataType === 'edge') {
          const st = edgeStyle[params.data.kind] || edgeStyle.similarity
          return `${st.label}关系<br/>关联度：${params.data.value}`
        }
        return ''
      }
    },
    legend: isMobile ? [] : [{
      data: categories.map(c => c.name),
      textStyle: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
      top: 64,
      left: 16,
      orient: 'vertical'
    }],
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      data: graphNodes,
      links: graphLinks,
      categories,
      force: {
        repulsion: isMobile ? 150 : 200,
        gravity: isMobile ? 0.08 : 0.1,
        edgeLength: isMobile ? [60, 150] : [80, 200],
        friction: 0.6
      },
      emphasis: {
        focus: 'adjacency',
        lineStyle: {
          width: 4,
          color: '#4f5ff0'
        }
      },
      animationDuration: 800,
      animationEasingUpdate: 'quinticInOut',
      animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }]
  }

  chartInstance.setOption(option)

  chartInstance.on('click', (params) => {
    if (params.dataType === 'node' && params.data._fullData) {
      selectedNode.value = params.data._fullData
    }
  })

  window.addEventListener('resize', handleResize)
}

function handleResize() {
  chartInstance?.resize()
}

function zoomChart(factor) {
  if (!chartInstance) return
  const cur = chartInstance.getOption()
  const zoom = cur?.series?.[0]?.zoom || 1
  chartInstance.dispatchAction({
    type: 'graphRoam',
    seriesIndex: 0,
    zoom: Math.min(3, Math.max(0.5, zoom * factor))
  })
}

function resetView() {
  if (!chartInstance) return
  chartInstance.dispatchAction({
    type: 'graphRoam',
    seriesIndex: 0,
    zoom: 1
  })
  chartInstance.dispatchAction({
    type: 'graphRoam',
    seriesIndex: 0,
    dx: 0,
    dy: 0
  })
}

function focusNode(id) {
  selectedNode.value = nodes.value.find(n => n.id === id) || null
  if (chartInstance) {
    chartInstance.dispatchAction({
      type: 'focusNodeAdjacency',
      seriesIndex: 0,
      dataIndex: nodes.value.findIndex(n => n.id === id)
    })
  }
}

function goPractice() {
  if (!selectedNode.value) return
  router.push({
    path: '/practice',
    query: {
      subject: selectedNode.value.subject,
      chapter: selectedNode.value.chapter
    }
  })
}

// 薄弱节点直达 AI 专项补强
function goAiPractice() {
  if (!selectedNode.value) return
  router.push({
    path: '/ai-practice',
    query: {
      subject: selectedNode.value.subject,
      chapter: selectedNode.value.chapter
    }
  })
}

// 加载 ECharts
function loadECharts() {
  return new Promise((resolve) => {
    if (window.echarts) return resolve()
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js'
    script.onload = resolve
    script.onerror = resolve
    document.head.appendChild(script)
  })
}

watch(weakOnly, async () => {
  await nextTick()
  renderChart()
})

onMounted(async () => {
  await loadSubjects()
  await loadECharts()
  await loadGraph()
  // 掌握度叠加依赖登录态，与图谱加载并行、失败静默降级
  loadMastery()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})
</script>

<style scoped>
.graph-page {
  position: relative;
  min-height: 600px;
}

.graph-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  gap: 16px;
}
.gh-left h2 {
  font-size: 22px;
  margin: 0 0 4px;
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 10px;
}
.gh-left h2 svg { width: 24px; height: 24px; color: var(--accent); }
.gh-left p {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}
.gh-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.subject-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px 5px 14px;
  border: 1px solid var(--rule);
  border-radius: 999px;
  background: var(--surface);
  box-shadow: var(--shadow-xs);
}
.ss-label {
  font-size: 14px;
  color: var(--muted);
  white-space: nowrap;
}
.ss-select {
  padding: 6px 32px 6px 12px;
  border: none;
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
}
.ss-select:focus {
  box-shadow: 0 0 0 3px var(--accent-soft);
  border-radius: 999px;
}
.gw-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border: 1px solid var(--rule);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s var(--ease), border-color 0.2s var(--ease), color 0.2s var(--ease), box-shadow 0.2s var(--ease), transform 0.2s var(--ease);
  white-space: nowrap;
  box-shadow: var(--shadow-xs);
}
.gw-toggle .gw-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f43f5e;
  box-shadow: 0 0 8px rgba(244, 63, 94, 0.6);
}
.gw-toggle:hover {
  border-color: #f43f5e;
  color: var(--ink);
  transform: translateY(-1px);
}
.gw-toggle:active { transform: translateY(0) scale(0.97); }
.gw-toggle.on {
  border-color: #f43f5e;
  background: rgba(244, 63, 94, 0.12);
  color: #f43f5e;
}

.graph-container {
  position: relative;
  background: linear-gradient(135deg, #0a1628, #050a18);
  border-radius: 16px;
  border: 1px solid rgba(79, 95, 240, 0.15);
  overflow: hidden;
  min-height: 560px;
  box-shadow: 0 4px 24px rgba(5, 10, 24, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.graph-container::before {
  content: '';
  position: absolute;
  top: -140px; right: -100px;
  width: 360px; height: 360px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(79, 95, 240, 0.12) 0%, transparent 65%);
  pointer-events: none;
  z-index: 0;
}
.chart-canvas {
  width: 100%;
  height: 560px;
  padding: 16px 20px;
  box-sizing: border-box;
}

/* 图谱控制栏 */
.graph-controls {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 6;
}
.gc-btn {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(79, 95, 240, 0.3);
  border-radius: 10px;
  background: rgba(10, 20, 40, 0.85);
  color: #4f5ff0;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: background-color 0.2s var(--ease), border-color 0.2s var(--ease), transform 0.2s var(--ease);
  display: flex;
  align-items: center;
  justify-content: center;
}
.gc-btn:hover {
  background: rgba(79, 95, 240, 0.2);
  border-color: #4f5ff0;
  transform: scale(1.08);
}
.gc-btn:active {
  transform: scale(0.94);
}

/* 节点统计 */
.graph-stats {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  background: rgba(10, 20, 40, 0.8);
  border: 1px solid rgba(79, 95, 240, 0.2);
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  backdrop-filter: blur(8px);
  z-index: 6;
}
.gs-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
}

.graph-loading, .graph-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: rgba(255,255,255,0.5);
}
.gl-loader {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(79, 95, 240,0.2);
  border-top-color: #4f5ff0;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.ge-icon {
  display: flex; align-items: center; justify-content: center;
  width: 64px; height: 64px; margin: 0 auto 14px;
  border-radius: 20px;
  background: rgba(79, 95, 240, 0.15);
  color: #8fa9ff;
}
.ge-icon svg { width: 30px; height: 30px; }
.ge-retry {
  margin-top: 14px;
  padding: 7px 18px;
  border: 1px solid rgba(79, 95, 240, 0.5);
  border-radius: 999px;
  background: rgba(79, 95, 240, 0.15);
  color: #8fa9ff;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background-color 0.2s var(--ease), border-color 0.2s var(--ease), transform 0.2s var(--ease);
}
.ge-retry:hover { background: rgba(79, 95, 240, 0.3); border-color: #4f5ff0; color: #fff; }
.ge-retry:active { transform: scale(0.97); }

/* 详情面板 */
.detail-panel {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 280px;
  background: rgba(10, 20, 40, 0.95);
  border: 1px solid rgba(79, 95, 240, 0.3);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  z-index: 10;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.dp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(79, 95, 240, 0.15);
}
.dp-header h3 {
  margin: 0;
  font-size: 16px;
  color: #4f5ff0;
}
.dp-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  font-size: 18px;
  cursor: pointer; min-width: 44px; min-height: 44px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  transition: color 0.2s var(--ease), background-color 0.2s var(--ease), transform 0.2s var(--ease);
}
.dp-close:hover {
  color: #fff;
  background: rgba(255,255,255,0.1);
}
.dp-close:active {
  transform: scale(0.94);
}
.dp-body {
  padding: 14px 16px;
}
.dp-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 13px;
}
.dp-label {
  color: rgba(255,255,255,0.6);
}
.dp-value {
  color: #fff;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.dp-value.highlight {
  color: #4f5ff0;
  font-size: 15px;
}
.dp-sub {
  margin-left: 4px;
  color: rgba(255,255,255,0.5);
  font-weight: 400;
  font-size: 13px;
}
.badge-weak {
  color: #f43f5e;
  font-weight: 600;
}
.badge-ok {
  color: #22c55e;
  font-weight: 600;
}
.dp-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(79, 95, 240, 0.15);
}
.dp-sec-title {
  font-size: 13px;
  color: rgba(255,255,255,0.6);
  margin-bottom: 8px;
  font-variant-numeric: tabular-nums;
}
.dp-related {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.dp-related-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s var(--ease);
}
.dp-related-item:hover {
  background: rgba(79, 95, 240, 0.15);
}
.dr-name {
  font-size: 13px;
  color: rgba(255,255,255,0.85);
  flex-shrink: 0;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dr-strength {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.dr-bar {
  width: 50px;
  height: 4px;
  background: rgba(79, 95, 240, 0.2);
  border-radius: 2px;
  overflow: hidden;
}
.dr-bar > span {
  display: block;
  height: 100%;
  background: #4f5ff0;
  border-radius: 2px;
}
.dr-num {
  font-size: 13px;
  color: rgba(255,255,255,0.5);
  width: 16px;
  text-align: right;
  font-family: monospace;
  font-variant-numeric: tabular-nums;
}
.dp-actions {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dp-btn {
  width: 100%;
  justify-content: center;
}

/* 图例 */
.legend-panel {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(10, 20, 40, 0.9);
  border: 1px solid rgba(79, 95, 240, 0.2);
  border-radius: 10px;
  padding: 12px 16px;
  backdrop-filter: blur(10px);
  z-index: 5;
}
.lp-title {
  font-size: 13px;
  font-weight: 600;
  color: #4f5ff0;
  margin-bottom: 8px;
}
.lp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255,255,255,0.7);
  padding: 3px 0;
}
.lp-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
.lp-dot.node {
  background: #4f5ff0;
  box-shadow: 0 0 8px rgba(79, 95, 240,0.5);
}
.lp-line {
  width: 22px;
  height: 0;
  border-top-width: 3px;
  flex-shrink: 0;
}
.lp-line.line-similarity {
  border-top-style: solid;
  border-top-color: rgba(79, 95, 240, 0.7);
}
.lp-line.line-teaching {
  border-top-style: dashed;
  border-top-color: #d97706;
}
.lp-line.line-bridge {
  border-top-style: dotted;
  border-top-color: rgba(148, 163, 184, 0.8);
}
.lp-divider {
  margin: 6px 0;
  border-top: 1px solid rgba(79, 95, 240, 0.15);
}
.lp-ring {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #334155;
  flex-shrink: 0;
}
.lp-ring.ring-weak {
  border: 3px solid #f43f5e;
  box-shadow: 0 0 8px rgba(244, 63, 94, 0.5);
}
.lp-ring.ring-ok {
  border: 3px solid #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
}
.lp-tip {
  color: rgba(255,255,255,0.55);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.lp-tip svg { width: 13px; height: 13px; color: #8fa9ff; }

/* 动画 */
.slide-enter-active, .slide-leave-active {
  transition: opacity 0.3s var(--ease), transform 0.3s var(--ease);
}
.slide-enter-from, .slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

@media (max-width: 768px) {
  .graph-header {
    flex-direction: column;
    gap: 12px;
  }
  .subject-selector {
    width: 100%;
    justify-content: flex-start;
  }
  .ss-label { white-space: nowrap; }
  .ss-select { flex: 1; max-width: 220px; }
  .gw-toggle { align-self: flex-start; }
  .detail-panel {
    width: calc(100% - 40px);
    right: 20px;
    left: 20px;
  }
  .legend-panel {
    display: none;
  }
  .graph-controls {
    flex-direction: row;
    top: 12px;
    right: 12px;
  }
  .graph-stats {
    display: none;
  }
}

@media (max-width: 600px) {
  .gw-toggle { min-height: 44px; }
  .graph-container { min-height: 400px; }
  .chart-canvas { height: 400px; }
  .graph-controls { top: 12px; right: 12px; gap: 6px; }
  .gc-btn { width: 40px; height: 40px; }
}

@media (max-width: 480px) {
  .graph-container { min-height: 350px; border-radius: 14px; }
  .chart-canvas { height: 350px; }
  .detail-panel {
    width: calc(100% - 24px);
    right: 12px;
    left: 12px;
    top: 12px;
    max-height: calc(100% - 24px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .graph-controls { top: 12px; right: 12px; gap: 6px; }
  .gc-btn { width: 40px; height: 40px; font-size: 15px; }
  .gh-left h2 { font-size: 18px; }
  .gh-left p { font-size: 13px; }
}
</style>
