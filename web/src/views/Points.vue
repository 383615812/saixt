<template>
  <div class="container points-page">
    <div class="page-head">
      <h2>积分中心</h2>
      <p>打卡、刷题、成就都能赚积分，积分是努力的见证</p>
    </div>

    <!-- 积分余额卡 -->
    <div class="card points-hero">
      <div class="ph-left">
        <div class="ph-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h5M9.5 14.5h5"/></svg>
        </div>
        <div>
          <span class="ph-label">当前积分</span>
          <div class="ph-balance">{{ data.balance ?? '—' }}</div>
        </div>
      </div>
      <div class="ph-right">
        <span class="tag tag-green">今日 +{{ data.todayGain ?? 0 }}</span>
      </div>
    </div>

    <!-- 赚积分方式 -->
    <h3 class="sec-title">如何赚积分</h3>
    <div class="earn-grid">
      <div class="card earn-item" v-for="e in earnRules" :key="e.name">
        <div class="ei-icon" :class="e.tone">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="e.icon"></svg>
        </div>
        <div class="ei-body">
          <strong>{{ e.name }}</strong>
          <p>{{ e.desc }}</p>
        </div>
        <span class="ei-points">+{{ e.points }}</span>
      </div>
    </div>

    <!-- 积分兑换 -->
    <h3 class="sec-title">积分兑换 <span class="sec-sub">积分可兑换 AI 次数包，免费额度用完后自动消耗</span></h3>
    <div class="exchange-grid">
      <div
        v-for="(ex, key) in data.exchanges || {}"
        :key="key"
        class="card exchange-item"
        :class="{ disabled: vip || data.balance < ex.cost }"
      >
        <div class="ex-icon" :class="ex.kind === 'chat' ? 't-accent' : 't-purple'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9.5L4 20V5z"/><path d="M8.5 10h7M8.5 13h4"/></svg>
        </div>
        <div class="ex-body">
          <strong>{{ ex.name }}</strong>
          <p>{{ ex.desc }}</p>
        </div>
        <div class="ex-right">
          <span class="ex-cost">{{ ex.cost }} 积分</span>
          <button class="btn btn-primary btn-sm" :disabled="exchanging || vip || data.balance < ex.cost" @click="exchange(key, ex)">
            {{ vip ? 'VIP 无限' : '兑换' }}
          </button>
        </div>
      </div>
    </div>
    <p v-if="data.exchanges && !Object.keys(data.exchanges).length" class="exchange-empty">暂无可兑换商品，敬请期待</p>
    <p v-if="vip" class="exchange-note">你已开通 VIP 会员，AI 功能无限使用，无需兑换次数包</p>

    <!-- 积分流水 -->
    <h3 class="sec-title">积分明细</h3>
    <div v-if="data.logs?.length" class="card log-list">
      <div class="log-row" v-for="(l, i) in data.logs" :key="i">
        <div class="lr-left">
          <strong>{{ l.reason }}</strong>
          <span class="lr-time">{{ l.created_at }}</span>
        </div>
        <span class="lr-change" :class="{ plus: l.change > 0, minus: l.change < 0 }">
          {{ l.change > 0 ? '+' : '' }}{{ l.change }}
        </span>
      </div>
    </div>
    <div v-else class="card empty">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h5M9.5 14.5h5"/></svg></div>
      <p>暂无积分记录</p>
      <span class="empty-sub">去打卡、刷题、完成任务，赚取第一笔积分吧</span>
      <div class="empty-actions">
        <router-link to="/practice" class="btn btn-primary empty-btn">去刷题</router-link>
        <router-link to="/tasks" class="btn btn-ghost empty-btn">任务中心</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'
import { toast } from '../toast'

const data = ref({ balance: 0, todayGain: 0, logs: [], exchanges: {} })
const vip = ref(false)
const exchanging = ref(false)

