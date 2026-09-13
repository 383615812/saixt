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

      <!-- ===================== 团购管理（学校/合作机构批量采购） ===================== -->
      <div class="sec-head">
        <h3 class="sec-title">团购管理 <span class="sec-sub">学校 / 合作机构批量采购会员</span></h3>
        <div class="toolbar">
          <button class="btn btn-primary btn-sm" @click="openPartnerModal()">新增机构</button>
          <button class="btn btn-primary btn-sm" @click="openGbModal()">新增团购方案</button>
        </div>
      </div>

      <!-- 团购统计 -->
      <div class="gb-kpi-grid">
        <div class="card gb-kpi"><span class="gb-kpi-l">合作机构</span><div class="gb-kpi-n">{{ gbStats.partners }}</div></div>
        <div class="card gb-kpi"><span class="gb-kpi-l">进行中方案</span><div class="gb-kpi-n">{{ gbStats.campaigns }}</div></div>
        <div class="card gb-kpi">
          <span class="gb-kpi-l">团购席位</span>
          <div class="gb-kpi-n">{{ gbStats.seats_total }}</div>
          <span class="gb-kpi-s">已兑 {{ gbStats.seats_redeemed }} · 余 {{ gbStats.seats_remaining }}</span>
        </div>
        <div class="card gb-kpi"><span class="gb-kpi-l">团购营收</span><div class="gb-kpi-n">¥{{ gbStats.revenue }}</div></div>
        <div class="card gb-kpi"><span class="gb-kpi-l">团购开通 VIP</span><div class="gb-kpi-n">{{ gbStats.vip_via_group }}</div></div>
      </div>

      <!-- 合作机构 -->
      <div class="card user-table-wrap">
        <table class="user-table user-table-sm2">
          <thead><tr><th>机构名称</th><th>类型</th><th>联系人</th><th>手机号</th><th>团购方案</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="p in partners" :key="p.id">
              <td class="ut-user"><span class="ut-avatar">{{ (p.name || '?')[0] }}</span><span>{{ p.name }}</span></td>
              <td>{{ p.type === 'school' ? '学校' : '合作机构' }}</td>
              <td>{{ p.contact || '-' }}</td>
              <td class="ut-mono">{{ p.phone || '-' }}</td>
              <td>{{ partnerGbCount(p.id) }}</td>
              <td><span class="tag" :class="p.status === 'active' ? 'tag-green' : 'tag-gray'">{{ p.status === 'active' ? '启用' : '停用' }}</span></td>
            </tr>
            <tr v-if="!partners.length"><td colspan="6" class="ut-empty">暂无合作机构</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 团购方案 -->
      <div class="card user-table-wrap">
        <table class="user-table">
          <thead><tr><th>方案编号</th><th>机构</th><th>商品</th><th>时长</th><th>单价</th><th>数量</th><th>已兑</th><th>结算</th><th>状态</th><th>兑换截止</th><th></th></tr></thead>
          <tbody>
            <tr v-for="g in groupBuys" :key="g.id">
              <td class="ut-mono">{{ g.code }}</td>
              <td>{{ g.partner_name }}</td>
              <td>{{ g.product_name }}</td>
              <td>{{ g.months }} 月</td>
              <td class="ut-amount">¥{{ g.unit_price }}</td>
              <td>{{ g.quantity }}</td>
              <td>{{ g.codes_redeemed }}/{{ g.codes_total }}</td>
              <td>
                <span class="tag" :class="g.paid ? 'tag-green' : 'tag-amber'">{{ g.paid ? '已收款' : '待收款' }}</span>
                <span v-if="g.paid && g.total_amount > 0" class="ut-muted gb-amount">¥{{ g.total_amount }}</span>
              </td>
              <td><span class="tag" :class="gbStatusClass(g.status)">{{ gbStatusText(g.status) }}</span></td>
              <td class="ut-muted">{{ g.expire_at || '长期' }}</td>
              <td class="ut-act">
                <button v-if="g.status !== 'pending' && g.status !== 'cancelled'" class="btn btn-ghost btn-xs" @click="openCodes(g)">查看码</button>
                <button v-if="g.status === 'pending'" class="btn btn-primary btn-xs" @click="payGb(g)">收款</button>
                <button v-if="g.status === 'pending'" class="btn btn-ghost btn-xs" @click="cancelGb(g)">取消</button>
                <button v-if="g.status === 'active'" class="btn btn-ghost btn-xs" @click="closeGb(g)">关闭</button>
              </td>
            </tr>
            <tr v-if="!groupBuys.length"><td colspan="11" class="ut-empty">暂无团购方案</td></tr>
          </tbody>
        </table>
        <div class="pager">
          <button class="btn btn-ghost btn-sm" :disabled="gbPage <= 1" @click="gbPage--; loadGroupBuys()">上一页</button>
          <span class="pager-info">共 {{ gbTotal }} 个 · 第 {{ gbPage }} / {{ gbPageCount }} 页</span>
          <button class="btn btn-ghost btn-sm" :disabled="gbPage >= gbPageCount" @click="gbPage++; loadGroupBuys()">下一页</button>
        </div>
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

    <!-- ===================== 团购：新增合作机构 ===================== -->
    <div v-if="partnerOpen" class="modal-mask" @click.self="partnerOpen = false">
      <div class="modal-panel modal-product">
        <div class="modal-head">
          <div><h4>新增合作机构</h4></div>
          <button class="modal-x" @click="partnerOpen = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="pf-row"><label class="pf-label">机构名称</label><input v-model="partnerForm.name" class="tool-input pf-input" placeholder="如 昆明某职业学院"></div>
          <div class="pf-grid">
            <div class="pf-row"><label class="pf-label">类型</label>
              <select v-model="partnerForm.type" class="pager-sel pf-input">
                <option value="school">学校</option>
                <option value="institution">合作机构</option>
              </select>
            </div>
            <div class="pf-row"><label class="pf-label">联系人</label><input v-model="partnerForm.contact" class="tool-input pf-input" placeholder="选填"></div>
          </div>
          <div class="pf-grid">
            <div class="pf-row"><label class="pf-label">手机号</label><input v-model="partnerForm.phone" class="tool-input pf-input" placeholder="选填"></div>
            <div class="pf-row"><label class="pf-label">关联院校编码</label><input v-model="partnerForm.school_code" class="tool-input pf-input" placeholder="选填，schools.code"></div>
          </div>
          <p v-if="partnerMsg" class="pf-err">{{ partnerMsg }}</p>
          <div class="pf-actions">
            <button class="btn btn-ghost btn-sm" @click="partnerOpen = false">取消</button>
            <button class="btn btn-primary btn-sm" :disabled="partnerBusy" @click="savePartner">保存</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================== 团购：新增团购方案 ===================== -->
    <div v-if="gbOpen" class="modal-mask" @click.self="gbOpen = false">
      <div class="modal-panel modal-product">
        <div class="modal-head">
          <div><h4>新增团购方案</h4><p class="modal-sub">生成后自动批量产出兑换码</p></div>
          <button class="modal-x" @click="gbOpen = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="pf-row"><label class="pf-label">合作机构</label>
            <select v-model.number="gbForm.partner_id" class="pager-sel pf-input">
              <option :value="0" disabled>请选择机构</option>
              <option v-for="p in partners" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div class="pf-row"><label class="pf-label">团购商品</label>
            <select v-model="gbForm.product_code" class="pager-sel pf-input">
              <option v-for="p in products.filter(x => x.active)" :key="p.code" :value="p.code">{{ p.name }}（{{ p.months }} 月）</option>
            </select>
          </div>
          <div class="pf-grid">
            <div class="pf-row"><label class="pf-label">会员时长（月）</label><input v-model.number="gbForm.months" type="number" min="1" max="120" class="tool-input pf-input" placeholder="留空用商品默认"></div>
            <div class="pf-row" v-if="!gbForm.useBatches"><label class="pf-label">团购数量（张）</label><input v-model.number="gbForm.quantity" type="number" min="1" max="100000" class="tool-input pf-input"></div>
          </div>
          <div class="pf-batch">
            <label class="pf-check"><input type="checkbox" v-model="gbForm.useBatches"> 按班级 / 专业分批发码</label>
            <p class="pf-hint" v-if="!gbForm.useBatches">关闭则整批发码；开启后可按班级、专业等拆分多批，便于分发出账与兑换进度跟踪。</p>
            <div v-if="gbForm.useBatches" class="batch-editor">
              <div v-for="(b, i) in gbForm.batches" :key="i" class="batch-row">
                <input v-model="b.label" class="tool-input" placeholder="批次名称，如 高三1班 / 计算机专业" maxlength="50">
                <input v-model.number="b.count" type="number" min="1" max="100000" class="tool-input batch-count" placeholder="数量">
                <button class="btn btn-ghost btn-sm" @click="gbForm.batches.splice(i, 1)">✕</button>
              </div>
              <button class="btn btn-ghost btn-sm" @click="gbForm.batches.push({ label: '', count: 1 })">+ 添加批次</button>
              <p class="pf-hint">合计 <b>{{ gbBatchTotal }}</b> 张（单批 1~100000，总 ≤ 100000）</p>
            </div>
          </div>
          <div class="pf-grid">
            <div class="pf-row"><label class="pf-label">团购单价（元）</label><input v-model.number="gbForm.unit_price" type="number" min="0" max="100000000" class="tool-input pf-input"></div>
            <div class="pf-row"><label class="pf-label">兑换截止</label><input v-model="gbForm.expire_at" type="date" class="tool-input pf-input" placeholder="选填，留空长期有效"></div>
          </div>
          <div class="pf-row"><label class="pf-label">备注</label><input v-model="gbForm.remark" class="tool-input pf-input" placeholder="选填"></div>
          <p v-if="gbMsg" class="pf-err">{{ gbMsg }}</p>
          <div class="pf-actions">
            <button class="btn btn-ghost btn-sm" @click="gbOpen = false">取消</button>
            <button class="btn btn-primary btn-sm" :disabled="gbBusy || gbForm.partner_id === 0" @click="saveGb">生成团购码</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================== 团购：团购码查看 / 导出 ===================== -->
    <div v-if="codesOpen" class="modal-mask" @click.self="codesOpen = false">
      <div class="modal-panel">
        <div class="modal-head">
          <div>
            <h4>团购码 · {{ codesGb?.code }}</h4>
            <p class="modal-sub" v-if="codesGb">{{ codesGb.partner_name }} · 已兑 {{ codesGb.codes_redeemed }}/{{ codesGb.codes_total }}</p>
          </div>
          <button class="modal-x" @click="codesOpen = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="toolbar">
            <select v-model="codeStatus" class="pager-sel" @change="loadCodes()">
              <option value="">全部状态</option>
              <option value="unused">未兑换</option>
              <option value="redeemed">已兑换</option>
              <option value="expired">已过期</option>
            </select>
            <select v-model="codeBatch" class="pager-sel" @change="loadCodes()">
              <option value="">全部批次</option>
              <option v-for="l in codeBatchLabels" :key="l" :value="l === '（未分组）' ? '__none__' : l">{{ l }}</option>
            </select>
            <button class="btn btn-ghost btn-sm" @click="exportCodes">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
              导出 CSV
            </button>
          </div>
          <div v-if="codeBatches.length" class="batch-stats">
            <div v-for="b in codeBatches" :key="b.batch_label" class="batch-stat">
              <div class="batch-stat-head"><span class="batch-name">{{ b.batch_label }}</span><span class="batch-sub">已兑 {{ b.redeemed }}/{{ b.total }} · {{ b.conversion }}%</span></div>
              <div class="batch-bar"><i :style="{ width: b.conversion + '%' }"></i></div>
            </div>
          </div>
          <div class="card user-table-wrap">
            <table class="mini-table">
              <thead><tr><th>兑换码</th><th>批次</th><th>状态</th><th>兑换用户</th><th>兑换时间</th></tr></thead>
              <tbody>
                <tr v-for="c in codesList" :key="c.id">
                  <td class="ut-mono">{{ c.code }}</td>
                  <td class="ut-muted">{{ c.batch_label || '-' }}</td>
                  <td>
                    <span class="tag" :class="c.status === 'unused' ? 'tag-amber' : c.status === 'redeemed' ? 'tag-green' : 'tag-gray'">
                      {{ { unused: '未兑换', redeemed: '已兑换', expired: '已过期' }[c.status] }}
                    </span>
                  </td>
                  <td>{{ c.redeemed_nickname || (c.redeemed_phone ? c.redeemed_phone : '-') }}</td>
                  <td class="ut-muted">{{ c.redeemed_at || '-' }}</td>
                </tr>
                <tr v-if="!codesList.length"><td colspan="5" class="ut-empty">暂无团购码</td></tr>
              </tbody>
            </table>
            <div class="pager">
              <button class="btn btn-ghost btn-sm" :disabled="codePage <= 1" @click="codePage--; loadCodes()">上一页</button>
              <span class="pager-info">共 {{ codeTotal }} 张 · 第 {{ codePage }} / {{ codePageCount }} 页</span>
              <button class="btn btn-ghost btn-sm" :disabled="codePage >= codePageCount" @click="codePage++; loadCodes()">下一页</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================== 团购：收款 / 结算 ===================== -->
    <div v-if="gbPayOpen" class="modal-mask" @click.self="gbPayOpen = false">
      <div class="modal-panel modal-product">
        <div class="modal-head">
          <div>
            <h4>团购收款 · {{ gbPayInfo?.group_buy?.code }}</h4>
            <p class="modal-sub" v-if="gbPayInfo">{{ gbPayInfo.group_buy.partner_name }} · 应收 ¥{{ gbPayInfo.amount }}</p>
          </div>
          <button class="modal-x" @click="gbPayOpen = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="gb-pay-box">
            <div v-if="gbPayInfo?.qr_code" class="gb-qr"><img :src="gbPayInfo.qr_code" alt="支付二维码"></div>
            <div v-else class="gb-qr gb-qr-empty">
              <p>当前支付渠道：<b>{{ gbPayInfo?.pay_provider || 'demo' }}</b></p>
              <p class="pf-hint">演示/线下模式无二维码。可与机构确认收款后点击下方「确认已收款」。</p>
            </div>
            <div v-if="gbPayInfo?.pay_url" class="gb-pay-link">
              <input :value="gbPayInfo.pay_url" readonly class="tool-input">
              <button class="btn btn-ghost btn-sm" @click="copyPayUrl">复制链接</button>
            </div>
            <p v-if="gbPayInfo?.pay_error" class="pf-err">支付参数获取失败：{{ gbPayInfo.pay_error }}</p>
          </div>
          <div v-if="gbPayInfo?.group_buy?.batches_plan?.length" class="batch-stats">
            <div v-for="b in gbPayInfo.group_buy.batches_plan" :key="b.label" class="batch-stat">
              <div class="batch-stat-head"><span class="batch-name">{{ b.label }}</span><span class="batch-sub">{{ b.count }} 张</span></div>
            </div>
          </div>
          <p class="pf-hint">确认收款后将 <b>立即生成 {{ gbPayInfo?.group_buy?.quantity }} 张兑换码</b>并生效，可发给机构分发给学生。</p>
          <div class="pf-actions">
            <button class="btn btn-ghost btn-sm" @click="gbPayOpen = false">稍后处理</button>
            <button class="btn btn-primary btn-sm" :disabled="gbPayBusy" @click="confirmGbSettle">确认已收款 · 生成兑换码</button>
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

