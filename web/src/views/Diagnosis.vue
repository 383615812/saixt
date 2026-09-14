<template>
  <div class="container diag-page">
    <div class="page-head">
      <h2>学情诊断</h2>
      <p>基于你的练习与模考数据，定位薄弱点并给出今日学习建议</p>
    </div>

    <template v-if="loading">
      <div class="card ov-card skeleton-card">
        <div class="skeleton sk-stat" v-for="i in 4" :key="i"></div>
      </div>
      <div class="card sk-block"></div>
    </template>

    <template v-else>
      <!-- 总览 -->
      <div class="card ov-card">
        <div class="ov-stat">
          <div class="num">{{ d.overall.total }}</div>
          <div class="lbl">累计练习</div>
        </div>
        <div class="ov-stat">
          <div class="num" :style="{ color: accColor(d.overall.accuracy) }">{{ d.overall.accuracy }}%</div>
          <div class="lbl">整体正确率</div>
        </div>
        <div class="ov-stat">
          <div class="num">{{ d.exam.examCount }}</div>
          <div class="lbl">模考场次</div>
        </div>
        <div class="ov-stat">
          <div class="num" :style="{ color: examColor(d.exam.daysSinceLast) }">
            {{ d.exam.daysSinceLast == null ? '—' : d.exam.daysSinceLast + '天' }}
          </div>
          <div class="lbl">距上次模考</div>
        </div>
      </div>

      <!-- 今日建议 -->
      <div class="card suggest-card">
        <div class="card-head">
          <h3>今日学习建议</h3>
          <span class="card-tag">{{ d.suggestions.length }} 条</span>
        </div>
        <div v-if="!d.suggestions.length" class="empty-mini">暂无建议，保持节奏继续加油</div>
        <div
          v-for="(s, i) in d.suggestions"
          :key="i"
          class="suggest-item"
          :class="'lv-' + s.level"
        >
          <span class="sg-icon">
            <svg v-if="s.level === 'warn'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <svg v-else-if="s.level === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          </span>
          <span class="sg-text">{{ s.text }}</span>
          <router-link v-if="s.action" :to="s.action.to" class="btn btn-sm sg-btn">{{ s.action.label }}</router-link>
        </div>
      </div>

      <!-- 错题本 & 冲刺 -->
      <div class="card sprint-card">
        <div class="card-head">
          <h3>错题本 &amp; 冲刺</h3>
          <span class="card-tag">近 7 天</span>
        </div>
        <div class="sp-grid">
          <div class="sp-stat">
            <div class="num" :style="{ color: d.wrongBook.pending > 0 ? 'var(--red, #e11d48)' : 'var(--green, #0da678)' }">{{ d.wrongBook.pending }}</div>
            <div class="lbl">待巩固错题</div>
          </div>
          <div class="sp-stat">
            <div class="num" style="color: var(--green, #0da678)">{{ d.wrongBook.mastered }}</div>
            <div class="lbl">累计移出</div>
          </div>
          <div class="sp-stat">
            <div class="num">{{ d.sprint.week.count }}</div>
            <div class="lbl">冲刺轮数</div>
          </div>
          <div class="sp-stat">
            <div class="num" :style="{ color: d.sprint.week.total ? accColor(d.sprint.week.accuracy) : 'var(--muted)' }">
              {{ d.sprint.week.total ? d.sprint.week.accuracy + '%' : '—' }}
            </div>
            <div class="lbl">冲刺正确率</div>
          </div>
        </div>
        <div v-if="d.wrongTrend.series.length" class="wt-block">
          <div class="wt-head">
            <span class="wt-title">近 {{ d.wrongTrend.days }} 天错题清除</span>
            <span class="wt-sum">
              <em class="wt-add">+{{ d.wrongTrend.added }}</em>
              <em class="wt-mst">-{{ d.wrongTrend.mastered }}</em>
            </span>
          </div>
          <div class="wt-bars">
            <div
              v-for="p in d.wrongTrend.series"
              :key="p.date"
              class="wt-col"
              :title="p.date + '：待巩固 ' + p.pending + ' 道（累计清除 ' + p.masteredTotal + ' / 当日新增 ' + p.added + ' / 当日清除 ' + p.mastered + '）'"
            >
              <span class="wt-bar-pending" :style="{ height: wtPct(p.pending) + '%' }"></span>
              <span class="wt-bar-mst" :style="{ height: wtPct(p.masteredTotal) + '%' }"></span>
            </div>
          </div>
          <div class="wt-legend">
            <span class="lg"><i class="lg-dot lg-pending"></i>待巩固</span>
            <span class="lg"><i class="lg-dot lg-mst"></i>已清除</span>
            <span class="wt-note">绿色段越长、红色段越薄，说明错题清得越干净</span>
          </div>
        </div>
        <div class="sp-foot">
          <span class="sp-note">{{ sprintNote }}</span>
          <router-link to="/wrong-book" class="btn btn-sm sp-btn">去错题冲刺 →</router-link>
        </div>
      </div>

      <!-- 科目掌握 -->
      <div class="card subj-card">
        <div class="card-head">
          <h3>科目掌握度</h3>
          <span class="card-tag">{{ d.bySubject.length }} 科</span>
        </div>
        <div v-if="!d.bySubject.length" class="empty-mini">还没有练习数据，去做题后这里会展示各科目掌握度</div>
        <div v-else class="subj-body">
          <RadarChart :data="radarData" class="subj-radar" />
          <div class="subj-list">
            <div v-for="s in d.bySubject" :key="s.subject" class="subj-row">
              <span class="subj-name">{{ s.subject }}</span>
              <span class="subj-bar"><i :style="{ width: s.accuracy + '%', background: accColor(s.accuracy) }"></i></span>
              <span class="subj-acc" :style="{ color: accColor(s.accuracy) }">{{ s.accuracy }}%</span>
              <span class="subj-total">{{ s.total }}题</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 薄弱章节 -->
      <div class="card weak-card">
        <div class="card-head">
          <h3>薄弱章节 Top</h3>
          <span class="card-tag">{{ d.weakChapters.length }} 个</span>
        </div>
        <div v-if="!d.weakChapters.length" class="empty-mini">暂无明显薄弱章节，或练习数据还不足（每个章节需 ≥3 题）</div>
        <div v-else class="weak-list">
          <div v-for="w in d.weakChapters" :key="w.subject + ':' + w.chapter" class="weak-item">
            <span class="weak-name">{{ w.subject }} · {{ w.chapter }}</span>
            <span class="weak-bar"><i :style="{ width: w.accuracy + '%' }"></i></span>
            <span class="weak-acc" :style="{ color: accColor(w.accuracy) }">{{ w.accuracy }}%</span>
            <span class="weak-total">{{ w.total }}题</span>
          </div>
          <router-link to="/paper" class="btn btn-primary weak-btn">去薄弱专项突破 →</router-link>
        </div>
      </div>

      <!-- 14 天趋势 -->
      <div class="card trend-card">
        <div class="card-head">
          <h3>近 14 天答题趋势</h3>
          <span class="card-tag">正确率</span>
        </div>
        <div class="trend-bars">
          <div v-for="t in d.trend" :key="t.date" class="trend-col" :title="t.date + '：' + t.total + '题 / 正确率' + t.accuracy + '%'">
            <span class="trend-val" v-if="t.total">{{ t.accuracy }}%</span>
            <span class="trend-bar" :style="{ height: (t.total ? t.accuracy : 0) + '%', background: accColor(t.accuracy) }"></span>
            <span class="trend-date">{{ t.date.slice(5) }}</span>
          </div>
        </div>
        <p class="trend-note">柱状高度代表当日正确率，悬停查看题量与日期</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { toast } from '../toast'
