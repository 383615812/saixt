<template>
  <div class="container rank-page">
    <div class="page-head">
      <h2>学习排行榜</h2>
      <p>按累计答对题数排名，与全省考生一起比拼进步</p>
    </div>

    <!-- 骨架屏 -->
    <template v-if="loading">
      <div class="card my-rank">
        <div class="skeleton rk-circle"></div>
        <div class="sk-lines">
          <div class="skeleton rk-line w60"></div>
          <div class="skeleton rk-line w40"></div>
        </div>
      </div>
      <div class="card rank-list">
        <div v-for="i in 6" :key="i" class="sk-row">
          <div class="skeleton rk-circle sm"></div>
          <div class="skeleton rk-line w30"></div>
          <div class="skeleton rk-line w50"></div>
        </div>
      </div>
    </template>

    <template v-else>
      <!-- 我的排名 -->
      <div v-if="mine" class="card my-rank">
        <div class="mr-ring" :class="'ring-' + Math.min(mine.rank, 3)">
          <div class="mr-avatar">{{ (mine.nickname || '考')[0] }}</div>
        </div>
        <div class="mr-info">
          <div class="mr-title">
            <h3>我的排名：第 {{ mine.rank }} 名</h3>
            <span v-if="mine.rank <= 3" class="mr-badge"><span class="mb-ic" v-html="ICONS.trophy"></span>榜上有名</span>
          </div>
          <p>答对 <strong>{{ mine.correct }}</strong> 题 · 正确率 <strong>{{ mine.accuracy }}%</strong></p>
          <div class="mr-bar"><div class="mr-fill" :style="{ width: mine.accuracy + '%' }"></div></div>
        </div>
        <router-link to="/practice" class="btn btn-primary">继续刷题提升排名</router-link>
      </div>

      <!-- 前三名领奖台 -->
      <div v-if="podium.length" class="podium">
        <div v-for="(p, i) in podium" :key="p.user_id" class="podium-col" :class="'col-' + (i + 1)">
          <div class="podium-avatar" :class="'av-' + (i + 1)">{{ (p.nickname || '考')[0] }}</div>
          <div class="podium-name">{{ p.nickname }}</div>
          <div class="podium-stats">答对 {{ p.correct }} 题</div>
          <div class="podium-block" :class="'block-' + (i + 1)">
            <span class="podium-medal" v-html="MEDALS[i]"></span>
          </div>
        </div>
      </div>

      <div v-if="!list.length" class="card empty">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
        </div>
        <p>暂无排名数据</p>
        <span class="empty-sub">快去刷题，成为第一个上榜的人</span>
        <router-link to="/practice" class="btn btn-primary empty-btn">开始刷题</router-link>
      </div>

      <!-- 完整榜单 -->
      <div v-else class="card rank-list">
        <div v-for="(r, i) in list" :key="r.user_id" class="rank-row" :class="{ me: mine && r.user_id === mine.user_id }">
          <div class="rank-no" :class="'top' + (i + 1)">
            <span v-if="i < 3" class="rank-medal" v-html="MEDALS[i]"></span>
            <template v-else>{{ i + 1 }}</template>
          </div>
          <div class="rank-avatar">{{ (r.nickname || '考')[0] }}</div>
          <div class="rank-name">
            <strong>{{ r.nickname }}</strong>
            <span v-if="mine && r.user_id === mine.user_id" class="me-tag">我</span>
          </div>
          <div class="rank-stats">
            <span>答对 <strong>{{ r.correct }}</strong> 题</span>
            <span class="rank-acc">
              <span class="acc-bar"><span class="acc-fill" :style="{ width: r.accuracy + '%' }"></span></span>
              {{ r.accuracy }}%
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { toast } from '../toast'

