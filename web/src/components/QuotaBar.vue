<template>
  <div class="quota-bar" :class="{ vip, empty: exhausted }" v-if="loaded">
    <div class="qb-icon">
      <svg v-if="vip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7L12 3z"/></svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h5M9.5 14.5h5"/></svg>
    </div>
    <div class="qb-body">
      <template v-if="vip">
        <strong>VIP 会员 · {{ label }}无限使用</strong>
        <span>已开通会员，畅享全部 AI 能力</span>
      </template>
      <template v-else-if="exhausted">
        <strong>今日免费 {{ label }}次数已用完</strong>
        <span>开通 VIP 无限使用，或用积分兑换次数包</span>
      </template>
      <template v-else>
        <strong>今日剩余 {{ left }} 次{{ topup ? `（含兑换 ${topup} 次）` : '' }}</strong>
        <span>免费额度每日刷新，开通 VIP 无限使用</span>
      </template>
    </div>
    <div class="qb-actions">
      <router-link v-if="!vip" to="/points" class="qb-link">积分兑换</router-link>
      <router-link v-if="!vip" to="/vip" class="btn btn-primary qb-btn">开通 VIP</router-link>
      <router-link v-else to="/vip" class="qb-link qb-link-vip">会员中心</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../api'

const props = defineProps({
  kind: { type: String, default: 'chat' },
  label: { type: String, default: 'AI 答疑' }
})

const data = ref(null)
// loaded 标记配额是否成功加载；加载失败时保持隐藏，避免把“未加载”误显示成“已用完”
const loaded = ref(false)

const vip = computed(() => !!data.value?.vip)
const quota = computed(() => data.value?.quota?.[props.kind] || {})
const left = computed(() => quota.value.left ?? 0)
const topup = computed(() => quota.value.topup ?? 0)
const exhausted = computed(() => loaded.value && !vip.value && left.value <= 0)

async function load() {
  try {
    data.value = await api.get('/ai/quota')
    loaded.value = true
  } catch (e) { /* 加载失败：保持隐藏，不用已用完文案误导 */ }
}

function onRefresh() { load() }

onMounted(() => {
  load()
  window.addEventListener('ai-quota-refresh', onRefresh)
})
onBeforeUnmount(() => {
  window.removeEventListener('ai-quota-refresh', onRefresh)
})
</script>

<style scoped>
.quota-bar {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 16px; border-radius: var(--radius-sm);
  background: var(--accent-soft); border: 1px solid rgba(79, 95, 240, 0.14);
  margin-bottom: 16px;
}
.quota-bar.vip { background: var(--green-soft); border-color: rgba(13, 166, 120, 0.18); }
.quota-bar.empty { background: var(--amber-soft); border-color: rgba(217, 119, 6, 0.2); }

.qb-icon {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  background: var(--accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.quota-bar.vip .qb-icon { background: var(--green); }
.quota-bar.empty .qb-icon { background: var(--amber); }
.qb-icon svg { width: 18px; height: 18px; }

.qb-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.qb-body strong { font-size: 0.88rem; color: var(--ink); }
.qb-body span { font-size: 0.76rem; color: var(--muted); margin-top: 1px; }

.qb-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.qb-link { font-size: 0.8rem; color: var(--accent); font-weight: 600; }
.qb-link:hover { text-decoration: underline; }
.qb-link-vip { color: var(--green); }
.qb-btn { padding: 7px 16px; font-size: 0.82rem; }

@media (max-width: 560px) {
  .quota-bar { flex-wrap: wrap; }
  .qb-actions { width: 100%; justify-content: flex-end; }
}
</style>