import RadarChart from '../components/RadarChart.vue'

const loading = ref(true)
const d = ref({
  overall: { total: 0, correct: 0, wrong: 0, accuracy: 0 },
  bySubject: [],
  weakChapters: [],
  trend: [],
  exam: { examCount: 0, lastExamAt: null, daysSinceLast: null },
  dueToday: 0,
  wrongBook: { pending: 0, mastered: 0 },
  wrongTrend: { days: 30, series: [], added: 0, mastered: 0, net: 0 },
  sprint: { count: 0, total: 0, correct: 0, accuracy: 0, week: { count: 0, total: 0, correct: 0, accuracy: 0 } },
  suggestions: []
})

function accColor(a) {
  if (a >= 75) return 'var(--green, #0da678)'
  if (a >= 60) return 'var(--accent, #4f5ff0)'
  return 'var(--red, #e11d48)'
}
function examColor(days) {
  if (days == null) return 'var(--muted)'
  if (days >= 7) return 'var(--red, #e11d48)'
  if (days >= 3) return 'var(--amber, #d97706)'
  return 'var(--green, #0da678)'
}

const radarData = computed(() =>
  d.value.bySubject.map(s => ({
    label: s.subject,
    value: s.accuracy,
    color: accColor(s.accuracy)
  }))
)

