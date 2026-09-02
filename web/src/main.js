import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './assets/main.css'

createApp(App).use(router).mount('#app')

// PWA 离线支持：仅生产环境注册 Service Worker
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // 用 BASE_URL 定位 sw.js 并限定作用域：子路径部署（如 /saixt/）下 SW 只接管该子路径
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL })
      .catch(() => {
        /* 注册失败仅静默，不影响在线使用 */
      })
  })
}
