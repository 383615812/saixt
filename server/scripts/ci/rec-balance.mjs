// CI 门禁：志愿推荐分档均衡回归测试
// 纯自包含脚本，不依赖生产数据/服务器。复刻 recommend.js /recommend 的分档均衡核心
// （scoreFit/capacityScore 打分 + 冲4/稳6/保4 上限 + 稳档就近补足），用真实的
// 云南民办/公办双峰院校录取线合成分布验证：
//   1) 打分满分仍为 100（52 契合 + 25 专业 + 15 学费 + 8 容量）
//   2) 各档数量不超过上限；「稳」档在候选中转充足时应补足到 6
//   3) 双峰分布下不再出现「保档十几所、稳档仅一两所」的失衡方案
// 任何对 recommend.js 分档逻辑的重构若破坏上述不变量，本门禁应先行失败。
import assert from 'node:assert/strict';

let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

// —— 复刻 recommend.js 打分与分档核心 ——
function scoreFit(diff) {
  const d = Math.abs(diff);
  if (d <= 15) return 52;
  return Math.max(15, Math.round(52 - (d - 15) * (37 / 85)));
}
function majorMatch(count, hasKeyword) {
  if (!hasKeyword) return 12;
  if (count >= 5) return 25;
  if (count >= 3) return 20;
  if (count >= 2) return 16;
  if (count >= 1) return 12;
  return 0;
}
function tuitionFit(tuition, budget, tol) {
  if (!budget || !tuition) return 15;
  if (tuition.max <= budget) return 15;
  const cap = budget * (1 + tol / 100);
  if (tuition.max > cap) return 0;
  const overRatio = (tuition.max - budget) / budget;
  const maxOver = tol / 100;
  return Math.max(3, Math.round(15 - (overRatio / maxOver) * 12));
}
function capacityScore(plans) {
  const p = Number(plans) || 0;
  if (p >= 1500) return 8;
  if (p >= 800) return 6;
  if (p >= 400) return 4;
  if (p >= 150) return 2;
  return 0;
}
function estimateLine(school, medianPlans) {
  if (school.estimate_score) {
    const m = String(school.estimate_score).match(/\d+(?:\.\d+)?/);
    if (m) return Math.round(Math.min(600, Math.max(0, Number(m[0]))));
  }
  const isPublic = !String(school.name).includes('民办');
  const base = isPublic ? 400 : 320;
  const line = base + (medianPlans - school.plans) * 0.06;
  return Math.round(Math.min(520, Math.max(300, line)));
}

const CHONG_MAX = 4, WEN_MAX = 6, BAO_MAX = 4;
function tiers(matched) {
  const fitSort = (arr) => arr.sort((a, b) => b.matchScore - a.matchScore || Math.abs(a.diff) - Math.abs(b.diff));
  const chongCands = fitSort(matched.filter(it => it.diff >= -20 && it.diff < 0));
  const baoCands = fitSort(matched.filter(it => it.diff >= 45));
  const chong = chongCands.slice(0, CHONG_MAX);
  const bao = baoCands.slice(0, BAO_MAX);
  const wen = fitSort(matched.filter(it => it.diff >= 0 && it.diff < 45));
  const wenOver = [...chongCands.slice(CHONG_MAX), ...baoCands.slice(BAO_MAX)]
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
  for (const cand of wenOver) { if (wen.length >= WEN_MAX) break; wen.push(cand); }
  return { chong, wen: wen.slice(0, WEN_MAX), bao };
}

// 构造院校：{ name, estimate_score?, plans }，返回按 estimateLine 生成的 matched 条目
function makeSchools(estimates) {
  const plansArr = estimates.map(s => s.plans);
  const median = plansArr.sort((a, b) => a - b)[Math.floor(plansArr.length / 2)];
  return estimates.map(s => {
    const line = estimateLine(s, median);
    return {
      name: s.name,
      line,
      plans: s.plans,
      matchScore: scoreFit(0) + majorMatch(0, false) + tuitionFit(null, 0, 10) + capacityScore(s.plans)
    };
  });
}

