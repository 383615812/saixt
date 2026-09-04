<template>
  <div class="app">
    <AppTopbar
      :user="user"
      :vip="vip"
      :points="points"
      :review-due="reviewDue"
      :menu-open="menuOpen"
      @open-search="openSearch"
      @go-review="goReview"
      @toggle-menu="menuOpen = !menuOpen"
    />

    <AppDrawer
      :open="menuOpen"
      :user="user"
      :vip="vip"
      :points="points"
      @close="menuOpen = false"
    />

    <main class="main">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" :key="route.path" />
        </transition>
      </router-view>
    </main>

    <!-- 回到顶部 -->
    <transition name="fade">
      <button v-if="showTopBtn" class="top-btn" @click="scrollTop" title="回到顶部" aria-label="回到顶部">
        <svg class="tp-ring" viewBox="0 0 40 40" aria-hidden="true">
          <circle class="tp-track" cx="20" cy="20" r="17"/>
          <circle class="tp-bar" cx="20" cy="20" r="17" :style="{ strokeDashoffset: ringOffset }"/>
        </svg>
        <span class="tp-arrow">↑</span>
      </button>
    </transition>

    <!-- 移动端底部导航栏 -->
    <nav v-if="!hideTabbar" class="tabbar" aria-label="底部导航">
      <router-link
        v-for="item in tabNav"
        :key="item.to"
        :to="item.to"
        class="tab-item"
        :class="{ active: isTabActive(item) }"
      >
        <span class="tab-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="ICONS[item.icon]"></svg>
        </span>
        <span class="tab-label">{{ item.label }}</span>
      </router-link>
    </nav>

    <!-- PWA 安装提示 -->
    <transition name="install">
      <div v-if="showInstall" class="install-banner">
        <span class="ib-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
        </span>
        <div class="ib-text">
          <strong>安装「云南春招」到桌面</strong>
          <span>随时刷题，离线也能学</span>
        </div>
        <button class="btn btn-primary btn-sm ib-btn" @click="doInstall">安装</button>
        <button class="ib-close" @click="dismissInstall" aria-label="关闭安装提示">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
    </transition>

    <AppSearch :open="searchOpen" @close="searchOpen = false" />

    <footer class="footer">
      <div class="container footer-inner">
        <div class="foot-brand">
          <div class="foot-logo">
            <img src="./assets/logo.svg" alt="云南春招智能学习平台 Logo" class="foot-logo-img">
          </div>
          <div class="foot-brand-text">
            <strong>云南春招智能学习平台</strong>
            <p>面向云南省春季招生考生的刷题 · 排名 · 志愿推荐一体化学习平台</p>
          </div>
        </div>
        <div class="foot-col">
          <span class="foot-title">快捷入口</span>
          <router-link to="/practice">在线刷题</router-link>
          <router-link to="/bank">题库练习</router-link>
          <router-link to="/ai">AI 答疑</router-link>
          <router-link to="/recommend">志愿推荐</router-link>
        </div>
        <div class="foot-col">
          <span class="foot-title">学习工具</span>
          <router-link to="/wrong-book">错题本</router-link>
          <router-link to="/review">复习计划</router-link>
          <router-link to="/weekly-report">学习周报</router-link>
          <router-link to="/dashboard">学习报告</router-link>
        </div>
        <div class="foot-col foot-note">
          <span class="foot-title">平台说明</span>
          <p>考试信息以云南省教育厅、云南省招生考试院官方发布为准</p>
          <p>© 2026 昆明梦飞教育培训学校 · 版权所有</p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api, getUser } from './api'
import { ICONS } from './icons'
import AppTopbar from './components/AppTopbar.vue'
import AppDrawer from './components/AppDrawer.vue'
import AppSearch from './components/AppSearch.vue'

const router = useRouter()
const route = useRoute()
const user = ref(getUser())
const menuOpen = ref(false)
const reviewDue = ref(0)
const showTopBtn = ref(false)
const scrollProgress = ref(0)
const vip = ref(false)
const points = ref(0)
let bellTimer = null
const showInstall = ref(false)
let installPrompt = null

// 全局搜索
const searchOpen = ref(false)

function openSearch() {
  searchOpen.value = true
}

function doInstall() {
  if (!installPrompt) return
  installPrompt.prompt()
  installPrompt.userChoice.then(() => { installPrompt = null; showInstall.value = false })
}
function dismissInstall() {
  showInstall.value = false
  localStorage.setItem('saixt_install_dismissed', '1')
}

function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const ringOffset = computed(() => Math.round(106.8 * (1 - scrollProgress.value) * 10) / 10)

function onScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight
  scrollProgress.value = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0
  showTopBtn.value = window.scrollY > 400
}

async function refreshReviewDue() {
  if (!getUser()) return
  try {
    const d = await api.get('/practice/review/summary')
    const prev = reviewDue.value
    reviewDue.value = d.dueToday
    if (d.dueToday > 0 && prev === 0) notifyDue(d.dueToday)
  } catch (e) { /* 忽略网络异常 */ }
}

