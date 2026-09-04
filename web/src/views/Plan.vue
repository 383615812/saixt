<template>
  <div class="container plan-page">
    <div class="page-head">
      <h2>AI 学习计划</h2>
      <p>根据你的刷题表现、薄弱知识点与目标，AI 生成个性化备考计划</p>
    </div>

    <QuotaBar kind="plan" label="学习计划" />

    <!-- 学习情况概览 -->
    <div v-if="statsLoading" class="card plan-stats plan-stats-sk">
      <div v-for="i in 4" :key="i" class="ps-item">
        <div class="skeleton sk-ps-num"></div>
        <div class="skeleton sk-ps-lbl"></div>
      </div>
    </div>
    <div v-else class="card plan-stats">
      <div class="ps-item">
        <div class="ps-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M17 5.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
        <div class="ps-num">{{ stats.accuracy ?? '—' }}%</div>
        <div class="ps-lbl">当前正确率</div>
      </div>
      <div class="ps-item">
        <div class="ps-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg></div>
        <div class="ps-num">{{ stats.total ?? '—' }}</div>
        <div class="ps-lbl">累计答题</div>
      </div>
      <div class="ps-item">
        <div class="ps-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16l3-4 3 3 4-6"/></svg></div>
        <div class="ps-num">{{ stats.predict?.total ?? '—' }}</div>
        <div class="ps-lbl">职业技能预测</div>
      </div>
      <div class="ps-item">
        <div class="ps-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z"/><path d="m9 12 2 2 4-4"/></svg></div>
        <div class="ps-num">{{ profile.target_score || '—' }}</div>
        <div class="ps-lbl">目标分数</div>
      </div>
    </div>

    <div v-if="weak.length" class="card weak-card">
      <span class="wc-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></span>
      <strong>薄弱知识点：</strong>
      <router-link
        v-for="w in weak"
        :key="w.chapter"
        class="tag tag-red weak-link"
        :to="{ path: '/ai-practice', query: { subject: w.subject, chapter: w.chapter } }"
        :title="`进入该章节 AI 智能出题补强：${w.subject}·${w.chapter}`"
      >{{ w.subject }} · {{ w.chapter }}<span class="wl-arrow">补强 →</span></router-link>
    </div>
    <div v-else-if="stats.total" class="card weak-card ok">
      <span class="wc-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
      <strong>表现均衡，暂无薄弱知识点，继续保持！</strong>
    </div>

    <div class="plan-actions">
      <button class="btn btn-primary" :disabled="loading" @click="generate">
        <svg v-if="!loading" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/><path d="M15 3h6v6"/><path d="M14 10 21 3"/><path d="M9 15l-1 1 1 1 6-6"/></svg>
        {{ loading ? 'AI 正在制定计划…' : (plan ? '重新生成计划' : '生成我的学习计划') }}
      </button>
      <router-link v-if="plan && !loading" to="/practice" class="btn btn-ghost">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
        按计划去刷题
      </router-link>
    </div>

    <div v-if="loading" class="card plan-loading">
      <div class="pl-spin"><div class="spinner"></div></div>
      <p>AI 正在分析你的学习情况，制定个性化计划，请稍候…</p>
    </div>

    <div v-else-if="plan" class="card plan-result">
      <div class="pr-glow"></div>
      <div class="plan-result-head">
        <div class="pr-title">
          <span class="pr-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/><path d="M15 3h6v6"/><path d="M14 10 21 3"/><path d="M9 15l-1 1 1 1 6-6"/></svg></span>
          <h3>你的专属备考计划</h3>
        </div>
        <span class="plan-date"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>生成于 {{ generatedAt }} · 已自动保存</span>
      </div>
      <div class="plan-body">
        <template v-for="(block, i) in planBlocks" :key="i">
          <h4 v-if="block.type === 'heading'" class="plan-h">{{ block.text }}</h4>
          <p v-else-if="block.type === 'bullet'" class="plan-bullet">{{ block.text }}</p>
          <p v-else class="plan-text">{{ block.text }}</p>
        </template>
        <span v-if="planTyping" class="tw-caret"></span>
      </div>
    </div>

    <div v-else class="card empty">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/><path d="M15 3h6v6"/><path d="M14 10 21 3"/><path d="M9 15l-1 1 1 1 6-6"/></svg></div>
      <p>还没有专属学习计划</p>
      <span class="empty-sub">点击上方「生成我的学习计划」，AI 会结合你的答题情况定制备考方案</span>
    </div>

    <!-- AI 学情分析 -->
    <div class="card analysis-card">
      <div class="analysis-head">
        <div class="an-title">
          <span class="an-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16l3-4 3 3 4-6"/></svg></span>
          <div>
            <h3>AI 学情分析</h3>
            <p class="analysis-sub">基于你的刷题数据、薄弱点与目标，AI 给出针对性分析与建议</p>
          </div>
        </div>
        <button class="btn btn-primary" :disabled="analyzing" @click="analyze">
          <svg v-if="!analyzing" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16l3-4 3 3 4-6"/></svg>
          {{ analyzing ? 'AI 正在分析…' : (analysis ? '重新分析' : '开始分析') }}
        </button>
      </div>
      <QuotaBar kind="analysis" label="学情分析" />
      <div v-if="analyzing" class="analysis-loading">
        <div class="pl-spin"><div class="spinner"></div></div>
        <p>AI 正在分析你的学习数据，请稍候…</p>
      </div>
      <div v-else-if="analysis" class="analysis-body">
        <template v-for="(block, i) in analysisBlocks" :key="i">
          <h4 v-if="block.type === 'heading'" class="analysis-h">{{ block.text }}</h4>
          <p v-else-if="block.type === 'bullet'" class="analysis-bullet">{{ block.text }}</p>
          <p v-else class="analysis-text">{{ block.text }}</p>
        </template>
        <span v-if="analysisTyping" class="tw-caret"></span>
      </div>
      <div v-else class="empty analysis-empty">
        <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16l3-4 3 3 4-6"/></svg></div>
        <p>还没有学情分析</p>
        <span class="empty-sub">点击「开始分析」，让 AI 帮你诊断学习情况</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { toast } from '../toast'
