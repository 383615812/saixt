// ---------------------------------------------------------------------------
// 云智学 · 商业化闭环回归验证（支付 → 会员 → 积分 → 后台兑付）
// 用法：node scripts/commerce_regression.mjs
// 覆盖：注册 → 会员信息 → 创建订单 → demo 模拟支付 → 会员开通 → 积分兑换 → 后台收入
// ---------------------------------------------------------------------------
const BASE = 'http://localhost:3000/api';
const P = (path, token, body, method = 'GET') =>
  fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));

let pass = 0, fail = 0;
const R = (name, ok, extra = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} :: ${name}${extra ? ' | ' + extra : ''}`);
};

const okResp = (r) => r && r.data && (r.data.code === 0 || r.data.code === undefined);

async function main() {
  console.log('\n========== 云智学 商业化闭环回归 ==========\n');

  // 1. 注册测试用户
  const phone = `188${String(Date.now()).slice(-8)}`;
  const reg = await P('/auth/register', null, { phone, password: 'test123456', nickname: '商测' }, 'POST');
  const token = reg.data?.data?.token;
  const uid = reg.data?.data?.user?.id;
  R('注册测试用户', okResp(reg) && !!token, `uid=${uid}`);
  if (!token) { console.log('注册失败，终止'); process.exit(1); }

  // 2. 会员信息（初始应为非 VIP，含商品目录）
  const me0 = await P('/membership/me', token);
  R('初始会员状态(非VIP)', okResp(me0) && me0.data?.data?.vip === false);
  const products = me0.data?.data?.products || [];
  R('商品目录≥3个', products.length >= 3, `count=${products.length}`);

  // 3. 创建订单（季卡）
  const order = await P('/membership/order', token, { product_code: 'vip_quarter' }, 'POST');
  const orderNo = order.data?.data?.order_no;
  R('创建订单(季卡)', okResp(order) && !!orderNo && order.data?.data?.pay_provider === 'demo', `order=${orderNo} provider=${order.data?.data?.pay_provider}`);

  // 4. 订单初始为 pending，且下单后会员仍未开通（未支付不发放权益）
  const o1 = await P(`/membership/order/${orderNo}`, token);
  R('订单初始 pending', o1.data?.data?.status === 'pending');
  const me1 = await P('/membership/me', token);
  R('未支付前仍是非VIP', me1.data?.data?.vip === false);

  // 5. demo 模拟支付回调（模拟用户点击"确认支付"）
  const notify = await P('/membership/pay/notify/wechat', token, { order_no: orderNo }, 'POST');
  R('demo 支付回调成功', okResp(notify));

  // 6. 会员应已开通（权益立即生效）
  const me2 = await P('/membership/me', token);
  const vipActive = me2.data?.data?.vip === true && me2.data?.data?.membership?.status === 'active';
  R('支付后会员开通且active', vipActive, `expire=${me2.data?.data?.membership?.expire_at}`);
  const days = me2.data?.data?.membership?.expire_at
    ? Math.round((new Date(me2.data.data.membership.expire_at.replace(' ', 'T')) - Date.now()) / 86400000)
    : 0;
  R('季卡时长≈3个月(>85天)', days >= 85, `${days}天`);

  // 7. 订单状态已登记为 paid 且记录支付方式
  const o2 = await P(`/membership/order/${orderNo}`, token);
  R('订单状态 paid', o2.data?.data?.status === 'paid' && o2.data?.data?.pay_method === 'wechat');

  // 8. 幂等性：重复回调不应重复发放/报错
  const notify2 = await P('/membership/pay/notify/wechat', token, { order_no: orderNo }, 'POST');
  const me3 = await P('/membership/me', token);
  const days2 = me3.data?.data?.membership?.expire_at
    ? Math.round((new Date(me3.data.data.membership.expire_at.replace(' ', 'T')) - Date.now()) / 86400000)
    : 0;
  R('重复回调幂等(会员时长不叠加)', okResp(notify2) && Math.abs(days2 - days) <= 1, `after=${days2}天`);

  // 8.5 演示回调鉴权：未登录 / 他人订单不可伪造支付（防免费开通漏洞）
  const badAnno = await P('/membership/pay/notify/wechat', null, { order_no: orderNo }, 'POST');
  R('未登录伪造回调被拒(401)', badAnno.status === 401);
  const ev = await P('/auth/register', null, { phone: `188${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, password: 'test123456', nickname: '盗刷用户' }, 'POST');
  const evToken = ev.data?.data?.token;
  const badOther = await P('/membership/pay/notify/wechat', evToken, { order_no: orderNo }, 'POST');
  R('他人订单伪造回调被拒(403)', badOther.status === 403);
  const evMe = await P('/membership/me', evToken);
  R('盗刷用户未获得VIP', evMe.data?.data?.vip === false);

  // 9. VIP 应有无限 AI 配额
  const quotaChat = await P('/ai/quota', token);
  const qc = quotaChat.data?.data;
  R('VIP 无限 AI 配额', okResp(quotaChat) && qc?.vip === true && qc?.quota?.chat?.unlimited === true, JSON.stringify({ vip: qc?.vip, chat: qc?.quota?.chat }).slice(0, 140));

  // 10. 积分兑换 AI 次数包
  const bal0 = await P('/points/me', token);
  const balance0 = bal0.data?.data?.balance || 0;
  R('查询积分余额', okResp(bal0), `balance=${balance0}`);
  const exchCost = 100;
  if (balance0 >= exchCost) {
    const ex = await P('/points/exchange', token, { product: 'ai_chat_5' }, 'POST');
    R('积分兑换AI次数包', okResp(ex) && ex.data?.data?.balance === balance0 - exchCost, `newBal=${ex.data?.data?.balance}`);
    const bal1 = await P('/points/me', token);
    R('兑换后积分扣减', bal1.data?.data?.balance === balance0 - exchCost);
  } else {
    R('积分兑换(余额不足,预期拒绝)', okResp(await P('/points/exchange', token, { product: 'ai_chat_5' }, 'POST')) === false, `balance=${balance0}`);
  }

  // 11. 非法兑换被拒
  const badEx = await P('/points/exchange', token, { product: 'nonexistent' }, 'POST');
  R('非法兑换商品被拒', badEx.data?.code !== 0 && badEx.status === 400);

  // 12. 我的订单记录
  const myOrders = await P('/membership/orders', token);
  R('我的订单列表含该订单', Array.isArray(myOrders.data?.data) && myOrders.data.data.some(o => o.order_no === orderNo));

  console.log(`\n========== 结果：${pass} 通过 / ${fail} 失败 ==========\n`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('脚本异常:', e.message); process.exit(1); });