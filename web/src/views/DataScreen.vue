<template>
  <div class="screen">
    <!-- 顶部标题栏 -->
    <div class="screen-header">
      <div class="header-left">
        <span class="deco"></span>
        <h1>学习数据可视化大屏</h1>
        <span class="deco right"></span>
      </div>
      <div class="header-right">
        <span class="time">{{ currentTime }}</span>
        <span class="date">{{ currentDate }}</span>
      </div>
    </div>

    <div v-if="loading" class="screen-loading">
      <div class="loader"></div>
      <p>数据加载中...</p>
    </div>

    <div v-else-if="loadFailed" class="screen-loading">
      <div class="loader"></div>
      <p>数据加载失败，请检查网络后重试</p>
      <button class="screen-retry" @click="loadData">点击重试</button>
    </div>

    <template v-else>
      <!-- 第一行：总览卡片 -->
      <div class="row row-4">
        <div class="panel kpi-panel" :class="item.color" v-for="(item, i) in kpiList" :key="i">
          <div class="panel-corner tl"></div>
          <div class="panel-corner tr"></div>
          <div class="panel-corner bl"></div>
          <div class="panel-corner br"></div>
          <div class="kpi-icon" v-html="item.icon"></div>
          <div class="kpi-value" :class="item.color">{{ formatNum(item.value) }}</div>
          <div class="kpi-label">{{ item.label }}</div>
        </div>
      </div>

      <!-- 第二行：左中右三栏 -->
      <div class="row row-3">
        <!-- 左：题型分布 -->
        <div class="panel">
          <div class="panel-corner tl"></div>
          <div class="panel-corner tr"></div>
          <div class="panel-corner bl"></div>
          <div class="panel-corner br"></div>
          <div class="panel-title">题型分布</div>
          <div class="chart-wrap">
            <canvas ref="typeChart"></canvas>
          </div>
        </div>

        <!-- 中：各科目题量 -->
        <div class="panel">
          <div class="panel-corner tl"></div>
          <div class="panel-corner tr"></div>
          <div class="panel-corner bl"></div>
          <div class="panel-corner br"></div>
          <div class="panel-title">各科目题量分布</div>
          <div class="chart-wrap tall">
            <canvas ref="subjectChart"></canvas>
          </div>
        </div>

        <!-- 右：难度分布 -->
        <div class="panel">
          <div class="panel-corner tl"></div>
          <div class="panel-corner tr"></div>
          <div class="panel-corner bl"></div>
          <div class="panel-corner br"></div>
          <div class="panel-title">难度分布</div>
          <div class="chart-wrap">
            <canvas ref="diffChart"></canvas>
          </div>
        </div>
      </div>

      <!-- 第三行：左右两栏 -->
      <div class="row row-2">
        <!-- 左：学习趋势 -->
        <div class="panel">
          <div class="panel-corner tl"></div>
          <div class="panel-corner tr"></div>
          <div class="panel-corner bl"></div>
          <div class="panel-corner br"></div>
          <div class="panel-title">
            <span>平台学习趋势（近14天）</span>
            <div class="panel-tabs">
              <span class="tab" :class="{active: trendMode==='total'}" role="tab" tabindex="0" @click="trendMode='total'" @keydown.enter.prevent="trendMode='total'" @keydown.space.prevent="trendMode='total'">答题量</span>
              <span class="tab" :class="{active: trendMode==='accuracy'}" role="tab" tabindex="0" @click="trendMode='accuracy'" @keydown.enter.prevent="trendMode='accuracy'" @keydown.space.prevent="trendMode='accuracy'">正确率</span>
            </div>
          </div>
          <div class="chart-wrap">
            <canvas ref="trendChart"></canvas>
          </div>
        </div>

        <!-- 右：个人掌握度雷达 -->
        <div class="panel">
          <div class="panel-corner tl"></div>
          <div class="panel-corner tr"></div>
          <div class="panel-corner bl"></div>
          <div class="panel-corner br"></div>
          <div class="panel-title">个人科目掌握度</div>
          <div class="chart-wrap">
            <canvas ref="radarChart"></canvas>
          </div>
          <div v-if="!hasUserStats" class="no-data-tip">登录并开始答题后展示你的掌握度</div>
        </div>
      </div>

      <!-- 第四行：左右两栏 -->
      <div class="row row-2">
        <!-- 左：成就统计 -->
        <div class="panel">
          <div class="panel-corner tl"></div>
          <div class="panel-corner tr"></div>
          <div class="panel-corner bl"></div>
          <div class="panel-corner br"></div>
          <div class="panel-title">成就系统</div>
          <div class="achievement-wrap">
            <div class="ach-circle">
              <svg viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" class="ach-bg"/>
                <circle cx="60" cy="60" r="50" class="ach-fg" :style="{ strokeDasharray: achCircumference + ' ' + achCircumference, strokeDashoffset: achDashOffset }"/>
              </svg>
              <div class="ach-center">
                <div class="ach-num">{{ achievements.earned || 0 }}</div>
                <div class="ach-total">/ {{ achievements.total || 15 }}</div>
                <div class="ach-pct">{{ achPercent }}%</div>
              </div>
            </div>
            <div class="ach-tiers">
              <div class="tier bronze">
                <div class="tier-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14.6" r="5.2"/><path d="M8.6 3.6 12 9l3.4-5.4"/><path d="M6.4 8.6H4a.55.55 0 0 1-.46-.88L6.4 3.9"/><path d="M17.6 8.6H20a.55.55 0 0 0 .46-.88L17.6 3.9"/><path d="M10.1 14.9l1.3 1.3 2.5-2.5"/></svg></div>
                <div class="tier-name">铜牌</div>
                <div class="tier-count">{{ achievements.byTier?.bronze?.earned || 0 }} / {{ achievements.byTier?.bronze?.total || 0 }}</div>
              </div>
              <div class="tier silver">
                <div class="tier-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14.6" r="5.2"/><path d="M8.6 3.6 12 9l3.4-5.4"/><path d="M6.4 8.6H4a.55.55 0 0 1-.46-.88L6.4 3.9"/><path d="M17.6 8.6H20a.55.55 0 0 0 .46-.88L17.6 3.9"/><path d="M10.1 14.9l1.3 1.3 2.5-2.5"/></svg></div>
                <div class="tier-name">银牌</div>
                <div class="tier-count">{{ achievements.byTier?.silver?.earned || 0 }} / {{ achievements.byTier?.silver?.total || 0 }}</div>
              </div>
              <div class="tier gold">
                <div class="tier-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14.6" r="5.2"/><path d="M8.6 3.6 12 9l3.4-5.4"/><path d="M6.4 8.6H4a.55.55 0 0 1-.46-.88L6.4 3.9"/><path d="M17.6 8.6H20a.55.55 0 0 0 .46-.88L17.6 3.9"/><path d="M10.1 14.9l1.3 1.3 2.5-2.5"/></svg></div>
                <div class="tier-name">金牌</div>
                <div class="tier-count">{{ achievements.byTier?.gold?.earned || 0 }} / {{ achievements.byTier?.gold?.total || 0 }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右：本周对比 -->
        <div class="panel">
          <div class="panel-corner tl"></div>
          <div class="panel-corner tr"></div>
          <div class="panel-corner bl"></div>
          <div class="panel-corner br"></div>
          <div class="panel-title">本周 vs 上周</div>
          <div class="compare-wrap">
            <div class="compare-item" v-for="(item, i) in compareItems" :key="i">
              <div class="ci-label">{{ item.label }}</div>
              <div class="ci-bars">
                <div class="ci-bar-row">
                  <span class="ci-bar-label">本周</span>
                  <div class="ci-bar-track">
                    <div class="ci-bar this-week" :style="{ width: item.thisPct + '%' }"></div>
                  </div>
                  <span class="ci-bar-val">{{ item.thisVal }}</span>
                </div>
                <div class="ci-bar-row">
                  <span class="ci-bar-label">上周</span>
                  <div class="ci-bar-track">
                    <div class="ci-bar last-week" :style="{ width: item.lastPct + '%' }"></div>
                  </div>
                  <span class="ci-bar-val">{{ item.lastVal }}</span>
                </div>
              </div>
              <div class="ci-trend" :class="item.trendClass">
                {{ item.trendIcon }} {{ item.trendText }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 第五行：章节掌握度热力图 -->
      <div class="row row-1">
        <div class="panel">
          <div class="panel-corner tl"></div>
          <div class="panel-corner tr"></div>
          <div class="panel-corner bl"></div>
          <div class="panel-corner br"></div>
          <div class="panel-title"><span>章节掌握度热力图</span><span class="heat-legend"><i class="hl l0"></i>薄弱 <i class="hl l1"></i>待加强 <i class="hl l2"></i>良好 <i class="hl l3"></i>熟练</span></div>
          <div v-if="chapterGroups.length" class="heat-content">
            <div v-for="g in chapterGroups" :key="g.subject" class="heat-subject">
              <div class="heat-subject-name">{{ g.subject }}</div>
              <div class="heat-cells">
                <div
                  v-for="c in g.cells"
                  :key="c.chapter"
                  class="heat-cell"
                  :class="c.cls"
                  :title="`${c.chapter}：${c.total} 题，正确率 ${c.accuracy}%`"
                >
                  <span class="hc-name">{{ c.chapter }}</span>
                  <span class="hc-vals">{{ c.correct }}/{{ c.total }} · {{ c.accuracy }}%</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="no-data-tip" style="position:static; padding:28px 0; text-align:center;">登录并开始答题后展示章节级掌握度</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { api } from '../api.js'
import Chart from 'chart.js/auto'

// 本地打包的 Chart.js 挂到 window，兼容下方基于 window.Chart 的既有图表代码
window.Chart = Chart

const loading = ref(true)
const data = ref(null)
const trendMode = ref('total')
const hasUserStats = ref(false)
const loadFailed = ref(false)

// 时间显示
const currentTime = ref('')
const currentDate = ref('')
let timer = null

function updateTime() {
  const now = new Date()
  currentTime.value = now.toLocaleTimeString('zh-CN', { hour12: false })
  currentDate.value = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' })
}

// KPI 卡片
const kpiList = computed(() => {
    const d = data.value
    if (!d) return []
    const I = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">${paths}</svg>`
    return [
      { label: '题库总量', value: d.overview?.totalQuestions || 0, color: 'cyan',
        icon: I('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/>') },
      { label: '注册用户', value: d.overview?.totalUsers || 0, color: 'green',
        icon: I('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>') },
      { label: '练习次数', value: d.overview?.totalPracticeRecords || 0, color: 'purple',
        icon: I('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>') },
      { label: '合作院校', value: d.overview?.totalSchools || 0, color: 'orange',
        icon: I('<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/><path d="M22 10v6"/>') }
    ]
  })

function formatNum(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n
}

// 成就圆环
const achievements = computed(() => data.value?.achievements || {})
const achPercent = computed(() => {
  const a = achievements.value
  if (!a.total) return 0
  return Math.round((a.earned / a.total) * 100)
})
const achCircumference = 2 * Math.PI * 50
const achDashOffset = computed(() => achCircumference * (1 - achPercent.value / 100))

// 章节掌握度热力图：按科目分组，按正确率四档上色
const masteryCells = computed(() => data.value?.masteryHeatmap || [])
const chapterGroups = computed(() => {
  const cells = masteryCells.value.filter(m => m.total >= 1)
  if (!cells.length) return []
  const map = new Map()
  for (const m of cells) {
    if (!map.has(m.subject)) map.set(m.subject, [])
    const acc = m.accuracy || 0
    const cls = acc >= 80 ? 'l3' : acc >= 60 ? 'l2' : acc >= 40 ? 'l1' : 'l0'
    map.get(m.subject).push({ chapter: m.chapter || '未分类', total: m.total, correct: m.correct || 0, accuracy: acc, cls })
  }
  return [...map.entries()].map(([subject, list]) => ({ subject, cells: list }))
})

// 本周对比
const compareItems = computed(() => {
  const d = data.value?.weeklyCompare
  if (!d) return []
  const tw = d.thisWeek || {}
  const lw = d.lastWeek || {}
  const items = [
    { label: '答题量', thisVal: tw.total || 0, lastVal: lw.total || 0, unit: '题' },
    { label: '正确数', thisVal: tw.correct || 0, lastVal: lw.correct || 0, unit: '题' },
    { label: '正确率', thisVal: tw.accuracy || 0, lastVal: lw.accuracy || 0, unit: '%' },
    { label: '打卡天数', thisVal: tw.checkinDays || 0, lastVal: lw.checkinDays || 0, unit: '天' }
  ]
  return items.map(i => {
    // 各指标按自身语义基准缩放，避免把"题数/百分比/天数"混在同一标尺导致误导：
    // 正确率按 0-100%、打卡天数按 1 周 7 天、计数按本周与上周的较大值
    let maxVal = 1
    if (i.unit === '%') maxVal = 100
    else if (i.unit === '天') maxVal = 7
    else maxVal = Math.max(i.thisVal, i.lastVal, 1)
    const clamp = (pct) => Math.min(100, Math.max(0, pct))
    const thisPct = clamp((i.thisVal / maxVal) * 100)
    const lastPct = clamp((i.lastVal / maxVal) * 100)
    let trendClass = 'up'
    let trendIcon = '↑'
    let trendText = ''
    const diff = i.thisVal - i.lastVal
    if (i.lastVal === 0 && i.thisVal > 0) {
      // 上周无记录时不渲染成"增长"，改用"新增"
      trendClass = 'up'
      trendIcon = 'N'
      trendText = `上周无记录，本周新增 +${i.thisVal}${i.unit}`
    } else if (diff === 0) {
      // 两周持平（含双 0），不显示误导性的"+0"或增长箭头
      trendClass = 'flat'
      trendIcon = '—'
      trendText = `持平 ${i.thisVal}${i.unit}`
    } else {
      trendClass = diff > 0 ? 'up' : 'down'
      trendIcon = diff > 0 ? '↑' : '↓'
      trendText = (diff > 0 ? '+' : '') + diff + i.unit
    }
    return { ...i, thisPct: Number(thisPct.toFixed(1)), lastPct: Number(lastPct.toFixed(1)), trendClass, trendIcon, trendText }
  })
})

// 图表引用
const typeChart = ref(null)
const subjectChart = ref(null)
const diffChart = ref(null)
const trendChart = ref(null)
const radarChart = ref(null)

let charts = {}

async function loadData() {
  loading.value = true
  loadFailed.value = false
  try {
    const d = await api.get('/stats/dashboard')
    data.value = d
    hasUserStats.value = (d.masteryHeatmap?.length || 0) > 0
  } catch (e) {
    console.error('大屏数据加载失败:', e)
    loadFailed.value = true
  } finally {
    loading.value = false
  }
  await nextTick()
  // 加载失败时不渲染图表，页面已显示失败提示
  if (!loadFailed.value) initCharts()
}

function initCharts() {
  if (!data.value) return
  const d = data.value

  // 尊重系统减弱动效偏好：关闭 Chart.js 动画
  if (window.Chart && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.Chart.defaults.animation = false
  }

  // 销毁旧图表
  Object.values(charts).forEach(c => c?.destroy?.())
  charts = {}

  const colors = {
    blue: '#4f5ff0',
    purple: '#7c3aed',
    green: '#0da678',
    orange: '#d97706',
    pink: '#ec4899',
    grid: 'rgba(255, 255, 255, 0.08)',
    text: 'rgba(255, 255, 255, 0.7)'
  }
  // 科目柱状图纯色板（按科目循环，避免渐变填充）
  const barPalette = ['#4f5ff0', '#7c3aed', '#0da678', '#d97706', '#0891b2', '#e11d48', '#65a30d', '#ea580c', '#64748b', '#0d9488', '#a16207']

  // 环形/饼图中心统计文字插件：窄屏利用环心空白呈现总题数，减少对外部图例依赖
  const centerLegend = {
    id: 'centerLegend',
    afterDraw(chart) {
      const meta = chart.getDatasetMeta(0)
      const pts = meta && meta.data
      if (!pts || !pts.length) return
      const { ctx } = chart
      const { x, y } = pts[0]
      const total = (chart.data.datasets[0] && chart.data.datasets[0].data || []).reduce((a, b) => a + (Number(b) || 0), 0)
      ctx.save()
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = '800 21px system-ui, -apple-system, sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(total >= 10000 ? (total / 10000).toFixed(1) + 'w' : String(total), x, y - 9)
      ctx.font = '13px system-ui, -apple-system, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,.6)'
      ctx.fillText('总题数', x, y + 13)
      ctx.restore()
    }
  }

  // 题型分布 - 环形图
  if (typeChart.value && window.Chart) {
    const td = Object.entries(d.typeDist || {}).map(([type, count]) => ({ type, count }))
    if (!td.length) return // 无数据时不渲染空环图
    const labels = td.map(t => ({ single: '单选题', multiple: '多选题', judge: '判断题', subjective: '主观题' }[t.type] || t.type))
    const vals = td.map(t => t.count)
    charts.type = new window.Chart(typeChart.value, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: vals,
          backgroundColor: [colors.blue, colors.purple, colors.green, colors.orange],
          borderColor: 'rgba(10, 15, 30, 0.9)',
          borderWidth: 2,
          hoverBorderColor: 'rgba(255, 255, 255, 0.85)',
          hoverBorderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: colors.text, padding: 12, font: { size: 13 } }
          }
        }
      },
      plugins: [centerLegend]
    })
  }

  // 各科目题量 - 横向柱状图
  if (subjectChart.value && window.Chart) {
    const ss = d.subjectStats || []
    if (!ss.length) return // 无数据时不渲染空柱状图
    const sorted = [...ss].sort((a, b) => a.total - b.total)
    charts.subject = new window.Chart(subjectChart.value, {
      type: 'bar',
      data: {
        labels: sorted.map(s => s.subject),
        datasets: [{
          label: '题目数量',
          data: sorted.map(s => s.total),
          backgroundColor: sorted.map((_, i) => barPalette[i % barPalette.length]),
          hoverBackgroundColor: sorted.map((_, i) => barPalette[i % barPalette.length] + 'cc'),
          borderColor: colors.blue,
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: colors.grid },
            ticks: { color: colors.text }
          },
          y: {
            grid: { display: false },
            ticks: { color: colors.text, font: { size: 13 } }
          }
        }
      }
    })
  }

  // 难度分布 - 饼图
  if (diffChart.value && window.Chart) {
    const dd = Object.values(d.difficultyDist || {})
    if (!dd.length) return // 无数据时不渲染空饼图
    charts.diff = new window.Chart(diffChart.value, {
      type: 'pie',
      data: {
        labels: dd.map(d => d.label),
        datasets: [{
          data: dd.map(d => d.count),
          backgroundColor: [colors.green, colors.blue, colors.orange],
          borderColor: 'rgba(10, 15, 30, 0.9)',
          borderWidth: 2,
          hoverBorderColor: 'rgba(255, 255, 255, 0.85)',
          hoverBorderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: colors.text, padding: 12, font: { size: 13 } }
          }
        }
      }
    })
  }

  // 学习趋势 - 折线图
  if (trendChart.value && window.Chart) {
    drawTrendChart()
  }

  // 雷达图
  if (radarChart.value && window.Chart && hasUserStats.value) {
    const ms = d.masteryHeatmap || []
    const bySubj = {}
    ms.forEach(m => {
      if (!bySubj[m.subject]) bySubj[m.subject] = { total: 0, correct: 0 }
      bySubj[m.subject].total += m.total
      bySubj[m.subject].correct += m.correct || 0
    })
    const subjects = Object.keys(bySubj).slice(0, 8)
    const vals = subjects.map(s => bySubj[s].total ? Math.round((bySubj[s].correct / bySubj[s].total) * 100) : 0)
    charts.radar = new window.Chart(radarChart.value, {
      type: 'radar',
      data: {
        labels: subjects,
        datasets: [{
          label: '正确率 %',
          data: vals,
          backgroundColor: 'rgba(79, 95, 240, 0.2)',
          borderColor: colors.blue,
          borderWidth: 2,
          pointBackgroundColor: colors.blue,
          pointBorderColor: '#fff',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          r: {
            angleLines: { color: colors.grid },
            grid: { color: colors.grid },
            pointLabels: { color: colors.text, font: { size: 12 } },
            ticks: { color: colors.text, backdropColor: 'transparent', stepSize: 20 },
            suggestedMin: 0,
            suggestedMax: 100
          }
        }
      }
    })
  }
}

