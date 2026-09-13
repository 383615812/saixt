// 团购逻辑自测：独立的临时库，不影响生产数据
process.env.SAIXT_DB_PATH = process.env.SAIXT_DB_PATH || 'C:/Users/hp/AppData/Local/Temp/saixt_gb_test.db';
import { db } from '../src/db.js';
import { grantMembership, getMembership, isVip } from '../src/commerce.js';
import {
  createPartner, listPartners, createGroupBuy, settleGroupBuy, cancelGroupBuy, getGroupBuyByPayNo, listGroupBuys, getGroupBuy,
  listGroupBuyCodes, listGroupBuyBatchLabels, groupBuyBatchStats, redeemCode, closeGroupBuy, groupBuyStats
} from '../src/groupbuy.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.error('  ✗', msg); }
}

// 准备一个测试用户
const u = db.prepare("INSERT INTO users (phone, password) VALUES (?,?)").run('13800000000', 'x');
const uid = u.lastInsertRowid;
const u2 = db.prepare("INSERT INTO users (phone, password) VALUES (?,?)").run('13800000001', 'x');
const uid2 = u2.lastInsertRowid;

console.log('1) 合作机构');
const partner = createPartner({ name: '昆明某职业学院', type: 'school', contact: '王老师', phone: '13900000000', createdBy: uid });
assert(partner && partner.id, '创建合作机构成功');
assert(listPartners().length === 1, '机构列表数量为 1');

console.log('2) 团购方案（待收款 → 结算发码）');
const gb0 = createGroupBuy({
  partnerId: partner.id, productCode: 'vip_year', quantity: 5, unitPrice: 99,
  expireAt: '2030-01-01', remark: '元旦活动', createdBy: uid
});
assert(gb0 && gb0.id, '创建团购方案成功');
assert(gb0.status === 'pending' && gb0.paid === 0, '创建后为待收款状态');
assert(gb0.codes_total === 0, '待收款阶段不生成兑换码');
assert(gb0.pay_no && gb0.pay_no.startsWith('GB'), '生成团购支付单号');
assert(gb0.total_amount === 495, '应收金额 = 99*5 = 495');

const gb = settleGroupBuy(gb0.id, { method: 'manual' });
assert(gb.paid === 1 && gb.status === 'active', '确认收款后方案生效');
assert(gb.quantity === 5, '团购数量 = 5');
assert(gb.codes_unused === 5 && gb.remaining === 5, '结算后生成 5 张未兑换码');
assert(gb.pay_method === 'manual' && !!gb.paid_at, '记录收款方式与时间');
const gbAgain = settleGroupBuy(gb.id, { method: 'manual' });
assert(gbAgain.codes_total === 5, '重复结算幂等（不重复发码）');

console.log('3) 团购码列表与唯一性');
const codes = listGroupBuyCodes(gb.id, { limit: 100 }).list;
assert(codes.length === 5, '码列表数量 = 5');
assert(new Set(codes.map(c => c.code)).size === 5, '团购码全局唯一');

console.log('4) 学生兑换');
assert(!isVip(uid), '兑换前非 VIP');
const r1 = redeemCode(codes[0].code, uid);
assert(r1.ok, '首张码兑换成功: ' + r1.message);
assert(isVip(uid), '兑换后成为 VIP');
const m = getMembership(uid);
assert(m.source === 'groupbuy' && m.source_ref === codes[0].code, '会员来源记录为团购码');

console.log('5) 幂等 / 防重复兑换');
const r2 = redeemCode(codes[0].code, uid);
assert(!r2.ok && r2.code === 409, '本人重复兑换被拒绝');
const r3 = redeemCode(codes[0].code, uid2);
assert(!r3.ok && r3.code === 409 && r3.data?.by_other, '他人兑换已被占用的码被拒绝');

console.log('6) 第二张码给 uid2');
const r4 = redeemCode(codes[1].code, uid2);
assert(r4.ok, 'uid2 兑换成功');
assert(getGroupBuy(gb.id).codes_redeemed === 2, '已兑换计数 = 2');

console.log('7) 关闭方案并作废剩余码');
const closed = closeGroupBuy(gb.id, { expireCodes: true });
assert(closed.status === 'closed', '状态变为 closed');
assert(closed.codes_unused === 0 && closed.codes_expired === 3, '剩余 3 张标记为过期');
const r5 = redeemCode(codes[2].code, uid);
assert(!r5.ok, '过期码不可兑换');

console.log('8) 统计');
const st = groupBuyStats();
assert(st.seats_total === 5 && st.seats_redeemed === 2 && st.seats_remaining === 3, '统计席位正确（总数5-已兑2=剩余3）');
assert(st.vip_via_group === 2, '通过团购开通的 VIP = 2');

