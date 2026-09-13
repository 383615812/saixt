// 团购 HTTP 集成冒烟测试：独立临时库 + 临时端口，验证路由挂载 / 管理员鉴权 / 端到端
// 注意：必须在 import db.js 之前设置 SAIXT_DB_PATH，否则 ESM 导入提升会使其命中默认(真实)库。
process.env.SAIXT_DB_PATH = 'C:/Users/hp/AppData/Local/Temp/saixt_gb_http.db';
process.env.ADMIN_PHONES = '13900000001';
process.env.NODE_ENV = 'development';
process.env.PORT = '3999';

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}/api`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const assert = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

// 动态导入 db / auth（此时 SAIXT_DB_PATH 已设置，确保命中临时库）
const { db } = await import('../src/db.js');
const { hashPassword } = await import('../src/auth.js');

// 预置主管理员账号（服务器启动时 ensureMainAdmin 会将其提升为 main）
const ADMIN_PWD = 'Admin@123';
db.prepare('DELETE FROM users WHERE phone = ?').run('13900000001');
db.prepare('INSERT INTO users (phone, password, nickname) VALUES (?,?,?)').run('13900000001', hashPassword(ADMIN_PWD), '管理员');

// 与前端 api.js 一致的响应解包：返回 { status, code, data(内层) }
async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const bodyJson = await r.json().catch(() => ({}));
  return { status: r.status, code: bodyJson.code, data: bodyJson.data };
}

console.log('启动服务器…');
const server = spawn('node', [join(__dirname, '..', 'src', 'index.js')], {
  env: process.env, stdio: 'ignore'
});
process.on('exit', () => { try { server.kill(); } catch {} });

let okHealth = false;
for (let i = 0; i < 40; i++) {
  try { const r = await fetch(BASE + '/health'); if (r.ok) { okHealth = true; break; } } catch {}
  await sleep(250);
}
assert(okHealth, '服务器启动且 /health 就绪');

// 管理员登录
const login = await call('/auth/login', { method: 'POST', body: { phone: '13900000001', password: ADMIN_PWD } });
assert(login.status === 200 && login.data?.token, '管理员登录成功');
const adminToken = login.data.token;

// 无 token 访问被拒
const noToken = await call('/groupbuy/stats');
assert(noToken.status === 401, '未登录访问团购接口被拒(401)');

// 统计初始为空
const st0 = await call('/groupbuy/stats', { token: adminToken });
assert(st0.data.partners === 0, '初始合作机构数=0');

// 创建机构
const p = await call('/groupbuy/partners', { method: 'POST', token: adminToken, body: { name: '测试学校', type: 'school', contact: '李老师' } });
assert(p.status === 200 && p.data.partner.id, '管理员创建机构成功');
const partnerId = p.data.partner.id;

// 创建团购方案（待收款）
const gb = await call('/groupbuy/groupbuys', { method: 'POST', token: adminToken, body: { partner_id: partnerId, product_code: 'vip_year', quantity: 3, unit_price: 88 } });
assert(gb.status === 200 && gb.data.group_buy.quantity === 3 && gb.data.group_buy.status === 'pending', '创建团购方案成功(待收款,3张)');
const gbId = gb.data.group_buy.id;
const gbList = await call('/groupbuy/groupbuys', { token: adminToken });
assert(gbList.data.list.length === 1 && gbList.data.total === 1, '团购方案列表返回 total=1');

// 待收款阶段不应有兑换码
const codesBefore = await call(`/groupbuy/groupbuys/${gbId}/codes?limit=10`, { token: adminToken });
assert(codesBefore.data.list.length === 0, '待收款阶段无兑换码');

// 发起在线支付
const pay = await call(`/groupbuy/groupbuys/${gbId}/pay`, { method: 'POST', token: adminToken, body: {} });
assert(pay.status === 200 && pay.data.pay_no && pay.data.pay_provider === 'demo', '发起支付返回支付参数(demo)');

// 确认收款（线下/人工）→ 生成兑换码
const settled = await call(`/groupbuy/groupbuys/${gbId}/settle`, { method: 'POST', token: adminToken, body: { method: 'manual' } });
assert(settled.data.group_buy.paid === 1 && settled.data.group_buy.status === 'active' && settled.data.group_buy.codes_total === 3, '确认收款后生效并生成3张码');

// 取一张码
const codes = await call(`/groupbuy/groupbuys/${gbId}/codes?limit=10`, { token: adminToken });
assert(codes.data.list.length === 3, '团购码列表返回 3 张');
const aCode = codes.data.list[0].code;

// 学生注册并兑换
const stuPhone = '1390000' + Math.floor(1000 + Math.random() * 8999);
await call('/auth/register', { method: 'POST', body: { phone: stuPhone, password: 'x123456', nickname: '学生A' } });
const stuLogin = await call('/auth/login', { method: 'POST', body: { phone: stuPhone, password: 'x123456' } });
const stuToken = stuLogin.data.token;
const redeem = await call('/groupbuy/redeem', { method: 'POST', token: stuToken, body: { code: aCode } });
assert(redeem.status === 200 && redeem.data.membership?.status === 'active', '学生兑换团购码开通会员成功');

// 学生查自己的会员
const me = await call('/membership/me', { token: stuToken });
assert(me.data.vip === true, '学生会员状态为 VIP');

// 重复兑换被拒
const dup = await call('/groupbuy/redeem', { method: 'POST', token: stuToken, body: { code: aCode } });
assert(dup.status === 409, '重复兑换被拒绝(409)');

// 关闭方案 + 统计更新
const closed = await call(`/groupbuy/groupbuys/${gb.data.group_buy.id}/close`, { method: 'POST', token: adminToken, body: { expireCodes: true } });
assert(closed.data.group_buy.status === 'closed', '方案关闭成功');
const st1 = await call('/groupbuy/stats', { token: adminToken });
assert(st1.data.partners === 1 && st1.data.vip_via_group === 1 && st1.data.seats_redeemed === 1, '统计正确(机构1/团购VIP1/已兑1)');

// 批次（按班级分批发码）场景
console.log('批次分批发码 HTTP 验证');
const gbB = await call('/groupbuy/groupbuys', { method: 'POST', token: adminToken, body: { partner_id: partnerId, product_code: 'vip_year', unit_price: 66, batches: [{ label: '高三1班', count: 3 }, { label: '高三2班', count: 2 }] } });
assert(gbB.status === 200 && gbB.data.group_buy.quantity === 5, '分批发码方案创建成功(合计5张)');
assert(gbB.data.group_buy.batches_plan?.length === 2, '待收款阶段返回批次计划(2批)');
const gbBId = gbB.data.group_buy.id;
// 结算后方有码
await call(`/groupbuy/groupbuys/${gbBId}/settle`, { method: 'POST', token: adminToken, body: {} });
const gbBAfter = await call(`/groupbuy/groupbuys/${gbBId}`, { token: adminToken });
assert(gbBAfter.data.group_buy.batches?.length === 2, '结算后返回 2 个批次统计');
const labels = await call(`/groupbuy/groupbuys/${gbBId}/batches`, { token: adminToken });
assert(labels.data.labels.length === 2 && labels.data.labels.includes('高三1班') && labels.data.labels.includes('高三2班'), '/batches 返回批次标签');
const b1 = await call(`/groupbuy/groupbuys/${gbBId}/codes?batch=${encodeURIComponent('高三1班')}&limit=20`, { token: adminToken });
assert(b1.data.list.length === 3 && b1.data.list.every(c => c.batch_label === '高三1班'), '按批次筛选返回正确数量(3)');
const allB = await call(`/groupbuy/groupbuys/${gbBId}/codes?batch=__none__&limit=20`, { token: adminToken });
assert(allB.data.list.length === 0, '__none__ 筛选未分组码返回 0（本方案全部有批次）');

// 在线支付回调结算（demo 渠道，管理员触发）
console.log('团购在线支付回调验证');
const gbN = await call('/groupbuy/groupbuys', { method: 'POST', token: adminToken, body: { partner_id: partnerId, product_code: 'vip_year', quantity: 2, unit_price: 120 } });
const gbNPayNo = (await call(`/groupbuy/groupbuys/${gbN.data.group_buy.id}/pay`, { method: 'POST', token: adminToken, body: {} })).data.pay_no;
const notify = await call('/membership/pay/notify/demo', { method: 'POST', token: adminToken, body: { order_no: gbNPayNo } });
assert(notify.code === 0, 'demo 支付回调返回成功');
const gbNAfter = await call(`/groupbuy/groupbuys/${gbN.data.group_buy.id}`, { token: adminToken });
assert(gbNAfter.data.group_buy.paid === 1 && gbNAfter.data.group_buy.codes_total === 2, '回调后团购自动结算并生成2张码');
const notifyDup = await call('/membership/pay/notify/demo', { method: 'POST', token: adminToken, body: { order_no: gbNPayNo } });
assert(notifyDup.code === 0 && gbNAfter.data.group_buy.codes_total === 2, '重复回调幂等(不重复发码)');

// 取消待收款方案
const gbX = await call('/groupbuy/groupbuys', { method: 'POST', token: adminToken, body: { partner_id: partnerId, product_code: 'vip_year', quantity: 1, unit_price: 30 } });
const cancelled = await call(`/groupbuy/groupbuys/${gbX.data.group_buy.id}/cancel`, { method: 'POST', token: adminToken, body: {} });
assert(cancelled.data.group_buy.status === 'cancelled', '取消待收款方案成功');

server.kill();
console.log(`\nHTTP 冒烟结果：通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
