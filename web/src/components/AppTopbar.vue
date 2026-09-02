<template>
  <header class="topbar">
    <div class="container topbar-inner">
      <router-link to="/" class="brand">
        <span class="brand-logo">
          <img src="../assets/logo.svg" alt="云南春招智能学习平台 Logo" class="brand-logo-img">
        </span>
        <span class="brand-text">
          <strong>云南春招</strong>
          <small>智能学习平台</small>
        </span>
      </router-link>

      <nav class="nav" aria-label="主导航">
        <router-link
          v-for="item in mainNav"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ active: isActive(item) }"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="ICONS[item.icon]"></svg>
          <span>{{ item.label }}</span>
        </router-link>

        <div class="nav-more" @mouseenter="moreOpen = true" @mouseleave="moreOpen = false">
          <button class="nav-more-btn" :class="{ open: moreOpen, active: moreActive }" @click="moreOpen = !moreOpen" aria-label="更多功能" :aria-expanded="moreOpen" aria-haspopup="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
            <span>更多</span>
            <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <transition name="more">
            <div v-if="moreOpen" class="more-panel" role="menu" aria-label="更多功能">
              <div v-for="group in moreGroups" :key="group.title" class="more-group">
                <div class="more-group-title">{{ group.title }}</div>
                <router-link
                  v-for="item in group.items"
                  :key="item.to"
                  :to="item.to"
                  role="menuitem"
                  :class="{ active: isActive(item) }"
                  @click="moreOpen = false"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="ICONS[item.icon]"></svg>
                  <span class="mp-text">
                    <strong>{{ item.label }}</strong>
                    <small>{{ item.desc }}</small>
                  </span>
                </router-link>
              </div>
            </div>
          </transition>
        </div>
      </nav>

      <div class="user-area">
        <button class="search-btn" @click="$emit('open-search')" title="搜索题目 / 院校 / 专业" aria-label="全局搜索">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        </button>
        <template v-if="user">
          <button class="bell" :class="{ has: reviewDue > 0 }" @click="$emit('go-review')" title="复习提醒" :aria-label="reviewDue > 0 ? `复习提醒：${reviewDue} 道待复习` : '复习提醒'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="ICONS.bell"></svg>
            <span v-if="reviewDue > 0" class="bell-badge">{{ reviewDue > 99 ? '99+' : reviewDue }}</span>
          </button>
          <router-link to="/points" class="points-chip" title="我的积分">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3z"/></svg>
            <span>{{ points }}</span>
          </router-link>
          <router-link to="/dashboard" class="user-chip">
            <span class="avatar-wrap">
              <span class="avatar">{{ (user.nickname || '考')[0] }}</span>
              <span v-if="vip" class="vip-badge" title="VIP 会员">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7L12 3z"/></svg>
              </span>
            </span>
            <span class="uname">{{ user.nickname }}</span>
          </router-link>
        </template>
        <template v-else>
          <router-link to="/login" class="btn btn-ghost login-btn">登录</router-link>
          <router-link to="/login?mode=register" class="btn btn-primary reg-btn">免费注册</router-link>
        </template>
      </div>

      <button class="hamburger" :class="{ open: menuOpen }" @click="$emit('toggle-menu')" aria-label="打开导航菜单" :aria-expanded="menuOpen" aria-controls="drawer-menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { ICONS } from '../icons'

defineProps({
  user: { type: Object, default: null },
  vip: { type: Boolean, default: false },
  points: { type: Number, default: 0 },
  reviewDue: { type: Number, default: 0 },
  menuOpen: { type: Boolean, default: false }
})
defineEmits(['open-search', 'go-review', 'toggle-menu'])

const route = useRoute()
const moreOpen = ref(false)

const mainNav = [
  { to: '/', label: '首页', icon: 'home' },
  { to: '/practice', label: '在线刷题', icon: 'pen' },
  { to: '/ai-practice', label: 'AI 练习', icon: 'spark' },
  { to: '/bank', label: '题库', icon: 'book' },
  { to: '/wrong-book', label: '错题本', icon: 'cross' },
  { to: '/dashboard', label: '个人中心', icon: 'user' }
]