// ---------- 团购管理 ----------
const gbStats = ref({ partners: 0, campaigns: 0, seats_total: 0, seats_redeemed: 0, seats_remaining: 0, revenue: 0, vip_via_group: 0 })
const partners = ref([])
const partnerOpen = ref(false)
const partnerBusy = ref(false)
const partnerMsg = ref('')
const partnerForm = ref({ name: '', type: 'school', contact: '', phone: '', school_code: '' })

const groupBuys = ref([])
const gbPage = ref(1)
const gbPerPage = 30
const gbTotal = ref(0)
const gbPageCount = computed(() => Math.max(1, Math.ceil(gbTotal.value / gbPerPage)))

const gbOpen = ref(false)
const gbBusy = ref(false)
const gbMsg = ref('')
const gbForm = ref({ partner_id: 0, product_code: '', months: '', quantity: 1, unit_price: 0, expire_at: '', remark: '', useBatches: false, batches: [] })
const gbBatchTotal = computed(() => (gbForm.value.batches || []).reduce((s, b) => s + (Number(b.count) || 0), 0))

const codesOpen = ref(false)
const codesGb = ref(null)
const codesList = ref([])
const codePage = ref(1)
const codePerPage = 50
const codeTotal = ref(0)
const codePageCount = computed(() => Math.max(1, Math.ceil(codeTotal.value / codePerPage)))
const codeStatus = ref('')
const codeBatch = ref('')
const codeBatchLabels = ref([])
const codeBatches = ref([])

