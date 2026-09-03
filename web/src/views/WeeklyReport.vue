<template>
  <div class="container report-page">
    <div class="page-head">
      <h2>学习周报</h2>
      <p>回顾本周学习数据，AI 帮你总结与规划</p>
      <div class="head-actions">
        <button class="btn btn-ghost btn-sm" :disabled="loading" @click="exportPdf">导出 PDF</button>
      </div>
    </div>

    <!-- 加载骨架屏 -->
    <template v-if="loading">
      <div class="card ov-grid">
        <div v-for="i in 4" :key="i" class="ov-item">
          <div class="skeleton sk-wr-num"></div>
          <div class="skeleton sk-wr-lbl"></div>
        </div>
      </div>
      <div class="card cmp-card">
        <div class="cmp-head">
          <div class="skeleton sk-wr-title"></div>
          <div class="skeleton sk-wr-sub"></div>
        </div>
        <div class="cmp-grid">
          <div v-for="i in 3" :key="i" class="cmp-item">
            <div class="skeleton sk-wr-cmp-lbl"></div>
            <div class="skeleton sk-wr-cmp-num"></div>
            <div class="skeleton sk-wr-cmp-bar"></div>
          </div>
        </div>
      </div>
    </template>
    <template v-else-if="loadFailed">
      <div class="card wk-error">
        <div class="wk-err-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><path d="M12 16.5h.01"/></svg></div>
        <p class="wk-err-title">周报加载失败</p>
        <span class="wk-err-sub">请检查网络后重试，或稍后再来查看</span>
        <button class="btn btn-primary wk-retry" @click="load">重新加载</button>
      </div>
    </template>
    <template v-else>
      <!-- 概览 -->
      <div class="card ov-grid">
        <div class="ov-item">
          <div class="ov-num">{{ data.total }}</div>
          <div class="ov-lbl">本周刷题</div>
        </div>
        <div class="ov-item">
          <div class="ov-num">{{ data.accuracy }}%</div>
          <div class="ov-lbl">正确率</div>
        </div>
        <div class="ov-item">
          <div class="ov-num">{{ data.checkinDays }}</div>
          <div class="ov-lbl">打卡天数</div>
        </div>
        <div class="ov-item">
          <div class="ov-num">{{ data.exams.length }}</div>
          <div class="ov-lbl">模拟考试</div>
        </div>
      </div>

      <!-- 环比对比 -->
      <div class="card cmp-card">
        <div class="cmp-head">
          <h3>环比上周</h3>
          <span class="cmp-sub">本周 vs 上周 · 看看你的进步</span>
        </div>
        <div class="cmp-grid">
          <div class="cmp-item">
            <div class="cmp-lbl">刷题量</div>
            <div class="cmp-nums">
              <strong>{{ data.total }}</strong>
              <span class="cmp-last">上周 {{ lastWeek.total }}</span>
            </div>
            <div class="cmp-delta" :class="deltaClass(data.total - lastWeek.total)">
              {{ deltaText(data.total - lastWeek.total) }}
            </div>
          </div>
          <div class="cmp-item">
            <div class="cmp-lbl">正确率</div>
            <div class="cmp-nums">
              <strong>{{ data.accuracy }}%</strong>
              <span class="cmp-last">上周 {{ lastWeek.accuracy }}%</span>
            </div>
            <div class="cmp-delta" :class="deltaClass(data.accuracy - lastWeek.accuracy)">
              {{ deltaText(data.accuracy - lastWeek.accuracy) }}
            </div>
          </div>
          <div class="cmp-item">
            <div class="cmp-lbl">打卡天数</div>
            <div class="cmp-nums">
              <strong>{{ data.checkinDays }}</strong>
              <span class="cmp-last">上周 {{ lastWeek.checkinDays }}</span>
            </div>
            <div class="cmp-delta" :class="deltaClass(data.checkinDays - lastWeek.checkinDays)">
              {{ deltaText(data.checkinDays - lastWeek.checkinDays) }}
            </div>
          </div>
          <div class="cmp-item">
            <div class="cmp-lbl">模拟考试</div>
            <div class="cmp-nums">
              <strong>{{ data.exams.length }}</strong>
              <span class="cmp-last">上周 {{ lastWeek.examCount }}</span>
            </div>
            <div class="cmp-delta" :class="deltaClass(data.exams.length - lastWeek.examCount)">
              {{ deltaText(data.exams.length - lastWeek.examCount) }}
            </div>
          </div>
        </div>
      </div>

      <!-- 每日趋势 -->
      <div class="card trend-card">
        <h3>每日刷题趋势</h3>
        <div v-if="data.trend.length" class="trend-chart">
          <div v-for="(t, i) in data.trend" :key="i" class="trend-col">
            <div class="tc-bar-wrap">
              <div class="tc-bar" :style="{ height: barHeight(t.total) }">
                <span class="tc-val">{{ t.total }}</span>
              </div>
            </div>
            <div class="tc-day">{{ dayLabel(t.d) }}</div>
          </div>
        </div>
        <div v-else class="empty-mini">本周暂无刷题记录，快去刷题吧</div>
      </div>

      <!-- 科目表现 + 薄弱点 -->
      <div class="card sub-card">
        <h3>科目表现</h3>
        <div v-if="data.bySubject.length" class="sub-list">
          <div v-for="s in data.bySubject" :key="s.subject" class="sub-row">
            <div class="sub-name">{{ s.subject }}</div>
            <div class="sub-track"><div class="sub-fill" :style="{ width: s.accuracy + '%' }"></div></div>
            <div class="sub-num">{{ s.accuracy }}%</div>
            <div class="sub-count">{{ s.total }} 题</div>
          </div>
        </div>
        <div v-else class="empty-mini">暂无科目数据</div>
      </div>

      <div class="card weak-card">
        <h3>本周薄弱知识点</h3>
        <div v-if="data.weak.length" class="weak-tags">
          <span v-for="(w, i) in data.weak" :key="i" class="weak-tag">{{ w }}</span>
        </div>
        <div v-else class="empty-mini">本周没有明显薄弱点，继续保持！</div>
      </div>

      <!-- AI 周报总结 -->
      <div class="card ai-report">
        <div class="ai-head">
          <div>
            <h3>AI 周报总结</h3>
            <p class="ai-sub">AI 结合本周数据，给出总结与下周建议</p>
          </div>
          <button class="btn btn-primary" :disabled="aiLoading" @click="genAi">
            {{ aiLoading ? 'AI 生成中…' : (aiReply ? '重新生成' : '生成周报') }}
          </button>
        </div>
        <div v-if="aiLoading" class="ai-loading">
          <div class="spinner"></div>
          <p>AI 正在分析本周学习数据…</p>
        </div>
        <div v-else-if="aiReply" class="ai-body">
          <template v-for="(b, i) in aiBlocks" :key="i">
            <h4 v-if="b.type === 'heading'" class="ai-h">{{ b.text }}</h4>
            <p v-else-if="b.type === 'bullet'" class="ai-bullet">{{ b.text }}</p>
            <p v-else class="ai-text">{{ b.text }}</p>
          </template>
          <span v-if="aiTyping" class="tw-caret"></span>
        </div>
        <div v-else class="ai-empty">点击「生成周报」，让 AI 帮你总结本周学习情况</div>
      </div>

      <!-- 历史周报 -->
      <div class="card hist-card">
        <div class="hist-head">
          <div>
            <h3>历史周报</h3>
            <p class="hist-sub">系统每周自动生成，回顾每周学习轨迹</p>
          </div>
          <span class="hist-count">{{ history.length }} 份</span>
        </div>
        <div v-if="historyLoading" class="hist-list">
          <div v-for="i in 3" :key="i" class="hist-item sk-hist">
            <div class="skeleton sk-hist-week"></div>
            <div class="sk-hist-stats">
              <div class="skeleton sk-hist-stat"></div>
              <div class="skeleton sk-hist-stat"></div>
              <div class="skeleton sk-hist-stat short"></div>
            </div>
          </div>
        </div>
        <div v-else-if="historyFailed" class="empty-mini">
          历史周报加载失败
          <button class="hist-retry" @click="loadHistory">点击重试</button>
        </div>
        <div v-else-if="!history.length" class="empty-mini">暂无历史周报，本周结束后系统将自动生成</div>
        <div v-else class="hist-list">
          <div v-for="h in history" :key="h.id" class="hist-item" role="button" tabindex="0" @click="openHistory(h)" @keydown.enter.prevent="openHistory(h)">
            <div class="hist-week">{{ h.week_start }} ~ {{ h.week_end }}</div>
            <div class="hist-stats">
              <span class="hs-item"><b>{{ h.total }}</b> 题</span>
              <span class="hs-item"><b>{{ h.accuracy }}%</b> 正确率</span>
              <span class="hs-item"><b>{{ h.checkinDays }}</b> 天打卡</span>
            </div>
            <span v-if="h.hasAi" class="hist-ai-tag">AI 总结</span>
            <span class="hist-arrow">→</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 历史周报详情弹窗 -->
    <div v-if="historyView" class="hist-mask" @click.self="historyView = null">
      <div class="hist-modal">
        <div class="hist-modal-head">
          <div>
            <h3>周报详情</h3>
            <p class="hist-sub">{{ historyView.week_start }} ~ {{ historyView.week_end }}</p>
          </div>
          <button class="hist-close" @click="historyView = null">✕</button>
        </div>
        <div class="hist-modal-body">
          <div class="hm-ov">
            <div class="hm-cell"><b>{{ historyView.total }}</b><span>刷题</span></div>
            <div class="hm-cell"><b>{{ historyView.accuracy }}%</b><span>正确率</span></div>
            <div class="hm-cell"><b>{{ historyView.checkinDays }}</b><span>打卡天数</span></div>
            <div class="hm-cell"><b>{{ historyView.exams.length }}</b><span>模拟考试</span></div>
          </div>

          <div class="hm-sec">
            <h4>每日刷题</h4>
            <div v-if="historyView.trend.length" class="hm-trend">
              <div v-for="(t, i) in historyView.trend" :key="i" class="hm-col">
                <div class="hm-bar" :style="{ height: hmBar(t.total) }"></div>
                <span class="hm-day">{{ dayLabel(t.d) }}</span>
              </div>
            </div>
            <div v-else class="empty-mini">该周暂无刷题记录</div>
          </div>

          <div class="hm-sec">
            <h4>科目表现</h4>
            <div v-if="historyView.bySubject.length" class="hm-sub">
              <div v-for="s in historyView.bySubject" :key="s.subject" class="hm-sub-row">
                <span class="hm-sub-name">{{ s.subject }}</span>
                <div class="hm-sub-track"><div class="hm-sub-fill" :style="{ width: s.accuracy + '%' }"></div></div>
                <span class="hm-sub-num">{{ s.accuracy }}%</span>
              </div>
            </div>
            <div v-else class="empty-mini">该周暂无科目数据</div>
          </div>

          <div class="hm-sec">
            <h4>薄弱知识点</h4>
            <div v-if="historyView.weak.length" class="weak-tags">
              <span v-for="(w, i) in historyView.weak" :key="i" class="weak-tag">{{ w }}</span>
            </div>
            <div v-else class="empty-mini">该周没有明显薄弱点</div>
          </div>

          <div class="hm-sec">
            <div class="hm-ai-head">
              <h4>AI 总结</h4>
              <button class="btn btn-ghost btn-sm" :disabled="histAiLoading" @click="genHistoryAi">
                {{ histAiLoading ? '生成中…' : (historyView.ai_summary ? '重新生成' : '生成 AI 总结') }}
              </button>
            </div>
            <div v-if="histAiLoading" class="ai-loading"><div class="spinner"></div><p>AI 正在分析该周数据…</p></div>
            <div v-else-if="historyView.ai_summary" class="ai-body">
              <template v-for="(b, i) in histAiBlocks" :key="i">
                <h4 v-if="b.type === 'heading'" class="ai-h">{{ b.text }}</h4>
                <p v-else-if="b.type === 'bullet'" class="ai-bullet">{{ b.text }}</p>
                <p v-else class="ai-text">{{ b.text }}</p>
              </template>
              <span v-if="histAiTyping" class="tw-caret"></span>
            </div>
            <div v-else class="empty-mini">点击按钮生成该周 AI 学习总结</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>

