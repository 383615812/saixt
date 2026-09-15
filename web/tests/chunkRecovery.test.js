import { describe, it, expect, vi } from 'vitest'
import {
  CHUNK_ERR_RE,
  isChunkLoadError,
  chunkReloadCount,
  clearChunkReload,
  recoverFromChunkError
} from '../src/chunkRecovery'

/** 内存版 sessionStorage，用于隔离测试 */
function memoryStore(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    _map: map
  }
}

describe('isChunkLoadError 懒加载资源失效识别', () => {
  it('命中各浏览器/打包器的真实原话', () => {
    const real = [
      // Chrome / Edge 走 Vite 动态导入
      'Failed to fetch dynamically imported module: http://x/saixt/assets/Practice-a1b2.js',
      // Firefox
      'error loading dynamically imported module: http://x/saixt/assets/Practice-a1b2.js',
      // Safari
      'Importing a module script failed.',
      'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html"',
      // webpack 风格（历史兼容）
      'Loading chunk 5 failed',
      'ChunkLoadError: Loading chunk 5 failed',
      // Vite 预加载 CSS
      'Unable to preload CSS for /saixt/assets/Practice-a1b2.css'
    ]
    for (const msg of real) {
      expect(isChunkLoadError(new Error(msg)), msg).toBe(true)
      expect(isChunkLoadError(msg), `裸字符串: ${msg}`).toBe(true)
    }
  })

  it('业务与网络错误不得误判（否则会触发无效刷新）', () => {
    const notChunk = [
      '网络连接失败，请检查网络后重试',
      '网络请求超时，请检查网络后重试',
      '请求失败，请稍后重试',
      'Request failed with status code 500',
      '登录已过期，请重新登录',
      ''
    ]
    for (const msg of notChunk) {
      expect(isChunkLoadError(new Error(msg)), msg).toBe(false)
    }
  })

  it('空值不抛异常且判为 false', () => {
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError({})).toBe(false)
  })

  it('正则不带全局标志（避免 lastIndex 造成连续调用结果漂移）', () => {
    expect(CHUNK_ERR_RE.global).toBe(false)
  })
})

describe('recoverFromChunkError 有限次自愈', () => {
  it('首次失败：直接刷新一次，计数置 1，不清缓存', async () => {
    const store = memoryStore()
    const reload = vi.fn()
    const caches = { keys: vi.fn(() => Promise.resolve([])), delete: vi.fn() }
    const ok = recoverFromChunkError({ storage: store, reload, caches })
    expect(ok).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(chunkReloadCount(store)).toBe(1)
    expect(caches.keys).not.toHaveBeenCalled()
  })

  it('第二次失败：先清空 CacheStorage 再刷新', async () => {
    const store = memoryStore({ saixt_chunk_reload: '1' })
    const reload = vi.fn()
    const deleted = []
    const caches = {
      keys: () => Promise.resolve(['springzhaokao-v21', 'springzhaokao-v22']),
      delete: (k) => { deleted.push(k); return Promise.resolve(true) }
    }
    const ok = recoverFromChunkError({ storage: store, reload, caches })
    expect(ok).toBe(true)
    // 清理缓存是异步链，等一轮宏任务后再断言
    await new Promise((r) => setTimeout(r, 0))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(deleted).toEqual(['springzhaokao-v21', 'springzhaokao-v22'])
    expect(chunkReloadCount(store)).toBe(2)
  })

  it('第三次失败：达到上限后不再刷新（杜绝无限刷新循环）', async () => {
    const store = memoryStore({ saixt_chunk_reload: '2' })
    const reload = vi.fn()
    const caches = { keys: vi.fn(() => Promise.resolve([])), delete: vi.fn() }
    expect(recoverFromChunkError({ storage: store, reload, caches })).toBe(false)
    await Promise.resolve()
    expect(reload).not.toHaveBeenCalled()
    expect(caches.keys).not.toHaveBeenCalled()
    expect(chunkReloadCount(store)).toBe(2)
  })

  it('sessionStorage 完全不可用（不可读写）时不刷新，避免刷新死循环', () => {
    const reload = vi.fn()
    // 传 null 模拟「拿不到存储」
    expect(recoverFromChunkError({ storage: null, reload })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('存储可读但不可写时同样不刷新', () => {
    const reload = vi.fn()
    const store = {
      getItem: () => '0',
      setItem: () => { throw new Error('QuotaExceededError') },
      removeItem: () => {}
    }
    expect(recoverFromChunkError({ storage: store, reload })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('损坏的计数（NaN/负数）按 0 处理，恢复到首次行为', () => {
    for (const bad of ['abc', '-3', '', 'Infinity']) {
      const store = memoryStore({ saixt_chunk_reload: bad })
      const reload = vi.fn()
      expect(chunkReloadCount(store), `计数=${bad}`).toBe(0)
      expect(recoverFromChunkError({ storage: store, reload }), `计数=${bad}`).toBe(true)
      expect(reload).toHaveBeenCalledTimes(1)
      expect(chunkReloadCount(store)).toBe(1)
    }
  })

  it('clearChunkReload 清零，使后续正常使用不受历史计数影响', () => {
    const store = memoryStore({ saixt_chunk_reload: '2' })
    clearChunkReload(store)
    expect(chunkReloadCount(store)).toBe(0)
    const reload = vi.fn()
    expect(recoverFromChunkError({ storage: store, reload })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('无 CacheStorage 环境下第二次失败也能照常刷新', async () => {
    const store = memoryStore({ saixt_chunk_reload: '1' })
    const reload = vi.fn()
    expect(recoverFromChunkError({ storage: store, reload, caches: null })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(chunkReloadCount(store)).toBe(2)
  })
})