const gbPayOpen = ref(false)
const gbPayBusy = ref(false)
const gbPayInfo = ref(null)
const gbPayGb = ref(null)

function gbStatusText(s) {
  return { pending: '待收款', active: '生效中', closed: '已关闭', cancelled: '已取消' }[s] || s
}
function gbStatusClass(s) {
  return s === 'active' ? 'tag-green' : s === 'pending' ? 'tag-amber' : 'tag-gray'
}
async function payGb(g) {
  gbPayGb.value = g
  gbPayInfo.value = { group_buy: g, amount: g.total_amount, pay_provider: '', qr_code: null, pay_url: null }
  gbPayOpen.value = true
  try {
    gbPayInfo.value = await api.post(`/groupbuy/groupbuys/${g.id}/pay`, {})
  } catch (e) { toast(e.message, 'error') }
}
async function confirmGbSettle() {
  if (!gbPayGb.value) return
  gbPayBusy.value = true
  try {
    const r = await api.post(`/groupbuy/groupbuys/${gbPayGb.value.id}/settle`, { method: 'manual' })
    toast(r.message || '已确认收款', 'success')
    gbPayOpen.value = false
    await loadGroupBuys(); await loadGbStats()
  } catch (e) { toast(e.message, 'error') }
  finally { gbPayBusy.value = false }
}
async function cancelGb(g) {
  if (!confirm(`确认取消团购方案「${g.code}」？取消后不可恢复。`)) return
  try {
    const r = await api.post(`/groupbuy/groupbuys/${g.id}/cancel`, {})
    toast(r.message || '方案已取消', 'success')
    await loadGroupBuys(); await loadGbStats()
  } catch (e) { toast(e.message, 'error') }
}
async function copyPayUrl() {
  try { await navigator.clipboard.writeText(gbPayInfo.value?.pay_url || ''); toast('支付链接已复制', 'success') }
  catch { toast('复制失败，请手动选择', 'error') }
}

