<template>
  <div class="container detail-page">
    <div v-if="loading" class="detail-skeleton">
      <!-- 院校概览骨架 -->
      <div class="card hero">
        <span class="skeleton sk-hero-logo"></span>
        <div class="hero-info">
          <div class="skeleton sk-hero-name"></div>
          <div class="skeleton sk-hero-code"></div>
        </div>
        <div class="hero-stats">
          <div v-for="i in 3" :key="i" class="hs">
            <div class="skeleton sk-hs-num"></div>
            <div class="skeleton sk-hs-lbl"></div>
          </div>
        </div>
      </div>
      <!-- 专业计划骨架 -->
      <div class="card plans-card">
        <div class="skeleton sk-plans-title"></div>
        <div v-for="i in 5" :key="i" class="skeleton sk-plan-row"></div>
      </div>
    </div>
    <div v-else-if="notFound" class="card empty">院校不存在或已被移除</div>
    <div v-else-if="loadFailed" class="card empty">
      院校信息加载失败，请检查网络后重试
      <div class="empty-btn"><button class="btn btn-primary" @click="load">点击重试</button></div>
    </div>
    <template v-else>
      <div class="back-row">
        <router-link to="/schools" class="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
          返回院校库
        </router-link>
      </div>

      <!-- 院校概览 -->
      <div class="card hero">
        <div class="hero-glow" aria-hidden="true"></div>
        <div class="hero-logo">{{ school.name.slice(0, 2) }}</div>
        <div class="hero-info">
          <h2>{{ school.name }}</h2>
          <p class="hero-code">院校代码：{{ school.code }}</p>
        </div>
        <div class="hero-stats">
          <div class="hs">
            <div class="num">{{ school.plans.toLocaleString() }}</div>
            <div class="lbl">招生计划（人）</div>
          </div>
          <div class="hs">
            <div class="num">{{ school.majors }}</div>
            <div class="lbl">招生专业</div>
          </div>
          <div class="hs">
            <div class="num tuition">{{ formatTuition(school.tuition_range) }}</div>
            <div class="lbl">学费区间（万元/年）</div>
          </div>
          <div class="hs" v-if="school.estimate_score">
            <div class="num estimate">{{ school.estimate_score }}</div>
            <div class="lbl">预估分数线（参考）</div>
          </div>
        </div>
      </div>

      <!-- 专业计划 -->
      <div class="card plans-card">
        <div class="plans-head">
          <h3>招生专业计划</h3>
          <span class="plans-total">共 {{ plans.length }} 个专业</span>
        </div>
        <div v-if="!plans.length" class="empty">暂无专业计划数据</div>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>专业</th>
                <th>专业名称</th>
                <th class="col-tuition">学费<span class="unit">（万元/年）</span></th>
                <th>语种</th>
                <th>口试</th>
                <th class="col-plan">计划</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in plans" :key="p.major_code">
                <td class="mono">{{ p.major_code }}</td>
                <td class="major-name">{{ p.major_name }}</td>
                <td class="col-tuition">{{ formatPlanTuition(p.tuition) }}</td>
                <td class="col-lang">{{ p.lang || '不限' }}</td>
                <td class="col-oral"><span class="oral-tag" :class="{ on: p.oral === '是' }">{{ p.oral === '是' ? '需口试' : '否' }}</span></td>
                <td class="col-plan"><span class="plan-num">{{ p.plan }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="notice">
        <p>注：以上招生计划与学费信息整理自云南省春季招生历年公布数据，仅供参考。实际招生计划以云南省招生考试院当年官方公布为准。</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { toast } from '../toast'

const route = useRoute()
const school = ref(null)
const plans = ref([])
const loading = ref(true)
const loadFailed = ref(false)
const notFound = ref(false)

// 学费区间统一样式：解析“万/元”混用数据，全部归一为 “x万元” 展示（如 1.48万）
function formatTuition(v) {
  if (!v) return '—'
  const s = String(v).trim()
  if (!s || s === '待定' || s.includes('待定')) return '待定'
  const pairs = s.match(/\d+(?:\.\d+)?\s*(?:万|元)/g) || []
  let yuan
  if (!pairs.length) {
    const nums = s.match(/\d+(\.\d+)?/g) || []
    if (!nums.length) return s
    yuan = nums.map(n => parseFloat(n))
  } else {
    yuan = pairs.map(p => {
      const m = p.match(/[\d.]+/)
      const v = parseFloat(m[0])
      return p.includes('万') ? v * 10000 : v
    })
  }
  const fmt = n => {
    const w = n / 10000
    return (Math.round(w * 100) / 100).toString().replace(/\.?0+$/, '') + '万'
  }
  if (yuan.length === 1) return fmt(yuan[0])
  return fmt(Math.min(...yuan)) + ' – ' + fmt(Math.max(...yuan))
}

// 单专业学费：解析“1.68万元/1.68万/待定”等，统一为“1.68万元”
function formatPlanTuition(v) {
  if (!v) return '—'
  const s = String(v).trim()
  if (!s || s === '待定' || s.includes('待定')) return '—'
  const m = s.match(/[\d.]+/)
  if (!m) return '—'
  const num = parseFloat(m[0])
  const yuan = s.includes('万') ? num * 10000 : num
  const w = yuan / 10000
  return (Math.round(w * 100) / 100).toString().replace(/\.?0+$/, '') + '万'
}

async function load() {
  loading.value = true
  loadFailed.value = false
  notFound.value = false
  try {
    const data = await api.get(`/schools/${route.params.code}`)
    school.value = data.school
    plans.value = data.plans
  } catch (e) {
    console.error('[school-detail] 加载院校失败:', e.message)
    if (e.code === 404) notFound.value = true
    else loadFailed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.back-row { margin-bottom: 14px; }
.back-link {
  display: inline-flex; align-items: center; gap: 6px;
  color: var(--muted); font-size: 0.9rem; font-weight: 500;
  padding: 7px 14px; border-radius: 999px;
  background: var(--surface); border: 1px solid var(--rule);
  transition: color 0.25s var(--ease), border-color 0.25s var(--ease), background-color 0.25s var(--ease), transform 0.25s var(--ease);
}
.back-link svg { width: 15px; height: 15px; }
.back-link:hover { color: var(--accent); border-color: rgba(79, 95, 240, 0.35); background: var(--accent-soft); transform: translateX(-2px); }

.hero {
  position: relative; overflow: hidden;
  display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
  padding: 26px; margin-bottom: 20px;
}
.hero::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: var(--grad-accent);
}
.hero-glow {
  position: absolute; top: -70px; right: -50px;
  width: 220px; height: 220px; border-radius: 50%;
  background: radial-gradient(circle, rgba(79, 95, 240, 0.09) 0%, transparent 65%);
  pointer-events: none;
}
.hero-logo {
  width: 64px; height: 64px; border-radius: 16px; flex-shrink: 0;
  background: var(--grad-accent);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 1.2rem; box-shadow: 0 6px 18px rgba(79, 95, 240, 0.3);
}
.hero-info { flex: 1; min-width: 200px; }
.hero-info h2 { font-size: 1.5rem; }
.hero-code { color: var(--muted); font-size: 0.9rem; margin-top: 4px; }
.hero-stats { display: flex; gap: 28px; }
.hs { text-align: center; }
.hs .num { font-size: 1.3rem; font-weight: 700; color: var(--accent); }
.hs .num.tuition { font-size: 1rem; color: var(--accent-2); }
.hs .num.tuition:not(:empty) { max-width: 200px; line-height: 1.4; }
.hs .num.estimate {
  display: inline-block; padding: 3px 12px; border-radius: 8px;
  font-size: 1.1rem; color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
.hs .lbl { font-size: 0.75rem; color: var(--muted); margin-top: 2px; }

.plans-card { margin-bottom: 20px; }
.plans-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.plans-head h3 { font-size: 1.15rem; }
.plans-total { font-size: 0.85rem; color: var(--muted); }

.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.92rem; min-width: 0; }
thead th {
  text-align: left; padding: 9px 10px; background: var(--accent-soft);
  color: var(--accent); font-weight: 600; font-size: 0.85rem; white-space: nowrap;
  border-bottom: 2px solid rgba(79, 95, 240, 0.18);
}
thead th:first-child { border-radius: 8px 0 0 8px; }
thead th:last-child { border-radius: 0 8px 8px 0; }
tbody td { padding: 9px 10px; border-bottom: 1px solid var(--rule); }
tbody tr { transition: background-color 0.2s var(--ease); }
tbody tr:hover { background: var(--accent-soft); }
th.col-tuition, td.col-tuition { text-align: right; white-space: nowrap; width: 34%; }
th.col-plan, td.col-plan { text-align: center; width: 62px; }
td.col-tuition { font-variant-numeric: tabular-nums; }
td.col-lang { white-space: nowrap; color: var(--muted); }
.oral-tag {
  display: inline-block; padding: 1px 9px; border-radius: 999px;
  font-size: 0.78rem; font-weight: 500; background: var(--surface-2); color: var(--muted);
}
.oral-tag.on { background: var(--amber-soft); color: #b45309; font-weight: 600; }
thead th .unit { font-weight: 400; opacity: 0.72; font-size: 0.76rem; }
.mono { font-family: Consolas, monospace; color: var(--muted); white-space: nowrap; }
.major-name { font-weight: 500; }
.plan-num {
  display: inline-block; min-width: 36px; text-align: center;
  padding: 2px 9px; border-radius: 999px; background: var(--green-soft);
  color: #047857; font-weight: 600;
}

.notice { padding: 12px 16px; border-radius: 12px; background: var(--amber-soft); color: #b45309; font-size: 0.82rem; }

@media (max-width: 600px) {
  .hero { flex-direction: column; text-align: center; padding: 20px; }
  .hero-stats {
    width: 100%; display: grid; grid-template-columns: 1fr 1fr;
    gap: 14px 10px;
  }
  .hs { text-align: center; }
  .hs .num { font-size: 1.12rem; }
  .hs .num.tuition { font-size: 0.82rem; max-width: 100%; }
  .hs .num.estimate {
    display: inline-block; padding: 2px 14px; font-size: 1.05rem;
    background: rgba(79, 95, 240, 0.12); color: var(--accent);
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    color: #fff;
  }
  .hs .lbl { font-size: 0.75rem; }
  .plans-card { padding: 14px; }
}

@media (max-width: 480px) {
  .hero-stats { grid-template-columns: 1fr 1fr; gap: 14px 6px; }
  .hs .num { font-size: 1.05rem; }
  .hs .lbl { font-size: 0.75rem; }
}
@media (max-width: 400px) {
  .hero { padding: 16px 12px; }
  .hero-stats { gap: 12px 4px; }
  .hs .num { font-size: 1rem; }
  .hs .lbl { font-size: 0.75rem; }
  .plans-card { padding: 12px 10px; }
}

/* ===== 骨架屏 ===== */
.sk-hero-logo { width: 56px; height: 56px; border-radius: 14px; flex-shrink: 0; }
.sk-hero-name { height: 20px; width: 200px; margin-bottom: 10px; }
.sk-hero-code { height: 12px; width: 130px; }
.sk-hs-num { height: 18px; width: 60px; margin-bottom: 8px; }
.sk-hs-lbl { height: 11px; width: 76px; }

.sk-plans-title { height: 16px; width: 130px; margin-bottom: 18px; }
.sk-plan-row { height: 20px; width: 100%; margin-bottom: 12px; }

@media (max-width: 768px) {
  .sk-hero-name { width: 140px; }
}
</style>
