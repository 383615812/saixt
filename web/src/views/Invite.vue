<template>
  <div class="container invite-page">
    <div class="page-head">
      <h2>邀请好友</h2>
      <p>分享你的专属邀请码，好友注册双方都得积分</p>
    </div>

    <!-- 邀请码卡 -->
    <div class="card invite-hero">
      <div class="ih-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M21 21v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/></svg>
      </div>
      <div class="ih-body">
        <span class="ih-label">我的专属邀请码</span>
        <div class="ih-code" @click="copyCode">{{ data.code || '------' }}</div>
        <span class="ih-hint">点击邀请码即可复制</span>
      </div>
      <button class="btn btn-primary ih-btn" @click="copyCode">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
        复制邀请码
      </button>
    </div>

    <!-- 使用邀请码 -->
    <div class="card redeem-card">
      <div class="rc-head">
        <span class="rc-title">使用邀请码</span>
        <span class="rc-sub">被好友邀请时，输入 TA 的邀请码可绑定邀请关系并获得积分享受权益</span>
      </div>
      <div class="rc-form">
        <input
          v-model="redeemCode"
          maxlength="6"
          placeholder="请输入 6 位邀请码"
          aria-label="邀请码"
          @keyup.enter="redeem"
        />
        <button class="btn btn-primary" :disabled="redeeming" @click="redeem">
          {{ redeeming ? '绑定中…' : '立即绑定' }}
        </button>
      </div>
      <p v-if="boundMsg" class="rc-bound">{{ boundMsg }}</p>
    </div>

    <!-- 奖励规则 -->
    <h3 class="sec-title">奖励规则</h3>
    <div class="reward-grid">
      <div class="card reward-item">
        <div class="ri-num">+50</div>
        <strong>你获得</strong>
        <p>好友通过你的邀请码注册成功</p>
      </div>
      <div class="card reward-item">
        <div class="ri-num">+20</div>
        <strong>好友获得</strong>
        <p>新用户注册奖励 + 使用邀请码奖励</p>
      </div>
      <div class="card reward-item">
        <div class="ri-num">∞</div>
        <strong>无上限</strong>
        <p>邀请好友数量不限，多邀多得</p>
      </div>
    </div>

    <!-- 邀请记录 -->
    <h3 class="sec-title">邀请记录 <span class="sec-sub">已邀请 {{ data.count ?? 0 }} 人 · 累计奖励 {{ data.totalReward ?? 0 }} 积分</span></h3>
    <div v-if="data.list?.length" class="card invite-list">
      <div class="invite-row" v-for="(it, i) in data.list" :key="i">
        <span class="ir-avatar">{{ (it.nickname || '友')[0] }}</span>
        <div class="ir-body">
          <strong>{{ it.nickname || '春招考生' }}</strong>
          <span class="ir-time">{{ it.created_at }}</span>
        </div>
        <span class="tag tag-green">已注册</span>
      </div>
    </div>
    <div v-else class="card empty">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M21 21v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/></svg></div>
      <p>还没有邀请记录</p>
      <span class="empty-sub">把邀请码分享给同学，一起备考一起拿积分</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'
import { toast } from '../toast'

const data = ref({ code: '', count: 0, totalReward: 0, list: [] })
const redeemCode = ref('')
const redeeming = ref(false)
const boundMsg = ref('')
// 是否已绑定他人邀请码（后端返回 my_inviter_id，用于避免重复绑定并引导流程）
const hasBound = ref(false)

async function load() {
  try {
    const d = await api.get('/invite/me')
    data.value = d
    if (d.my_inviter_id) {
      hasBound.value = true
      boundMsg.value = '你已绑定邀请码，无需重复绑定'
    }
  } catch (e) { toast.error(e.message) }
}

async function redeem() {
  const code = redeemCode.value.trim().toUpperCase()
  if (!code) return toast.error('请输入邀请码')
  if (redeeming.value) return
  if (hasBound.value) return toast.info('你已绑定过邀请码，无需重复绑定')
  redeeming.value = true
  try {
    const r = await api.post('/invite/redeem', { code })
    toast.success(r.message || '绑定成功')
    redeemCode.value = ''
    boundMsg.value = '绑定成功，邀请双方均已获得奖励'
    hasBound.value = true
    load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    redeeming.value = false
  }
}