import { toast } from '../toast'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../api'
import { useTypewriter } from '../useTypewriter'

const { text: aiText, typing: aiTyping, type: typeAi } = useTypewriter()
const { text: histAiText, typing: histAiTyping, type: typeHistAi } = useTypewriter()

const data = ref({ trend: [], total: 0, accuracy: 0, bySubject: [], weak: [], exams: [], checkinDays: 0, lastWeek: { total: 0, accuracy: 0, checkinDays: 0, examCount: 0 } })
const loading = ref(true)
const loadFailed = ref(false)
const aiReply = ref('')
const aiLoading = ref(false)
const history = ref([])
const historyLoading = ref(true)
const historyFailed = ref(false)
const historyView = ref(null)
const histAiLoading = ref(false)

const lastWeek = computed(() => data.value.lastWeek || { total: 0, accuracy: 0, checkinDays: 0, examCount: 0 })

function deltaClass(d) {
  if (d > 0) return 'up'
  if (d < 0) return 'down'
  return 'flat'
}

function deltaText(d) {
  if (d > 0) return '↑ +' + d
  if (d < 0) return '↓ ' + d
  return '— 持平'
}

const maxTotal = computed(() => Math.max(1, ...data.value.trend.map(t => t.total)))

function barHeight(n) {
  return Math.max(8, Math.round((n / maxTotal.value) * 130)) + 'px'
}

