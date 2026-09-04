// BASE_URL 以 / 结尾（dev='/'，生产子路径如 '/saixt/'），拼接出子路径感知的 API 前缀
const BASE = import.meta.env.BASE_URL + 'api'
const TIMEOUT_MS = 15000
// AI 类接口生成耗时较长，单独放宽超时，避免被前端提前中断
const AI_TIMEOUT_MS = 90000
const AI_PREFIX = ['/ai/']
// 登录/注册接口自身会返回 401（账号或密码错误），不应触发"登录过期"跳转
const AUTH_PATHS = ['/auth/login', '/auth/register']

let authRedirecting = false

async function request(path, options = {}) {
  const token = localStorage.getItem('saixt_token')
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const controller = new AbortController()
  const isAi = AI_PREFIX.some(p => path.startsWith(p))
  const timer = setTimeout(() => controller.abort(), isAi ? AI_TIMEOUT_MS : TIMEOUT_MS)
  let res
  try {
    res = await fetch(BASE + path, { ...options, headers, signal: controller.signal })
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('网络请求超时，请检查网络后重试')
    throw new Error('网络连接失败，请检查网络后重试')
  } finally {
    clearTimeout(timer)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.code !== 0) {
    const err = new Error(data.message || '请求失败，请稍后重试')
    err.code = data.code
    if (data.code === 401 && !AUTH_PATHS.includes(path)) {
      localStorage.removeItem('saixt_token')
      localStorage.removeItem('saixt_user')
      if (!authRedirecting) {
        authRedirecting = true
        import('./toast').then(({ toast }) => {
          toast('登录已过期，请重新登录', 'warn', 3000)
        })
        setTimeout(() => { window.location.href = import.meta.env.BASE_URL + 'login'; authRedirecting = false }, 1200)
      }
    }
    throw err
  }
  return data.data
}

// 二进制下载：复用 BASE/token/超时/统一错误，但不做 JSON 解析，返回原始 Response 供取 blob
async function download(path) {
  const token = localStorage.getItem('saixt_token')
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res
  try {
    res = await fetch(BASE + path, { headers, signal: controller.signal })
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('下载请求超时，请重试')
    throw new Error('网络连接失败，请检查网络后重试')
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    let msg = '下载失败，请稍后重试'
    try { const d = await res.json(); if (d?.message) msg = d.message } catch { /* 非 JSON 响应保持默认提示 */ }
    throw new Error(msg)
  }
  return res
}

export const api = {
  get: (path, params) => {
    const qs = params && Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
    return request(path + qs)
  },
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: path => request(path, { method: 'DELETE' }),
  download
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem('saixt_user')) } catch { return null }
}

export function setUser(user) {
  localStorage.setItem('saixt_user', JSON.stringify(user))
}

export function logout() {
  localStorage.removeItem('saixt_token')
  localStorage.removeItem('saixt_user')
}