import { useTypewriter } from '../useTypewriter'
import QuotaBar from '../components/QuotaBar.vue'

const { text: planText, typing: planTyping, type: typePlan } = useTypewriter()
const { text: analysisText, typing: analysisTyping, type: typeAnalysis } = useTypewriter()

const statsLoading = ref(true)
const stats = ref({})
const profile = ref({})
const weak = ref([])
const plan = ref('')
const loading = ref(false)
const generatedAt = ref('')
const analysis = ref('')
const analyzing = ref(false)

const planBlocks = computed(() => {
  if (!planText.value) return []
  return planText.value.split('\n').map(line => {
    let t = line.trim()
    if (!t) return { type: 'blank', text: '' }
    if (/^#{1,6}\s*/.test(t)) {
      return { type: 'heading', text: t.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '') }
    }
    if (/^第[一二三四五六七八九十\d]+周/.test(t) || /^[一二三四五六七八九十]+、/.test(t) || /^\d+[、.．]/.test(t)) {
      return { type: 'heading', text: t.replace(/\*\*/g, '') }
    }
    if (/^[-•·]/.test(t)) return { type: 'bullet', text: t.replace(/^[-•·]\s*/, '').replace(/\*\*/g, '') }
    return { type: 'text', text: t.replace(/\*\*/g, '') }
  }).filter(b => b.type !== 'blank')
})

const analysisBlocks = computed(() => {
  if (!analysisText.value) return []
  return analysisText.value.split('\n').map(line => {
    let t = line.trim()
    if (!t) return { type: 'blank', text: '' }
    if (/^#{1,6}\s*/.test(t) || /^【.*】/.test(t)) {
      return { type: 'heading', text: t.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '') }
    }
    if (/^[-•·]/.test(t)) return { type: 'bullet', text: t.replace(/^[-•·]\s*/, '').replace(/\*\*/g, '') }
    return { type: 'text', text: t.replace(/\*\*/g, '') }
  }).filter(b => b.type !== 'blank')
})

