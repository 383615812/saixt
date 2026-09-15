import { createRouter, createWebHistory } from 'vue-router'
import { isChunkLoadError, recoverFromChunkError, clearChunkReload } from './chunkRecovery'

const routes = [
  { path: '/', name: 'home', component: () => import('./views/Home.vue'), meta: { title: '首页' } },
  { path: '/login', name: 'login', component: () => import('./views/Login.vue'), meta: { title: '登录' } },
  { path: '/practice', name: 'practice', component: () => import('./views/Practice.vue'), meta: { title: '在线刷题', auth: true } },
  { path: '/bank', name: 'bank', component: () => import('./views/QuestionBank.vue'), meta: { title: '题库' } },
  { path: '/schools', name: 'schools', component: () => import('./views/Schools.vue'), meta: { title: '院校库' } },
  { path: '/schools/:code', name: 'school-detail', component: () => import('./views/SchoolDetail.vue'), meta: { title: '院校详情' } },
  { path: '/ai', name: 'ai', component: () => import('./views/AiChat.vue'), meta: { title: 'AI 助手', auth: true } },
  { path: '/ai-practice', name: 'ai-practice', component: () => import('./views/AiPractice.vue'), meta: { title: 'AI 练习', auth: true } },
  { path: '/paper', name: 'paper', component: () => import('./views/PaperPractice.vue'), meta: { title: '薄弱专项套卷', auth: true } },
  { path: '/mock-exam', name: 'mock-exam', component: () => import('./views/MockExam.vue'), meta: { title: '模拟考试', auth: true } },
  { path: '/diagnosis', name: 'diagnosis', component: () => import('./views/Diagnosis.vue'), meta: { title: '学情诊断', auth: true } },
  { path: '/plan', name: 'plan', component: () => import('./views/Plan.vue'), meta: { title: '学习计划', auth: true } },
  { path: '/recommend', name: 'recommend', component: () => import('./views/Recommend.vue'), meta: { title: '志愿推荐', auth: true } },
  { path: '/ranking', name: 'ranking', component: () => import('./views/Ranking.vue'), meta: { title: '排行榜', auth: true } },
  { path: '/tasks', name: 'tasks', component: () => import('./views/Tasks.vue'), meta: { title: '任务中心', auth: true } },
  { path: '/achievements', name: 'achievements', component: () => import('./views/Achievements.vue'), meta: { title: '成就徽章', auth: true } },
  { path: '/weekly-report', name: 'weekly-report', component: () => import('./views/WeeklyReport.vue'), meta: { title: '学习周报', auth: true } },
  { path: '/wrong-book', name: 'wrong-book', component: () => import('./views/WrongBook.vue'), meta: { title: '错题本', auth: true } },
  { path: '/review', name: 'review', component: () => import('./views/ReviewPlan.vue'), meta: { title: '复习计划', auth: true } },
  { path: '/remind', name: 'remind', component: () => import('./views/Remind.vue'), meta: { title: '提醒设置', auth: true } },
  { path: '/favorites', name: 'favorites', component: () => import('./views/Favorites.vue'), meta: { title: '我的收藏', auth: true } },
  { path: '/dashboard', name: 'dashboard', component: () => import('./views/Dashboard.vue'), meta: { title: '个人中心', auth: true } },
  { path: '/data-screen', name: 'data-screen', component: () => import('./views/DataScreen.vue'), meta: { title: '数据大屏', auth: true } },
  { path: '/knowledge-graph', name: 'knowledge-graph', component: () => import('./views/KnowledgeGraph.vue'), meta: { title: '知识图谱', auth: true } },
  { path: '/blind-box', name: 'blind-box', component: () => import('./views/BlindBox.vue'), meta: { title: '盲盒刷题', auth: true } },
  { path: '/vip', name: 'vip', component: () => import('./views/Vip.vue'), meta: { title: 'VIP 会员', auth: true } },
  { path: '/points', name: 'points', component: () => import('./views/Points.vue'), meta: { title: '积分中心', auth: true } },
  { path: '/invite', name: 'invite', component: () => import('./views/Invite.vue'), meta: { title: '邀请好友', auth: true } },
  { path: '/admin', name: 'admin', component: () => import('./views/Admin.vue'), meta: { title: '运营看板', auth: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  // base 取自 vite base（dev='/'，生产子路径部署时由 --base 注入，如 '/saixt/'）
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  // 路由切换即时回到顶部（behavior:'auto' 覆盖 html 的 smooth，避免与 0.16s 淡入过渡叠加出拖拽感）；后退/前进恢复原滚动位置
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return { ...savedPosition, behavior: 'auto' }
    return { top: 0, behavior: 'auto' }
  }
})

// 读取登录态：localStorage 在「禁用 Cookie / 受限 WebView」下会直接抛异常，
// 若不兜住会让 beforeEach 抛错 → 导航中断 → 整页空白
function readToken() {
  try {
    return localStorage.getItem('saixt_token')
  } catch {
    return null
  }
}

router.beforeEach((to) => {
  const token = readToken()
  if (to.meta.auth && !token && to.name !== 'login') {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
})

// 懒加载 chunk 失效自愈：部署后旧页面引用的 hash 资源已不存在时，动态 import 会失败并
// 让 <router-view> 整页空白。此处做有限次硬刷新恢复，详见 chunkRecovery.js。
router.onError((error) => {
  if (isChunkLoadError(error)) recoverFromChunkError()
})

router.afterEach((to) => {
  document.title = to.meta?.title ? `${to.meta.title} · 云南春招智能学习平台` : '云南春招智能学习平台'
  // 导航成功即说明资源完好，清零自愈计数——afterEach 在懒加载组件解析完成后才触发
  clearChunkReload()
})

export default router
