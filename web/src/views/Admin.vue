<template>
  <div class="container admin-page">
    <div class="page-head">
      <h2>运营数据看板</h2>
      <p>平台用户增长、活跃、AI 消耗与会员转化一览</p>
    </div>

    <div v-if="loading && !overview" class="spinner"></div>

    <template v-else-if="overview">
      <!-- 核心指标 -->
      <div class="kpi-grid">
        <div class="card kpi">
          <span class="kpi-label">注册用户</span>
          <div class="kpi-num">{{ overview.users.total }}</div>
          <span class="kpi-sub">今日 +{{ overview.users.todayNew }} · 近7天 +{{ overview.users.weekNew }}</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">今日活跃</span>
          <div class="kpi-num">{{ overview.activity.todayActive }}</div>
          <span class="kpi-sub">今日刷题 {{ overview.activity.todayRecords }} 次</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">VIP 会员</span>
          <div class="kpi-num">{{ overview.vip.active }}</div>
          <span class="kpi-sub">转化率 {{ overview.vip.conversion }}%</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">累计营收</span>
          <div class="kpi-num">¥{{ overview.orders.revenue }}</div>
          <span class="kpi-sub">已支付订单 {{ overview.orders.paid }} 笔</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">今日 AI 调用</span>
          <div class="kpi-num">{{ overview.ai.today }}</div>
          <span class="kpi-sub">近七天 {{ overview.ai.week }} 次</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">积分发放</span>
          <div class="kpi-num">{{ overview.points.issued }}</div>
          <span class="kpi-sub">已消耗 {{ overview.points.spent }}</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">支付渠道</span>
          <div class="kpi-num kpi-pay" :class="payReady ? 'ok' : 'warn'">{{ payChannelText }}</div>
          <span class="kpi-sub">{{ payReady ? '商户参数已配置，可正常收款' : '未配置完整，当前为演示模式' }}</span>
        </div>
      </div>

      <!-- 近十四天趋势 -->
      <h3 class="sec-title">近十四天趋势</h3>
      <div class="card trend-card">
        <div class="trend-tabs">
          <button v-for="m in ['reg', 'act', 'ai']" :key="m" class="trend-tab" :class="{ on: trendMode === m }" @click="trendMode = m">
            {{ { reg: '新增注册', act: '活跃用户', ai: 'AI 调用' }[m] }}
          </button>
        </div>
        <div class="trend-bars">
          <div class="tbar" v-for="d in trend" :key="d.date" :title="`${d.date}：${d[trendMode]}`">
            <div class="tbar-fill" :style="{ height: barHeight(d[trendMode]) + '%' }"></div>
            <span class="tbar-label">{{ d.date.slice(5) }}</span>
          </div>
        </div>
      </div>

      <!-- ===================== 管理员管理 ===================== -->
      <div class="sec-head">
        <h3 class="sec-title">管理员配置</h3>
        <div v-if="adminCurrent.role === 'main'" class="toolbar">
          <input v-model="addPhone" class="tool-input" placeholder="按手机号添加管理员" @keyup.enter="addAdmin">
          <button class="btn btn-primary btn-sm" :disabled="adminBusy || !addPhone.trim()" @click="addAdmin">添加</button>
        </div>
      </div>
      <div class="card user-table-wrap">
        <table class="user-table user-table-sm">
          <thead>
            <tr>
              <th>管理员</th>
              <th>手机号</th>
              <th>角色</th>
              <th>加入时间</th>
              <th v-if="adminCurrent.role === 'main'"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in admins" :key="a.user_id">
              <td class="ut-user">
                <span class="ut-avatar">{{ (a.nickname || '管')[0] }}</span>
                <span>{{ a.nickname }}<template v-if="a.user_id === adminCurrent.userId">（我）</template></span>
              </td>
              <td class="ut-mono">{{ a.phone }}</td>
              <td>
                <span v-if="a.role === 'main'" class="tag tag-purple">主管理员</span>
                <span v-else class="tag tag-blue">管理员</span>
              </td>
              <td class="ut-muted">{{ a.created_at }}</td>
              <td v-if="adminCurrent.role === 'main'" class="ut-act">
                <button v-if="a.role !== 'main' && a.user_id !== adminCurrent.userId" class="btn btn-ghost btn-xs" :disabled="adminBusy" @click="removeAdmin(a)">移除</button>
              </td>
            </tr>
            <tr v-if="!admins.length"><td :colspan="adminCurrent.role === 'main' ? 5 : 4" class="ut-empty">暂无管理员</td></tr>
          </tbody>
        </table>
        <p v-if="adminCurrent.role !== 'main'" class="admin-hint">普通管理员可查看看板与兑付，仅主管理员可配置管理员。</p>
      </div>

      <!-- ===================== 用户管理 ===================== -->
      <div class="sec-head">
        <h3 class="sec-title">用户管理</h3>
        <div class="toolbar">
          <input v-model="userKw" class="tool-input" placeholder="搜索手机号 / 昵称" @keyup.enter="searchUsers">
          <button class="btn btn-ghost btn-sm" @click="searchUsers">搜索</button>
        </div>
      </div>
      <div class="card user-table-wrap">
        <table class="user-table">
          <thead>
            <tr>
              <th>用户</th>
              <th>手机号</th>
              <th>注册时间</th>
              <th>刷题</th>
              <th>打卡</th>
              <th>积分</th>
              <th>会员</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td class="ut-user">
                <span class="ut-avatar">{{ (u.nickname || '考')[0] }}</span>
                <span>{{ u.nickname }}</span>
              </td>
              <td class="ut-mono">{{ u.phone }}</td>
              <td class="ut-muted">{{ u.created_at }}</td>
              <td>{{ u.records }}</td>
              <td>{{ u.checkins }}</td>
              <td>{{ u.points ?? 0 }}</td>
              <td>
                <span v-if="u.vip" class="tag tag-purple">VIP</span>
                <span v-else class="tag tag-blue">免费</span>
              </td>
              <td class="ut-act">
                <button class="btn btn-ghost btn-xs" @click="openDetail(u)">详情与兑付</button>
              </td>
            </tr>
            <tr v-if="!users.length"><td colspan="8" class="ut-empty">未找到匹配的用户</td></tr>
          </tbody>
        </table>
        <div class="pager">
          <button class="btn btn-ghost btn-sm" :disabled="userPage <= 1" @click="userPage--; loadUsers()">上一页</button>
          <span class="pager-info">共 {{ userTotal }} 位 · 第 {{ userPage }} / {{ userPageCount }} 页</span>
          <select v-model.number="userPerPage" class="pager-sel" @change="userPage = 1; loadUsers()">
            <option :value="10">10/页</option>
            <option :value="20">20/页</option>
            <option :value="50">50/页</option>
          </select>
          <button class="btn btn-ghost btn-sm" :disabled="userPage >= userPageCount" @click="userPage++; loadUsers()">下一页</button>
        </div>
      </div>

      <!-- ===================== 订单管理 ===================== -->
      <div class="sec-head">
        <div class="sec-head-left">
          <h3 class="sec-title">订单管理</h3>
          <div class="seg">
            <button v-for="s in orderTabs" :key="s.v" class="trend-tab" :class="{ on: orderStatus === s.v }" @click="setOrderStatus(s.v)">
              {{ s.label }}
            </button>
          </div>
        </div>
        <div class="toolbar">
          <input v-model="orderKw" class="tool-input" placeholder="搜索订单号 / 昵称 / 手机号" @keyup.enter="searchOrders">
          <button class="btn btn-ghost btn-sm" @click="searchOrders">搜索</button>
          <button class="btn btn-ghost btn-sm" @click="exportOrders">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
            导出 CSV
          </button>
        </div>
      </div>
      <div class="card user-table-wrap">
        <table class="user-table">
          <thead>
            <tr>
              <th>订单号</th>
              <th>用户</th>
              <th>商品</th>
              <th>金额</th>
              <th>状态</th>
              <th>支付方式</th>
              <th>下单时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in orders" :key="o.order_no">
              <td class="ut-mono">{{ o.order_no }}</td>
              <td class="ut-user">
                <span class="ut-avatar">{{ (o.nickname || '考')[0] }}</span>
                <span>{{ o.nickname }}<span class="ut-sub">{{ o.phone }}</span></span>
              </td>
              <td>{{ o.product_name }}</td>
              <td class="ut-amount">¥{{ o.amount }}</td>
              <td>
                <span class="tag" :class="o.status === 'paid' ? 'tag-green' : o.status === 'pending' ? 'tag-amber' : 'tag-gray'">{{ statusText(o.status) }}</span>
              </td>
              <td class="ut-muted">{{ payMethodText(o.pay_method) }}</td>
              <td class="ut-muted">{{ o.created_at }}</td>
            </tr>
            <tr v-if="!orders.length"><td colspan="7" class="ut-empty">暂无订单记录</td></tr>
          </tbody>
        </table>
        <div class="pager">
          <button class="btn btn-ghost btn-sm" :disabled="orderPage <= 1" @click="orderPage--; loadOrders()">上一页</button>
          <span class="pager-info">共 {{ orderTotal }} 笔 · 第 {{ orderPage }} / {{ orderPageCount }} 页</span>
          <select v-model.number="orderPerPage" class="pager-sel" @change="orderPage = 1; loadOrders()">
            <option :value="10">10/页</option>
            <option :value="20">20/页</option>
            <option :value="50">50/页</option>
          </select>
          <button class="btn btn-ghost btn-sm" :disabled="orderPage >= orderPageCount" @click="orderPage++; loadOrders()">下一页</button>
        </div>
      </div>

      <!-- ===================== 商品/会员套餐管理 ===================== -->
      <div class="sec-head">
        <h3 class="sec-title">商品与会员套餐</h3>
        <div v-if="adminCurrent.role === 'main'" class="toolbar">
          <button class="btn btn-primary btn-sm" @click="openProductModal(null)">新增商品</button>
        </div>
      </div>
      <div class="card user-table-wrap">
        <table class="user-table">
          <thead>
            <tr>
              <th>编码</th>
              <th>类型</th>
              <th>名称</th>
              <th>价格</th>
              <th>会员时长</th>
              <th>排序</th>
              <th>状态</th>
              <th>更新时间</th>
              <th v-if="adminCurrent.role === 'main'"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in products" :key="p.code">
              <td class="ut-mono">{{ p.code }}</td>
              <td>{{ p.kind === 'vip' ? '会员套餐' : p.kind }}</td>
              <td>{{ p.name }}</td>
              <td class="ut-amount">¥{{ p.price }}</td>
              <td>{{ p.months ? `${p.months} 月` : '-' }}</td>
              <td>{{ p.sort }}</td>
              <td>
                <span v-if="p.active" class="tag tag-green">上架</span>
                <span v-else class="tag tag-gray">下架</span>
              </td>
              <td class="ut-muted">{{ p.updated_at }}</td>
              <td v-if="adminCurrent.role === 'main'" class="ut-act">
                <button class="btn btn-ghost btn-xs" @click="openProductModal(p)">编辑</button>
              </td>
            </tr>
            <tr v-if="!products.length"><td :colspan="adminCurrent.role === 'main' ? 9 : 8" class="ut-empty">暂无商品</td></tr>
          </tbody>
        </table>
        <p v-if="adminCurrent.role !== 'main'" class="admin-hint">仅主管理员可编辑商品配置。</p>
      </div>
    </template>

    <div v-else class="card empty">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7"/><path d="M3 20h18"/></svg></div>
      <p>无权限访问运营看板</p>
      <span class="empty-sub">仅管理员账号可查看，请在服务端 .env 配置 ADMIN_PHONES</span>
    </div>

    <!-- ===================== 商品编辑弹窗 ===================== -->
    <div v-if="productOpen" class="modal-mask" @click.self="productOpen = false">
      <div class="modal-panel modal-product">
        <div class="modal-head">
          <div>
            <h4>{{ productForm.isNew ? '新增商品' : '编辑商品' }}</h4>
            <p class="modal-sub" v-if="!productForm.isNew">编码：{{ productForm.code }}</p>
          </div>
          <button class="modal-x" @click="productOpen = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="pf-row">
            <label class="pf-label">商品编码</label>
            <input v-model="productForm.code" :disabled="!productForm.isNew" class="tool-input pf-input" placeholder="如 vip_month，小写字母/数字/下划线">
          </div>
          <div class="pf-row">
            <label class="pf-label">商品名称</label>
            <input v-model="productForm.name" class="tool-input pf-input" placeholder="如 VIP 会员 · 半年卡">
          </div>
          <div class="pf-grid">
            <div class="pf-row">
              <label class="pf-label">类型</label>
              <select v-model="productForm.kind" class="pager-sel pf-input">
                <option value="vip">会员套餐</option>
                <option value="points">积分包</option>
                <option value="course">课程</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div class="pf-row">
              <label class="pf-label">价格（元）</label>
              <input v-model.number="productForm.price" type="number" min="0" max="1000000" class="tool-input pf-input" placeholder="0">
            </div>
          </div>
          <div class="pf-grid">
            <div class="pf-row">
              <label class="pf-label">会员时长（月）</label>
              <input v-model="productForm.months" type="number" min="1" max="120" class="tool-input pf-input" placeholder="留空表示非会员时长商品">
            </div>
            <div class="pf-row">
              <label class="pf-label">排序</label>
              <input v-model.number="productForm.sort" type="number" class="tool-input pf-input" placeholder="0">
            </div>
          </div>
          <div class="pf-row">
            <label class="pf-check">
              <input type="checkbox" v-model="productForm.active">
              <span>上架中（用户可购买）</span>
            </label>
          </div>
          <p v-if="productMsg" class="pf-err">{{ productMsg }}</p>
          <div class="pf-actions">
            <button class="btn btn-ghost btn-sm" @click="productOpen = false">取消</button>
            <button class="btn btn-primary btn-sm" :disabled="productBusy" @click="saveProduct">保存</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================== 用户详情与兑付弹窗 ===================== -->
    <div v-if="detailOpen" class="modal-mask" @click.self="detailOpen = false">
      <div class="modal-panel">
        <div class="modal-head">
          <div>
            <h4>用户详情与兑付</h4>
            <p class="modal-sub" v-if="detail">{{ detail.nickname }} · {{ detail.phone }}</p>
          </div>
          <button class="modal-x" @click="detailOpen = false">✕</button>
        </div>

        <div v-if="detailLoading" class="modal-body centered"><div class="spinner small"></div></div>

        <div v-else-if="detail" class="modal-body">
          <!-- 概览 -->
          <div class="ov-grid">
            <div class="ov-cell"><span class="ov-l">注册时间</span><span class="ov-v">{{ detail.created_at }}</span></div>
            <div class="ov-cell"><span class="ov-l">当前积分</span><span class="ov-v ov-money">{{ detail.points }}</span></div>
            <div class="ov-cell"><span class="ov-l">会员状态</span>
              <span v-if="detail.membership && detail.membership.status === 'active'" class="tag tag-purple">VIP · {{ detail.membership.expire_at || '永久' }}</span>
              <span v-else class="tag tag-blue">免费</span>
            </div>
            <div class="ov-cell"><span class="ov-l">刷题</span><span class="ov-v">{{ detail.stats.records }} 题 · 正确率 {{ detail.stats.rate }}%</span></div>
          </div>

          <!-- 兑付操作 -->
          <div class="ad-sec">
            <div class="ad-title">积分调整</div>
            <div class="ad-row">
              <select v-model="pt.mode" class="pager-sel ad-sel">
                <option value="set">设为余额</option>
                <option value="increase">增加</option>
                <option value="decrease">扣减</option>
              </select>
              <input v-model.number="pt.val" type="number" min="0" class="tool-input ad-val" placeholder="数值">
              <input v-model="pt.reason" class="tool-input ad-reason" placeholder="调整原因" maxlength="40">
              <button class="btn btn-primary btn-sm" :disabled="busy || !isValidPointVal" @click="adjustPoints">提交</button>
            </div>
          </div>

          <div class="ad-sec">
            <div class="ad-title">会员兑付</div>
            <div class="ad-row">
              <input v-model.number="vipMonths" type="number" min="1" max="120" class="tool-input ad-val" placeholder="月数">
              <button class="btn btn-primary btn-sm" :disabled="busy || vipMonths < 1 || vipMonths > 120" @click="grantVip">开通 / 续费会员</button>
              <button v-if="detail.vip" class="btn btn-ghost btn-sm" :disabled="busy" @click="cancelVip">停用会员</button>
            </div>
          </div>

          <!-- 积分流水 -->
          <div class="ad-sec">
            <div class="ad-title">积分流水（最近 {{ detail.logs.length }} 条）</div>
            <table class="mini-table" v-if="detail.logs.length">
              <thead><tr><th>变动</th><th>原因</th><th>时间</th></tr></thead>
              <tbody>
                <tr v-for="(l, i) in detail.logs" :key="i">
                  <td :class="l.change >= 0 ? 'pos' : 'neg'">{{ l.change >= 0 ? '+' : '' }}{{ l.change }}</td>
                  <td>{{ l.reason }}<span v-if="l.ref" class="ut-sub"> ({{ l.ref }})</span></td>
                  <td class="ut-muted">{{ l.created_at }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="ad-empty">暂无积分变动</p>
          </div>

          <!-- 订单记录 -->
          <div class="ad-sec">
            <div class="ad-title">订单记录（最近 {{ detail.orders.length }} 笔）</div>
            <table class="mini-table" v-if="detail.orders.length">
              <thead><tr><th>商品</th><th>金额</th><th>状态</th><th>时间</th></tr></thead>
              <tbody>
                <tr v-for="(o, i) in detail.orders" :key="i">
                  <td>{{ o.product_name }}<div class="ut-sub">{{ o.order_no }}</div></td>
                  <td class="ut-amount">¥{{ o.amount }}</td>
                  <td><span class="tag" :class="o.status === 'paid' ? 'tag-green' : o.status === 'pending' ? 'tag-amber' : 'tag-gray'">{{ statusText(o.status) }}</span></td>
                  <td class="ut-muted">{{ o.created_at }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="ad-empty">暂无订单</p>
          </div>

          <!-- AI 用量 -->
          <div class="ad-sec" v-if="detail.ai && detail.ai.length">
            <div class="ad-title">AI 用量</div>
            <div class="ai-kinds">
              <span v-for="a in detail.ai" :key="a.kind" class="ai-kind">{{ { chat: 'AI 答疑', plan: '学习计划', analyze: '学情分析', explain: '错题讲解', generate: '智能出题' }[a.kind] || a.kind }}：{{ a.total }} 次</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '../api'
import { toast } from '../toast'

const loading = ref(true)
const overview = ref(null)
const trend = ref([])
const trendMode = ref('reg')

// 管理员管理
const admins = ref([])
const adminCurrent = ref({ userId: 0, role: '' })
const addPhone = ref('')
const adminBusy = ref(false)
async function loadAdmins() {
  try {
    const d = await api.get('/admin/admins')
    admins.value = d.list
    adminCurrent.value = d.current
  } catch (e) {
    if (e.code !== 403) toast(e.message, 'error')
  }
}
async function addAdmin() {
  const phone = addPhone.value.trim()
  if (!phone) return
  adminBusy.value = true
  try {
    const r = await api.post('/admin/admins', { phone })
    toast(r.message || '已添加管理员', 'success')
    addPhone.value = ''
    await loadAdmins()
  } catch (e) {
    toast(e.message, 'error')
  } finally { adminBusy.value = false }
}
async function removeAdmin(a) {
  if (!confirm(`确认移除管理员「${a.nickname}」？`)) return
  adminBusy.value = true
  try {
    const r = await api.del('/admin/admins/' + a.user_id)
    toast(r.message || '已移除', 'success')
    await loadAdmins()
  } catch (e) {
    toast(e.message, 'error')
  } finally { adminBusy.value = false }
}

// 商品管理
const products = ref([])
const productOpen = ref(false)
const productBusy = ref(false)
const productMsg = ref('')
const emptyProduct = () => ({ isNew: true, code: '', name: '', kind: 'vip', price: 0, months: '', sort: 0, active: true })
const productForm = ref(emptyProduct())
async function loadProducts() {
  try {
    const d = await api.get('/admin/products')
    products.value = d.list
  } catch (e) {
    if (e.code !== 403) toast(e.message, 'error')
  }
}
function openProductModal(p) {
  productMsg.value = ''
  productForm.value = p
    ? { isNew: false, code: p.code, name: p.name, kind: p.kind, price: p.price, months: p.months ?? '', sort: p.sort, active: !!p.active }
    : emptyProduct()
  productOpen.value = true
}
async function saveProduct() {
  productBusy.value = true
  productMsg.value = ''
  try {
    const f = productForm.value
    if (f.isNew) {
      const r = await api.post('/admin/products', {
        code: f.code.trim(), name: f.name.trim(), kind: f.kind,
        price: f.price, months: f.months === '' ? undefined : f.months, sort: f.sort, active: f.active
      })
      toast(r.message || '已新增商品', 'success')
    } else {
      const r = await api.patch(`/admin/products/${encodeURIComponent(f.code)}`, {
        name: f.name.trim(), kind: f.kind, price: f.price,
        months: f.months === '' ? null : f.months, sort: f.sort, active: f.active
      })
      toast(r.message || '已更新商品', 'success')
    }
    productOpen.value = false
    await loadProducts()
  } catch (e) {
    toast(e.message, 'error')
    productMsg.value = e.message
  } finally { productBusy.value = false }
}

// 用户列表
const users = ref([])
const userKw = ref('')
const userPage = ref(1)
const userPerPage = ref(10)
const userTotal = ref(0)
const userPageCount = computed(() => Math.max(1, Math.ceil(userTotal.value / userPerPage.value)))

// 订单列表
const orders = ref([])
const orderKw = ref('')
const orderStatus = ref('')
const orderPage = ref(1)
const orderPerPage = ref(10)
const orderTotal = ref(0)
const orderPageCount = computed(() => Math.max(1, Math.ceil(orderTotal.value / orderPerPage.value)))
const orderTabs = [
  { v: '', label: '全部' },
  { v: 'paid', label: '已支付' },
  { v: 'pending', label: '待支付' },
  { v: 'cancelled', label: '已取消' }
]

// 详情弹窗
const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const busy = ref(false)
const pt = reactive({ mode: 'increase', val: 0, reason: '' })
const vipMonths = ref(1)
const isValidPointVal = computed(() => Number.isFinite(pt.val) && pt.val > 0)

const payChannelText = computed(() => {
  const p = overview.value?.pay?.provider
  return { demo: '演示模式', wechat: '微信支付', alipay: '支付宝' }[p] || '演示模式'
})
const payReady = computed(() => overview.value?.pay?.ready === true)

function barHeight(v) {
  const max = Math.max(...trend.value.map(d => d[trendMode.value]), 1)
  return Math.max((v / max) * 100, 2)
}

function statusText(s) {
  return { paid: '已支付', pending: '待支付', cancelled: '已取消' }[s] || s
}
function payMethodText(m) {
  return { wechat: '微信支付', alipay: '支付宝' }[m] || '—'
}

async function loadUsers() {
  const params = new URLSearchParams({ page: userPage.value, limit: userPerPage.value })
  if (userKw.value.trim()) params.set('keyword', userKw.value.trim())
  try {
    const d = await api.get('/admin/users?' + params)
    users.value = d.list
    userTotal.value = d.total
    userPage.value = Math.min(userPage.value, Math.max(1, Math.ceil(d.total / userPerPage.value)))
  } catch (e) {
    if (e.code !== 403) toast(e.message, 'error')
  }
}
function searchUsers() { userPage.value = 1; loadUsers() }

async function loadOrders() {
  const params = new URLSearchParams({ page: orderPage.value, limit: orderPerPage.value })
  if (orderStatus.value) params.set('status', orderStatus.value)
  if (orderKw.value.trim()) params.set('keyword', orderKw.value.trim())
  try {
    const d = await api.get('/admin/orders?' + params)
    orders.value = d.list
    orderTotal.value = d.total
    orderPage.value = Math.min(orderPage.value, Math.max(1, Math.ceil(d.total / orderPerPage.value)))
  } catch (e) {
    if (e.code !== 403) toast(e.message, 'error')
  }
}
function searchOrders() { orderPage.value = 1; loadOrders() }
function setOrderStatus(v) { orderStatus.value = v; orderPage.value = 1; loadOrders() }

async function openDetail(u) {
  const id = u.id || u
  detailOpen.value = true
  detailLoading.value = true
  detail.value = null
  pt.val = 0; pt.reason = ''; pt.mode = 'increase'; vipMonths.value = 1
  try {
    detail.value = await api.get(`/admin/users/${id}`)
  } catch (e) {
    toast(e.message, 'error'); detailOpen.value = false
  } finally {
    detailLoading.value = false
  }
}

async function adjustPoints() {
  busy.value = true
  try {
    const body = { reason: pt.reason.trim() || undefined }
    if (pt.mode === 'set') body.balance = pt.val
    else body.change = (pt.mode === 'decrease' ? -1 : 1) * pt.val
    const r = await api.post(`/admin/users/${detail.value.id}/points`, body)
    toast(r.message || '积分已更新', 'success')
    await openDetail(detail.value)
    await loadUsers()
  } catch (e) {
    toast(e.message, 'error')
  } finally { busy.value = false }
}

async function grantVip() {
  busy.value = true
  try {
    const r = await api.post(`/admin/users/${detail.value.id}/membership`, { action: 'open', months: vipMonths.value })
    toast(r.message || '会员已开通', 'success')
    await openDetail(detail.value); await loadUsers()
  } catch (e) {
    toast(e.message, 'error')
  } finally { busy.value = false }
}

async function cancelVip() {
  busy.value = true
  try {
    const r = await api.post(`/admin/users/${detail.value.id}/membership`, { action: 'cancel' })
    toast(r.message || '会员已停用', 'success')
    await openDetail(detail.value); await loadUsers()
  } catch (e) {
    toast(e.message, 'error')
  } finally { busy.value = false }
}

async function exportOrders() {
  const token = localStorage.getItem('saixt_token')
  const q = new URLSearchParams()
  if (orderStatus.value) q.set('status', orderStatus.value)
  if (orderKw.value.trim()) q.set('keyword', orderKw.value.trim())
  const qs = q.toString() ? '?' + q.toString() : ''
  try {
    const resp = await fetch('/api/admin/orders/export' + qs, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!resp.ok) {
      const j = await resp.json().catch(() => null)
      throw new Error((j && j.message) || '导出失败')
    }
    const blob = await resp.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    toast('订单已导出', 'success')
  } catch (e) {
    toast(e.message, 'error')
  }
}

async function load() {
  try {
    const [o, t] = await Promise.all([api.get('/admin/overview'), api.get('/admin/trend')])
    overview.value = o
    trend.value = t
  } catch (e) {
    if (e.code !== 403) toast(e.message, 'error')
  } finally {
    loading.value = false
  }
  loadUsers()
  loadOrders()
  loadAdmins()
  loadProducts()
}

onMounted(load)
</script>

<style scoped>
.admin-page { max-width: 1120px; }
.spinner.small { width: 26px; height: 26px; }

.kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.kpi { padding: 18px 20px; }
.kpi-label { font-size: 0.8rem; color: var(--muted); }
.kpi-num { font-size: 1.9rem; font-weight: 800; margin: 4px 0 2px; letter-spacing: -0.02em; }
.kpi-num.kpi-pay { font-size: 1.3rem; }
.kpi-num.kpi-pay.ok { color: var(--green); }
.kpi-num.kpi-pay.warn { color: var(--amber); }
.kpi-sub { font-size: 0.78rem; color: var(--muted-2); }

.sec-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 28px 0 0; }
.sec-head .sec-title { margin: 0 0 14px; }
.sec-head-left { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
.sec-title {
  margin: 28px 0 14px; font-size: 1.05rem; font-weight: 700;
  display: flex; align-items: center; gap: 9px;
}
.sec-title::before { content: ''; width: 4px; height: 16px; border-radius: 2px; background: var(--grad-accent); flex-shrink: 0; }
.sec-sub { font-size: 0.8rem; color: var(--muted-2); font-weight: 500; margin-left: 8px; }

.toolbar { display: flex; gap: 8px; margin-bottom: 14px; align-items: center; }
.sec-head .toolbar { margin-bottom: 14px; }
.tool-input {
  height: 34px; padding: 0 12px; border: 1px solid var(--rule); border-radius: 10px;
  background: var(--surface); color: var(--ink); font-size: 0.85rem; min-width: 200px;
  transition: border-color 0.2s var(--ease), box-shadow 0.2s var(--ease);
}
.tool-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

.seg { display: flex; gap: 4px; margin-bottom: 14px; }
.trend-card { padding: 18px 20px 14px; margin-top: 14px; }
.trend-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.trend-tab {
  padding: 6px 14px; border-radius: var(--radius-full);
  border: 1px solid var(--rule); background: var(--surface);
  color: var(--muted); font-size: 0.8rem; font-weight: 600; cursor: pointer;
  transition: border-color 0.2s var(--ease), background-color 0.2s var(--ease), color 0.2s var(--ease);
}
.trend-tab:hover { border-color: var(--accent); color: var(--accent); }
.trend-tab.on { background: var(--accent); border-color: var(--accent); color: #fff; }

.trend-bars { display: flex; align-items: flex-end; gap: 6px; height: 150px; padding-top: 8px; }
.tbar { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; justify-content: flex-end; }
.tbar-fill {
  width: 100%; max-width: 30px; border-radius: 6px 6px 2px 2px;
  background: var(--grad-accent); transition: height 0.5s var(--ease-out); min-height: 2px;
}
.tbar-label { font-size: 0.78rem; color: var(--muted-2); white-space: nowrap; }

.user-table-wrap { padding: 6px 8px; overflow-x: auto; max-width: 100%; }
.user-table.user-table-sm { min-width: 520px; }
.admin-hint { margin: 8px 10px 4px; font-size: 0.78rem; color: var(--muted-2); }
.user-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; min-width: 640px; }
.user-table th {
  text-align: left; padding: 12px 10px; color: var(--muted-2);
  font-size: 0.78rem; font-weight: 600; border-bottom: 1px solid var(--rule);
}
.user-table td { padding: 11px 10px; border-bottom: 1px solid var(--rule-soft); }
.user-table tr:last-child td { border-bottom: none; }
.user-table tbody tr:hover td { background: var(--surface-2); }
.ut-user { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.ut-user .ut-sub { display: block; font-weight: 500; }
.ut-avatar {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent-soft); color: var(--accent);
  display: flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: 700;
}
.ut-muted { color: var(--muted-2); font-size: 0.78rem; }
.ut-sub { font-size: 0.78rem; color: var(--muted-2); font-weight: 400; }
.ut-mono { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 0.78rem; color: var(--muted); }
.ut-amount { font-weight: 700; color: var(--amber); }
.ut-empty { text-align: center; color: var(--muted-2); padding: 24px 10px; }
.ut-act { text-align: right; }

.pager { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 12px 8px 6px; flex-wrap: wrap; }
.pager-info { font-size: 0.78rem; color: var(--muted); }
.pager-sel {
  height: 30px; border: 1px solid var(--rule); border-radius: 9px; background: var(--surface);
  color: var(--ink); font-size: 0.8rem; padding: 0 6px;
}

/* ---------- 弹窗 ---------- */
.modal-mask {
  position: fixed; inset: 0; z-index: 1200; background: rgba(10, 12, 18, 0.55);
  backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 20px;
}
.modal-panel {
  width: 100%; max-width: 640px; max-height: 86vh; display: flex; flex-direction: column;
  background: var(--surface); border: 1px solid var(--rule); border-radius: 18px;
  box-shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.35); overflow: hidden;
}
.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px 14px; border-bottom: 1px solid var(--rule-soft); }
.modal-head h4 { margin: 0; font-size: 1.04rem; }
.modal-sub { margin: 3px 0 0; font-size: 0.78rem; color: var(--muted-2); }
.modal-x {
  border: none; background: transparent; color: var(--muted); font-size: 1.05rem; cursor: pointer;
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  transition: background-color 0.2s var(--ease), color 0.2s var(--ease), transform 0.15s var(--ease);
}
.modal-x:hover { background: var(--surface-2); color: var(--ink); }
.modal-x:active { transform: scale(0.92); }
.modal-body { padding: 18px 22px 22px; overflow-y: auto; overscroll-behavior: contain; }
.modal-body.centered { min-height: 140px; display: flex; align-items: center; justify-content: center; }