function drawTrendChart() {
  if (!trendChart.value || !window.Chart || !data.value) return
  const d = data.value.userTrend || []
  if (!d.length) {
    if (charts.trend) charts.trend.destroy()
    return // 无数据时不渲染空折线图
  }
  const colors = {
    blue: '#4f5ff0',
    green: '#0da678',
    grid: 'rgba(255, 255, 255, 0.08)',
    text: 'rgba(255, 255, 255, 0.7)'
  }

  const labels = d.map(t => t.date?.slice(5) || '')
  const totalData = d.map(t => t.total || 0)
  const accData = d.map(t => t.accuracy || 0)

  const isTotal = trendMode.value === 'total'
  if (charts.trend) charts.trend.destroy()

  charts.trend = new window.Chart(trendChart.value, {
    type: 'line',
    data: {
      labels,
      datasets: isTotal ? [
        {
          label: '答题量',
          data: totalData,
          borderColor: colors.blue,
          backgroundColor: 'rgba(79, 95, 240, 0.12)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: colors.blue
        }
      ] : [
        {
          label: '正确率 %',
          data: accData,
          borderColor: colors.green,
          backgroundColor: 'rgba(13, 166, 120, 0.12)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: colors.green
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: colors.grid },
          ticks: { color: colors.text, autoSkip: true, maxTicksLimit: 5, maxRotation: 0, font: { size: 13 } }
        },
        y: isTotal
          ? { grid: { color: colors.grid }, ticks: { color: colors.text, font: { size: 13 } }, beginAtZero: true }
          : { grid: { color: colors.grid }, ticks: { color: colors.text, font: { size: 13 }, callback: v => v + '%' }, suggestedMin: 0, suggestedMax: 100 }
      }
    }
  })
}