console.log('9) 异常参数校验');
let threw = false;
try { createGroupBuy({ partnerId: 99999, productCode: 'vip_year', quantity: 1, unitPrice: 1 }); } catch { threw = true; }
assert(threw, '不存在的机构拒绝创建');
threw = false;
try { createGroupBuy({ partnerId: partner.id, productCode: 'no_such', quantity: 1, unitPrice: 1 }); } catch { threw = true; }
assert(threw, '不存在的商品拒绝创建');

console.log('10) 按班级分批发码');
const gb2 = settleGroupBuy(createGroupBuy({
  partnerId: partner.id, productCode: 'vip_year', expireAt: '2030-01-01',
  batches: [{ label: '高三1班', count: 3 }, { label: '高三2班', count: 2 }], unitPrice: 88, createdBy: uid
}).id, { method: 'manual' });
assert(gb2 && gb2.id, '创建并结算分批发码方案成功');
assert(gb2.quantity === 5, '总数量 = 各批次之和 5');
assert(gb2.total_amount === 440, '总金额 = 88*5 = 440');
assert(gb2.batches.length === 2, '批次数为 2');
assert(gb2.batches[0].total === 3 && gb2.batches[1].total === 2, '批次数量正确');
assert(gb2.batches[0].conversion === 0, '批次初始转化率为 0');

console.log('11) 批次筛选与标签');
const c1 = listGroupBuyCodes(gb2.id, { batch: '高三1班', limit: 100 }).list;
const c2 = listGroupBuyCodes(gb2.id, { batch: '高三2班', limit: 100 }).list;
assert(c1.length === 3 && c2.length === 2, '按批次筛选数量正确');
assert(c1.every(c => c.batch_label === '高三1班'), '码带正确批次标签');
const labels = listGroupBuyBatchLabels(gb2.id);
assert(labels.length === 2 && labels.includes('高三1班') && labels.includes('高三2班'), '批次标签枚举正确');

console.log('12) 批次维度兑换统计');
const rb = redeemCode(c1[0].code, uid);
assert(rb.ok, '兑换某班学生码成功');
const bs = groupBuyBatchStats(gb2.id);
const b1 = bs.find(b => b.batch_label === '高三1班');
assert(b1.redeemed === 1 && Math.abs(b1.conversion - 33.3) < 0.1, '高三1班已兑1/转化率≈33.3%');

console.log('13) 未分组（整批发码）兼容');
const gb3 = settleGroupBuy(createGroupBuy({ partnerId: partner.id, productCode: 'vip_year', quantity: 4, unitPrice: 77, createdBy: uid }).id, { method: 'manual' });
assert(gb3.quantity === 4 && (!gb3.batches || gb3.batches.length === 1), '无批次时整批发码');
const noneCodes = listGroupBuyCodes(gb3.id, { batch: '__none__', limit: 100 }).list;
assert(noneCodes.length === 4 && noneCodes.every(c => c.batch_label === null), '未分组码 batch_label 为 null');
const bs3 = groupBuyBatchStats(gb3.id);
assert(bs3.length === 1 && bs3[0].batch_label === '（未分组）' && bs3[0].total === 4, '未分组统计归到（未分组）');

console.log('14) 批次参数校验');
let bt = false;
try { createGroupBuy({ partnerId: partner.id, productCode: 'vip_year', batches: [{ label: '', count: 2 }] }); } catch { bt = true; }
assert(bt, '批次名称为空被拒绝');
bt = false;
try { createGroupBuy({ partnerId: partner.id, productCode: 'vip_year', batches: [{ label: 'X', count: 0 }] }); } catch { bt = true; }
assert(bt, '批次数量 < 1 被拒绝');

console.log('15) 取消待收款方案');
const gbC = createGroupBuy({ partnerId: partner.id, productCode: 'vip_year', quantity: 2, unitPrice: 50, createdBy: uid });
assert(gbC.status === 'pending' && !gbC.paid, '待收款方案已创建');
const cancelled = cancelGroupBuy(gbC.id);
assert(cancelled.status === 'cancelled', '取消成功');
let ce = false;
try { settleGroupBuy(gbC.id, {}); } catch { ce = true; }
assert(ce, '已取消方案不可结算');

console.log('16) 免支付方案自动结算');
const gbF = createGroupBuy({ partnerId: partner.id, productCode: 'vip_year', quantity: 3, unitPrice: 0, createdBy: uid });
assert(gbF.paid === 1 && gbF.status === 'active', '金额为 0 直接生效');
assert(gbF.codes_total === 3, '免支付自动生成 3 张码');
assert(gbF.pay_method === 'free', '记录免支付方式');

console.log('17) 支付单号查询（回调分流用）');
assert(getGroupBuyByPayNo(gbF.pay_no)?.id === gbF.id, '可按 pay_no 反查团购方案');
assert(getGroupBuyByPayNo('CZ999') === undefined, '个人订单号不会命中团购');

console.log(`\n结果：通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