const moreGroups = [
  {
    title: '学习中心',
    items: [
      { to: '/tasks', label: '任务中心', icon: 'check', desc: '每日学习任务' },
      { to: '/paper', label: '薄弱专项套卷', icon: 'page', desc: '自动针对薄弱点出卷' },
      { to: '/review', label: '复习计划', icon: 'refresh', desc: '错题复习' },
      { to: '/plan', label: '学习计划', icon: 'calendar', desc: 'AI 计划' },
      { to: '/favorites', label: '我的收藏', icon: 'star', desc: '收藏题目' },
      { to: '/remind', label: '提醒设置', icon: 'bell', desc: '复习提醒' }
    ]
  },
  {
    title: '成长工具',
    items: [
      { to: '/ai', label: 'AI 答疑', icon: 'chat', desc: '智能问答' },
      { to: '/achievements', label: '成就徽章', icon: 'trophy', desc: '学习成就' },
      { to: '/weekly-report', label: '学习周报', icon: 'chart', desc: '每周总结' },
      { to: '/data-screen', label: '数据大屏', icon: 'chart', desc: '可视化看板' },
      { to: '/knowledge-graph', label: '知识图谱', icon: 'spark', desc: '知识点关联' },
      { to: '/blind-box', label: '盲盒刷题', icon: 'spark', desc: '抽题抽惊喜' }
    ]
  },
  {
    title: '志愿择校',
    items: [
      { to: '/recommend', label: '志愿推荐', icon: 'target', desc: '择校建议' },
      { to: '/schools', label: '院校库', icon: 'school', desc: '院校信息' },
      { to: '/ranking', label: '排行榜', icon: 'podium', desc: '学习排行' }
    ]
  },
  {
    title: '会员与邀请',
    items: [
      { to: '/vip', label: 'VIP 会员', icon: 'trophy', desc: '解锁无限 AI' },
      { to: '/points', label: '积分中心', icon: 'star', desc: '积分明细' },
      { to: '/invite', label: '邀请好友', icon: 'user', desc: '邀请得积分' }
    ]
  }
]

const moreActive = computed(() => moreGroups.some(group => group.items.some(item => isActive(item))))

function isActive(item) {
  if (item.to === '/') return route.path === '/'
  return route.path === item.to || route.path.startsWith(item.to + '/')
}

// 点击"更多"面板外部时关闭下拉
function onClickOutside(e) {
  if (moreOpen.value && !e.target.closest('.nav-more')) moreOpen.value = false
}
onMounted(() => document.addEventListener('click', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))
</script>

<style scoped>
.topbar {
    position: sticky; top: 0; z-index: 100;
    background: rgba(250, 251, 253, 0.88);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border-bottom: 1px solid rgba(230, 233, 241, 0.9);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
  }
.topbar-inner { display: flex; align-items: center; gap: 24px; height: 64px; }

