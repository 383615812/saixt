<template>
  <div class="container ach-page">
    <div class="page-head">
      <h2>成就徽章</h2>
      <p>每一枚徽章，都是你努力的见证</p>
    </div>

    <div v-if="loading" class="ach-skeleton">
      <!-- 进度骨架 -->
      <div class="card ach-progress">
        <span class="skeleton sk-ap-ring"></span>
        <div class="ap-info">
          <div class="skeleton sk-ap-title"></div>
          <div class="skeleton sk-ap-sub"></div>
        </div>
        <span class="skeleton sk-ap-btn"></span>
      </div>
      <!-- 徽章网格骨架 -->
      <div class="card ach-grid">
        <div v-for="i in 8" :key="i" class="sk-badge">
          <span class="skeleton sk-badge-icon"></span>
          <span class="skeleton sk-badge-name"></span>
          <span class="skeleton sk-badge-desc"></span>
        </div>
      </div>
    </div>
    <template v-else>
      <!-- 进度 -->
      <div class="card ach-progress">
        <div class="ap-ring" :style="{ '--pct': data.percent * 3.6 + 'deg' }">
          <span>{{ data.percent }}%</span>
        </div>
        <div class="ap-info">
          <h3>已点亮 {{ data.earnedCount }} / {{ data.total }} 枚徽章</h3>
          <p v-if="data.earnedCount === data.total">全部集齐，你是当之无愧的学习王者</p>
          <p v-else>继续刷题、打卡、练习，解锁更多成就</p>
        </div>
        <button class="btn btn-primary share-btn" :disabled="data.earnedCount === 0" @click="openPoster">生成分享海报</button>
      </div>

      <!-- 徽章网格 -->
      <div class="card ach-grid">
        <div v-for="a in data.list" :key="a.key" class="badge" :class="[a.tier, a.earned ? 'earned' : (a.progress > 0 && a.progress_target > 1 ? 'progressing' : 'locked')]">
          <div class="badge-icon" v-html="badgeIcon(a.icon)"></div>
          <div class="badge-name">{{ a.name }}</div>
          <div class="badge-desc">{{ a.desc }}</div>
          <div v-if="!a.earned && a.progress_target > 1" class="badge-progress">
            <div class="bp-track"><div class="bp-fill" :style="{ width: Math.max(6, Math.min(100, Math.round(a.progress / a.progress_target * 100))) + '%' }"></div></div>
            <span class="bp-num">{{ a.progress }} / {{ a.progress_target }}</span>
          </div>
          <div class="badge-status">
            <span v-if="a.earned" class="bs-earned"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>已获得</span>
            <span v-else-if="a.progress > 0 && a.progress_target > 1" class="bs-progress">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
              进行中 {{ Math.round(a.progress / a.progress_target * 100) }}%
            </span>
            <span v-else class="bs-locked"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>未解锁</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 分享海报弹窗 -->
    <div v-if="posterShow" class="poster-mask" @click.self="posterShow = false">
      <div class="poster-modal">
        <div class="poster-head">
          <h3>我的学习成就海报</h3>
          <button class="poster-close" @click="posterShow = false">✕</button>
        </div>
        <div class="poster-body">
          <img v-if="posterUrl" :src="posterUrl" alt="成就分享海报" class="poster-img" />
          <div v-else class="spinner"></div>
        </div>
        <div class="poster-actions">
          <button v-if="posterUrl" class="btn btn-primary" @click="sharePoster">分享</button>
          <button v-if="posterUrl" class="btn btn-ghost" @click="copyPoster">复制图片</button>
          <a v-if="posterUrl" :href="posterUrl" download="我的学习成就海报.png" class="btn btn-ghost">下载</a>
          <button class="btn btn-ghost" @click="posterShow = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>

import { toast } from '../toast'
import { ref, onMounted, onUnmounted } from 'vue'
import QRCode from 'qrcode'
import { api, getUser } from '../api'