// 刷新导航栏会员状态与积分余额
async function refreshCommerce() {
  if (!getUser()) return
  try {
    const m = await api.get('/membership/me')
    vip.value = m.vip
  } catch (e) { /* 忽略 */ }
  try {
    const p = await api.get('/points/me')
    points.value = p.balance
  } catch (e) { /* 忽略 */ }
}

function notifyDue(n) {
  if (!('Notification' in window)) return
  if (localStorage.getItem('saixt_browser_notif') !== '1') return
  if (Notification.permission === 'granted') {
    try {
      new Notification('复习提醒', {
        body: `你有 ${n} 道错题到了复习时间，点击去复习`,
        tag: 'review-due'
      })
    } catch (e) { /* 忽略 */ }
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission()
  }
}

function goReview() {
  router.push('/review')
}

onMounted(() => {
  refreshReviewDue()
  refreshCommerce()
  bellTimer = setInterval(refreshReviewDue, 5 * 60 * 1000)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('ai-quota-refresh', refreshCommerce)
  // PWA 安装提示（桌面端与已关闭过的用户不打扰）
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installPrompt = e
    if (!localStorage.getItem('saixt_install_dismissed') && !window.matchMedia('(display-mode: standalone)').matches) {
      showInstall.value = true
    }
  })
  window.addEventListener('appinstalled', () => { showInstall.value = false; installPrompt = null })
})

onBeforeUnmount(() => {
  if (bellTimer) clearInterval(bellTimer)
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('ai-quota-refresh', refreshCommerce)
})

watch(() => route.path, () => {
  if (['/points', '/vip', '/invite', '/dashboard'].includes(route.path)) refreshCommerce()
})

// 移动端底部导航（未登录时"我的"指向登录页）
const tabNav = [
  { to: '/', label: '首页', icon: 'home' },
  { to: '/practice', label: '刷题', icon: 'pen' },
  { to: '/bank', label: '题库', icon: 'book' },
  { to: '/dashboard', label: '我的', icon: 'user' }
]

// 数据大屏为全屏暗色页面，隐藏底部导航
const hideTabbar = computed(() => route.path === '/data-screen')

function isTabActive(item) {
  if (item.to === '/') return route.path === '/'
  if (item.to === '/dashboard') return route.path === '/dashboard' || route.path === '/login'
  return route.path === item.to || route.path.startsWith(item.to + '/')
}

function onKeydown(e) {
  if (e.key === 'Escape') { menuOpen.value = false; searchOpen.value = false }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    openSearch()
  }
}

router.afterEach(() => {
  user.value = getUser()
  menuOpen.value = false
})
</script>

<style scoped>
.app { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }

.main { flex: 1; padding: 26px 0 52px; min-height: calc(100vh - 64px - 240px); min-height: calc(100dvh - 64px - 240px); }

.page-enter-active { transition: opacity 0.26s var(--ease), transform 0.26s var(--ease); }
.page-leave-active { transition: opacity 0.16s var(--ease); }
.page-enter-from { opacity: 0; transform: translateY(10px); }
.page-leave-to { opacity: 0; }