watch(trendMode, () => {
  nextTick(drawTrendChart)
})

// Chart.js 已本地打包引入，无需再从 CDN 动态加载
function loadChartJS() {
  return Promise.resolve(window.Chart || Chart)
}

onMounted(async () => {
  updateTime()
  timer = setInterval(updateTime, 1000)
  document.documentElement.classList.add('page-dark')
  await loadChartJS()
  await loadData()
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  Object.values(charts).forEach(c => c?.destroy?.())
  document.documentElement.classList.remove('page-dark')
})
</script>

<style scoped>
.screen {
  min-height: 100vh;
  min-height: 100dvh;
  background: radial-gradient(ellipse at top, #0a1628 0%, #050a18 60%, #02040a 100%);
  color: #fff;
  padding: 16px 20px 32px;
  margin: -20px 0 -32px;
  position: relative;
  overflow-x: hidden;
  max-width: 100%;
}
.screen::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-image: 
    linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}

/* 顶部 */
.screen-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 0 8px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.header-left h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--accent);
  margin: 0;
  letter-spacing: 2px;
}
.deco {
  width: 60px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent));
}
.deco.right {
  background: linear-gradient(90deg, var(--accent), transparent);
}
.header-right {
  text-align: right;
}
.header-right .time {
  font-size: 22px;
  font-weight: 600;
  color: #8fa9ff;
  font-family: 'Courier New', monospace;
  display: block;
}
.header-right .date {
  font-size: 13px;
  color: rgba(255,255,255,0.6);
}

