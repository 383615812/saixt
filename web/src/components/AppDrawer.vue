<template>
  <transition name="drawer">
    <div v-if="open" class="drawer-mask" @click="$emit('close')">
      <div
        id="drawer-menu"
        ref="drawerEl"
        class="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="导航菜单"
        tabindex="-1"
        @click.stop
        @keydown.esc="$emit('close')"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
      >
        <div class="drawer-head">
          <router-link :to="user ? '/dashboard' : '/login'" class="drawer-user" @click="$emit('close')">
            <span class="drawer-avatar">{{ (user?.nickname || '学')[0] }}</span>
            <span class="drawer-user-text">
              <strong>
                {{ user ? (user.nickname || '同学') : '未登录' }}
                <span v-if="vip" class="drawer-vip">VIP</span>
              </strong>
              <small v-if="user">{{ vip ? '尊享会员 · 无限 AI' : '欢迎回来，继续加油' }}</small>
              <small v-else>登录后同步学习记录</small>
            </span>
          </router-link>
          <router-link v-if="user" to="/points" class="drawer-points" @click="$emit('close')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3z"/></svg>
            {{ points }}
          </router-link>
          <button ref="closeBtn" class="drawer-close" @click="$emit('close')" aria-label="关闭菜单">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        <nav class="drawer-nav" aria-label="侧边导航">
          <template v-for="(section, si) in menuSections" :key="si">
            <div v-if="section.title" class="drawer-sec">{{ section.title }}</div>
            <router-link
              v-for="(item, ii) in section.items"
              :key="item.to"
              :to="item.to"
              class="drawer-item"
              :class="{ active: isActive(item) }"
              :style="{ animationDelay: itemDelay(si, ii) + 'ms' }"
              @click="$emit('close')"
            >
              <span class="dn-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="ICONS[item.icon]"></svg>
              </span>
              <span class="dn-label">{{ item.label }}</span>
              <svg class="dn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </router-link>
          </template>
        </nav>

        <div class="drawer-foot">
          <template v-if="user">
            <router-link to="/dashboard" class="btn btn-primary drawer-btn" @click="$emit('close')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>
              个人中心
            </router-link>
          </template>
          <template v-else>
            <router-link to="/login" class="btn btn-ghost drawer-btn" @click="$emit('close')">登录</router-link>
            <router-link to="/login?mode=register" class="btn btn-primary drawer-btn" @click="$emit('close')">免费注册</router-link>
          </template>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { ICONS } from '../icons'

const props = defineProps({
  open: { type: Boolean, default: false },
  user: { type: Object, default: null },
  vip: { type: Boolean, default: false },
  points: { type: Number, default: 0 }
})
const emit = defineEmits(['close'])

const route = useRoute()
const drawerEl = ref(null)
const closeBtn = ref(null)
let lastFocused = null

const menuSections = [
  { title: '', items: [
    { to: '/', label: '首页', icon: 'home' }
  ]},
  { title: '学习中心', items: [
    { to: '/practice', label: '在线刷题', icon: 'pen' },
    { to: '/ai-practice', label: 'AI 练习', icon: 'spark' },
    { to: '/paper', label: '薄弱专项套卷', icon: 'page' },
    { to: '/bank', label: '题库中心', icon: 'book' },
    { to: '/wrong-book', label: '错题本', icon: 'cross' },
    { to: '/review', label: '复习计划', icon: 'refresh' },
    { to: '/plan', label: '学习计划', icon: 'calendar' }
  ]},
  { title: '成长工具', items: [
    { to: '/tasks', label: '任务中心', icon: 'check' },
    { to: '/achievements', label: '成就徽章', icon: 'trophy' },
    { to: '/points', label: '积分中心', icon: 'star' },
    { to: '/weekly-report', label: '学习周报', icon: 'chart' },
    { to: '/favorites', label: '我的收藏', icon: 'star' },
    { to: '/remind', label: '提醒设置', icon: 'bell' },
    { to: '/ai', label: 'AI 答疑', icon: 'chat' },
    { to: '/data-screen', label: '数据大屏', icon: 'chart' },
    { to: '/knowledge-graph', label: '知识图谱', icon: 'spark' },
    { to: '/blind-box', label: '盲盒刷题', icon: 'spark' }
  ]},
  { title: '会员与邀请', items: [
    { to: '/vip', label: 'VIP 会员', icon: 'trophy' },
    { to: '/invite', label: '邀请好友', icon: 'user' }
  ]},
  { title: '志愿择校', items: [
    { to: '/recommend', label: '志愿推荐', icon: 'target' },
    { to: '/schools', label: '院校库', icon: 'school' },
    { to: '/ranking', label: '排行榜', icon: 'podium' }
  ]}
]

function itemDelay(si, ii) {
  let d = 0
  for (let i = 0; i < si; i++) d += menuSections[i].items.length
  return (d + ii) * 24
}

function isActive(item) {
  if (item.to === '/') return route.path === '/'
  return route.path === item.to || route.path.startsWith(item.to + '/')
}