const data = ref({ list: [], earnedCount: 0, total: 0, percent: 0 })
const loading = ref(true)
const stats = ref({ total: 0, accuracy: 0 })
const checkin = ref({ streak: 0 })
const posterShow = ref(false)
const posterUrl = ref('')
const posterGenerating = ref(false)

const ICONS = {
  '🔥': '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  '📅': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  '🗓': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  '✏️': '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  '📚': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  '🏆': '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3a2 2 0 0 1 0 5h-3"/><path d="M7 5H4a2 2 0 0 0 0 5h3"/>',
  '🎯': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  '⏱': '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
  '💯': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  '🤖': '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  '✨': '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
  '⭐': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  '🏅': '<circle cx="12" cy="14.6" r="5.2"/><path d="M8.6 3.6 12 9l3.4-5.4"/><path d="M6.4 8.6H4a.55.55 0 0 1-.46-.88L6.4 3.9"/><path d="M17.6 8.6H20a.55.55 0 0 0 .46-.88L17.6 3.9"/>',
  '🗺': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  '🔍': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'
}

function badgeIcon(emoji) {
  const p = ICONS[emoji] || '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="m9 12 2 2 4-4"/>'
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`
}

function escText(str) {
  return String(str == null ? '' : str)
}

function openPoster() {
  if (posterGenerating.value) return
  posterShow.value = true
  posterUrl.value = ''
  posterGenerating.value = true
  setTimeout(generatePoster, 60)
}

function drawSvgOnCanvas(ctx, paths, color, x, y, size) {
  return new Promise(resolve => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
    const img = new Image()
    img.onload = () => { ctx.drawImage(img, x, y, size, size); resolve() }
    img.onerror = resolve
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}

async function generatePoster() {
  try {
    await drawPoster()
    posterUrl.value = canvasToDataUrl()
  } catch (e) {
    console.error('海报生成失败:', e)
    toast('海报生成失败，请稍后重试', 'error')
    posterShow.value = false
  } finally {
    posterGenerating.value = false
  }
}

function canvasToDataUrl() {
  return posterCanvas.toDataURL('image/png')
}

let posterCanvas = null

async function drawPoster() {
  const W = 750
  const H = 1440
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  posterCanvas = canvas
  const ctx = canvas.getContext('2d')

  // 背景渐变
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, '#1e3a8a')
  grad.addColorStop(0.45, '#4f5ff0')
  grad.addColorStop(1, '#6b58e8')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // 装饰圆环
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 2
  for (const r of [140, 260, 380]) {
    ctx.beginPath()
    ctx.arc(W / 2, 330, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.beginPath()
  ctx.arc(90, 180, 60, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(W - 80, 100, 44, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(W - 60, 980, 70, 0, Math.PI * 2)
  ctx.fill()

  // 顶部标题
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '26px "PingFang SC","Microsoft YaHei",sans-serif'
  ctx.fillText('云南春招智能学习平台', W / 2, 96)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 46px "PingFang SC","Microsoft YaHei",sans-serif'
  ctx.fillText('我的学习成就', W / 2, 160)

  // 头像
  const name = escText(getUser()?.nickname || '考生')
  ctx.save()
  ctx.beginPath()
  ctx.arc(W / 2, 300, 74, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(W / 2, 300, 62, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.fillStyle = '#4f5ff0'
  ctx.font = 'bold 60px "PingFang SC","Microsoft YaHei",sans-serif'
  ctx.fillText((name || '考')[0], W / 2, 326)
  ctx.restore()

  // 昵称
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 34px "PingFang SC","Microsoft YaHei",sans-serif'
  ctx.fillText(name, W / 2, 420)

  // 已点亮徽章
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '24px "PingFang SC","Microsoft YaHei",sans-serif'
  ctx.fillText('已点亮学习徽章', W / 2, 500)
  ctx.fillStyle = '#fde047'
  ctx.font = 'bold 92px "PingFang SC","Microsoft YaHei",sans-serif'
  ctx.fillText(String(data.value.earnedCount), W / 2, 620)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = '30px "PingFang SC","Microsoft YaHei",sans-serif'
  ctx.fillText(`/ 共 ${data.value.total} 枚`, W / 2, 668)

  // 数据卡片
  const cards = [
    { label: '累计刷题', value: String(stats.value.total || 0) },
    { label: '正确率', value: (stats.value.accuracy || 0) + '%' },
    { label: '连续打卡', value: String(checkin.value.streak || 0) + ' 天' }
  ]
  const cw = 196
  const ch = 120
  const gap = 24
  const startX = (W - (cw * 3 + gap * 2)) / 2
  const cardY = 720
  cards.forEach((c, i) => {
    const x = startX + i * (cw + gap)
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    roundRect(ctx, x, cardY, cw, ch, 18)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1.5
    roundRect(ctx, x, cardY, cw, ch, 18)
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 34px "PingFang SC","Microsoft YaHei",sans-serif'
    ctx.fillText(c.value, x + cw / 2, cardY + 58)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.font = '22px "PingFang SC","Microsoft YaHei",sans-serif'
    ctx.fillText(c.label, x + cw / 2, cardY + 96)
  })

  // 已获得徽章图标
  const earned = data.value.list.filter(a => a.earned)
  if (earned.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '24px "PingFang SC","Microsoft YaHei",sans-serif'
    ctx.fillText('我的徽章', W / 2, 920)
    const icons = earned.slice(0, 8)
    const iw = 64
    const igap = 22
    const totalW = icons.length * iw + (icons.length - 1) * igap
    const ix0 = (W - totalW) / 2
    await Promise.all(icons.map((a, i) => {
      const p = ICONS[a.icon]
      return p ? drawSvgOnCanvas(ctx, p, 'rgba(255,255,255,0.95)', ix0 + i * (iw + igap), 943, iw) : Promise.resolve()
    }))
  }

  // 底部标语 + 日期
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '26px "PingFang SC","Microsoft YaHei",sans-serif'
  ctx.fillText('坚持刷题 · 稳步提升 · 圆梦春招', W / 2, 1080)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '22px "PingFang SC","Microsoft YaHei",sans-serif'
  const now = new Date()
  ctx.fillText(`${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`, W / 2, 1130)

  // 二维码引流：扫码直达平台
  const qrSize = 200
  const qrX = (W - qrSize) / 2
  const qrY = 1160
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 22)
  ctx.fill()
  const shareUrl = window.location.origin + '/?from=poster'
  try {
    const qrDataUrl = await QRCode.toDataURL(shareUrl, { margin: 1, width: qrSize, color: { dark: '#0f172a', light: '#ffffff' } })
    const img = new Image()
    await new Promise(resolve => {
      img.onload = resolve
      img.onerror = resolve
      img.src = qrDataUrl
    })
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize)
  } catch (e) { /* 二维码生成失败不影响海报主体 */ }
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = '24px "PingFang SC","Microsoft YaHei",sans-serif'
  ctx.fillText('扫码加入 · 一起冲刺春招', W / 2, qrY + qrSize + 48)
}

async function posterFile() {
  const blob = await (await fetch(posterUrl.value)).blob()
  return new File([blob], '我的学习成就海报.png', { type: 'image/png' })
}

// 分享到社交平台（微信/QQ/微博等，通过系统分享面板）
async function sharePoster() {
  try {
    const file = await posterFile()
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: '我的学习成就',
        text: `我在云南春招智能学习平台点亮了 ${data.value.earnedCount} 枚学习徽章，快来一起学习！`
      })
    } else {
      toast('当前浏览器不支持直接分享，请使用「复制图片」或「下载」功能', 'error')
    }
  } catch (e) {
    if (e.name !== 'AbortError') toast('分享失败，请重试', 'error')
  }
}

// 复制海报图片到剪贴板（可粘贴到微信/朋友圈）
async function copyPoster() {
  try {
    const blob = await (await fetch(posterUrl.value)).blob()
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast('海报已复制到剪贴板，可直接粘贴到微信、朋友圈等', 'success')
    } else {
      toast('当前浏览器不支持复制图片，请使用「下载」功能', 'error')
    }
  } catch (e) {
    toast('复制失败，请使用「下载」功能', 'error')
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

onMounted(async () => {
  const onKey = e => { if (e.key === 'Escape') posterShow.value = false }
  window.addEventListener('keydown', onKey)
  onUnmounted(() => window.removeEventListener('keydown', onKey))
  try {
    const [ach, me, ck] = await Promise.all([
      api.get('/achievements'),
      api.get('/stats/me').catch(() => null),
      api.get('/checkin/me').catch(() => null)
    ])
    data.value = ach
    if (me) stats.value = me
    if (ck) checkin.value = ck
  } catch (e) {
    toast(e.message || '加载失败，请稍后重试', 'error')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.ach-page { max-width: 860px; }
.page-head { text-align: center; margin-bottom: 24px; }
.page-head h2 { font-size: 1.6rem; }
.page-head p { color: var(--muted); margin-top: 4px; }

.ach-progress { display: flex; align-items: center; gap: 20px; padding: 22px 26px; margin-bottom: 16px; flex-wrap: wrap; }
.ap-ring {
  width: 84px; height: 84px; border-radius: 50%; flex-shrink: 0;
  background: conic-gradient(var(--accent) var(--pct), var(--rule-soft) 0);
  display: flex; align-items: center; justify-content: center;
  position: relative;
}
.ap-ring::before { content: ''; position: absolute; width: 64px; height: 64px; border-radius: 50%; background: var(--surface); }
.ap-ring span { position: relative; font-size: 1.1rem; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
.ap-info { flex: 1; min-width: 200px; }
.ap-info h3 { font-size: 1.15rem; }
.ap-info p { color: var(--muted); font-size: 0.88rem; margin-top: 4px; }
.share-btn { flex-shrink: 0; }

.ach-grid { padding: 18px; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
.badge {
  border: 1px solid var(--rule); border-radius: 14px; padding: 18px 12px;
  text-align: center; transition: transform 0.2s var(--ease), box-shadow 0.2s var(--ease), border-color 0.2s var(--ease); background: var(--surface);
}
.badge.earned:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); }
.badge-icon {
  display: flex; align-items: center; justify-content: center;
  width: 54px; height: 54px; margin: 0 auto 12px;
  border-radius: 15px;
}
.badge-icon svg { width: 26px; height: 26px; }
.badge.bronze .badge-icon { background: linear-gradient(135deg, #fdf3e7, #f9e3c8); color: #d97706; }
.badge.silver .badge-icon { background: linear-gradient(135deg, #f1f5f9, #e2e8f0); color: #64748b; }
.badge.gold .badge-icon { background: linear-gradient(135deg, #fdf9e6, #f9eec2); color: #d97706; }
.badge-name { font-weight: 700; font-size: 0.95rem; margin-bottom: 4px; }
.badge-desc { font-size: 0.78rem; color: var(--muted); line-height: 1.5; min-height: 34px; }
.badge-status { margin-top: 8px; font-size: 0.75rem; font-weight: 600; }
.badge-progress { margin-top: 8px; }
.bp-track { height: 5px; border-radius: 999px; background: var(--rule-soft); overflow: hidden; }
.bp-fill { height: 100%; border-radius: 999px; background: var(--accent); transition: width 0.6s var(--ease); }
.bp-num { display: block; font-size: 0.72rem; color: var(--muted); margin-top: 3px; }
.bs-earned {
  display: inline-flex; align-items: center; gap: 4px;
  color: var(--green);
  background: var(--green-soft);
  padding: 2px 10px;
  border-radius: 999px;
}
.bs-earned svg { width: 12px; height: 12px; }
.bs-locked {
  display: inline-flex; align-items: center; gap: 4px;
  color: var(--muted);
  background: var(--rule-soft);
  padding: 2px 10px;
  border-radius: 999px;
}
.bs-locked svg { width: 12px; height: 12px; }
.bs-progress {
  display: inline-flex; align-items: center; gap: 4px;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 2px 10px;
  border-radius: 999px;
}
.bs-progress svg { width: 12px; height: 12px; }

.badge.bronze { border-color: #e7c9a8; background: linear-gradient(180deg, #fdf6ee, var(--surface)); }
.badge.silver { border-color: #c3ccd6; background: linear-gradient(180deg, #f4f6f9, var(--surface)); }
.badge.gold { border-color: #e6c15a; background: linear-gradient(180deg, #fdf8e8, var(--surface)); }

.badge.locked { opacity: 0.55; filter: grayscale(1); background: var(--surface); border-color: var(--rule); }
.badge.locked .badge-icon { background: var(--rule-soft); color: var(--muted-2); }

.badge.progressing { opacity: 0.85; background: var(--surface); border-color: rgba(79, 95, 240, 0.45); }
.badge.progressing .badge-icon { background: var(--accent-soft); color: var(--accent); }

.poster-mask {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
  animation: modalFadeIn 0.22s var(--ease-out) both;
}
.poster-modal {
  background: var(--surface); border-radius: 18px; max-width: 520px; width: 100%;
  max-height: 92vh; display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);
  animation: modalPopIn 0.3s var(--ease-out) both;
}
.poster-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--rule); }
.poster-head h3 { font-size: 1.05rem; }
.poster-close {
  background: none; border: none; font-size: 1.05rem; color: var(--muted);
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  transition: background-color 0.2s var(--ease), color 0.2s var(--ease), transform 0.15s var(--ease);
}
.poster-close:hover { background: var(--accent-soft); color: var(--accent); }
.poster-close:active { transform: scale(0.92); }
.poster-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; align-items: center; justify-content: center; background: var(--accent-soft); overscroll-behavior: contain; }
.poster-img { width: 100%; max-width: 380px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
.poster-actions { display: flex; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--rule); flex-wrap: wrap; }
.poster-actions .btn { flex: 1; min-width: 88px; }

@media (max-width: 600px) {
  .page-head h2 { font-size: 1.3rem; }
  .page-head p { font-size: 0.82rem; }
  .ach-progress { padding: 18px 16px; gap: 16px; }
  .ap-ring { width: 70px; height: 70px; }
  .ap-ring::before { width: 54px; height: 54px; }
  .ap-info h3 { font-size: 1.05rem; }
  .ap-info p { font-size: 0.84rem; }
  .share-btn { width: 100%; }
  .ach-grid { padding: 14px; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  .badge { padding: 14px 10px; }
  .badge-icon { font-size: 1.7rem; }
  .badge-name { font-size: 0.88rem; }
  .badge-desc { font-size: 0.75rem; min-height: 30px; }
  .badge-status { font-size: 0.75rem; }
  .bp-num { font-size: 0.75rem; }
  .poster-actions .btn { min-width: 100%; }
  .poster-mask { padding: 10px; }
  .poster-modal { border-radius: 16px; }
}
@media (max-width: 400px) {
  .ach-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .badge { padding: 12px 8px; }
  .badge-icon { font-size: 1.5rem; }
}

/* ===== 骨架屏 ===== */
.sk-ap-ring { width: 96px; height: 96px; border-radius: 50%; flex-shrink: 0; }
.sk-ap-title { height: 18px; width: 210px; margin-bottom: 10px; }
.sk-ap-sub { height: 13px; width: 150px; }
.sk-ap-btn { height: 36px; width: 130px; border-radius: 10px; flex-shrink: 0; }

.ach-grid .sk-badge {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 18px 12px; border-radius: 12px; background: transparent;
}
.sk-badge-icon { width: 44px; height: 44px; border-radius: 12px; }
.sk-badge-name { height: 13px; width: 62px; }
.sk-badge-desc { height: 11px; width: 86px; }

@media (max-width: 768px) {
  .sk-ap-ring { width: 76px; height: 76px; }
}
@media (max-width: 600px) {
  .sk-ap-btn { width: 100%; }
}
</style>