function partnerGbCount(id) {
  const n = groupBuys.value.filter(g => g.partner_id === id).length
  return n ? `${n} 个` : '0'
}

async function loadGbStats() {
  try { gbStats.value = await api.get('/groupbuy/stats') } catch (e) { if (e.code !== 403) toast(e.message, 'error') }
}
async function loadPartners() {
  try { partners.value = (await api.get('/groupbuy/partners')).list } catch (e) { if (e.code !== 403) toast(e.message, 'error') }
}
async function loadGroupBuys() {
  const params = new URLSearchParams({ page: gbPage.value, limit: gbPerPage })
  try {
    const d = await api.get('/groupbuy/groupbuys?' + params)
    groupBuys.value = d.list
    gbTotal.value = d.total || d.list.length
    gbPage.value = Math.min(gbPage.value, Math.max(1, Math.ceil(gbTotal.value / gbPerPage)))
  } catch (e) { if (e.code !== 403) toast(e.message, 'error') }
}

function openPartnerModal() {
  partnerMsg.value = ''
  partnerForm.value = { name: '', type: 'school', contact: '', phone: '', school_code: '' }
  partnerOpen.value = true
}
async function savePartner() {
  partnerBusy.value = true
  partnerMsg.value = ''
  try {
    const r = await api.post('/groupbuy/partners', { ...partnerForm.value })
    toast(r.message || '已新增合作机构', 'success')
    partnerOpen.value = false
    await loadPartners()
  } catch (e) { toast(e.message, 'error'); partnerMsg.value = e.message }
  finally { partnerBusy.value = false }
}

