/* 云南春招智能学习平台 Service Worker
 * 策略：应用外壳（hashed JS/CSS + 静态资源）预缓存，导航兜底离线；
 * 运行时的 /api 与 /qimages 请求网络优先，离线时尝试缓存。 */
const CACHE = 'springzhaokao-v1'

const ASSETS = [
  '/',
  '/index.html',
  '/logo.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.webmanifest'
]

// 构建后自动注入 hashed 资源清单（由 vite build 后脚本写入以下占位）
const BUILT = []

// 安装：预缓存应用外壳 + 构建产物
self.addEventListener('install', (e) => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE).then((c) => c.addAll([...ASSETS, ...BUILT])),
      self.skipWaiting()
    ])
  )
})

// 激活：清理旧版本缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET') return

  // 跳过跨域与不需要缓存的目标
  if (url.origin !== self.location.origin) return
  if (url.pathname.includes('/socket')) return

  // API 数据：网络优先，离线回退缓存（弱网不阻塞）
  if (url.pathname.startsWith('/api')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(req, clone))
          }
          return res
        })
        .catch(() => caches.match(req))
    )
    return
  }

  // 导航请求：网络优先，离线收到应用外壳
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put('/index.html', clone))
          }
          return res
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    )
    return
  }

  // hashed 静态资源与图片：缓存优先，回退网络并即时入缓存
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(req, clone))
        }
        return res
      })
      return hit || net
    })
  )
})