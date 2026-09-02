// ---------------------------------------------------------------------------
// 云智学 · 后台运营管理接口回归验证
// 用法：node scripts/admin_regression.mjs
// 覆盖：管理员鉴权 → 看板/趋势 → 用户搜索分页 → 订单筛选分页 → 用户详情
//       → 积分调整(增/减/设余额) → 会员兑付(开通/停用) → 订单导出 CSV → 非法访问
// ---------------------------------------------------------------------------
const BASE = 'http://localhost:3000/api';
const ADMIN_PHONE = '13900000001';
const ADMIN_PWD = 'test123456';

const P = (path, token, body, method = 'GET') =>
  fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));

let pass = 0, fail = 0;
const R = (name, ok, extra = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} :: ${name}${extra ? ' | ' + extra : ''}`);
};
const okResp = r => r && r.data && r.data.code === 0;

async function ensureAdmin() {
  // 已存在则登录，否则注册
  const login = await P('/auth/login', null, { phone: ADMIN_PHONE, password: ADMIN_PWD }, 'POST');
  if (login.data?.data?.token) return login.data.data.token;
  const reg = await P('/auth/register', null, { phone: ADMIN_PHONE, password: ADMIN_PWD, nickname: '运营管理员' }, 'POST');
  return reg.data?.data?.token;
}

async function main() {
  console.log('\n========== 云智学 后台运营管理接口回归 ==========\n');

  // 0. 管理员登录
  const adminToken = await ensureAdmin();
  R('管理员登录/注册', !!adminToken);
  if (!adminToken) { console.log('管理员登录失败，终止'); process.exit(1); }

  // 1. 创建目标用户（用于被兑付测试）
  const phone = `189${String(Date.now()).slice(-8)}`;
  const reg = await P('/auth/register', null, { phone, password: 'test123456', nickname: '兑付对象' }, 'POST');
  const targetId = reg.data?.data?.user?.id;
  const targetToken = reg.data?.data?.token;
  R('创建兑付目标用户', !!targetId, `uid=${targetId}`);
  if (!targetId) process.exit(1);

  // 2. 非管理员无权访问
  const userDenied = await P('/admin/overview', targetToken);
  R('普通用户访问被拒(403)', userDenied.status === 403 && userDenied.data.code === 403);

  // 3. 看板 + 趋势
  const ov = await P('/admin/overview', adminToken);
  R('运营总览', okResp(ov) && typeof ov.data.data.users.total === 'number', `users=${ov.data?.data?.users?.total}`);
  const tr = await P('/admin/trend', adminToken);
  R('近14天趋势', okResp(tr) && tr.data.data.length === 14);

  // 4. 用户列表搜索 + 分页
  const ul = await P('/admin/users?page=1&limit=10', adminToken);
  R('用户列表分页', okResp(ul) && Array.isArray(ul.data.data.list) && ul.data.data.total >= 1, `total=${ul.data?.data?.total}`);
  const sul = await P(`/admin/users?keyword=${phone}`, adminToken);
  R('用户搜索(手机号)', okResp(sul) && sul.data.data.list.some(u => u.id === targetId));
  const badPage = await P('/admin/users?limit=999999', adminToken);
  R('分页参数夹取', okResp(badPage) && badPage.data.data.list.length <= 100);

  // 5. 订单列表分页（含状态筛选）
  const ol = await P('/admin/orders?page=1&limit=10', adminToken);
  R('订单列表分页', okResp(ol) && Array.isArray(ol.data.data.list) && ol.data.data.total >= 0, `total=${ol.data?.data?.total}`);
  const olBad = await P('/admin/orders?status=hack', adminToken);
  R('无效状态筛选被拒(400)', olBad.status === 400);

  // 6. 用户详情
  const det = await P(`/admin/users/${targetId}`, adminToken);
  R('用户详情', okResp(det) && det.data.data.id === targetId && typeof det.data.data.stats.records === 'number', `points=${det.data?.data?.points}`);

  // 7. 积分调整（目标用户自带注册初始积分，基于当前余额断言）
  let bal = det.data.data.points;
  const up = await P(`/admin/users/${targetId}/points`, adminToken, { change: 50, reason: '管理员发放' }, 'POST');
  bal += 50;
  R('积分增加+50', okResp(up) && up.data.data.balance === bal, `balance=${up.data?.data?.balance}`);

  const down = await P(`/admin/users/${targetId}/points`, adminToken, { change: -10, reason: '扣回' }, 'POST');
  bal -= 10;
  R('积分扣减-10', okResp(down) && down.data.data.balance === bal, `balance=${down.data?.data?.balance}`);

  const set = await P(`/admin/users/${targetId}/points`, adminToken, { balance: 100, reason: '设为余额' }, 'POST');
  R('积分设为100', okResp(set) && set.data.data.balance === 100, `balance=${set.data?.data?.balance}`);

  const over = await P(`/admin/users/${targetId}/points`, adminToken, { change: -9999, reason: '超额扣减' }, 'POST');
  R('超额扣减不回正(0)', okResp(over) && over.data.data.balance === 0, `balance=${over.data?.data?.balance}`);

  // 非法参数
  const badPt = await P(`/admin/users/${targetId}/points`, adminToken, {}, 'POST');
  R('非法积分参数被拒(400)', badPt.status === 400);
  const badPt2 = await P(`/admin/users/${targetId}/points`, adminToken, { balance: 'abc' }, 'POST');
  R('非法积分格式被拒(400)', badPt2.status === 400);

  // 8. 会员兑付：开通
  const vip = await P(`/admin/users/${targetId}/membership`, adminToken, { action: 'open', months: 3 }, 'POST');
  const alive = /* re-fetch */ (await P(`/admin/users/${targetId}`, adminToken)).data?.data?.vip === true;
  const vd = await P(`/admin/users/${targetId}`, adminToken);
  const expireDays = vd.data?.data?.membership?.expire_at
    ? Math.round((new Date(vd.data.data.membership.expire_at.replace(' ', 'T')) - Date.now()) / 86400000) : 0;
  R('会员开通3个月', okResp(vip) && alive && expireDays >= 85, `expire≈${expireDays}天`);

  // 停用
  const stop = await P(`/admin/users/${targetId}/membership`, adminToken, { action: 'cancel' }, 'POST');
  const stopped = (await P(`/admin/users/${targetId}`, adminToken)).data?.data?.vip === false;
  R('会员停用', okResp(stop) && stopped);

  // 非法 action
  const badAct = await P(`/admin/users/${targetId}/membership`, adminToken, { action: 'nuke' }, 'POST');
  R('非法会员操作被拒(400)', badAct.status === 400);

  // 9. 积分流水记录
  const logs = (await P(`/admin/users/${targetId}`, adminToken)).data?.data?.logs || [];
  R('积分流水已记录', Array.isArray(logs) && logs.length >= 4, `count=${logs.length}`);

  // 10. 订单导出 CSV：先造一笔已支付订单，再按该状态导出并核对数据行
  const oNo = (await P('/membership/order', targetToken, { product_code: 'vip_quarter' }, 'POST')).data?.data?.order_no;
  await P('/membership/pay/notify/wechat', targetToken, { order_no: oNo }, 'POST');
  const exp = await fetch(`${BASE}/admin/orders/export?status=paid`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const csv = await exp.text();
  const ct = exp.headers.get('content-type') || '';
  R('订单导出CSV(含数据行)', exp.status === 200 && ct.includes('text/csv') && csv.includes('订单号') && csv.includes(oNo), `len=${csv.length} oNo=${!!oNo}`);

  console.log(`\n========== 结果：${pass} 通过 / ${fail} 失败 ==========\n`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('脚本异常:', e.message); process.exit(1); });