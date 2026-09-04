<template>
  <div class="container vip-page">
    <div class="page-head">
      <h2>VIP 会员</h2>
      <p>解锁无限 AI 答疑与专属权益，让备考更高效</p>
    </div>

    <!-- 加载骨架屏 -->
    <template v-if="loading">
      <div class="card vip-status sk-status">
        <div class="skeleton sk-vs-badge"></div>
        <div class="sk-vs-text">
          <div class="skeleton sk-vs-title"></div>
          <div class="skeleton sk-vs-sub"></div>
        </div>
      </div>
      <h3 class="sec-title">会员权益</h3>
      <div class="benefit-grid">
        <div v-for="i in 3" :key="i" class="card benefit">
          <div class="skeleton sk-bf-icon"></div>
          <div class="sk-bf-body">
            <div class="skeleton sk-bf-name"></div>
            <div class="skeleton sk-bf-desc"></div>
          </div>
        </div>
      </div>
      <h3 class="sec-title">开通方案</h3>
      <div class="plan-grid">
        <div v-for="i in 3" :key="i" class="card">
          <div class="skeleton sk-plan-name"></div>
          <div class="skeleton sk-plan-price"></div>
        </div>
      </div>
      <div class="skeleton sk-buy"></div>
    </template>

    <!-- 会员状态卡 -->
    <template v-else>
    <div class="card vip-status" :class="{ active: data.vip }">
      <div class="vs-left">
        <div class="vs-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7L12 3z"/></svg>
        </div>
        <div>
          <h3>{{ data.vip ? '尊享 VIP 会员' : '普通用户' }}</h3>
          <p v-if="data.vip && data.membership">
            有效期至 {{ formatDate(data.membership.expire_at) }} · {{ data.membership.level === 'vip' ? 'VIP' : data.membership.level }}
          </p>
          <p v-else>开通 VIP，解锁全部 AI 能力与专属功能</p>
        </div>
      </div>
      <span v-if="data.vip" class="tag tag-purple vs-tag">已开通</span>
    </div>

    <!-- 权益对比 -->
    <h3 class="sec-title">会员权益</h3>
    <div class="benefit-grid">
      <div class="card benefit" v-for="b in benefits" :key="b.name">
        <div class="bf-icon" :class="b.tone">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="b.icon"></svg>
        </div>
        <div class="bf-body">
          <strong>{{ b.name }}</strong>
          <p>{{ b.desc }}</p>
        </div>
        <span class="bf-free" :class="{ off: data.vip }">{{ data.vip ? '无限' : b.free }}</span>
      </div>
    </div>

    <!-- 套餐选择 -->
    <h3 class="sec-title">开通方案</h3>
    <div class="plan-grid">
      <div
        v-for="p in data.products"
        :key="p.code"
        class="card plan-card tappable"
        :class="{ selected: selected === p.code, hot: p.code === 'vip_quarter' }"
        @click="selected = p.code"
      >
        <span v-if="p.code === 'vip_quarter'" class="plan-hot">最受欢迎</span>
        <div class="pc-name">{{ p.name.replace('VIP 会员 · ', '') }}</div>
        <div class="pc-price"><span class="pc-yen">¥</span>{{ p.price }}</div>
        <div class="pc-unit">约 ¥{{ (p.price / p.months).toFixed(0) }}/月</div>
        <div class="pc-check">
          <svg v-if="selected === p.code" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </div>
      </div>
    </div>

    <button class="btn btn-primary buy-btn" :disabled="buying || data.vip" @click="createOrder">
      {{ data.vip ? '已是 VIP 会员' : (buying ? '正在下单…' : '立即开通') }}
    </button>
    <p class="buy-note">开通即视为同意会员服务条款 · 支付后会员权益立即生效</p>
    <p v-if="data.pay && data.pay.provider !== 'demo'" class="pay-channel">
      当前支付渠道：{{ payChannelText }}<span v-if="!data.pay.ready" class="pay-warn">（商户参数未配置完整，请联系管理员）</span>
    </p>

    <!-- 订单记录 -->
    <h3 class="sec-title">订单记录</h3>
    <div v-if="orders.length" class="card order-list">
      <div class="order-row" v-for="o in orders" :key="o.order_no">
        <div class="or-left">
          <strong>{{ o.product_name }}</strong>
          <span class="or-no">{{ o.order_no }}</span>
        </div>
        <div class="or-right">
          <span class="or-amount">¥{{ o.amount }}</span>
          <span class="tag" :class="o.status === 'paid' ? 'tag-green' : o.status === 'pending' ? 'tag-amber' : 'tag-gray'">{{ statusText(o.status) }}</span>
          <button v-if="o.status === 'pending'" class="btn btn-primary btn-sm" @click="rePay(o)">去支付</button>
          <span class="or-time">{{ o.created_at }}</span>
        </div>
      </div>
    </div>
    <div v-else class="card empty">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12v20l-6-4-6 4V2z"/></svg></div>
      <p>暂无订单记录</p>
      <span class="empty-sub">开通会员后，订单记录将展示在这里</span>
    </div>

    <!-- 支付弹窗 -->
    <div v-if="payModal" class="pay-mask" @click.self="closePayMask">
      <div class="pay-modal" :class="{ success: paySuccess }">
        <template v-if="paySuccess">
          <div class="pm-success">
            <div class="pm-success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <h3>支付成功</h3>
            <p>VIP 会员权益已生效，快去体验无限 AI 吧</p>
            <button class="btn btn-primary pm-btn" @click="closePay">完成</button>
          </div>
        </template>
        <template v-else>
          <div class="pm-head">
            <h3>{{ payProvider === 'wechat' ? '微信扫码支付' : payProvider === 'alipay' ? '支付宝支付' : '确认支付' }}</h3>
            <button class="pm-close" @click="closePayMask" aria-label="关闭">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </div>
          <div class="pm-product">{{ displayProduct?.name }}</div>
          <div class="pm-price"><span class="pc-yen">¥</span>{{ displayProduct?.price }}</div>

          <!-- 演示支付：选择方式并确认 -->
          <template v-if="payProvider === 'demo'">
            <div class="pm-methods">
              <button
                v-for="m in payMethods"
                :key="m"
                class="pm-method"
                :class="{ on: payMethod === m }"
                @click="payMethod = m"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>
                {{ m === 'wechat' ? '微信支付' : '支付宝' }}
              </button>
            </div>
            <button class="btn btn-primary pm-btn" :disabled="paying" @click="confirmPay">
              {{ paying ? '支付处理中…' : '确认支付' }}
            </button>
            <p class="pm-note">当前为{{ data.pay?.provider !== 'demo' ? '在线' : '演示' }}购买：点击确认即完成开通，不会产生真实扣款</p>
          </template>

          <!-- 微信扫码支付 -->
          <template v-else-if="payProvider === 'wechat'">
            <div class="pm-qr">
              <img v-if="qrCode" :src="qrCode" alt="微信支付二维码" />
              <div v-else class="pm-qr-loading">
                <div class="spinner"></div>
                <p>正在生成支付二维码…</p>
              </div>
            </div>
            <p class="pm-qr-tip">请使用微信「扫一扫」完成支付</p>
            <p class="pm-qr-status">{{ paying ? '正在等待支付结果…' : '二维码 5 分钟内有效，过期可刷新' }}</p>
            <button class="btn btn-ghost pm-btn" :disabled="paying" @click="refreshQr">刷新二维码</button>
          </template>

          <!-- 支付宝跳转 -->
          <template v-else-if="payProvider === 'alipay'">
            <div class="pm-alipay-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>
            </div>
            <p class="pm-alipay-tip">点击下方按钮前往支付宝完成支付，支付完成后将自动返回本页</p>
            <button class="btn btn-primary pm-btn" :disabled="paying" @click="goAlipay">
              {{ paying ? '正在跳转…' : '前往支付宝支付' }}
            </button>
          </template>
        </template>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import QRCode from 'qrcode'