function openGbModal() {
  gbMsg.value = ''
  gbForm.value = { partner_id: partners.value[0]?.id || 0, product_code: (products.value.find(p => p.active) || {}).code || '', months: '', quantity: 1, unit_price: 0, expire_at: '', remark: '', useBatches: false, batches: [] }
  gbOpen.value = true
}
async function saveGb() {
  gbBusy.value = true
  gbMsg.value = ''
  try {
    const f = gbForm.value
    const body = {
      partner_id: f.partner_id,
      product_code: f.product_code,
      months: f.months === '' ? undefined : f.months,
      unit_price: f.unit_price,
      expire_at: f.expire_at || undefined,
      remark: f.remark
    }
    if (f.useBatches) {
      const batches = (f.batches || []).map(b => ({ label: String(b.label || '').trim(), count: Number(b.count) }))
      if (!batches.length || batches.some(b => !b.label || !(b.count >= 1))) {
        gbMsg.value = '请填写每个批次的名称与数量（数量 ≥ 1）'; gbBusy.value = false; return
      }
      body.batches = batches
    } else {
      body.quantity = f.quantity
    }
    const r = await api.post('/groupbuy/groupbuys', body)
    toast(r.message || '已创建团购方案', 'success')
    gbOpen.value = false
    await loadGroupBuys(); await loadGbStats()
    // 待收款方案：直接拉起收款弹窗，方便立即收款发码
    if (r.group_buy && !r.group_buy.paid) payGb(r.group_buy)
  } catch (e) { toast(e.message, 'error'); gbMsg.value = e.message }
  finally { gbBusy.value = false }
}