const MEDALS = [
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14.6" r="5.2"/><path d="M8.6 3.6 12 9l3.4-5.4"/><path d="M6.4 8.6H4a.55.55 0 0 1-.46-.88L6.4 3.9"/><path d="M17.6 8.6H20a.55.55 0 0 0 .46-.88L17.6 3.9"/><path d="M10.1 14.9l1.3 1.3 2.5-2.5"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14.6" r="5.2"/><path d="M8.6 3.6 12 9l3.4-5.4"/><path d="M6.4 8.6H4a.55.55 0 0 1-.46-.88L6.4 3.9"/><path d="M17.6 8.6H20a.55.55 0 0 0 .46-.88L17.6 3.9"/><path d="M10.1 14.9l1.3 1.3 2.5-2.5"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14.6" r="5.2"/><path d="M8.6 3.6 12 9l3.4-5.4"/><path d="M6.4 8.6H4a.55.55 0 0 1-.46-.88L6.4 3.9"/><path d="M17.6 8.6H20a.55.55 0 0 0 .46-.88L17.6 3.9"/><path d="M10.1 14.9l1.3 1.3 2.5-2.5"/></svg>`
]
const ICONS = {
  trophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3a2 2 0 0 1 0 5h-3"/><path d="M7 5H4a2 2 0 0 0 0 5h3"/></svg>`
}

const list = ref([])
const mine = ref(null)
const loading = ref(true)

const podium = computed(() => list.value.slice(0, 3))