function dayLabel(d) {
  const date = new Date(d + 'T00:00:00')
  const week = ['日', '一', '二', '三', '四', '五', '六']
  return '周' + week[date.getDay()]
}

const aiBlocks = computed(() => {
  if (!aiText.value) return []
  return aiText.value.split('\n').map(line => {
    let t = line.trim()
    if (!t) return { type: 'blank', text: '' }
    if (/^#{1,6}\s*/.test(t) || /^【.*】/.test(t)) {
      return { type: 'heading', text: t.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '') }
    }
    if (/^[-•·]/.test(t)) return { type: 'bullet', text: t.replace(/^[-•·]\s*/, '').replace(/\*\*/g, '') }
    return { type: 'text', text: t.replace(/\*\*/g, '') }
  }).filter(b => b.type !== 'blank')
})

const histAiBlocks = computed(() => {
  const s = histAiText.value
  if (!s) return []
  return s.split('\n').map(line => {
    let t = line.trim()
    if (!t) return { type: 'blank', text: '' }
    if (/^#{1,6}\s*/.test(t) || /^【.*】/.test(t)) {
      return { type: 'heading', text: t.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '') }
    }
    if (/^[-•·]/.test(t)) return { type: 'bullet', text: t.replace(/^[-•·]\s*/, '').replace(/\*\*/g, '') }
    return { type: 'text', text: t.replace(/\*\*/g, '') }
  }).filter(b => b.type !== 'blank')
})

