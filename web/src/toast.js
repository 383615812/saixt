let container = null
let seed = 0

const ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>'
}

function ensureContainer() {
  if (container && document.body.contains(container)) return container
  container = document.createElement('div')
  container.className = 'toast-container'
  document.body.appendChild(container)
  return container
}

export function toast(message, type = 'info', duration = 2600) {
  const id = 'toast-' + (++seed)
  const el = document.createElement('div')
  el.className = 'toast toast-' + (ICONS[type] ? type : 'info')
  el.setAttribute('role', 'status')
  el.dataset.id = id
  el.innerHTML = '<span class="toast-ic">' + (ICONS[type] || ICONS.info) + '</span><span class="toast-tx"></span>'
  el.querySelector('.toast-tx').textContent = message
  ensureContainer().appendChild(el)
  requestAnimationFrame(() => el.classList.add('in'))
  const timer = setTimeout(() => dismiss(id), duration)
  el.addEventListener('click', () => { clearTimeout(timer); dismiss(id) })
  return id
}

function dismiss(id) {
  if (!container) return
  const el = container.querySelector('[data-id="' + id + '"]')
  if (!el) return
  el.classList.remove('in')
  setTimeout(() => el.remove(), 240)
}

export const notify = toast
