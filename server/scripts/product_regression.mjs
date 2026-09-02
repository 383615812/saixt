// 云智学 · 商品配置与会员购买联动回归
const BASE = 'http://localhost:3000/api';
const P = (path, token, body, method = 'GET') =>
  fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    .then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));
let fail = 0, pass = 0;
const R = (n, ok, e = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} :: ${n}${e ? ' | ' + e : ''}`); };
const ok = r => r && r.data && r.data.code === 0;

async function main() {
  console.log('\n========== 商品配置与会员购买联动 ==========\n');
  const adminToken = (await P('/auth/login', null, { phone: '13900000001', password: 'test123456' }, 'POST')).data?.data?.token;
  R('主管理员登录', !!adminToken); if (!adminToken) process.exit(1);
  const uReg = await P('/auth/register', null, { phone: `130${String(Date.now()).slice(-8)}`, password: 'test123456', nickname: '购卡用户' }, 'POST');
  const uToken = uReg.data?.data?.token;
  R('购卡用户注册', !!uToken);

  // 用户侧商品目录（应来自 products 表且仅上架的）
  const me = await P('/membership/me', uToken);
  const prods = me.data?.data?.products || [];
  R('用户可见商品(3个默认)', ok(me) && prods.length >= 3 && prods.every(p => p.active !== 0), `count=${prods.length}`);

  // 管理端商品列表（含下架）
  const gl = await P('/admin/products', adminToken);
  R('管理端商品列表', ok(gl) && gl.data?.data?.list.length >= 3, `count=${gl.data?.data?.list?.length}`);

  // 新增商品
  const add = await P('/admin/products', adminToken, { code: 'vip_half', name: 'VIP 会员 · 半年卡', kind: 'vip', price: 128, months: 6, sort: 4, active: true }, 'POST');
  R('新增商品', ok(add));
  R('重复编码被拒(400)', (await P('/admin/products', adminToken, { code: 'vip_half', name: 'x', price: 1, months: 6 }, 'POST')).status === 400);
  R('非法编码被拒(400)', (await P('/admin/products', adminToken, { code: 'BAD name!', name: 'x', price: 1, months: 6 }, 'POST')).status === 400);

  // 用户可见含新商品，且可在用户侧购买
  const me2 = await P('/membership/me', uToken);
  R('用户可见新商品', me2.data?.data?.products.some(p => p.code === 'vip_half' && p.price === 128));
  const ord = await P('/membership/order', uToken, { product_code: 'vip_half' }, 'POST');
  R('下单新商品', ok(ord) && ord.data?.data?.order_no);

  // 绑定后支付 → 会员时长6个月
  const ono = ord.data?.data?.order_no;
  await P('/membership/pay/notify/wechat', uToken, { order_no: ono }, 'POST');
  const m6 = await P('/membership/me', uToken);
  const days = m6.data?.data?.membership?.expire_at ? Math.round((new Date(m6.data.data.membership.expire_at.replace(' ', 'T')) - Date.now()) / 86400000) : 0;
  R('支付后会员时长约6个月', m6.data?.data?.vip === true && days >= 170, `days=${days}`);

  // 改价后新订单价格生效
  await P('/admin/products/vip_half', adminToken, { price: 99 }, 'PATCH');
  const ord2 = await P('/membership/order', uToken, { product_code: 'vip_half' }, 'POST');
  const ord2no = ord2.data?.data?.order_no;
  R('改价99后新订单金额99', ok(ord2) && ord2.data?.data?.product?.price === 99, `price=${ord2.data?.data?.product?.price}`);

  // 下架后不可购买
  await P('/admin/products/vip_half', adminToken, { active: false }, 'PATCH');
  const ordersDisabled = await P('/membership/order', uToken, { product_code: 'vip_half' }, 'POST');
  R('下架商品不可下单(400)', ordersDisabled.status === 400);
  const me3 = await P('/membership/me', uToken);
  R('下架商品用户不可见', !me3.data?.data?.products.some(p => p.code === 'vip_half'));

  // 用户侧目录不泄露管理接口
  R('普通用户无权管理商品(403)', (await P('/admin/products', uToken)).status === 403);

  // 删除行为：有待支付订单则禁止删除
  const delWhilePending = await P('/admin/products/vip_half', adminToken, {}, 'DELETE');
  R('有待支付订单时禁止删除(400)', delWhilePending.status === 400);
  // 取消待支付订单后，删除将因已有历史(已支付)订单而自动转为下架
  await P(`/membership/order/${ord2no}/cancel`, uToken, {}, 'POST');
  const delRes = await P('/admin/products/vip_half', adminToken, {}, 'DELETE');
  R('有历史订单删除转为下架', ok(delRes));
  const me4 = await P('/membership/me', uToken);
  R('删除后用户不可见该商品', !me4.data?.data?.products.some(p => p.code === 'vip_half'));
  const glAfter = await P('/admin/products', adminToken);
  const left = glAfter.data?.data?.list.find(p => p.code === 'vip_half');
  R('下架商品仍保留在管理列表', !!left && left.active === 0);

  console.log(`\n========== 结果：${pass} 通过 / ${fail} 失败 ==========\n`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('脚本异常:', e.message); process.exit(1); });