<template>
  <div class="container rec-page">
    <div class="page-head">
      <h2>智能志愿推荐</h2>
      <p>根据你的预估总分，结合真实院校数据，生成「冲 · 稳 · 保」志愿方案</p>
    </div>

    <!-- 参数区 -->
    <div class="card rec-form">
      <div class="form-row">
        <label>
          <span>预估总分（600 分制）</span>
          <input v-model.number="score" type="number" min="0" max="600" placeholder="如：450" />
        </label>
        <label>
          <span>意向专业方向（可选）</span>
          <input v-model="keyword" placeholder="如：护理、计算机、机电" @keyup.enter="load" />
        </label>
        <label>
          <span>学费预算（元/年，可选）</span>
          <input v-model.number="maxTuition" type="number" min="0" step="500" placeholder="如：8000" @keyup.enter="load" />
        </label>
        <label>
          <span>浮动比例（%，可选）</span>
          <input v-model.number="tuitionTolerance" type="number" min="0" max="100" step="5" placeholder="默认 10" @keyup.enter="load" />
        </label>
        <label>
          <span>意向地区（可选）</span>
          <select v-model="region" @change="load">
            <option value="">不限</option>
            <option v-for="r in regions" :key="r" :value="r">{{ r }}</option>
          </select>
        </label>
        <button class="btn btn-primary" :disabled="loading" @click="load">生成推荐方案</button>
      </div>
      <p class="form-tip">
        <template v-if="autoScore">已根据你的刷题表现自动带入预测分 {{ autoScore }} 分，可手动修改。</template>
        录取线为基于院校类型与招生规模的估算值，仅供参考，实际以官方公布为准。
      </p>
    </div>

    <div v-if="loading" class="rec-skeleton">
      <!-- 得分概览骨架 -->
      <div class="card score-banner sk-score-banner">
        <div class="sk-sb-main">
          <div class="skeleton sk-sb-score"></div>
          <div class="skeleton sk-sb-lbl"></div>
        </div>
        <div class="sk-sb-note">
          <div class="skeleton sk-sb-line"></div>
          <div class="skeleton sk-sb-line short"></div>
        </div>
      </div>
      <!-- 冲稳保三档骨架 -->
      <div class="card sk-tier" v-for="i in 3" :key="i">
        <div class="skeleton sk-tier-title"></div>
        <div class="sk-tier-grid">
          <div v-for="j in 2" :key="j" class="skeleton sk-tier-card"></div>
        </div>
      </div>
    </div>
    <template v-else-if="result">
      <!-- 得分概览 -->
      <div class="card score-banner">
        <div class="sb-glow" aria-hidden="true"></div>
        <div class="sb-main">
          <div class="sb-score">{{ result.score }}</div>
          <div class="sb-lbl">你的预估总分</div>
        </div>
        <div class="sb-divider" aria-hidden="true"></div>
        <div class="sb-note">
          <p>共匹配 <strong>{{ result.total }}</strong> 所院校</p>
          <p>冲 {{ result.tiers.chong.length }} · 稳 {{ result.tiers.wen.length }} · 保 {{ result.tiers.bao.length }}</p>
          <p v-if="result.keyword" class="sb-kw">专业方向：<strong>{{ result.keyword }}</strong></p>
          <p v-if="result.maxTuition" class="sb-kw">学费预算：<strong>≤ {{ result.maxTuition.toLocaleString() }} 元/年</strong><template v-if="result.tuitionTolerance">（允许上浮 {{ result.tuitionTolerance }}%）</template></p>
          <p v-if="result.region" class="sb-kw">意向地区：<strong>{{ result.region }}</strong></p>
        </div>
      </div>

      <!-- 推荐建议 -->
      <div v-if="result.tips && result.tips.length" class="card tips-card">
        <div class="tips-head">
          <span class="tips-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg></span>
          <strong>填报建议</strong>
        </div>
        <ul class="tips-list">
          <li v-for="(t, i) in result.tips" :key="i">{{ t }}</li>
        </ul>
      </div>

      <!-- 冲 -->
      <TierBlock v-if="result.tiers.chong.length" title="冲 · 冲刺院校" color="red" :schools="result.tiers.chong" />
      <!-- 稳 -->
      <TierBlock v-if="result.tiers.wen.length" title="稳 · 稳妥院校" color="blue" :schools="result.tiers.wen" />
      <!-- 保 -->
      <TierBlock v-if="result.tiers.bao.length" title="保 · 保底院校" color="green" :schools="result.tiers.bao" />

      <div v-if="!result.total" class="card empty">没有匹配到合适的院校，试试调整分数或专业方向</div>
    </template>
    <div v-else class="card empty">输入预估总分后点击「生成推荐方案」</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'
import { toast } from '../toast'
import TierBlock from '../components/TierBlock.vue'

const score = ref(null)
const keyword = ref('')
const maxTuition = ref(null)
const tuitionTolerance = ref(null)
const region = ref('')
const autoScore = ref(null)
const loading = ref(false)
const result = ref(null)

const regions = ['昆明', '曲靖', '玉溪', '楚雄', '大理', '丽江', '保山', '昭通', '普洱', '临沧', '红河', '文山', '西双版纳', '德宏', '怒江', '迪庆']