onMounted(async () => {
  try {
    const data = await api.get('/ranking?limit=50')
    list.value = data.list
    mine.value = data.mine
  } catch (e) {
    toast(e.message || '排行榜加载失败，请稍后重试', 'error')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.page-head { margin-bottom: 20px; }
.page-head h2 { font-size: 1.6rem; }
.page-head p { color: var(--muted); margin-top: 4px; }

/* 骨架屏（复用全局 .skeleton 类） */
.rk-circle { width: 48px; height: 48px; border-radius: 50%; }
.rk-circle.sm { width: 36px; height: 36px; }
.rk-line { height: 14px; }
.sk-lines { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.sk-row { display: flex; align-items: center; gap: 14px; padding: 13px 6px; }
.w60 { width: 60%; } .w50 { width: 50%; } .w40 { width: 40%; } .w30 { width: 30%; }

/* 我的排名 */
.my-rank {
  display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
  padding: 20px 24px; margin-bottom: 20px;
  background: var(--grad-accent-soft);
  border-color: transparent;
}
.mr-ring {
  width: 62px; height: 62px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid var(--accent);
  background: var(--surface);
}
.mr-ring.ring-1 { border-color: #d97706; }
.mr-ring.ring-2 { border-color: #94a3b8; }
.mr-ring.ring-3 { border-color: #b45309; }
.mr-avatar {
  width: 52px; height: 52px; border-radius: 50%;
  background: var(--accent-soft); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 1.3rem;
}
.mr-info { flex: 1; min-width: 200px; }
.mr-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mr-title h3 { font-size: 1.12rem; }
.mr-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 0.75rem; padding: 2px 10px; border-radius: 999px; background: var(--amber-soft); color: #b45309; font-weight: 600; }
.mb-ic { display: inline-flex; }
.mb-ic svg { width: 13px; height: 13px; }
.mr-info p { color: var(--muted); font-size: 0.88rem; margin-top: 3px; }
.mr-info p strong { color: var(--accent); }
.mr-bar { height: 6px; background: rgba(79, 95, 240, 0.12); border-radius: 999px; margin-top: 8px; overflow: hidden; max-width: 260px; }
.mr-fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width 0.8s var(--ease); }

/* 领奖台 */
.podium {
  display: flex; align-items: flex-end; justify-content: center; gap: 14px;
  margin-bottom: 20px; padding: 10px 16px 0;
}
.podium-col { display: flex; flex-direction: column; align-items: center; width: 96px; animation: podiumIn 0.5s var(--ease-out) both; }
.podium-col.col-2 { animation-delay: 0.08s; }
.podium-col.col-3 { animation-delay: 0.16s; }
@keyframes podiumIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
.podium-avatar {
  width: 52px; height: 52px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 1.2rem; color: #fff; margin-bottom: 8px;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
}
.av-1 { background: #d97706; }
.av-2 { background: #94a3b8; }
.av-3 { background: #b45309; }
.podium-name { font-size: 0.85rem; font-weight: 700; max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.podium-stats { font-size: 0.75rem; color: var(--muted); margin: 2px 0 8px; }
.podium-block {
  width: 100%; border-radius: 12px 12px 0 0;
  display: flex; align-items: flex-start; justify-content: center; padding-top: 10px;
  position: relative;
}
.block-1 { height: 92px; background: rgba(217, 119, 6, 0.16); }
.block-2 { height: 68px; background: rgba(148, 163, 184, 0.2); }
.block-3 { height: 52px; background: rgba(180, 83, 9, 0.14); }
.podium-medal { font-size: 1.3rem; display: flex; }
.podium-medal svg { width: 26px; height: 26px; }
.podium-col.col-1 .podium-medal { color: #d97706; }
.podium-col.col-2 .podium-medal { color: #94a3b8; }
.podium-col.col-3 .podium-medal { color: #b45309; }

.rank-no { width: 40px; text-align: center; font-weight: 700; font-size: 1.05rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.rank-medal { display: inline-flex; }
.rank-medal svg { width: 22px; height: 22px; }
.rank-no.top1 .rank-medal { color: #d97706; }
.rank-no.top2 .rank-medal { color: #94a3b8; }
.rank-no.top3 .rank-medal { color: #b45309; }
.rank-no.top1, .rank-no.top2, .rank-no.top3 { font-size: 1.4rem; }
.rank-row {
  display: flex; align-items: center; gap: 14px;
  padding: 13px 6px; border-bottom: 1px solid var(--rule);
  transition: background 0.2s var(--ease), border-radius 0.2s var(--ease);
}
.rank-row:hover { background: var(--bg-soft); }
.rank-row:last-child { border-bottom: none; }
.rank-row.me { background: var(--accent-soft); border-radius: 10px; padding: 13px 10px; }
.rank-row.me:hover { background: color-mix(in srgb, var(--accent-soft) 72%, var(--bg-soft)); }

.rank-avatar {
  width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent-soft); color: var(--accent);
  display: flex; align-items: center; justify-content: center; font-weight: 700;
}
.rank-name { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 120px; }
.rank-name strong { font-size: 0.95rem; }
.me-tag { font-size: 0.72rem; padding: 1px 8px; border-radius: 999px; background: var(--accent); color: #fff; }
.rank-stats { display: flex; align-items: center; gap: 18px; font-size: 0.85rem; color: var(--muted); }
.rank-stats strong { color: var(--accent); }
.rank-acc { display: flex; align-items: center; gap: 8px; }
.acc-bar { width: 64px; height: 5px; background: var(--rule-soft); border-radius: 999px; overflow: hidden; }
.acc-fill { display: block; height: 100%; background: var(--green); border-radius: 999px; transition: width 0.8s var(--ease); }

/* 空状态 */
@media (max-width: 600px) {
  .page-head h2 { font-size: 1.3rem; }
  .page-head p { font-size: 0.82rem; }
  .my-rank { flex-direction: column; align-items: flex-start; padding: 16px; gap: 12px; }
  .my-rank .btn { width: 100%; }
  .mr-ring { width: 54px; height: 54px; }
  .mr-avatar { width: 45px; height: 45px; font-size: 1.1rem; }
  .mr-info { min-width: 0; width: 100%; }
  .mr-title h3 { font-size: 1.02rem; }
  .mr-info p { font-size: 0.82rem; }
  .podium { gap: 8px; }
  .podium-col { width: 84px; }
  .podium-avatar { width: 46px; height: 46px; font-size: 1.05rem; }
  .block-1 { height: 80px; } .block-2 { height: 60px; } .block-3 { height: 46px; }
  .rank-list { padding: 6px 12px; }
  .rank-row { padding: 12px 4px; gap: 10px; }
  .rank-no { width: 32px; font-size: 0.92rem; }
  .rank-no.top1, .rank-no.top2, .rank-no.top3 { font-size: 1.15rem; }
  .rank-avatar { width: 32px; height: 32px; font-size: 0.82rem; }
  .rank-name strong { font-size: 0.88rem; }
  .rank-name { min-width: 80px; }
  .me-tag { font-size: 0.75rem; }
  .rank-stats { gap: 10px; font-size: 0.76rem; }
  .rank-stats span:nth-child(1) { display: none; }
  .acc-bar { width: 48px; }
}
@media (max-width: 400px) {
  .rank-row { gap: 8px; }
  .rank-no { width: 28px; }
  .rank-avatar { width: 28px; height: 28px; }
  .rank-name { min-width: 60px; }
  .rank-stats { gap: 8px; font-size: 0.75rem; }
}
</style>