const hmMaxTotal = computed(() => Math.max(1, ...(historyView.value?.trend || []).map(t => t.total)))

function hmBar(n) {
  return Math.max(6, Math.round((n / hmMaxTotal.value) * 90)) + 'px'
}

async function loadHistory() {
  historyLoading.value = true
  historyFailed.value = false
  try {
    history.value = await api.get('/report/weekly/history')
  } catch (e) {
    historyFailed.value = true
  } finally {
    historyLoading.value = false
  }
}

async function openHistory(h) {
  try {
    const d = await api.get(`/report/weekly/${h.id}`)
    historyView.value = { ...d, ...(d.data || {}) }
    histAiText.value = historyView.value.ai_summary || ''
  } catch (e) {
    toast(e.message || '加载失败，请稍后重试', 'error')
  }
}

async function genHistoryAi() {
  if (histAiLoading.value || !historyView.value) return
  histAiLoading.value = true
  try {
    const r = await api.post(`/report/weekly/${historyView.value.id}/ai`, {})
    if (r.configured === false) {
      historyView.value.ai_summary = 'AI 服务尚未配置，请在服务端 .env 中设置 DEEPSEEK_API_KEY 后使用。'
      histAiText.value = historyView.value.ai_summary
    } else {
      historyView.value.ai_summary = r.reply
      typeHistAi(r.reply)
      const h = history.value.find(x => x.id === historyView.value.id)
      if (h) h.hasAi = true
    }
  } catch (e) {
    toast(e.message || '生成失败，请稍后重试', 'error')
  } finally {
    histAiLoading.value = false
  }
}

