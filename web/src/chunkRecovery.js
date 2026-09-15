/**
 * 懒加载 chunk 失效的识别与自愈（无框架依赖，便于单元测试）
 *
 * 背景：本站启用了 Service Worker，且路由全部为 () => import() 懒加载。
 * 每次部署后 hashed 资源名会变化，此时仍停留在旧页面的用户点击路由时，
 * 动态 import 会去请求已下线的旧 hash 文件（或命中 nginx 的 SPA 回退拿到 index.html），
 * 结果是 vue-router 导航失败、<router-view> 区域整页空白，且刷新后仍可能复现。
 *
 * 处理策略（有限次自愈，绝不死循环）：
 *   第 1 次失败 → 硬刷新一次（拿到新壳）
 *   第 2 次失败 → 先清空全部 CacheStorage（清掉旧应用外壳）再刷新
 *   第 3 次失败 → 放弃自动恢复，交回用户手动处理
 * 任意一次路由成功即清零计数（见 router.js 的 afterEach）。
 * 若 sessionStorage 不可用（计数无法落盘），则完全不做自动刷新——
 * 白屏固然糟糕，但无限刷新循环更糟。
 */

const RELOAD_KEY = 'saixt_chunk_reload'
const MAX_RELOAD = 2

/** 各浏览器 / 打包器在「模块脚本加载失败」时抛出的原话，命中即视为资源失效 */
export const CHUNK_ERR_RE =
  /dynamically imported module|Importing a module script failed|Failed to load module script|Loading chunk \d+ failed|ChunkLoadError|Unable to preload CSS/i

/** 该异常是否属于「懒加载资源失效」（值得刷新自愈），而非业务或网络错误 */
export function isChunkLoadError(err) {
  const msg = String((err && (err.message || err)) || '')
  return CHUNK_ERR_RE.test(msg)
}

function resolveStore(explicit) {
  if (explicit !== undefined) return explicit
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}

/** 已自愈次数（读不到存储按 0 处理） */
export function chunkReloadCount(store) {
  const s = resolveStore(store)
  try {
    const n = Number(s?.getItem(RELOAD_KEY) || 0)
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0
  } catch {
    return 0
  }
}

/** 路由成功时清零，避免历史计数影响后续正常使用 */
export function clearChunkReload(store) {
  const s = resolveStore(store)
  try {
    s?.removeItem(RELOAD_KEY)
  } catch {
    /* 存储不可用则忽略 */
  }
}

/**
 * 执行自愈。返回是否已发起刷新（false = 已达上限或无法记数，不再刷新）。
 * deps 仅用于可测试性注入，生产环境走默认实现。
 */
export function recoverFromChunkError(deps = {}) {
  const store = resolveStore(deps.storage)
  const reload = deps.reload || (() => { try { location.reload() } catch { /* 忽略 */ } })
  const cacheStorage = deps.caches !== undefined
    ? deps.caches
    : (typeof caches !== 'undefined' ? caches : null)

  if (!store) return false

  const times = chunkReloadCount(store)
  if (times >= MAX_RELOAD) return false

  // 计数必须先落盘再刷新；写不进去宁可刷新不执行，避免无限循环
  try {
    store.setItem(RELOAD_KEY, String(times + 1))
  } catch {
    return false
  }

  // 第二次起先清空 CacheStorage：旧应用外壳可能仍在被命中
  if (times >= 1 && typeof cacheStorage?.keys === 'function') {
    try {
      cacheStorage
        .keys()
        .then((keys) => Promise.all(keys.map((k) => cacheStorage.delete(k))))
        .catch(() => {})
        .finally(() => reload())
      return true
    } catch {
      /* 落到下方直接刷新 */
    }
  }
  reload()
  return true
}