.top-btn {
  position: fixed; right: 24px; bottom: 24px; z-index: 90;
  width: 46px; height: 46px; border-radius: 50%;
  background: var(--surface); color: var(--accent);
  border: 1px solid var(--rule);
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow-lg);
  cursor: pointer;
  transition: transform 0.3s var(--ease), box-shadow 0.3s var(--ease), background-color 0.3s var(--ease), border-color 0.3s var(--ease);
}
.top-btn:hover { transform: translateY(-3px); background: var(--surface); box-shadow: var(--shadow-brand); }
.top-btn:active { transform: translateY(0) scale(0.95); }
.top-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tp-ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.tp-track { fill: none; stroke: var(--rule); stroke-width: 3; }
.tp-bar { fill: none; stroke: var(--accent); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 106.8; stroke-dashoffset: 106.8; transition: stroke-dashoffset 0.25s var(--ease); }
.tp-arrow { position: relative; z-index: 1; font-size: 1.15rem; font-weight: 800; line-height: 1; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s var(--ease); }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 移动端底部导航栏 */
.tabbar {
  display: none;
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 95;
  height: calc(56px + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-top: 1px solid var(--rule-soft);
  box-shadow: 0 -6px 24px rgba(15, 23, 42, 0.06);
}
.tab-item {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 3px; height: 100%; color: var(--muted-2);
  transition: color 0.22s var(--ease), transform 0.22s var(--ease);
  -webkit-tap-highlight-color: transparent;
}
.tab-item:active { transform: scale(0.94); }
.tab-item.active { color: var(--accent); }
.tab-icon { position: relative; display: flex; align-items: center; justify-content: center; width: 40px; height: 26px; border-radius: var(--radius-full); transition: background-color 0.22s var(--ease); }
.tab-icon svg { width: 23px; height: 23px; transition: transform 0.22s var(--ease); }
.tab-item.active .tab-icon { background: var(--accent-soft); }
.tab-item.active .tab-icon svg { transform: translateY(-1px) scale(1.06); }
.tab-label { font-size: 0.78rem; font-weight: 600; letter-spacing: 0.01em; }
@media (max-width: 900px) {
  .tabbar { display: flex; }
  .main { padding-bottom: calc(96px + var(--safe-bottom)); }
  .footer { padding-bottom: calc(72px + var(--safe-bottom)); }
  .top-btn { bottom: calc(72px + var(--safe-bottom)); }
}

/* PWA 安装提示 */
.install-banner {
  position: fixed; left: 50%; bottom: calc(72px + var(--safe-bottom)); transform: translateX(-50%);
  z-index: 96; width: min(420px, calc(100vw - 32px));
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 16px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--rule);
  box-shadow: var(--shadow-lg);
}
.ib-icon {
  width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
  background: var(--accent-soft); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
}
.ib-icon svg { width: 20px; height: 20px; }
.ib-text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.35; }
.ib-text strong { font-size: 0.9rem; color: var(--ink); }
.ib-text span { font-size: 0.78rem; color: var(--muted); }
.ib-btn { flex-shrink: 0; padding: 8px 16px; min-height: 36px; }
.ib-close {
  width: 36px; height: 36px; flex-shrink: 0; border-radius: 10px;
  border: none; background: transparent; color: var(--muted-2);
  display: flex; align-items: center; justify-content: center;
  transition: background-color 0.2s var(--ease), color 0.2s var(--ease), transform 0.15s var(--ease);
}
.ib-close:hover { background: var(--surface-2); color: var(--ink); }
.ib-close:active { transform: scale(0.92); }
.ib-close svg { width: 14px; height: 14px; }
.install-enter-active, .install-leave-active { transition: opacity 0.3s var(--ease), transform 0.3s var(--ease); }
.install-enter-from, .install-leave-to { opacity: 0; transform: translateX(-50%) translateY(14px); }
@media (min-width: 901px) {
  .install-banner { bottom: 24px; }
}
@media (max-width: 600px) {
  /* 移动端更紧凑轻量，减少对内容与 TabBar 的遮挡 */
  .install-banner { width: calc(100vw - 20px); padding: 9px 12px; gap: 9px; border-radius: 14px; }
  .ib-icon { width: 34px; height: 34px; border-radius: 10px; }
  .ib-icon svg { width: 18px; height: 18px; }
  .ib-text strong { font-size: 0.85rem; }
  .ib-text span { font-size: 0.78rem; }
  .ib-btn { padding: 7px 14px; min-height: 36px; }
}

.footer {
  border-top: 1px solid var(--rule-soft);
  background: var(--surface-2);
  padding: 36px 0 40px;
  position: relative;
}
.footer::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent-light), var(--accent2-light), transparent);
  opacity: 0.4;
}
.footer-inner { display: grid; grid-template-columns: 1.4fr 0.8fr 0.8fr 1.2fr; gap: 28px; }
.foot-brand { display: flex; gap: 12px; align-items: flex-start; }
.foot-logo {
  width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;
  background: #fff; border: 1px solid rgba(79, 95, 240, 0.12);
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow-xs);
}
.foot-logo-img { width: 32px; height: 32px; }
.foot-brand-text strong { font-size: 0.98rem; color: var(--ink); display: block; }
.foot-brand-text p { color: var(--muted); font-size: 0.82rem; margin-top: 6px; line-height: 1.7; }
.foot-col { display: flex; flex-direction: column; gap: 8px; }
.foot-col a { color: var(--muted); font-size: 0.85rem; transition: color 0.2s var(--ease), transform 0.2s var(--ease); width: fit-content; }
.foot-col a:hover { color: var(--accent); transform: translateX(2px); }
.foot-col a:active { transform: translateX(2px) scale(0.98); }
.foot-title { font-size: 0.8rem; font-weight: 700; color: var(--ink-soft); letter-spacing: 0.04em; margin-bottom: 4px; }
.foot-note p { color: var(--muted); font-size: 0.8rem; margin-top: 0; line-height: 1.8; }

@media (max-width: 860px) {
  .footer-inner { grid-template-columns: 1fr 1fr; gap: 22px; }
  .foot-brand { grid-column: 1 / -1; }
}
@media (max-width: 480px) {
  .footer-inner { grid-template-columns: 1fr; gap: 18px; }
  .footer { padding: 26px 0 30px; }
}
@media (max-width: 600px) {
  .main { padding: 18px 0 calc(36px + var(--safe-bottom)); }
  .footer { padding: 24px 0 calc(24px + var(--safe-bottom)); }
  .footer-inner { flex-direction: column; }
  .footer-note { text-align: left; }
  .top-btn { right: 16px; bottom: calc(16px + var(--safe-bottom)); width: 40px; height: 40px; font-size: 1.1rem; }
}
</style>