async function analyze() {
  if (analyzing.value) return
  analyzing.value = true
  try {
    const data = await api.post('/ai/analysis', {})
    analysis.value = data.reply
    typeAnalysis(data.reply)
    window.dispatchEvent(new Event('ai-quota-refresh'))
  } catch (e) {
    // 失败不写入正文，避免错误文案被当作 AI 分析内容展示
    toast(e.message || '分析失败，请稍后重试', 'error')
  } finally {
    analyzing.value = false
  }
}

async function generate() {
  if (loading.value) return
  loading.value = true
  try {
    const data = await api.post('/ai/plan', {})
    plan.value = data.reply
    typePlan(data.reply)
    generatedAt.value = new Date().toLocaleString('zh-CN', { hour12: false })
    window.dispatchEvent(new Event('ai-quota-refresh'))
  } catch (e) {
    // 失败不写入正文，避免错误文案被当作 AI 计划内容展示
    toast(e.message || '生成失败，请稍后重试', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    const [me, mk, auth] = await Promise.all([
      api.get('/stats/me'),
      api.get('/stats/mastery'),
      api.get('/auth/me')
    ])
    stats.value = me
    weak.value = (mk.weak || []).slice(0, 5)
    profile.value = auth.profile || {}
  } catch (e) { /* 忽略 */ }
  // 优先读取上次保存的计划，避免重复生成
  try {
    const latest = await api.get('/ai/plan/latest')
    if (latest && latest.content) {
      plan.value = latest.content
      typePlan(latest.content)
      generatedAt.value = latest.created_at || new Date().toLocaleString('zh-CN', { hour12: false })
      return
    }
  } catch (e) { /* 忽略 */ }
  generate()
})
</script>

<style scoped>
.plan-page { max-width: 860px; }
.page-head { text-align: center; margin-bottom: 24px; }
.page-head h2 { font-size: 1.6rem; }
.page-head p { color: var(--muted); margin-top: 4px; }

