/* 云南春招智能学习平台 Service Worker
 * 策略：应用外壳（hashed JS/CSS + 静态资源）预缓存，导航兜底离线；
 * 运行时的 /api 与 /qimages 请求网络优先，离线时尝试缓存。
 *
 * ⚠️ 子路径适配（重要）：
 * 本应用以 base=/saixt/ 部署在 https://www.xlxzb.com/saixt/ 下，与同域的其它站点共存。
 * sw.js 内部一切路径都必须带 BASE 前缀，否则：
 *   - addAll(['/index.html']) 会去请求域名根，命中同域其它站的 302 页面 → install 失败、离线功能整体失效；
 *   - startsWith('/api') 永远匹配不到 /saixt/api/... → API 离线回退形同虚设。
 * BASE 由 sw.js 自身的 URL 推导，因此同一份文件在根部署与任意子路径部署都正确。 */
const CACHE = 'springzhaokao-v24'

// sw.js 位于 <base>/sw.js → BASE = '/saixt/'（根部署时为 '/'）
const BASE = (() => {
  const p = new URL(self.location.href).pathname
  return p.slice(0, p.lastIndexOf('/') + 1) || '/'
})()

const ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'logo.svg',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  BASE + 'manifest.webmanifest'
]

// 构建后自动注入 hashed 资源清单（由 vite build 后脚本写入以下占位）
// 注入值形如 './assets/xxx.js'，相对 BASE 解析 → <base>/assets/xxx.js
const BUILT = []

// 安装：预缓存应用外壳 + 构建产物
self.addEventListener('install', (e) => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE).then((c) =>
        // 逐个 add：任一资源 404 不应让整个 install 失败
        Promise.all([...ASSETS, ...BUILT].map((u) => c.add(u).catch(() => {})))
      ),
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
  // 注意必须带 BASE：部署在 /saixt/ 时实际请求是 /saixt/api/...
  if (url.pathname.startsWith(BASE + 'api')) {
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
    const shell = BASE + 'index.html'
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(shell, clone))
          }
          return res
        })
        .catch(() => caches.match(shell).then((r) => r || caches.match(BASE)))
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