/* Loading */
.screen-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: rgba(255,255,255,0.6);
}
.loader {
  width: 48px;
  height: 48px;
  border: 3px solid rgba(79,95,240,0.2);
  border-top-color: #4f5ff0;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}
.screen-retry {
  margin-top: 14px;
  padding: 7px 18px;
  border: 1px solid rgba(79, 95, 240, 0.5);
  border-radius: 999px;
  background: rgba(79, 95, 240, 0.15);
  color: #8fa9ff;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background-color 0.2s var(--ease), border-color 0.2s var(--ease), color 0.2s var(--ease), transform 0.2s var(--ease);
}
.screen-retry:hover { background: rgba(79, 95, 240, 0.3); border-color: #4f5ff0; color: #fff; }
.screen-retry:active { transform: scale(0.97); }
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 行布局 */
.row {
  display: grid;
  gap: 16px;
  margin-bottom: 16px;
}
.row-4 { grid-template-columns: repeat(4, 1fr); }
.row-3 { grid-template-columns: repeat(3, 1fr); }
.row-2 { grid-template-columns: repeat(2, 1fr); }

/* 面板 */
.panel {
  min-width: 0;
  background: linear-gradient(135deg, rgba(16, 30, 60, 0.6), rgba(10, 15, 35, 0.8));
  border: 1px solid rgba(79, 95, 240, 0.28);
  border-radius: 12px;
  padding: 16px;
  position: relative;
  backdrop-filter: blur(10px);
  transition: border-color 0.3s var(--ease), box-shadow 0.3s var(--ease);
}
.panel:hover { border-color: rgba(79, 95, 240, 0.45); box-shadow: 0 0 24px rgba(79, 95, 240, 0.08); }
.panel-corner {
  position: absolute;
  width: 12px;
  height: 12px;
  border-color: #4f5ff0;
  border-style: solid;
}
.panel-corner.tl { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
.panel-corner.tr { top: -1px; right: -1px; border-width: 2px 2px 0 0; }
.panel-corner.bl { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; }
.panel-corner.br { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
}
.panel-title::after {
  content: '';
  position: absolute;
  left: 0; bottom: -1px;
  width: 44px; height: 2px;
  background: linear-gradient(90deg, #4f5ff0, transparent);
  border-radius: 2px;
}
.panel-tabs {
  display: flex;
  gap: 4px;
}
.panel-tabs .tab {
  padding: 2px 10px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  color: rgba(255,255,255,0.5);
  transition: background-color 0.2s var(--ease), color 0.2s var(--ease);
}
.panel-tabs .tab.active {
  background: rgba(79, 95, 240, 0.35);
  color: #fff;
}

/* KPI 卡片 */
.kpi-panel {
  text-align: center;
  padding: 20px 16px;
  position: relative;
  overflow: hidden;
}
.kpi-panel::before {
  content: '';
  position: absolute;
  top: -60px; left: 50%;
  transform: translateX(-50%);
  width: 160px; height: 120px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(79, 95, 240, 0.12) 0%, transparent 65%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s var(--ease);
}
.kpi-panel:hover::before { opacity: 1; }
.kpi-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.12);
    margin-bottom: 10px;
    color: inherit;
    transition: transform 0.25s var(--ease), box-shadow 0.25s var(--ease);
  }
  .kpi-panel:hover .kpi-icon { transform: translateY(-2px) scale(1.05); }
  .kpi-panel.cyan .kpi-icon { color: #8fa9ff; }
  .kpi-panel.green .kpi-icon { color: var(--green-light); }
  .kpi-panel.purple .kpi-icon { color: var(--accent2-light); }
  .kpi-panel.orange .kpi-icon { color: var(--amber-light); }
.kpi-value {
  font-size: 32px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.kpi-value.cyan { color: #8fa9ff; }
.kpi-value.green { color: #34d399; }
.kpi-value.purple { color: var(--accent2-light); }
.kpi-value.orange { color: #fbbf24; }
.kpi-label {
  font-size: 13px;
  color: rgba(255,255,255,0.6);
  margin-top: 4px;
}

/* 图表容器 */
.chart-wrap {
  height: 220px;
  position: relative;
}
.chart-wrap.tall {
  height: 280px;
}
.no-data-tip {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: rgba(255,255,255,0.4);
  font-size: 13px;
}

/* 成就 */
.achievement-wrap {
  display: flex;
  align-items: center;
  gap: 24px;
}
.ach-circle {
  position: relative;
  width: 140px;
  height: 140px;
  flex-shrink: 0;
}
.ach-circle svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.ach-bg {
  fill: none;
  stroke: rgba(148, 163, 184, 0.2);
  stroke-width: 8;
}
.ach-fg {
  fill: none;
  stroke: #4f5ff0;
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.8s var(--ease);
}
.ach-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}
.ach-num {
  font-size: 28px;
  font-weight: 700;
  color: #8fa9ff;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.ach-total {
  font-size: 13px;
  color: rgba(255,255,255,0.5);
}
.ach-pct {
  font-size: 12px;
  color: var(--green-light);
  margin-top: 4px;
}
.ach-tiers {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tier {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
}
.tier-icon { display: flex; align-items: center; justify-content: center; }
.tier-icon svg { width: 22px; height: 22px; }
.tier-name {
  font-size: 14px;
  font-weight: 500;
  flex: 1;
}
.tier.bronze .tier-name { color: #cd7f32; }
.tier.silver .tier-name { color: #c0c0c0; }
.tier.gold .tier-name { color: #ffd700; }
.tier-count {
  font-size: 13px;
  color: rgba(255,255,255,0.6);
  font-family: 'Courier New', monospace;
}

/* 对比 */
.compare-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.compare-item {
  padding: 10px 12px;
  background: rgba(0,0,0,0.2);
  border-radius: 6px;
}
.ci-label {
  font-size: 13px;
  color: rgba(255,255,255,0.8);
  margin-bottom: 6px;
  font-weight: 500;
}
.ci-bars {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ci-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.ci-bar-label {
  width: 36px;
  color: rgba(255,255,255,0.5);
  flex-shrink: 0;
}
.ci-bar-track {
  flex: 1;
  height: 8px;
  background: rgba(255,255,255,0.08);
  border-radius: 4px;
  overflow: hidden;
}
.ci-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.8s var(--ease);
}
.ci-bar.this-week {
  background: #4f5ff0;
}
.ci-bar.last-week {
  background: rgba(255,255,255,0.25);
}
.ci-bar-val {
  width: 50px;
  text-align: right;
  color: rgba(255,255,255,0.7);
  font-family: 'Courier New', monospace;
  flex-shrink: 0;
}
.ci-trend {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 600;
  text-align: right;
}
.ci-trend.up { color: var(--green-light); }
.ci-trend.down { color: var(--red-light); }
.ci-trend.flat { color: rgba(255,255,255,0.55); }

/* 章节掌握度热力图 */
.row-1 { grid-template-columns: 1fr; }
.heat-legend { display: inline-flex; gap: 10px; font-size: 12px; color: rgba(255,255,255,0.55); align-items: center; }
.heat-legend .hl { width: 12px; height: 12px; border-radius: 3px; display: inline-block; margin-right: 3px; }
.heat-legend .hl.l0 { background: rgba(225,29,72,.55); }
.heat-legend .hl.l1 { background: rgba(217,119,6,.6); }
.heat-legend .hl.l2 { background: rgba(79,95,240,.6); }
.heat-legend .hl.l3 { background: rgba(13,166,120,.65); }
.heat-content { display: flex; flex-direction: column; gap: 14px; }
.heat-subject { display: flex; flex-direction: column; gap: 8px; }
.heat-subject-name { font-size: 13px; font-weight: 600; color: #8fa9ff; }
.heat-cells { display: flex; flex-wrap: wrap; gap: 8px; }
.heat-cell {
  display: flex; flex-direction: column; gap: 2px;
  min-width: 128px; padding: 8px 12px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,.08); cursor: default;
  transition: transform .2s var(--ease), box-shadow .2s var(--ease), border-color .2s var(--ease);
}
.heat-cell:hover { transform: translateY(-2px); }
.heat-cell.l0 { background: rgba(225,29,72,.2); border-color: rgba(225,29,72,.4); }
.heat-cell.l0:hover { box-shadow: 0 6px 18px rgba(225,29,72,.25); }
.heat-cell.l1 { background: rgba(217,119,6,.18); border-color: rgba(217,119,6,.4); }
.heat-cell.l1:hover { box-shadow: 0 6px 18px rgba(217,119,6,.22); }
.heat-cell.l2 { background: rgba(79,95,240,.18); border-color: rgba(79,95,240,.4); }
.heat-cell.l2:hover { box-shadow: 0 6px 18px rgba(79,95,240,.22); }
.heat-cell.l3 { background: rgba(13,166,120,.18); border-color: rgba(13,166,120,.4); }
.heat-cell.l3:hover { box-shadow: 0 6px 18px rgba(13,166,120,.22); }
.hc-name { font-size: 12.5px; font-weight: 600; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hc-vals { font-size: 12px; color: rgba(255,255,255,.6); font-family: 'Courier New', monospace; }

@media (max-width: 1024px) {
  .row-4 { grid-template-columns: repeat(2, 1fr); }
  .row-3 { grid-template-columns: 1fr; }
  .row-2 { grid-template-columns: 1fr; }
  .achievement-wrap { flex-direction: column; }
}

@media (max-width: 768px) {
  .screen { padding: 12px 12px 24px; margin: -12px 0 -24px; }
  .screen-header { flex-direction: column; gap: 6px; }
  .header-left h1 { font-size: 18px; letter-spacing: 1px; }
  .deco { width: 32px; }
  .header-right .time { font-size: 16px; }
  .header-right .date { font-size: 12px; }
  .chart-wrap { height: 190px; }
  .chart-wrap.tall { height: 240px; }
  .panel { padding: 13px; }
}

@media (max-width: 480px) {
  .row { gap: 10px; margin-bottom: 10px; }
  .row-4 { grid-template-columns: repeat(2, 1fr); }
  .panel { padding: 12px; }
  .panel-title { font-size: 13px; }
  .chart-wrap { height: 180px; }
  .chart-wrap.tall { height: 220px; }
  .kpi-panel { padding: 16px 10px; }
  .ach-circle { width: 110px; height: 110px; }
}
</style>