.plan-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; padding: 20px; margin-bottom: 16px; }
.ps-item { text-align: center; padding: 18px 10px 16px; border-radius: 14px; background: var(--grad-accent-soft); border: 1px solid rgba(79, 95, 240, 0.08); position: relative; overflow: hidden; transition: transform 0.25s var(--ease), box-shadow 0.25s var(--ease), border-color 0.25s var(--ease); }
.ps-item::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 40px; height: 3px; border-radius: 0 0 3px 3px; background: var(--grad-accent); opacity: 0; transition: opacity 0.3s var(--ease); }
.ps-item:hover { transform: translateY(-2px); box-shadow: var(--shadow-sm); border-color: rgba(79, 95, 240, 0.2); }
.ps-item:hover::before { opacity: 1; }
.ps-ic { width: 38px; height: 38px; margin: 0 auto 10px; border-radius: 11px; display: flex; align-items: center; justify-content: center; background: var(--surface); color: var(--accent); box-shadow: var(--shadow-xs); }
.ps-ic svg { width: 19px; height: 19px; }
.sk-ps-num { width: 52px; height: 22px; margin: 0 auto 8px; }
.sk-ps-lbl { width: 44px; height: 12px; margin: 0 auto; }
.ps-num { font-size: 1.6rem; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; background: var(--grad-accent); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
.ps-lbl { font-size: 0.8rem; color: var(--muted); margin-top: 2px; }

.weak-card { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 15px 20px; margin-bottom: 16px; font-size: 0.92rem; border-left: 3px solid var(--red); }
.weak-card.ok { background: var(--green-soft); border-color: transparent; border-left: 3px solid var(--green); color: #047857; }
.wc-ic { width: 26px; height: 26px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: var(--red-soft); color: var(--red); }
.weak-card.ok .wc-ic { background: var(--green-soft); color: var(--green); }
.wc-ic svg { width: 15px; height: 15px; }
.weak-link { text-decoration: none; transition: transform 0.2s var(--ease), box-shadow 0.2s var(--ease), background-color 0.2s var(--ease); }
.weak-link:hover { transform: translateY(-2px); box-shadow: var(--shadow-sm); background: var(--accent-soft); color: var(--accent); }
.wl-arrow { margin-left: 5px; font-size: 0.78rem; font-weight: 700; opacity: 0.85; }

.plan-actions { display: flex; gap: 12px; justify-content: center; margin-bottom: 20px; flex-wrap: wrap; }
.plan-actions .btn svg { width: 16px; height: 16px; }

.plan-loading { text-align: center; padding: 60px 20px; position: relative; overflow: hidden; }
.plan-loading::before { content: ''; position: absolute; top: -80px; left: 50%; transform: translateX(-50%); width: 260px; height: 200px; border-radius: 50%; background: radial-gradient(circle, rgba(79, 95, 240, 0.08) 0%, transparent 65%); pointer-events: none; }
.pl-spin .spinner { margin: 0 auto 0; }
.plan-loading p { color: var(--muted); margin-top: 16px; }

.plan-result { padding: 26px 28px; position: relative; overflow: hidden; }
.pr-glow { position: absolute; top: -90px; right: -70px; width: 260px; height: 260px; border-radius: 50%; background: radial-gradient(circle, rgba(79, 95, 240, 0.09) 0%, transparent 65%); pointer-events: none; }
.plan-result-head { position: relative; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--rule); }
.pr-title { display: flex; align-items: center; gap: 10px; }
.pr-ic { width: 36px; height: 36px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--grad-accent); color: #fff; box-shadow: 0 3px 10px rgba(79, 95, 240, 0.25); }
.pr-ic svg { width: 18px; height: 18px; }
.plan-result-head h3 { font-size: 1.2rem; }
.plan-date { display: inline-flex; align-items: center; gap: 5px; font-size: 0.82rem; color: var(--muted); }
.plan-date svg { width: 13px; height: 13px; }

.plan-body, .analysis-body { line-height: 1.9; overflow-wrap: break-word; word-break: break-word; }
.plan-h { font-size: 1.05rem; font-weight: 700; color: var(--accent); margin: 20px 0 10px; padding-left: 10px; border-left: 4px solid var(--accent); letter-spacing: 0.01em; }
.plan-h:first-child { margin-top: 0; }
.plan-bullet { padding-left: 20px; position: relative; margin-bottom: 8px; }
.plan-bullet::before { content: ''; position: absolute; left: 5px; top: 0.72em; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
.plan-text { color: var(--ink); margin-bottom: 8px; }

.analysis-card { margin-top: 20px; padding: 24px 26px; position: relative; overflow: hidden; }
.analysis-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--grad-accent); opacity: 0.9; }
.analysis-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.an-title { display: flex; align-items: flex-start; gap: 12px; }
.an-ic { width: 38px; height: 38px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 11px; background: var(--grad-accent-soft); color: var(--accent); border: 1px solid rgba(79, 95, 240, 0.12); }
.an-ic svg { width: 19px; height: 19px; }
.analysis-head h3 { font-size: 1.15rem; }
.analysis-sub { color: var(--muted); font-size: 0.85rem; margin-top: 4px; }
.analysis-head .btn svg { width: 16px; height: 16px; }
.analysis-loading { text-align: center; padding: 40px 20px; }
.analysis-loading p { color: var(--muted); margin-top: 14px; }
.analysis-empty { padding: 28px 0; }
.analysis-h { font-size: 1rem; font-weight: 700; color: var(--accent); margin: 18px 0 10px; padding-left: 10px; border-left: 4px solid var(--accent); letter-spacing: 0.01em; }
.analysis-h:first-child { margin-top: 0; }
.analysis-bullet { padding-left: 20px; position: relative; margin-bottom: 8px; }
.analysis-bullet::before { content: ''; position: absolute; left: 5px; top: 0.72em; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
.analysis-text { color: var(--ink); margin-bottom: 8px; }

@media (max-width: 600px) {
  .plan-stats { grid-template-columns: repeat(2, 1fr); gap: 10px; padding: 14px; }
  .ps-item { padding: 14px 8px 12px; }
  .plan-result { padding: 18px 16px; }
  .analysis-card { padding: 18px 16px; }
  .analysis-head .btn { width: 100%; }
}
@media (max-width: 400px) {
  .plan-stats { grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px; }
  .ps-num { font-size: 1.35rem; }
  .ps-ic { width: 32px; height: 32px; }
  .plan-result { padding: 14px 12px; }
  .analysis-card { padding: 14px 12px; }
  .plan-actions .btn { flex: 1; min-width: 0; }
}
</style>