const sprintNote = computed(() => {
  const w = d.value.sprint.week
  if (w.total) return `本周冲刺 ${w.total} 题，答对 ${w.correct} 题`
  if (d.value.wrongBook.pending > 0) return `近 7 天还没做错题冲刺，集中清一波吧`
  return '错题本暂无待巩固题目，保持得不错'
})

const wtMax = computed(() => {
  const arr = d.value.wrongTrend.series || []
  return Math.max(1, ...arr.map(p => p.total || p.pending + (p.masteredTotal || 0)))
})
function wtPct(v) {
  return Math.round((v / wtMax.value) * 100)
}

async function load() {
  loading.value = true
  try {
    d.value = await api.get('/diagnose')
  } catch (e) {
    toast(e.message || '加载学情诊断失败', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.diag-page { padding-bottom: 40px; }
.page-head { margin-bottom: 20px; }
.page-head h2 { font-size: 1.6rem; }
.page-head p { color: var(--muted); margin-top: 4px; }

.card { padding: 20px 22px; margin-bottom: 16px; }
.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.card-head h3 { font-size: 1.05rem; }
.card-tag { font-size: 0.8rem; color: var(--accent); font-weight: 700; background: var(--accent-soft, rgba(79,95,240,0.1)); padding: 3px 10px; border-radius: 999px; }
.empty-mini { color: var(--muted); font-size: 0.86rem; padding: 8px 0; }

/* 总览 */
.ov-card { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align: center; }
.ov-stat { display: flex; flex-direction: column; gap: 4px; padding: 6px; }
.ov-stat .num { font-size: 1.7rem; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }
.ov-stat .lbl { font-size: 0.8rem; color: var(--muted); }

/* 建议 */
.suggest-card .suggest-item {
  display: flex; align-items: center; gap: 12px; padding: 13px 0;
  border-bottom: 1px dashed var(--rule, #e7e9f0);
}
.suggest-card .suggest-item:last-child { border-bottom: 0; }
.sg-icon { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0; }
.sg-icon svg { width: 17px; height: 17px; }
.lv-warn .sg-icon { background: var(--amber-soft, rgba(217,119,6,0.1)); color: var(--amber, #d97706); }
.lv-info .sg-icon { background: var(--accent-soft, rgba(79,95,240,0.1)); color: var(--accent, #4f5ff0); }
.lv-success .sg-icon { background: var(--green-soft, rgba(13,166,120,0.1)); color: var(--green, #0da678); }
.sg-text { flex: 1; font-size: 0.9rem; color: var(--ink-soft); line-height: 1.5; }
.sg-btn { flex-shrink: 0; white-space: nowrap; }

/* 错题本 & 冲刺 */
.sp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align: center; }
.sp-stat { display: flex; flex-direction: column; gap: 4px; padding: 6px; }
.sp-stat .num { font-size: 1.5rem; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }
.sp-stat .lbl { font-size: 0.78rem; color: var(--muted); }
.sp-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--rule, #e7e9f0); }
.sp-note { font-size: 0.84rem; color: var(--muted); line-height: 1.5; }
.sp-btn { flex-shrink: 0; white-space: nowrap; }

/* 错题清除趋势 */
.wt-block { margin-top: 14px; }
.wt-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.wt-title { font-size: 0.84rem; font-weight: 600; color: var(--ink-soft); }
.wt-sum { display: flex; gap: 10px; font-size: 0.8rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.wt-sum em { font-style: normal; }
.wt-add { color: var(--red, #e11d48); }
.wt-mst { color: var(--green, #0da678); }
.wt-bars { display: flex; align-items: flex-end; gap: 3px; height: 64px; }
.wt-col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; min-width: 0; }
.wt-bar-pending { width: 100%; min-height: 1px; background: var(--red, #e11d48); opacity: 0.8; transition: height 0.5s var(--ease); }
.wt-bar-mst { width: 100%; min-height: 1px; background: var(--green, #0da678); opacity: 0.8; border-radius: 3px 3px 0 0; transition: height 0.5s var(--ease); }
.wt-legend { display: flex; align-items: center; gap: 12px; margin-top: 8px; font-size: 0.76rem; color: var(--muted); }
.wt-legend .lg { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; }
.wt-legend .lg-dot { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
.lg-pending { background: var(--red, #e11d48); }
.lg-mst { background: var(--green, #0da678); }
.wt-note { margin-left: auto; font-size: 0.74rem; color: var(--muted-2); }

/* 科目 */
.subj-body { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: center; }
.subj-radar { min-width: 0; }
.subj-list { display: flex; flex-direction: column; gap: 10px; }
.subj-row { display: flex; align-items: center; gap: 10px; font-size: 0.84rem; }
.subj-name { width: 84px; flex-shrink: 0; color: var(--ink); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.subj-bar { flex: 1; height: 8px; background: var(--rule-soft, #eef0f5); border-radius: 999px; overflow: hidden; min-width: 40px; }
.subj-bar i { display: block; height: 100%; border-radius: 999px; transition: width 0.5s var(--ease); }
.subj-acc { width: 44px; text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }
.subj-total { width: 40px; text-align: right; color: var(--muted); font-size: 0.76rem; }

/* 薄弱章节 */
.weak-list { display: flex; flex-direction: column; gap: 9px; }
.weak-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--rule, #e7e9f0); border-radius: 10px; background: var(--surface); }
.weak-name { flex: 1; font-size: 0.88rem; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.weak-bar { width: 90px; height: 7px; background: var(--rule-soft, #eef0f5); border-radius: 999px; overflow: hidden; flex-shrink: 0; }
.weak-bar i { display: block; height: 100%; background: var(--red, #e11d48); border-radius: 999px; }
.weak-acc { width: 42px; text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; font-size: 0.84rem; }
.weak-total { width: 38px; text-align: right; color: var(--muted); font-size: 0.74rem; }
.weak-btn { margin-top: 12px; align-self: flex-start; }

/* 趋势 */
.trend-bars { display: flex; align-items: flex-end; gap: 6px; height: 150px; padding-top: 18px; }
.trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }
.trend-val { font-size: 0.66rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.trend-bar { width: 100%; max-width: 22px; border-radius: 5px 5px 0 0; min-height: 2px; transition: height 0.5s var(--ease); }
.trend-date { font-size: 0.62rem; color: var(--muted-2); transform: rotate(0deg); white-space: nowrap; }
.trend-note { margin-top: 12px; font-size: 0.78rem; color: var(--muted); }

/* 骨架 */
.skeleton-card { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.sk-stat { height: 56px; border-radius: 12px; }
.sk-block { height: 160px; }
.skeleton { background: linear-gradient(90deg, var(--rule-soft, #eef0f5) 25%, #f6f7fb 37%, var(--rule-soft, #eef0f5) 63%); background-size: 400% 100%; animation: sk-shimmer 1.4s ease infinite; border-radius: 12px; }
@keyframes sk-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }

@media (max-width: 720px) {
  .subj-body { grid-template-columns: 1fr; }
  .ov-card { grid-template-columns: repeat(2, 1fr); gap: 14px 10px; }
  .sp-grid { grid-template-columns: repeat(2, 1fr); gap: 14px 10px; }
  .sp-foot { flex-direction: column; align-items: flex-start; }
}
@media (max-width: 480px) {
  .card { padding: 16px 14px; }
  .page-head h2 { font-size: 1.3rem; }
  .trend-date { font-size: 0.56rem; }
}
</style>