async function copyCode() {
  if (!data.value.code) return
  try {
    await navigator.clipboard.writeText(data.value.code)
    toast.success('邀请码已复制，快去分享吧')
  } catch (e) {
    toast.error('复制失败，请手动复制')
  }
}

onMounted(load)
</script>

<style scoped>
.invite-page { max-width: 860px; }

.invite-hero {
  display: flex; align-items: center; gap: 18px;
  background: linear-gradient(135deg, #4f5ff0 0%, #6b58e8 100%);
  border: none; color: #fff; padding: 28px;
}
.ih-icon {
  width: 56px; height: 56px; border-radius: 18px; flex-shrink: 0;
  background: rgba(255, 255, 255, 0.16); color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.ih-icon svg { width: 30px; height: 30px; }
.ih-body { flex: 1; min-width: 0; }
.ih-label { font-size: 0.82rem; color: rgba(255, 255, 255, 0.75); }
.ih-code {
  font-size: 2rem; font-weight: 800; letter-spacing: 0.18em;
  margin: 4px 0 2px; cursor: pointer; user-select: all;
}
.ih-hint { font-size: 0.74rem; color: rgba(255, 255, 255, 0.65); }
.ih-btn {
  background: #fff; color: var(--accent);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.18);
}
.ih-btn:hover { background: #f4f5ff; color: var(--accent-deep); }
.ih-btn svg { width: 15px; height: 15px; }

.sec-title {
  margin: 28px 0 14px; font-size: 1.05rem; font-weight: 700;
  display: flex; align-items: center; gap: 9px;
}
.sec-title::before { content: ''; width: 4px; height: 16px; border-radius: 2px; background: var(--grad-accent); flex-shrink: 0; }
.sec-sub { font-size: 0.8rem; color: var(--muted-2); font-weight: 500; margin-left: 8px; }

/* 使用邀请码 */
.redeem-card { padding: 18px 20px; border: 1px dashed rgba(79, 95, 240, 0.45); background: var(--accent-soft); }
.rc-head { margin-bottom: 12px; }
.rc-title { font-weight: 700; font-size: 0.98rem; color: var(--ink); }
.rc-sub { display: block; font-size: 0.78rem; color: var(--muted); margin-top: 3px; }
.rc-form { display: flex; gap: 10px; max-width: 420px; }
.rc-form input {
  flex: 1; padding: 11px 14px; border: 1px solid var(--rule); border-radius: var(--radius-sm);
  font-size: 1rem; letter-spacing: 0.2em; text-transform: uppercase; outline: none;
  background: var(--surface); color: var(--ink);
  transition: border-color 0.25s var(--ease), box-shadow 0.25s var(--ease);
}
.rc-form input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79, 95, 240, 0.16); }
.rc-bound { margin-top: 10px; font-size: 0.86rem; color: var(--green); font-weight: 500; }

.reward-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.reward-item { text-align: center; padding: 20px 14px; }
.ri-num { font-size: 1.6rem; font-weight: 800; color: var(--accent); letter-spacing: -0.02em; }
.reward-item strong { display: block; font-size: 0.9rem; margin-top: 4px; }
.reward-item p { font-size: 0.76rem; color: var(--muted); margin-top: 4px; line-height: 1.6; }

.invite-list { padding: 6px 18px; }
.invite-row {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 0; border-bottom: 1px solid var(--rule-soft);
}
.invite-row:last-child { border-bottom: none; }
.ir-avatar {
  width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent-soft); color: var(--accent);
  display: flex; align-items: center; justify-content: center; font-weight: 700;
}
.ir-body { flex: 1; display: flex; flex-direction: column; }
.ir-body strong { font-size: 0.88rem; }
.ir-time { font-size: 0.75rem; color: var(--muted-2); }

@media (max-width: 600px) {
  .invite-hero { flex-wrap: wrap; padding: 20px; }
  .ih-btn { width: 100%; }
  .reward-grid { grid-template-columns: 1fr; }
  .ih-code { font-size: 1.6rem; }
  .invite-list { padding: 4px 14px; }
}
@media (max-width: 400px) {
  .invite-hero { padding: 16px; }
  .ih-icon { width: 48px; height: 48px; border-radius: 15px; }
  .ih-code { font-size: 1.35rem; letter-spacing: 0.12em; }
  .reward-item { padding: 16px 10px; }
}
</style>