.ov-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
.ov-cell { display: flex; flex-direction: column; gap: 2px; }
.ov-l { font-size: 0.78rem; color: var(--muted-2); }
.ov-v { font-size: 0.9rem; font-weight: 600; }
.ov-money { color: var(--accent); font-weight: 800; }

/* 商品表单 */
.modal-product { max-width: 520px; }
.pf-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.pf-label { font-size: 0.78rem; font-weight: 600; color: var(--muted); }
.pf-input { width: 100%; min-width: 0; }
.pf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
.pf-check { display: flex; align-items: center; gap: 8px; font-size: 0.86rem; cursor: pointer; }
.pf-check input { accent-color: var(--accent); width: 15px; height: 15px; }
.pf-err { color: var(--red); font-size: 0.8rem; margin: 2px 0 10px; }
.pf-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }

.ad-sec { margin-top: 18px; }
.ad-title { font-size: 0.86rem; font-weight: 700; margin-bottom: 10px; color: var(--ink); }
.ad-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ad-sel { height: 34px; }
.ad-val { width: 90px; min-width: 90px; }
.ad-reason { flex: 1; min-width: 150px; }
.ad-empty { color: var(--muted-2); font-size: 0.8rem; }

.mini-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.mini-table th { text-align: left; padding: 7px 8px; color: var(--muted-2); font-size: 0.78rem; font-weight: 600; border-bottom: 1px solid var(--rule); }
.mini-table td { padding: 8px; border-bottom: 1px solid var(--rule-soft); }
.mini-table tr:last-child td { border-bottom: none; }
.pos { color: var(--green); font-weight: 700; }
.neg { color: var(--red); font-weight: 700; }

.ai-kinds { display: flex; flex-wrap: wrap; gap: 8px; }
.ai-kind { padding: 5px 12px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 0.78rem; font-weight: 600; }

@media (max-width: 768px) {
  .kpi-grid { grid-template-columns: 1fr 1fr; }
  .sec-head, .sec-head-left { flex-direction: column; align-items: stretch; }
  .sec-head .toolbar { margin-bottom: 0; }
  .toolbar { flex-wrap: wrap; }
  .tool-input { min-width: 150px; flex: 1; }
  .ov-grid { grid-template-columns: 1fr; }
  .pf-grid { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .modal-mask { padding: 10px; align-items: flex-end; }
  .modal-panel { max-height: 94vh; max-height: 94dvh; border-radius: 16px 16px 12px 12px; }
  .modal-head { padding: 14px 16px 12px; }
  .modal-body { padding: 14px 16px calc(18px + var(--safe-bottom)); }
  .tool-input { font-size: 1rem; }
}
@media (max-width: 480px) {
  .kpi-grid { grid-template-columns: 1fr; }
}
</style>