const earnRules = [
  { name: '每日打卡', desc: '每天完成一次学习打卡', points: 10, icon: '<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3z"/>', tone: 't-amber' },
  { name: '新用户注册', desc: '注册即送新人积分', points: 20, icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>', tone: 't-accent' },
  { name: '邀请好友', desc: '好友通过你的邀请码注册', points: 50, icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M21 21v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/>', tone: 't-purple' },
  { name: '成就徽章', desc: '达成成就获得对应积分', points: '10~150', icon: '<path d="M8 4h8v6a4 4 0 0 1-8 0V4z"/><path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 14v3M8 21h8M10 17h4"/>', tone: 't-green' }
]

async function load() {
  try {
    const d = await api.get('/points/me')
    data.value = d
  } catch (e) { toast.error(e.message) }
  try {
    const m = await api.get('/membership/me')
    vip.value = m.vip
  } catch (e) { /* 忽略 */ }
}

async function exchange(key, ex) {
  if (exchanging.value || vip.value || data.value.balance < ex.cost) return
  exchanging.value = true
  try {
    const d = await api.post('/points/exchange', { product: key })
    toast.success(d.message || '兑换成功')
    await load()
    window.dispatchEvent(new Event('ai-quota-refresh'))
  } catch (e) { toast.error(e.message) }
  finally { exchanging.value = false }
}

onMounted(load)
</script>

<style scoped>
.points-page { max-width: 860px; }

.points-hero {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  background: linear-gradient(135deg, #1e2547 0%, #2b2f63 55%, #3a356f 100%);
  border: none; color: #fff; padding: 26px;
}
.ph-left { display: flex; align-items: center; gap: 18px; }
.ph-icon {
  width: 56px; height: 56px; border-radius: 18px; flex-shrink: 0;
  background: rgba(255, 255, 255, 0.14); color: #ffd166;
  display: flex; align-items: center; justify-content: center;
}
.ph-icon svg { width: 30px; height: 30px; }
.ph-label { font-size: 0.82rem; color: rgba(255, 255, 255, 0.72); }
.ph-balance { font-size: 2.4rem; font-weight: 800; line-height: 1.2; letter-spacing: -0.02em; }

.sec-title { margin: 28px 0 14px; font-size: 1.05rem; font-weight: 700; }
.sec-sub { font-size: 0.8rem; color: var(--muted-2); font-weight: 500; margin-left: 8px; }

.exchange-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.exchange-item { display: flex; align-items: center; gap: 12px; padding: 15px 16px; }
.exchange-item.disabled { opacity: 0.55; }
.ex-icon {
  width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.ex-icon svg { width: 19px; height: 19px; }
.ex-body { flex: 1; min-width: 0; }
.ex-body strong { font-size: 0.88rem; display: block; }
.ex-body p { font-size: 0.76rem; color: var(--muted); margin-top: 2px; }
.ex-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.ex-cost { font-size: 0.78rem; color: var(--amber); font-weight: 700; }
.exchange-note { color: var(--muted-2); font-size: 0.78rem; margin-top: 10px; }
.exchange-empty { text-align: center; color: var(--muted-2); font-size: 0.82rem; padding: 18px 0; }

.earn-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.earn-item { display: flex; align-items: center; gap: 12px; padding: 15px 16px; }
.ei-icon {
  width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.ei-icon svg { width: 19px; height: 19px; }
.t-accent { background: var(--accent-soft); color: var(--accent); }
.t-purple { background: var(--accent2-soft); color: var(--accent-2); }
.t-green { background: var(--green-soft); color: var(--green); }
.t-amber { background: var(--amber-soft); color: var(--amber); }
.ei-body { flex: 1; min-width: 0; }
.ei-body strong { font-size: 0.88rem; display: block; }
.ei-body p { font-size: 0.76rem; color: var(--muted); margin-top: 2px; }
.ei-points { font-weight: 800; color: var(--accent); font-size: 0.95rem; }

.log-list { padding: 6px 18px; }
.log-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 13px 0; border-bottom: 1px solid var(--rule-soft);
}
.log-row:last-child { border-bottom: none; }
.lr-left { display: flex; flex-direction: column; gap: 2px; }
.lr-left strong { font-size: 0.88rem; font-weight: 600; }
.lr-time { font-size: 0.72rem; color: var(--muted-2); }
.lr-change { font-weight: 800; font-size: 1rem; }
.lr-change.plus { color: var(--green); }
.lr-change.minus { color: var(--muted-2); }

@media (max-width: 560px) {
  .earn-grid, .exchange-grid { grid-template-columns: 1fr; }
  .ph-balance { font-size: 2rem; }
}
</style>
