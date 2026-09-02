// 云智学 · 管理员动态管理回归验证
const BASE = 'http://localhost:3000/api';
const ADMIN_PHONE = '13900000001';
const P = (path, token, body, method = 'GET') =>
  fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    .then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));

let fail = 0, pass = 0;
const R = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} :: ${name}${extra ? ' | ' + extra : ''}`); };
const okResp = r => r && r.data && r.data.code === 0;

async function main() {
  console.log('\n========== 管理员动态管理回归 ==========\n');
  const token = (await P('/auth/login', null, { phone: ADMIN_PHONE, password: 'test123456' }, 'POST')).data?.data?.token;
  R('主管理员登录', !!token);
  if (!token) process.exit(1);

  // 普通用户 A（注册即普通）
  const aReg = await P('/auth/register', null, { phone: `131${String(Date.now()).slice(-8)}`, password: 'test123456', nickname: '普通用户A' }, 'POST');
  const tokenA = aReg.data?.data?.token;
  const aList = await P('/admin/admins', tokenA);
  R('普通用户无权查列表(403)', aList.status === 403);

  // 目标用户 B
  const bPhone = `132${String(Date.now()).slice(-8)}`;
  const bReg = await P('/auth/register', null, { phone: bPhone, password: 'test123456', nickname: '目标B' }, 'POST');
  const bId = bReg.data?.data?.user?.id;
  const bToken = bReg.data?.data?.token;

  const lst1 = await P('/admin/admins', token);
  R('初始列表含主管理员', okResp(lst1) && lst1.data?.data?.current?.role === 'main' && lst1.data?.data?.list.some(a => a.role === 'main' && a.phone === ADMIN_PHONE), `count=${lst1.data?.data?.list?.length}`);

  // 添加 B
  const add = await P('/admin/admins', token, { phone: bPhone }, 'POST');
  R('添加管理员B', okResp(add));
  const lst2 = await P('/admin/admins', token);
  R('列表含B(role=admin)', lst2.data?.data?.list.some(a => a.user_id === bId && a.role === 'admin'));

  // 边界
  R('不能添加自己(400)', (await P('/admin/admins', token, { phone: ADMIN_PHONE }, 'POST')).status === 400);
  R('不能重复添加(400)', (await P('/admin/admins', token, { phone: bPhone }, 'POST')).status === 400);
  R('手机号不存在(404)', (await P('/admin/admins', token, { phone: '10000000000' }, 'POST')).status === 404);

  // B 现在是管理员，可访问运营
  const bOv = await P('/admin/overview', bToken);
  R('B(管理员)可看运营总览', okResp(bOv));
  const me = lst2.data?.data?.current;
  const bList = await P('/admin/admins', bToken);
  R('B 是 admin 角色并可查列表', okResp(bList) && bList.data?.data?.current?.role === 'admin');

  // B 试图移除 main / 添加(普通 admin 无权)
  R('B(admin)无权添加管理员(403)', (await P('/admin/admins', bToken, { phone: ADMIN_PHONE }, 'POST')).status === 403);
  R('B(admin)无权移除其他人(403)', (await P(`/admin/admins/${me.userId}`, bToken, {}, 'DELETE')).status === 403);
  R('B(admin)无权移除自己(403)', (await P(`/admin/admins/${bId}`, bToken, {}, 'DELETE')).status === 403);

  // main 移除 B
  const rm = await P(`/admin/admins/${bId}`, token, {}, 'DELETE');
  R('主管理员移除B', okResp(rm));
  const lst3 = await P('/admin/admins', token);
  R('列表不再含B', !lst3.data?.data?.list.some(a => a.user_id === bId));
  R('移除不存在(404)', (await P(`/admin/admins/${bId}`, token, {}, 'DELETE')).status === 404);

  // 被移除后 B 无权访问
  R('B(已移除)无权看总览(403)', (await P('/admin/overview', bToken)).status === 403);

  // main 自保护
  R('主管理员不可移除自己(400)', (await P(`/admin/admins/${me.userId}`, token, {}, 'DELETE')).status === 400);

  console.log(`\n========== 结果：${pass} 通过 / ${fail} 失败 ==========\n`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('脚本异常:', e.message); process.exit(1); });