// 无障碍：打开时记录触发元素并聚焦关闭按钮，关闭后恢复焦点
watch(() => props.open, async (open) => {
  if (open) {
    lastFocused = document.activeElement
    document.body.style.overflow = 'hidden'
    await nextTick()
    closeBtn.value?.focus()
  } else {
    document.body.style.overflow = ''
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus()
  }
})

// 无障碍：焦点陷阱，Tab 循环在抽屉内
function onKeydown(e) {
  if (!props.open || e.key !== 'Tab') return
  const focusables = drawerEl.value?.querySelectorAll(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )
  if (!focusables || !focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus()
  }
}

let touchStart = null
function onTouchStart(e) {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }
}
function onTouchEnd(e) {
  if (!touchStart) return
  const dx = e.changedTouches[0].clientX - touchStart.x
  const dy = e.changedTouches[0].clientY - touchStart.y
  touchStart = null
  if (dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) emit('close')
}

document.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.drawer-mask {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(30, 41, 59, 0.45);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.drawer {
  position: absolute; top: 0; right: 0; bottom: 0; width: 300px; max-width: 86vw;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  display: flex; flex-direction: column;
  box-shadow: -16px 0 56px rgba(30, 41, 59, 0.18);
  outline: none;
}
.drawer-head {
  display: flex; align-items: center; gap: 12px;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--rule-soft);
}
.drawer-user { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
.drawer-user:active { opacity: 0.75; }
.drawer-vip {
  display: inline-block; margin-left: 6px; padding: 1px 7px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #f59e0b, #f97316);
  color: #fff; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.04em;
  vertical-align: 2px;
}
.drawer-points {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 11px; border-radius: var(--radius-full);
  background: var(--amber-soft); border: 1px solid rgba(245, 158, 11, 0.28);
  color: var(--amber); font-size: 0.8rem; font-weight: 700;
  flex-shrink: 0;
}
.drawer-points svg { width: 13px; height: 13px; }
.drawer-avatar {
  width: 44px; height: 44px; border-radius: 13px; flex-shrink: 0;
  background: var(--accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 1.15rem;
  box-shadow: 0 3px 10px rgba(79, 95, 240, 0.26);
}
.drawer-user-text { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
.drawer-user-text strong { font-size: 1rem; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drawer-user-text small { font-size: 0.74rem; color: var(--muted-2); }
.drawer-close {
  width: 34px; height: 34px; flex-shrink: 0;
  background: var(--surface-2); border: 1px solid var(--rule);
  border-radius: 10px; color: var(--muted);
  display: flex; align-items: center; justify-content: center;
  transition: background-color 0.25s var(--ease), color 0.25s var(--ease), transform 0.25s var(--ease);
}
.drawer-close svg { width: 16px; height: 16px; }
.drawer-close:active { background: var(--accent-soft); color: var(--accent); transform: scale(0.98); }
.drawer-close:focus-visible, .drawer-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.drawer-nav { flex: 1; overflow-y: auto; padding: 8px 14px 14px; overscroll-behavior: contain; }
.drawer-sec {
  padding: 16px 10px 6px; font-size: 0.72rem; font-weight: 600;
  color: var(--muted-2); letter-spacing: 0.08em;
}
.drawer-item {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 12px; border-radius: 12px;
  color: var(--ink); font-size: 0.94rem; font-weight: 500;
  transition: background-color 0.25s var(--ease), color 0.25s var(--ease), transform 0.25s var(--ease);
  animation: drawerItemIn 0.4s var(--ease-out) backwards;
}
.drawer-item:active { background: var(--accent-soft); transform: scale(0.98); }
.drawer-item.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.dn-icon {
  width: 32px; height: 32px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 9px; background: var(--accent-soft); color: var(--accent);
  transition: background-color 0.25s var(--ease), color 0.25s var(--ease), box-shadow 0.25s var(--ease);
}
.dn-icon svg { width: 17px; height: 17px; }
.drawer-item.active .dn-icon { background: var(--accent); color: #fff; box-shadow: 0 2px 8px rgba(79, 95, 240, 0.26); }
.dn-label { flex: 1; min-width: 0; }
.dn-arrow { width: 14px; height: 14px; color: var(--muted-2); opacity: 0; transform: translateX(-4px); transition: opacity 0.25s var(--ease), transform 0.25s var(--ease); }
.drawer-item.active .dn-arrow { opacity: 1; transform: translateX(0); color: var(--accent); }

.drawer-foot {
  display: flex; gap: 10px; padding: 14px 20px calc(16px + var(--safe-bottom));
  border-top: 1px solid var(--rule-soft);
}
.drawer-btn { flex: 1; padding: 11px; }
.drawer-btn svg { width: 16px; height: 16px; }

@keyframes drawerItemIn { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: translateX(0); } }

.drawer-enter-active, .drawer-leave-active { transition: opacity 0.3s var(--ease); }
.drawer-enter-active .drawer, .drawer-leave-active .drawer { transition: transform 0.35s var(--ease); }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .drawer, .drawer-leave-to .drawer { transform: translateX(100%); }
</style>