async function load() {
  if (loading.value) return
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (score.value) params.set('score', score.value)
    if (keyword.value.trim()) params.set('keyword', keyword.value.trim())
    if (maxTuition.value) params.set('maxTuition', maxTuition.value)
    if (tuitionTolerance.value != null && tuitionTolerance.value !== '') params.set('tuitionTolerance', tuitionTolerance.value)
    if (region.value) params.set('region', region.value)
    result.value = await api.get(`/recommend?${params}`)
  } catch (e) {
    toast(e.message || '推荐方案生成失败，请稍后重试', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    const stats = await api.get('/stats/me')
    // 优先使用后端真实总分测算（含会考折算）；未填会考成绩时回退为职业技能预测 + 文化素质中等估算
    const s = stats.totalScore ?? (stats.predict.total + 200)
    autoScore.value = s
    score.value = s
    // 已带出分数则自动生成推荐方案，减少用户手动点击的摩擦；无分/未登录时保持表单等待输入
    if (score.value && !result.value) await load()
  } catch (e) { /* 未登录或暂无数据 */ }
})
</script>

<style scoped>
.page-head { margin-bottom: 20px; }
.page-head h2 { font-size: 1.6rem; }
.page-head p { color: var(--muted); margin-top: 4px; }

.rec-form { margin-bottom: 20px; }
.form-row { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.form-row label { display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; color: var(--muted); }
.form-row input, .form-row select {
  width: 100%; max-width: 220px; padding: 9px 12px; border: 1px solid var(--rule); border-radius: var(--radius-sm);
  font-size: 0.92rem; outline: none; background: var(--surface);
  transition: border-color 0.25s var(--ease), box-shadow 0.25s var(--ease), background 0.25s var(--ease);
}
.form-row select { cursor: pointer; }
.form-row input:hover, .form-row select:hover { border-color: #d6dae6; }
.form-row input:focus, .form-row select:focus {
  border-color: var(--accent); background: var(--surface);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.form-tip { margin-top: 12px; font-size: 0.82rem; color: var(--muted); }

.score-banner {
  position: relative; overflow: hidden;
  display: flex; align-items: center; gap: 28px; flex-wrap: wrap;
  padding: 22px 24px; margin-bottom: 16px;
}
.sb-glow {
  position: absolute; top: -80px; right: -60px;
  width: 240px; height: 240px; border-radius: 50%;
  background: radial-gradient(circle, rgba(79, 95, 240, 0.1) 0%, transparent 65%);
  pointer-events: none;
}
.sb-main { text-align: center; }
.sb-score {
  font-size: clamp(1.8rem, 8vw, 2.6rem); font-weight: 800; line-height: 1.1;
  background: var(--grad-accent); -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
  font-variant-numeric: tabular-nums;
}
.sb-lbl { color: var(--muted); font-size: 0.85rem; }
.sb-divider {
  width: 1px; height: 52px; align-self: center;
  background: linear-gradient(180deg, transparent, var(--rule) 30%, var(--rule) 70%, transparent);
}
.sb-note { color: var(--muted); font-size: 0.9rem; }
.sb-note strong { color: var(--accent); }
.sb-kw { margin-top: 4px; }

.tips-card { padding: 16px 20px; margin-bottom: 20px; background: linear-gradient(135deg, var(--accent-soft), #fff); border: 1px solid var(--accent-soft); }
.tips-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: var(--accent); }
.tips-icon { display: inline-flex; color: var(--amber); }
.tips-icon svg { width: 18px; height: 18px; }
.tips-list { display: flex; flex-direction: column; gap: 6px; padding-left: 4px; }
.tips-list li { font-size: 0.88rem; color: var(--ink); line-height: 1.6; padding-left: 14px; position: relative; }
.tips-list li::before { content: ''; position: absolute; left: 0; top: 0.6em; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

@media (max-width: 600px) {
  .page-head h2 { font-size: 1.3rem; }
  .page-head p { font-size: 0.82rem; }
  .rec-form { padding: 16px 14px; }
  .form-row { flex-direction: column; align-items: stretch; gap: 10px; }
  .form-row input, .form-row select { width: 100%; max-width: none; font-size: 1rem; }
  .form-row label { width: 100%; }
  .form-row .btn { width: 100%; }
  .score-banner { justify-content: center; text-align: center; gap: 14px; padding: 18px 16px; }
  .sb-note { font-size: 0.85rem; }
  .tips-card { padding: 14px 16px; }
  .tips-list li { font-size: 0.84rem; padding-left: 16px; }
}
@media (max-width: 480px) {
  .rec-form { padding: 14px 12px; }
  .score-banner { padding: 16px 14px; gap: 12px; }
  .tips-card { padding: 12px 14px; }
  .tips-list li { font-size: 0.82rem; }
}

/* ===== 骨架屏 ===== */
.sk-score-banner { display: flex; align-items: center; gap: 24px; padding: 22px 24px; }
.sk-sb-main { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.sk-sb-score { height: 40px; width: 84px; border-radius: 10px; }
.sk-sb-lbl { height: 12px; width: 64px; }
.sk-sb-note { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.sk-sb-line { height: 14px; width: 80%; }
.sk-sb-line.short { width: 55%; }

.sk-tier { padding: 18px 22px; margin-bottom: 20px; }
.sk-tier-title { height: 16px; width: 130px; margin-bottom: 16px; }
.sk-tier-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.sk-tier-card { height: 130px; border-radius: 12px; }

@media (max-width: 700px) {
  .sk-score-banner { flex-direction: column; gap: 16px; }
  .sk-tier-grid { grid-template-columns: 1fr; }
  .sk-tier-card { height: 110px; }
}
</style>