import { api } from '../api'
import { toast } from '../toast'

const route = useRoute()
const loading = ref(true)
const data = ref({ vip: false, membership: null, products: [] })
const orders = ref([])
const selected = ref('vip_quarter')
const buying = ref(false)
const payModal = ref(false)
const payMethod = ref('wechat')
const paying = ref(false)
const paySuccess = ref(false)
const currentOrder = ref(null)
const payProvider = ref('demo')
const qrCode = ref('')
let pollTimer = null
let pollCount = 0

const benefits = [
  { name: 'AI 答疑无限次', desc: '随时提问，不限次数，深度解答各科知识点', icon: '<path d="M4 5h16v11H9.5L4 20V5z"/><path d="M8.5 10h7M8.5 13h4"/>', tone: 't-accent', free: '每日 10 次' },
  { name: 'AI 练习无限组', desc: '智能生成同类题，无限刷题巩固薄弱点', icon: '<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3z"/>', tone: 't-purple', free: '每日 3 组' },
  { name: '错题讲解无限次', desc: 'AI 深度讲解错题思路，举一反三', icon: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>', tone: 't-green', free: '每日 5 次' },
  { name: '学习计划不限量', desc: '随时重新生成个性化备考计划', icon: '<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>', tone: 't-amber', free: '每日 1 次' },
  { name: '学情分析不限量', desc: 'AI 深度分析学习数据，给出冲刺建议', icon: '<path d="M4 20V10M10 20V4M16 20v-7"/><path d="M3 20h18"/>', tone: 't-accent', free: '每日 1 次' },
  { name: '专属身份标识', desc: '个人中心展示 VIP 尊贵标识', icon: '<path d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7L12 3z"/>', tone: 't-purple', free: '无' }
]

const currentProduct = computed(() => data.value.products.find(p => p.code === selected.value))
// 重付时 currentOrder 已带商品信息，优先展示订单自身商品，避免下架/未知商品导致弹窗空白
const displayProduct = computed(() => currentProduct.value || currentOrder.value?.product)

const payChannelText = computed(() => ({ demo: '演示模式', wechat: '微信支付', alipay: '支付宝' })[data.value.pay?.provider] || '演示模式')

function formatDate(s) {
  if (!s) return ''
  return String(s).slice(0, 10)
}

function statusText(s) {
  return { paid: '已支付', pending: '待支付', cancelled: '已取消' }[s] || s
}

async function load() {
  loading.value = true
  try {
    const d = await api.get('/membership/me')
    data.value = d
    if (d.products?.length && !d.products.some(p => p.code === selected.value)) selected.value = d.products[0].code
  } catch (e) { toast(e.message || '套餐信息加载失败，请稍后重试', 'error') }
  try { orders.value = await api.get('/membership/orders') } catch (e) { toast('订单记录加载失败，请稍后重试', 'error') }
  loading.value = false
}

async function createOrder() {
  if (!currentProduct.value) return
  buying.value = true
  try {
    const d = await api.post('/membership/order', { product_code: selected.value })
    if (d.pay_error) { toast.error(d.pay_error); return }
    currentOrder.value = d
    paySuccess.value = false
    payProvider.value = d.pay_provider || 'demo'
    payModal.value = true
    if (payProvider.value === 'wechat') {
      await showQr(d.qr_code)
      startPoll()
    }
  } catch (e) { toast.error(e.message) }
  finally { buying.value = false }
}

// 从订单记录中对待支付订单重新发起支付
async function rePay(o) {
  const product = data.value.products.find(p => p.code === o.product_code)
  if (product) selected.value = product.code
  paySuccess.value = false
  payModal.value = true
  try {
    const d = await api.post(`/membership/order/${o.order_no}/pay`, {})
    if (d.pay_error) { toast.error(d.pay_error); return }
    currentOrder.value = {
      order_no: o.order_no,
      product: { name: o.product_name, price: o.amount },
      pay_url: d.pay_url
    }
    payProvider.value = d.pay_provider || 'demo'
    if (payProvider.value === 'wechat') {
      await showQr(d.qr_code)
      startPoll()
    }
  } catch (e) { toast.error(e.message) }
}

async function showQr(text) {
  qrCode.value = ''
  if (!text) return
  try {
    qrCode.value = await QRCode.toDataURL(text, { width: 220, margin: 1, color: { dark: '#1e293b', light: '#ffffff' } })
  } catch (e) { qrCode.value = '' }
}

async function refreshQr() {
  if (!currentOrder.value) return
  paying.value = true
  try {
    const d = await api.post(`/membership/order/${currentOrder.value.order_no}/pay`, {})
    if (d.pay_error) { toast.error(d.pay_error); return }
    await showQr(d.qr_code)
    startPoll()
  } catch (e) { toast.error(e.message) }
  finally { paying.value = false }
}

function goAlipay() {
  if (!currentOrder.value?.pay_url) { toast.error('支付链接无效，请重试'); return }
  paying.value = true
  window.location.href = currentOrder.value.pay_url
  // 跳转后本页卸载，返回时通过路由参数恢复轮询
}

function startPoll() {
  stopPoll()
  pollCount = 0
  pollTimer = setInterval(async () => {
    if (!currentOrder.value) return
    pollCount++
    try {
      const o = await api.get(`/membership/order/${currentOrder.value.order_no}`)
      if (o.status === 'paid') {
        stopPoll()
        paySuccess.value = true
        toast.success('支付成功，VIP 会员已开通')
        await load()
        window.dispatchEvent(new Event('ai-quota-refresh'))
      } else if (pollCount > 40) {
        // 约 2 分钟未支付，停止轮询
        stopPoll()
        toast.info('支付未完成，可稍后在订单记录中继续支付')
      }
    } catch (e) { /* 忽略 */ }
  }, 3000)
}

function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

function closePayMask() {
  stopPoll()
  payModal.value = false
}

function closePay() {
  stopPoll()
  payModal.value = false
  paySuccess.value = false
}

async function confirmPay() {
  if (!currentOrder.value) return
  paying.value = true
  try {
    // 演示环境直接调用支付回调模拟成功；真实环境由支付平台回调
    await api.post(`/membership/pay/notify/${payMethod.value}`, { order_no: currentOrder.value.order_no })
    paySuccess.value = true
    toast.success('支付成功，VIP 会员已开通')
    await load()
    window.dispatchEvent(new Event('ai-quota-refresh'))
  } catch (e) { toast.error(e.message) }
  finally { paying.value = false }
}

onMounted(async () => {
  await load()
  // 从支付宝返回：通过路由参数恢复订单轮询
  const orderNo = route.query.order
  if (orderNo) {
    currentOrder.value = { order_no: orderNo }
    payProvider.value = 'alipay'
    payModal.value = true
    startPoll()
  }
})

onBeforeUnmount(() => {
  stopPoll()
})
</script>

<style scoped>
.vip-page { max-width: 960px; }

/* 骨架屏 */
.sk-status { background: var(--surface); }
.sk-vs-badge { width: 52px; height: 52px; border-radius: 16px; flex-shrink: 0; }
.sk-vs-text { flex: 1; }
.sk-vs-title { width: 55%; height: 20px; border-radius: 6px; margin-bottom: 10px; }
.sk-vs-sub { width: 38%; height: 14px; border-radius: 6px; }
.sk-bf-icon { width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0; }
.sk-bf-body { flex: 1; }
.sk-bf-name { width: 55%; height: 14px; border-radius: 5px; margin-bottom: 8px; }
.sk-bf-desc { width: 90%; height: 11px; border-radius: 5px; }
.sk-plan-name { width: 50%; height: 14px; border-radius: 5px; margin: 4px auto 18px; }
.sk-plan-price { width: 45%; height: 26px; border-radius: 6px; margin: 0 auto; }
.sk-buy { width: 100%; height: 50px; border-radius: var(--radius-md); margin-top: 18px; }

.vip-status {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  background: linear-gradient(135deg, #1e2547 0%, #2b2f63 55%, #3a356f 100%);
  border: none; color: #fff;
}
.vip-status.active { background: linear-gradient(135deg, #4f5ff0 0%, #6b58e8 100%); }
.vs-left { display: flex; align-items: center; gap: 16px; }
.vs-badge {
  width: 52px; height: 52px; border-radius: 16px; flex-shrink: 0;
  background: rgba(255, 255, 255, 0.14); color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.vs-badge svg { width: 28px; height: 28px; }
.vs-left h3 { font-size: 1.2rem; font-weight: 700; }
.vs-left p { color: rgba(255, 255, 255, 0.78); font-size: 0.86rem; margin-top: 3px; }
.vs-tag { background: rgba(255, 255, 255, 0.2); color: #fff; }

.sec-title {
  margin: 30px 0 14px; font-size: 1.05rem; font-weight: 700;
  display: flex; align-items: center; gap: 9px;
}
.sec-title::before { content: ''; width: 4px; height: 16px; border-radius: 2px; background: var(--grad-accent); flex-shrink: 0; }

.benefit-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.benefit { display: flex; align-items: flex-start; gap: 12px; padding: 16px; }
.bf-icon {
  width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.bf-icon svg { width: 20px; height: 20px; }
.t-accent { background: var(--accent-soft); color: var(--accent); }
.t-purple { background: var(--accent2-soft); color: var(--accent-2); }
.t-green { background: var(--green-soft); color: var(--green); }
.t-amber { background: var(--amber-soft); color: var(--amber); }
.bf-body { flex: 1; min-width: 0; }
.bf-body strong { font-size: 0.9rem; display: block; }
.bf-body p { font-size: 0.78rem; color: var(--muted); margin-top: 3px; line-height: 1.6; }
.bf-free { font-size: 0.78rem; color: var(--muted-2); white-space: nowrap; }
.bf-free.off { color: var(--green); font-weight: 700; }

.plan-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.plan-card {
  position: relative; text-align: center; padding: 22px 16px 18px;
  cursor: pointer; transition: border-color 0.25s var(--ease), box-shadow 0.25s var(--ease), transform 0.25s var(--ease);
}
.plan-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
.plan-card.selected { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.plan-hot {
  position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
  background: var(--grad-accent); color: #fff; font-size: 0.78rem; font-weight: 700;
  padding: 3px 12px; border-radius: var(--radius-full); white-space: nowrap;
}
.pc-name { font-size: 0.9rem; color: var(--muted); font-weight: 600; }
.pc-price { font-size: 2rem; font-weight: 800; color: var(--ink); margin: 8px 0 2px; letter-spacing: -0.02em; }
.pc-yen { font-size: 1rem; font-weight: 700; vertical-align: 8px; color: var(--accent); }
.pc-unit { font-size: 0.78rem; color: var(--muted-2); }
.pc-check {
  position: absolute; top: 12px; right: 12px;
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid var(--rule); color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.pc-check svg { width: 13px; height: 13px; }
.plan-card.selected .pc-check { background: var(--accent); border-color: var(--accent); }

.buy-btn { width: 100%; padding: 14px; font-size: 1rem; margin-top: 18px; }
.buy-note { text-align: center; color: var(--muted-2); font-size: 0.78rem; margin-top: 10px; }
.pay-channel { text-align: center; color: var(--muted-2); font-size: 0.78rem; margin-top: 6px; }
.pay-warn { color: var(--red); font-weight: 600; }

.order-list { padding: 6px 18px; }
.order-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 0; border-bottom: 1px solid var(--rule-soft);
}
.order-row:last-child { border-bottom: none; }
.or-left { display: flex; flex-direction: column; gap: 2px; }
.or-left strong { font-size: 0.9rem; }
.or-no { font-size: 0.78rem; color: var(--muted-2); }
.or-right { display: flex; align-items: center; gap: 10px; }
.or-amount { font-weight: 700; font-size: 0.95rem; }
.or-time { font-size: 0.78rem; color: var(--muted-2); }

.pay-mask {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(30, 41, 59, 0.5); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
  animation: modalFadeIn 0.25s var(--ease) both;
}
.pay-modal {
  width: 100%; max-width: 360px; background: var(--surface);
  border-radius: var(--radius-lg); padding: 24px;
  box-shadow: var(--shadow-lg); animation: modalPopIn 0.3s var(--ease-out) both;
}
.pm-head { display: flex; align-items: center; justify-content: space-between; }
.pm-head h3 { font-size: 1.05rem; }
.pm-close {
  width: 36px; height: 36px; border-radius: 10px; border: none;
  background: var(--surface-2); color: var(--muted);
  display: flex; align-items: center; justify-content: center;
  transition: background-color 0.2s var(--ease), color 0.2s var(--ease), transform 0.15s var(--ease);
}
.pm-close:hover { background: var(--accent-soft); color: var(--accent); }
.pm-close:active { transform: scale(0.92); }
.pm-close svg { width: 15px; height: 15px; }
.pm-product { text-align: center; color: var(--muted); font-size: 0.88rem; margin-top: 18px; }
.pm-price { text-align: center; font-size: 2.4rem; font-weight: 800; margin: 6px 0 18px; }
.pm-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
.pm-method {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px; border-radius: var(--radius-sm);
  border: 1px solid var(--rule); background: var(--surface);
  color: var(--ink-soft); font-size: 0.88rem; font-weight: 600;
  transition: border-color 0.2s var(--ease), background-color 0.2s var(--ease), color 0.2s var(--ease);
}
.pm-method svg { width: 18px; height: 18px; }
.pm-method.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.pm-btn { width: 100%; }
.pm-note { text-align: center; color: var(--muted-2); font-size: 0.78rem; margin-top: 10px; }

.pm-qr { display: flex; flex-direction: column; align-items: center; margin: 14px 0 4px; }
.pm-qr img {
  width: 220px; height: 220px; border-radius: var(--radius-sm);
  border: 1px solid var(--rule); padding: 8px; background: #fff;
}
.pm-qr-loading { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 60px 0; color: var(--muted); font-size: 0.84rem; }
.pm-qr-tip { text-align: center; font-weight: 600; font-size: 0.9rem; margin-top: 10px; }
.pm-qr-status { text-align: center; color: var(--muted-2); font-size: 0.78rem; margin: 6px 0 12px; }
.pm-qr .pm-btn { margin-top: 4px; }

.pm-alipay-icon {
  width: 56px; height: 56px; margin: 16px auto 12px; border-radius: 16px;
  background: var(--accent2-soft); color: var(--accent-2);
  display: flex; align-items: center; justify-content: center;
}
.pm-alipay-icon svg { width: 28px; height: 28px; }
.pm-alipay-tip { text-align: center; color: var(--muted); font-size: 0.84rem; margin: 0 0 18px; line-height: 1.7; }

.pay-modal.success { max-width: 340px; }
.pm-success { text-align: center; padding: 12px 4px 6px; }
.pm-success-icon {
  width: 64px; height: 64px; margin: 0 auto 16px; border-radius: 50%;
  background: var(--green-soft); color: var(--green);
  display: flex; align-items: center; justify-content: center;
  animation: successPop 0.45s var(--ease-out) both;
}
.pm-success-icon svg { width: 32px; height: 32px; }
.pm-success h3 { font-size: 1.2rem; }
.pm-success p { color: var(--muted); font-size: 0.85rem; margin: 8px 0 20px; }
@keyframes successPop {
  0% { transform: scale(0.4); opacity: 0; }
  60% { transform: scale(1.12); }
  100% { transform: scale(1); opacity: 1; }
}
.tag-gray { background: var(--bg-soft); color: var(--muted-2); }

@media (max-width: 768px) {
  .benefit-grid, .plan-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 600px) {
  .pay-mask { padding: 12px; align-items: flex-end; }
  .pay-modal { max-width: 100%; border-radius: 18px 18px 14px 14px; padding-bottom: calc(24px + var(--safe-bottom)); }
}
@media (max-width: 480px) {
  .benefit-grid, .plan-grid { grid-template-columns: 1fr; }
  .vs-badge { width: 44px; height: 44px; }
}
</style>