async function openCodes(g) {
  codesGb.value = g
  codeStatus.value = ''
  codeBatch.value = ''
  codePage.value = 1
  codesOpen.value = true
  try {
    codeBatchLabels.value = (await api.get(`/groupbuy/groupbuys/${g.id}/batches`)).labels || []
    codeBatches.value = (await api.get(`/groupbuy/groupbuys/${g.id}`)).group_buy?.batches || []
  } catch (e) { /* 忽略筛选加载失败 */ }
  await loadCodes()
}
async function loadCodes() {
  if (!codesGb.value) return
  const params = new URLSearchParams({ page: codePage.value, limit: codePerPage })
  if (codeStatus.value) params.set('status', codeStatus.value)
  if (codeBatch.value) params.set('batch', codeBatch.value)
  try {
    const d = await api.get(`/groupbuy/groupbuys/${codesGb.value.id}/codes?` + params)
    codesList.value = d.list
    codeTotal.value = d.total || d.list.length
    codePage.value = Math.min(codePage.value, Math.max(1, Math.ceil(codeTotal.value / codePerPage)))
  } catch (e) { toast(e.message, 'error') }
}
async function exportCodes() {
  const token = localStorage.getItem('saixt_token')
  const q = new URLSearchParams()
  if (codeStatus.value) q.set('status', codeStatus.value)
  if (codeBatch.value) q.set('batch', codeBatch.value)
  const qs = q.toString() ? '?' + q.toString() : ''
  try {
    const resp = await fetch('/api/groupbuy/groupbuys/' + codesGb.value.id + '/codes/export' + qs, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!resp.ok) { const j = await resp.json().catch(() => null); throw new Error((j && j.message) || '导出失败') }
    const blob = await resp.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `gb_codes_${codesGb.value.id}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    toast('团购码已导出', 'success')
  } catch (e) { toast(e.message, 'error') }
}
async function closeGb(g) {
  if (!confirm(`确认关闭团购方案「${g.code}」？未兑换的码仍可继续使用，也可一并作废。`)) return
  const expire = confirm('是否一并作废所有未兑换的团购码？')
  try {
    const r = await api.post(`/groupbuy/groupbuys/${g.id}/close`, { expireCodes: expire })
    toast(r.message || '已关闭', 'success')
    await loadGroupBuys(); await loadGbStats()
  } catch (e) { toast(e.message, 'error') }
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
  loadGbStats()
  loadPartners()
  loadGroupBuys()
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
.user-table.user-table-sm2 { min-width: 560px; }

.gb-kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-top: 14px; }
.gb-kpi { padding: 16px 18px; display: flex; flex-direction: column; gap: 3px; }
.gb-kpi-l { font-size: 0.78rem; color: var(--muted); }
.gb-kpi-n { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.02em; color: var(--ink); }
.gb-kpi-s { font-size: 0.76rem; color: var(--muted-2); }

@media (max-width: 900px) { .gb-kpi-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 480px) { .gb-kpi-grid { grid-template-columns: 1fr; } }
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
.pf-batch { margin: 4px 0 6px; padding: 12px; border: 1px dashed var(--rule); border-radius: 10px; background: var(--bg-soft, rgba(255,255,255,0.02)); }
.pf-hint { font-size: 0.76rem; color: var(--muted-2); margin: 8px 0 0; line-height: 1.5; }
.pf-hint b { color: var(--ink); }
.batch-editor { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.batch-row { display: flex; gap: 8px; align-items: center; }
.batch-row .tool-input { flex: 1; }
.batch-count { max-width: 110px; min-width: 80px; }
.batch-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin: 12px 0; }
.batch-stat { padding: 10px 12px; border: 1px solid var(--rule); border-radius: 10px; background: var(--bg-soft, rgba(255,255,255,0.02)); }
.batch-stat-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 7px; }
.batch-name { font-size: 0.82rem; font-weight: 600; color: var(--ink); }
.batch-sub { font-size: 0.72rem; color: var(--muted-2); }
.batch-bar { height: 6px; border-radius: 4px; background: var(--rule); overflow: hidden; }
.batch-bar i { display: block; height: 100%; background: var(--accent, #4f8cff); border-radius: 4px; transition: width .3s ease; }
.gb-amount { margin-left: 6px; font-size: 0.74rem; }
.gb-pay-box { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-bottom: 10px; }
.gb-qr { width: 190px; height: 190px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid var(--rule); border-radius: 12px; background: #fff; padding: 10px; text-align: center; }
.gb-qr img { width: 100%; height: 100%; object-fit: contain; }
.gb-qr-empty { background: var(--bg-soft, rgba(255,255,255,0.02)); color: var(--muted); font-size: 0.8rem; height: auto; padding: 16px; }
.gb-qr-empty b { color: var(--ink); }
.gb-pay-link { display: flex; gap: 8px; width: 100%; align-items: center; }
.gb-pay-link .tool-input { flex: 1; }

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