.brand { display: flex; align-items: center; gap: 10px; }
.brand-logo {
  position: relative; overflow: hidden;
  width: 40px; height: 40px; border-radius: 12px;
  background: #ffffff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(79, 95, 240, 0.18), 0 1px 3px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(79, 95, 240, 0.12);
  transition: transform 0.3s var(--ease), box-shadow 0.3s var(--ease);
}
.brand-logo-img { width: 28px; height: 28px; position: relative; z-index: 1; display: block; }
.brand-logo::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, transparent 45%);
  border-radius: inherit;
}
.brand-logo::after {
  content: ''; position: absolute; inset: -30%;
  background: conic-gradient(from 0deg, transparent 0%, rgba(255, 255, 255, 0.45) 12%, transparent 24%);
  opacity: 0; transition: opacity 0.35s var(--ease);
}
.brand:hover .brand-logo {
  transform: scale(1.07) rotate(-4deg);
  box-shadow: 0 6px 22px rgba(79, 95, 240, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.brand:hover .brand-logo::after { opacity: 1; animation: logoShine 1.1s linear infinite; }
@keyframes logoShine { to { transform: rotate(360deg); } }
.brand-text { display: flex; flex-direction: column; line-height: 1.2; }
.brand-text strong { font-size: 1.05rem; color: var(--ink); letter-spacing: 0.02em; }
.brand-text small { font-size: 0.72rem; color: var(--muted-2); }

.nav { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }

.nav-link {
  position: relative;
  display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 13px; border-radius: 10px;
  color: var(--muted); font-size: 0.92rem; font-weight: 500;
  transition: color 0.22s var(--ease), background-color 0.22s var(--ease), transform 0.22s var(--ease);
  white-space: nowrap;
}
.nav-link svg { width: 18px; height: 18px; flex-shrink: 0; transition: transform 0.22s var(--ease); }
.nav-link::after {
  content: ''; position: absolute; left: 14px; right: 14px; bottom: 2px;
  height: 2.5px; border-radius: 2px;
  background: var(--grad-accent);
  transform: scaleX(0); transform-origin: center;
  transition: transform 0.28s var(--ease);
}
.nav-link:hover { color: var(--accent); background: var(--accent-soft); }
.nav-link:hover svg { transform: scale(1.08); }
.nav-link:active { transform: scale(0.97); }
.nav-link.active {
  color: var(--accent); font-weight: 600;
  background: var(--accent-soft);
}
.nav-link.active svg { color: var(--accent); }
.nav-link.active::after { transform: scaleX(1); }
@media (prefers-reduced-motion: reduce) {
  .nav-link.active, .nav-more-btn.active { animation: none; }
}

.nav-link:focus-visible, .nav-more-btn:focus-visible, .bell:focus-visible, .hamburger:focus-visible, .search-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.nav-more { position: relative; }
.nav-more-btn {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 13px; border-radius: 10px; border: none;
  background: transparent; color: var(--muted); font-size: 0.92rem; font-weight: 500;
  transition: color 0.22s var(--ease), background-color 0.22s var(--ease), transform 0.22s var(--ease); white-space: nowrap;
}
.nav-more-btn > svg { width: 18px; height: 18px; }
.nav-more-btn .caret { width: 14px; height: 14px; transition: transform 0.3s var(--ease); }
.nav-more-btn:hover, .nav-more-btn.open { color: var(--accent); background: var(--accent-soft); }
.nav-more-btn:active { transform: scale(0.97); }
.nav-more-btn.active { color: var(--accent); font-weight: 600; background: var(--accent-soft); }
.nav-more-btn.open .caret { transform: rotate(180deg); }

.more-panel {
  position: absolute; top: calc(100% + 14px); right: 0;
  width: 520px; padding: 12px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid var(--glass-border);
  border-radius: 18px;
  box-shadow: var(--shadow-lg);
  display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px;
}
.more-panel::before {
  content: ''; position: absolute; top: -6px; right: 30px;
  width: 12px; height: 12px;
  background: #fff; border-left: 1px solid var(--glass-border); border-top: 1px solid var(--glass-border);
  transform: rotate(45deg); border-radius: 2px;
}
.more-group { display: flex; flex-direction: column; }
.more-group-title {
  font-size: 0.7rem; font-weight: 700; color: var(--muted-2);
  letter-spacing: 0.1em; padding: 6px 12px 4px;
  text-transform: uppercase;
}
.more-group + .more-group { margin-top: 6px; }
.more-panel a {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 12px; border-radius: 12px;
  color: var(--ink); transition: background-color 0.22s var(--ease), transform 0.22s var(--ease);
}
.more-panel a > svg {
  width: 34px; height: 34px; padding: 7px; box-sizing: border-box;
  border-radius: 10px; background: var(--accent-soft); color: var(--accent);
  flex-shrink: 0; transition: background-color 0.22s var(--ease), color 0.22s var(--ease);
}
.more-panel a:hover { background: var(--accent-soft); transform: translateX(2px); }
.more-panel a:hover > svg { background: var(--accent); color: #fff; }
.more-panel a:active { background: var(--accent-soft); transform: translateX(2px) scale(0.98); }
.more-panel a.active { background: var(--accent-soft); }
.more-panel a.active strong { color: var(--accent); }
.mp-text { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
.mp-text strong { font-size: 0.9rem; font-weight: 600; color: var(--ink-soft); }
.mp-text small { font-size: 0.72rem; color: var(--muted-2); }

.more-enter-active, .more-leave-active { transition: opacity 0.25s var(--ease), transform 0.25s var(--ease); transform-origin: top right; }
.more-enter-from, .more-leave-to { opacity: 0; transform: translateY(-8px) scale(0.96); }

.user-area { display: flex; align-items: center; gap: 10px; }
.bell {
  position: relative; width: 38px; height: 38px; border-radius: 50%;
  background: var(--surface); border: 1px solid var(--rule); cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: border-color 0.25s var(--ease), background-color 0.25s var(--ease), transform 0.25s var(--ease), box-shadow 0.25s var(--ease);
}
.bell:hover { border-color: var(--accent); background: var(--accent-soft); transform: scale(1.08); }
.bell:active { transform: scale(0.94); }
.bell.has { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
.bell svg { width: 19px; height: 19px; color: var(--muted); transition: color 0.25s var(--ease); }
.bell:hover svg { color: var(--accent); }
.bell.has svg { color: var(--accent); }
.bell-badge {
  position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 4px;
  border-radius: var(--radius-full); background: var(--red); color: #fff;
  font-size: 0.7rem; font-weight: 700; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(225, 29, 72, 0.4);
}
.user-chip {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 14px 5px 5px; border-radius: var(--radius-full);
  background: var(--glass); border: 1px solid var(--glass-border);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  transition: box-shadow 0.25s var(--ease), transform 0.25s var(--ease);
}
.user-chip:hover { box-shadow: var(--shadow-sm); }
.user-chip:active { transform: scale(0.98); }
.points-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: var(--radius-full);
  background: var(--amber-soft); border: 1px solid rgba(245, 158, 11, 0.28);
  color: var(--amber); font-size: 0.82rem; font-weight: 700;
  transition: box-shadow 0.25s var(--ease), transform 0.25s var(--ease);
}
.points-chip:hover { box-shadow: var(--shadow-sm); transform: translateY(-1px); }
.points-chip:active { transform: scale(0.97); }
.points-chip svg { width: 14px; height: 14px; }
.avatar-wrap { position: relative; display: inline-flex; }
.avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--accent);
  color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem;
  box-shadow: 0 2px 6px rgba(79, 95, 240, 0.24);
}
.vip-badge {
  position: absolute; right: -5px; bottom: -3px;
  width: 16px; height: 16px; border-radius: 50%;
  background: linear-gradient(135deg, #f59e0b, #f97316);
  color: #fff; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 4px rgba(245, 158, 11, 0.5);
  border: 1.5px solid var(--surface);
}
.vip-badge svg { width: 9px; height: 9px; }
.uname { font-size: 0.88rem; color: var(--ink); font-weight: 600; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.login-btn { padding: 8px 16px; }
.reg-btn { padding: 8px 16px; }

.hamburger { display: none; flex-direction: column; gap: 5px; background: none; border: none; padding: 8px; }
.hamburger span { width: 22px; height: 2.5px; background: var(--ink); border-radius: 2px; transition: transform 0.3s var(--ease), opacity 0.3s var(--ease); }
.hamburger.open span:nth-child(1) { transform: translateY(7.5px) rotate(45deg); }
.hamburger.open span:nth-child(2) { opacity: 0; }
.hamburger.open span:nth-child(3) { transform: translateY(-7.5px) rotate(-45deg); }
.hamburger:active { opacity: 0.7; }

.search-btn {
  width: 38px; height: 38px; border-radius: 11px;
  border: 1px solid var(--rule); background: var(--surface);
  color: var(--muted); display: flex; align-items: center; justify-content: center;
  transition: border-color 0.2s var(--ease), color 0.2s var(--ease), box-shadow 0.2s var(--ease), transform 0.15s var(--ease);
}
.search-btn:hover { border-color: var(--accent); color: var(--accent); box-shadow: var(--shadow-sm); transform: translateY(-1px); }
.search-btn:active { transform: scale(0.94); }
.search-btn svg { width: 18px; height: 18px; }

@media (max-width: 1180px) {
  .nav-link, .nav-more-btn { padding: 8px 10px; }
}
@media (max-width: 1080px) {
  .nav-link, .nav-more-btn { padding: 8px 8px; font-size: 0.88rem; gap: 5px; }
  .nav-link svg, .nav-more-btn > svg { width: 16px; height: 16px; }
  .reg-btn { display: none; }
  .more-panel { width: min(480px, 92vw); }
}
@media (max-width: 960px) {
  .topbar-inner { gap: 14px; }
  .nav { gap: 2px; }
  .nav-link, .nav-more-btn { padding: 8px 7px; }
  .more-panel { width: min(440px, 92vw); }
}

@media (max-width: 900px) {
  .nav { display: none; }
  .hamburger { display: flex; }
  .user-area { margin-left: auto; }
  .reg-btn { display: none; }
}
@media (max-width: 760px) {
  .points-chip { display: none; }
  .uname { display: none; }
  .user-chip { padding: 4px; }
}
@media (max-width: 600px) {
  .topbar-inner { height: 56px; gap: 12px; padding-top: var(--safe-top); }
  .brand-logo { width: 34px; height: 34px; border-radius: 10px; }
  .brand-logo-img { width: 24px; height: 24px; }
  .brand-text strong { font-size: 0.98rem; }
  .brand-text small { display: none; }
}
</style>