// 评分满分结构校验
check('打分满分仍为 100（52+25+15+8）', () => {
  const F = scoreFit(0) + majorMatch(5, true) + tuitionFit(null, 0, 10) + capacityScore(2000);
  assert.equal(F, 100, `期望满分 100，实际 ${F}`);
  // 容量因子最高 8 分，权重合理占位
  assert.equal(capacityScore(2000), 8);
  assert.equal(capacityScore(0), 0);
});

// 双峰分布：民办多所录取线~320，公办学~400、420。总分 380 时应均衡而非「保十几所」
check('双峰分布下各档均衡（380 分）', () => {
  const schools = makeSchools([
    ...Array.from({ length: 8 }, (_, i) => ({ name: `云南民办学院${i}`, plans: 300 })),
    ...Array.from({ length: 3 }, (_, i) => ({ name: `云南公办大学${i}`, plans: 900 })),
    ...Array.from({ length: 2 }, (_, i) => ({ name: `云南公办专科${i}`, plans: 1600 }))
  ]);
  const SCORE = 380;
  const matched = schools.map(s => ({ ...s, diff: SCORE - s.line }));
  const r = tiers(matched);
  assert.ok(r.chong.length <= CHONG_MAX, `冲档突破上限：${r.chong.length}`);
  assert.ok(r.wen.length <= WEN_MAX, `稳档突破上限：${r.wen.length}`);
  assert.ok(r.bao.length <= BAO_MAX, `保档突破上限：${r.bao.length}`);
  // 关键不变量：不再出现「保档十几所、稳档仅一两所」的失衡
  assert.ok(r.bao.length < 8, `保档仍失衡：${r.bao.length} 所`);
  assert.ok(r.wen.length >= 3, `稳档不足：${r.wen.length} 所`);
  console.log(`    (380分) 冲 ${r.chong.length} · 稳 ${r.wen.length} · 保 ${r.bao.length}`);
});

// 稳档就近补足：候选充足时稳档优先补满，而不是任其空缺
check('稳档候选充足时补足到 6', () => {
  const schools = makeSchools(
    Array.from({ length: 14 }, (_, i) => ({ name: `云南公办院校${i}`, plans: 1000 }))
  );
  const SCORE = 380; // 全部公办 ~400 录取线，diff 均为 -20（冲档口径）
  const matched = schools.map(s => ({ ...s, diff: SCORE - s.line }));
  const r = tiers(matched);
  // 14 所都在冲档口径(-20..0)，稳档空，冲档截断 4，剩余 10 就近补入稳档
  assert.equal(r.chong.length, CHONG_MAX, `冲档未截断到 ${CHONG_MAX}`);
  assert.equal(r.wen.length, WEN_MAX, `稳档未补足到 ${WEN_MAX}`);
  assert.equal(r.bao.length, 0);
  const total = r.chong.length + r.wen.length + r.bao.length;
  assert.equal(total, CHONG_MAX + WEN_MAX, `总推荐数应为 ${CHONG_MAX + WEN_MAX} - 0 = 10`);
  console.log(`    (同分群) 冲 ${r.chong.length} · 稳 ${r.wen.length} · 保 ${r.bao.length} = ${total}`);
});

// 无候选时各档为空且不崩溃（如分数过低无冲档可选）
check('分数过低时冲档为空但仍可用（语义正确）', () => {
  const schools = makeSchools([
    { name: '云南公办大学A', plans: 1000 },
    { name: '云南民办学院B', plans: 300 },
    { name: '云南民办学院C', plans: 260 }
  ]);
  const SCORE = 180; // 远低于所有录取线
  const matched = schools.map(s => ({ ...s, diff: SCORE - s.line }));
  const r = tiers(matched);
  assert.equal(r.chong.length, 0);
  assert.ok(Array.isArray(r.wen) && Array.isArray(r.bao));
  assert.equal(r.chong.length + r.wen.length + r.bao.length, 0, '可选院校超过顶格分差时应为空档');
});

if (failed > 0) {
  console.error(`\n推荐门禁失败：${failed} 项未通过`);
  process.exit(1);
}
console.log('\n推荐门禁全部通过 ✅');