async function genAi() {
  if (aiLoading.value) return
  aiLoading.value = true
  try {
    const r = await api.post('/report/weekly/ai', {})
    if (r.configured === false) {
      aiReply.value = 'AI 服务尚未配置，请在服务端 .env 中设置 DEEPSEEK_API_KEY 后使用。'
      aiText.value = aiReply.value
    } else {
      aiReply.value = r.reply
      typeAi(r.reply)
    }
  } catch (e) {
    aiReply.value = e.message || '生成失败，请稍后重试'
    aiText.value = aiReply.value
  } finally {
    aiLoading.value = false
  }
}

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// 导出周报 PDF：打开打印友好版，浏览器「另存为 PDF」
function exportPdf() {
  const d = data.value
  const lw = lastWeek.value

  const maxTrend = Math.max(1, ...d.trend.map(t => t.total))
  const trendBars = d.trend.length
    ? d.trend.map(t => {
        const h = Math.max(4, Math.round((t.total / maxTrend) * 120))
        return `<div class="tcol"><div class="tbar-wrap"><div class="tbar" style="height:${h}px"><span>${t.total}</span></div></div><div class="tday">${escHtml(dayLabel(t.d))}</div></div>`
      }).join('')
    : '<p class="muted">本周暂无刷题记录</p>'

  const subjRows = d.bySubject.length
    ? d.bySubject.map(s => `
      <div class="row"><span class="lbl">${escHtml(s.subject)}</span>
      <div class="track"><div class="fill" style="width:${s.accuracy}%"></div></div>
      <span class="val">${s.accuracy}%</span><span class="cnt">${s.total} 题</span></div>`).join('')
    : '<p class="muted">暂无科目数据</p>'

  const weakTags = d.weak.length
    ? d.weak.map(w => `<span class="tag">${escHtml(w)}</span>`).join('')
    : '<p class="muted">本周没有明显薄弱点，继续保持！</p>'

  const examRows = d.exams.length
    ? d.exams.map(e => `<div class="exam-row"><span class="d">${escHtml((e.created_at || '').replace('T', ' ').slice(0, 16))}</span><span class="s">${e.score} 分</span></div>`).join('')
    : '<p class="muted">本周暂无模拟考试</p>'

  const aiText = aiReply.value
    ? aiReply.value.split('\n').map(line => {
        const t = line.trim()
        if (!t) return ''
        if (/^#{1,6}\s*/.test(t) || /^【.*】/.test(t)) return `<h4>${escHtml(t.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, ''))}</h4>`
        if (/^[-•·]/.test(t)) return `<p class="bullet">${escHtml(t.replace(/^[-•·]\s*/, '').replace(/\*\*/g, ''))}</p>`
        return `<p>${escHtml(t.replace(/\*\*/g, ''))}</p>`
      }).join('')
    : '<p class="muted">尚未生成 AI 周报总结，可在页面点击「生成周报」后再导出。</p>'

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>学习周报 - 云南春招智能学习平台</title>
<style>
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; max-width: 820px; margin: 0 auto; padding: 32px 24px; color: #1f2937; line-height: 1.7; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  .sub { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  .sec { border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; page-break-inside: avoid; }
  .sec h2 { font-size: 16px; margin: 0 0 14px; padding-bottom: 8px; border-bottom: 2px solid #4f5ff0; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .cell { text-align: center; background: #f9fafb; border-radius: 10px; padding: 14px 8px; }
  .cell .num { font-size: 22px; font-weight: 800; color: #4f5ff0; }
  .cell .lbl { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .cmp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .cmp { background: #f9fafb; border-radius: 10px; padding: 12px 10px; text-align: center; }
  .cmp .lbl { font-size: 12px; color: #6b7280; }
  .cmp .now { font-size: 18px; font-weight: 800; color: #1f2937; }
  .cmp .last { font-size: 12px; color: #9ca3af; }
  .cmp .delta.up { color: #0da678; font-weight: 700; font-size: 12px; }
  .cmp .delta.down { color: #e11d48; font-weight: 700; font-size: 12px; }
  .cmp .delta.flat { color: #9ca3af; font-size: 12px; }
  .trend { display: flex; align-items: flex-end; gap: 8px; height: 150px; }
  .tcol { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; }
  .tbar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
  .tbar { width: 60%; max-width: 36px; border-radius: 6px 6px 0 0; background: #4f5ff0; display: flex; align-items: flex-start; justify-content: center; }
  .tbar span { font-size: 0.72rem; color: #fff; font-weight: 700; padding-top: 2px; }
  .tday { font-size: 12px; color: #6b7280; }
  .row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; font-size: 13px; }
  .row .lbl { width: 90px; flex-shrink: 0; font-weight: 600; }
  .row .track { flex: 1; height: 10px; background: #f0f2f8; border-radius: 999px; overflow: hidden; }
  .row .fill { height: 100%; background: #4f5ff0; border-radius: 999px; }
  .row .val { width: 44px; text-align: right; font-weight: 700; color: #4f5ff0; }
  .row .cnt { width: 52px; text-align: right; color: #9ca3af; font-size: 12px; }
  .tags { display: flex; flex-wrap: wrap; gap: 8px; }
  .tag { padding: 4px 12px; border-radius: 999px; background: #fef3c7; color: #b45309; font-size: 12px; }
  .exam-row { display: flex; gap: 16px; padding: 8px 0; border-bottom: 1px dashed #e5e7eb; font-size: 13px; }
  .exam-row .d { color: #6b7280; }
  .exam-row .s { font-weight: 700; color: #4f5ff0; margin-left: auto; }
  .ai-body h4 { font-size: 14px; color: #4f5ff0; margin: 12px 0 6px; }
  .ai-body p { font-size: 13px; margin-bottom: 4px; }
  .ai-body .bullet { padding-left: 14px; position: relative; }
  .ai-body .bullet::before { content: '•'; position: absolute; left: 2px; color: #4f5ff0; }
  .muted { color: #9ca3af; font-size: 13px; }
  .note { font-size: 12px; color: #9ca3af; margin-top: 16px; line-height: 1.8; }
  @media print {
    body { padding: 0; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sec { break-inside: avoid; }
  }
  @page { margin: 14mm 12mm; }
</style>
</head>
<body>
  <h1>我的学习周报</h1>
  <div class="sub">云南春招智能学习平台 · 近七天学习数据 · 生成时间 ${new Date().toLocaleString('zh-CN', { hour12: false })}</div>

  <div class="sec">
    <h2>本周概览</h2>
    <div class="grid">
      <div class="cell"><div class="num">${d.total || 0}</div><div class="lbl">本周刷题</div></div>
      <div class="cell"><div class="num">${d.accuracy || 0}%</div><div class="lbl">正确率</div></div>
      <div class="cell"><div class="num">${d.checkinDays || 0}</div><div class="lbl">打卡天数</div></div>
      <div class="cell"><div class="num">${d.exams.length}</div><div class="lbl">模拟考试</div></div>
    </div>
  </div>

  <div class="sec">
    <h2>环比上周</h2>
    <div class="cmp-grid">
      <div class="cmp"><div class="lbl">刷题量</div><div class="now">${d.total || 0}</div><div class="last">上周 ${lw.total || 0}</div><div class="delta ${deltaClass(d.total - lw.total)}">${escHtml(deltaText(d.total - lw.total))}</div></div>
      <div class="cmp"><div class="lbl">正确率</div><div class="now">${d.accuracy || 0}%</div><div class="last">上周 ${lw.accuracy || 0}%</div><div class="delta ${deltaClass(d.accuracy - lw.accuracy)}">${escHtml(deltaText(d.accuracy - lw.accuracy))}</div></div>
      <div class="cmp"><div class="lbl">打卡天数</div><div class="now">${d.checkinDays || 0}</div><div class="last">上周 ${lw.checkinDays || 0}</div><div class="delta ${deltaClass(d.checkinDays - lw.checkinDays)}">${escHtml(deltaText(d.checkinDays - lw.checkinDays))}</div></div>
      <div class="cmp"><div class="lbl">模拟考试</div><div class="now">${d.exams.length}</div><div class="last">上周 ${lw.examCount || 0}</div><div class="delta ${deltaClass(d.exams.length - lw.examCount)}">${escHtml(deltaText(d.exams.length - lw.examCount))}</div></div>
    </div>
  </div>

  <div class="sec">
    <h2>每日刷题趋势</h2>
    <div class="trend">${trendBars}</div>
  </div>

  <div class="sec">
    <h2>科目表现</h2>
    ${subjRows}
  </div>

  <div class="sec">
    <h2>本周薄弱知识点</h2>
    <div class="tags">${weakTags}</div>
  </div>

  <div class="sec">
    <h2>模拟考试</h2>
    ${examRows}
  </div>

  <div class="sec">
    <h2>AI 周报总结</h2>
    <div class="ai-body">${aiText}</div>
  </div>

  <div class="note">注：本报告数据来源于平台学习记录，分数预测与学习建议仅供参考，实际成绩以云南省招生考试院官方公布为准。</div>
  <script>window.onload = () => setTimeout(() => window.print(), 300)<\/script>
</body>
</html>`
  const win = window.open('', '_blank')
  if (!win) { toast('浏览器阻止了弹窗，请允许后重试', 'error'); return }
  win.document.write(html)
  win.document.close()
}

async function load() {
  loadFailed.value = false
  loading.value = true
  try {
    data.value = await api.get('/report/weekly')
    loadHistory()
  } catch (e) {
    toast(e.message || '加载失败，请稍后重试', 'error')
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  const onKey = e => { if (e.key === 'Escape') historyView.value = null }
  window.addEventListener('keydown', onKey)
  onUnmounted(() => window.removeEventListener('keydown', onKey))
  load()
})
</script>

<style scoped>
.report-page { max-width: 820px; }
.page-head { text-align: center; margin-bottom: 24px; }
.page-head h2 { font-size: 1.6rem; }
.page-head p { color: var(--muted); margin-top: 4px; }
.head-actions { margin-top: 12px; display: flex; justify-content: center; }

.ov-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 20px; margin-bottom: 16px; }
.ov-item { text-align: center; padding: 10px 4px; transition: transform 0.25s var(--ease); position: relative; }
.ov-item::after {
  content: ''; position: absolute; right: 0; top: 12%; bottom: 12%; width: 1px;
  background: linear-gradient(180deg, transparent, var(--rule), transparent);
}
.ov-item:last-child::after { display: none; }
.ov-item:hover { transform: translateY(-2px); }
.ov-num {
  font-size: 1.7rem; font-weight: 800; font-variant-numeric: tabular-nums;
  background: var(--grad-accent); -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.ov-lbl { color: var(--muted); font-size: 0.82rem; margin-top: 4px; }

/* 骨架屏 */
.sk-wr-num { width: 56px; height: 26px; margin: 0 auto; }
.sk-wr-lbl { width: 72px; height: 12px; margin: 8px auto 0; }
.sk-wr-title { width: 140px; height: 18px; }
.sk-wr-sub { width: 200px; height: 12px; margin-top: 8px; }
.sk-wr-cmp-lbl { width: 64px; height: 12px; }
.sk-wr-cmp-num { width: 90px; height: 24px; margin-top: 10px; }
.sk-wr-cmp-bar { width: 100%; height: 8px; border-radius: 999px; margin-top: 12px; }

.cmp-card { padding: 22px 26px; margin-bottom: 16px; }
.cmp-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.cmp-head h3 { font-size: 1.12rem; }
.cmp-sub { font-size: 0.82rem; color: var(--muted); }
.cmp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.cmp-item {
  padding: 14px 16px; border: 1px solid var(--rule); border-radius: 12px; background: var(--surface);
  transition: transform 0.25s var(--ease), box-shadow 0.25s var(--ease), border-color 0.25s var(--ease);
}
.cmp-item:hover { transform: translateY(-2px); box-shadow: var(--shadow-sm); border-color: rgba(79, 95, 240, 0.22); }
.cmp-lbl { font-size: 0.82rem; color: var(--muted); margin-bottom: 8px; }
.cmp-nums { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.cmp-nums strong {
  font-size: 1.6rem; font-weight: 800; font-variant-numeric: tabular-nums;
  background: var(--grad-accent); -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.cmp-last { font-size: 0.75rem; color: var(--muted); }
.cmp-delta { margin-top: 8px; font-size: 0.85rem; font-weight: 700; }
.cmp-delta.up { color: var(--green); }
.cmp-delta.down { color: var(--red); }
.cmp-delta.flat { color: var(--muted); font-weight: 500; }

.card h3 { font-size: 1.05rem; margin-bottom: 14px; }

.trend-card, .sub-card, .weak-card { padding: 22px 26px; margin-bottom: 16px; }
.trend-chart { display: flex; align-items: flex-end; gap: 10px; height: 160px; }
.trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; }
.tc-bar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
.tc-bar {
  width: 60%; max-width: 40px; border-radius: 8px 8px 0 0;
  background: linear-gradient(180deg, #6b58e8 0%, #4f5ff0 100%);
  display: flex; align-items: flex-start; justify-content: center; padding-top: 4px;
  transition: height 0.4s var(--ease);
  box-shadow: 0 3px 8px rgba(79, 95, 240, 0.2);
}
.tc-val { font-size: 0.75rem; font-weight: 700; color: #fff; }
.tc-day { font-size: 0.78rem; color: var(--muted); }

.sub-list { display: flex; flex-direction: column; gap: 12px; }
.sub-row { display: flex; align-items: center; gap: 12px; }
.sub-name { width: 80px; font-size: 0.9rem; font-weight: 600; flex-shrink: 0; }
.sub-track { flex: 1; height: 10px; border-radius: 999px; background: var(--rule); overflow: hidden; }
.sub-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #4f5ff0, #6b58e8); }
.sub-num { width: 44px; text-align: right; font-weight: 700; color: var(--accent); }
.sub-count { width: 52px; text-align: right; font-size: 0.8rem; color: var(--muted); }

.weak-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.weak-tag { padding: 6px 12px; border-radius: 999px; background: var(--amber-soft); color: #b45309; font-size: 0.85rem; font-weight: 500; }

.empty-mini { color: var(--muted); font-size: 0.88rem; padding: 12px 0; }
.hist-retry { margin-left: 8px; padding: 2px 10px; font-size: 0.8rem; color: var(--accent); border: 1px solid var(--accent); border-radius: 999px; background: transparent; cursor: pointer; }
.wk-error { text-align: center; padding: 48px 20px; }
.wk-err-icon { width: 52px; height: 52px; margin: 0 auto 12px; color: var(--accent); }
.wk-err-icon svg { width: 100%; height: 100%; }
.wk-err-title { font-size: 1.05rem; font-weight: 600; margin: 0; }
.wk-err-sub { display: block; color: var(--muted); font-size: 0.85rem; margin-top: 6px; }
.wk-retry { margin-top: 20px; }

.ai-report { padding: 22px 26px; }
.ai-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.ai-sub { color: var(--muted); font-size: 0.85rem; margin-top: 4px; }
.ai-loading { text-align: center; padding: 36px 20px; }
.ai-loading p { color: var(--muted); margin-top: 14px; }
.ai-empty { text-align: center; color: var(--muted); font-size: 0.9rem; padding: 22px 0; }
.ai-body { line-height: 1.9; }
.ai-h { font-size: 1rem; color: var(--accent); margin: 14px 0 8px; padding-left: 10px; border-left: 4px solid var(--accent); }
.ai-h:first-child { margin-top: 0; }
.ai-bullet { padding-left: 18px; position: relative; margin-bottom: 6px; }
.ai-bullet::before { content: '•'; position: absolute; left: 6px; color: var(--accent); }
.ai-text { color: var(--ink); margin-bottom: 6px; }

.hist-card { padding: 22px 26px; margin-top: 16px; }
.hist-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.hist-head h3 { font-size: 1.05rem; margin-bottom: 4px; }
.hist-sub { color: var(--muted); font-size: 0.82rem; }
.hist-count { font-size: 0.85rem; color: var(--accent); font-weight: 700; }
.hist-list { display: flex; flex-direction: column; gap: 10px; }
.hist-item {
  display: flex; align-items: center; gap: 14px; padding: 14px 16px;
  border: 1px solid var(--rule); border-radius: 12px; cursor: pointer;
  transition: border-color 0.2s var(--ease), background-color 0.2s var(--ease), transform 0.2s var(--ease), box-shadow 0.2s var(--ease);
}
.hist-item:hover { border-color: var(--accent); background: var(--accent-soft); box-shadow: var(--shadow-xs); }
.hist-item:active { transform: scale(0.985); }
.sk-hist { cursor: default; }
.sk-hist:hover { border-color: var(--rule); background: transparent; }
.sk-hist-week { width: 180px; height: 16px; flex-shrink: 0; }
.sk-hist-stats { display: flex; gap: 14px; flex: 1; flex-wrap: wrap; }
.sk-hist-stat { width: 90px; height: 13px; }
.sk-hist-stat.short { width: 60px; }
.hist-week { font-weight: 700; font-size: 0.95rem; flex-shrink: 0; }
.hist-stats { display: flex; gap: 14px; flex: 1; flex-wrap: wrap; }
.hs-item { font-size: 0.82rem; color: var(--muted); }
.hs-item b { color: var(--accent); font-size: 0.95rem; }
.hist-ai-tag { font-size: 0.75rem; font-weight: 700; color: var(--accent-2); background: var(--accent2-soft); padding: 2px 8px; border-radius: 999px; }
.hist-arrow { color: var(--muted); }

.hist-mask {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
  animation: modalFadeIn 0.22s var(--ease-out) both;
}
.hist-modal {
  background: var(--surface); border-radius: 18px; max-width: 620px; width: 100%;
  max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);
  animation: modalPopIn 0.3s var(--ease-out) both;
}
.hist-modal-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--rule); }
.hist-modal-head h3 { font-size: 1.1rem; margin-bottom: 2px; }
.hist-close {
  background: none; border: none; font-size: 1.05rem; color: var(--muted);
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  transition: background-color 0.2s var(--ease), color 0.2s var(--ease), transform 0.15s var(--ease);
}
.hist-close:hover { background: var(--accent-soft); color: var(--accent); }
.hist-close:active { transform: scale(0.92); }
.hist-modal-body { flex: 1; overflow-y: auto; padding: 18px 22px; }
.hm-ov { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
.hm-cell { text-align: center; background: var(--accent-soft); border-radius: 12px; padding: 14px 6px; }
.hm-cell b { display: block; font-size: 1.4rem; font-weight: 800; color: var(--accent); }
.hm-cell span { font-size: 0.78rem; color: var(--muted); }
.hm-sec { margin-bottom: 18px; }
.hm-sec h4 { font-size: 0.98rem; margin-bottom: 10px; color: var(--ink); }
.hm-trend { display: flex; align-items: flex-end; gap: 8px; height: 110px; }
.hm-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; }
.hm-bar { width: 60%; max-width: 30px; border-radius: 6px 6px 0 0; background: var(--accent); }
.hm-day { font-size: 0.75rem; color: var(--muted); }
.hm-sub { display: flex; flex-direction: column; gap: 10px; }
.hm-sub-row { display: flex; align-items: center; gap: 10px; }
.hm-sub-name { width: 76px; font-size: 0.88rem; font-weight: 600; flex-shrink: 0; }
.hm-sub-track { flex: 1; height: 9px; border-radius: 999px; background: var(--rule); overflow: hidden; }
.hm-sub-fill { height: 100%; border-radius: 999px; background: var(--accent); }
.hm-sub-num { width: 40px; text-align: right; font-weight: 700; color: var(--accent); }
.hm-ai-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.hm-ai-head h4 { margin-bottom: 0; }

@media (max-width: 768px) {
  .ov-grid { grid-template-columns: repeat(2, 1fr); }
  .cmp-grid { grid-template-columns: repeat(2, 1fr); }
  .hm-ov { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .page-head h2 { font-size: 1.3rem; }
  .page-head p { font-size: 0.82rem; }
  .ov-grid { grid-template-columns: repeat(2, 1fr); padding: 14px; gap: 10px; }
  .ov-num { font-size: 1.35rem; }
  .ov-lbl { font-size: 0.76rem; }
  .cmp-card { padding: 16px 14px; }
  .cmp-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .cmp-item { padding: 12px 14px; }
  .cmp-nums strong { font-size: 1.3rem; }
  .cmp-lbl { font-size: 0.78rem; }
  .trend-card, .sub-card, .weak-card, .ai-report, .hist-card { padding: 16px 14px; }
  .trend-chart { height: 130px; gap: 6px; }
  .tc-val { font-size: 0.75rem; }
  .tc-day { font-size: 0.75rem; }
  .sub-name { width: 64px; font-size: 0.82rem; }
  .sub-num { width: 38px; font-size: 0.84rem; }
  .sub-count { width: 44px; font-size: 0.75rem; }
  .weak-tag { padding: 5px 10px; font-size: 0.8rem; }
  .ai-body { font-size: 0.88rem; }
  .ai-h { font-size: 0.95rem; }
  .hist-item { flex-wrap: wrap; padding: 12px 14px; gap: 10px; }
  .hist-stats { width: 100%; gap: 10px; }
  .hist-ai-tag { font-size: 0.75rem; }
  .hist-mask { padding: 10px; }
  .hist-modal { max-height: 95vh; border-radius: 16px; }
  .hist-modal-head { padding: 14px 16px; }
  .hist-modal-body { padding: 14px; }
  .hm-ov { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .hm-cell { padding: 10px 4px; }
  .hm-cell b { font-size: 1.2rem; }
  .hm-cell span { font-size: 0.75rem; }
  .hm-sub-name { width: 60px; font-size: 0.82rem; }
  .hm-trend { height: 90px; }
  .hm-day { font-size: 0.75rem; }
}
@media (max-width: 400px) {
  .ov-grid { grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px; }
  .ov-num { font-size: 1.15rem; }
  .cmp-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
  .cmp-item { padding: 10px 10px; }
  .cmp-nums strong { font-size: 1.1rem; }
  .sub-name { width: 56px; font-size: 0.78rem; }
}
</style>
