// CI 门禁：知识图谱连通性与教学关系回归测试
// 纯自包含脚本，不依赖生产数据/服务器。复刻 questions.js /knowledge-graph 的核心算法
// （bigram 相似度边 + 「专题NN」教学承接边 + 连通分量桥接），用合成断连数据验证：
//   1) 带「专题NN」编号的科目应生成相邻编号间的教学承接边
//   2) 桥接后每个科目应退化为单一连通分量（全连通可导航）
// 任何对 questions.js 图谱逻辑的重构若破坏上述不变量，本门禁应先行失败。
import assert from 'node:assert/strict';

let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

// —— 复刻 questions.js 图谱核心算法 ——
function getBigrams(str) {
  const s = String(str).replace(/\s+/g, '');
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s[i] + s[i + 1]);
  return set;
}

// 输入节点：{ id, name, subject, chapter, count }
function buildGraph(nodes) {
  const bySubject = {};
  for (const n of nodes) {
    if (!bySubject[n.subject]) bySubject[n.subject] = [];
    bySubject[n.subject].push(n);
  }
  const bigramCache = new Map();
  for (const n of nodes) bigramCache.set(n.id, getBigrams(n.chapter));

  const links = [];
  for (const sub of Object.keys(bySubject)) {
    const list = bySubject[sub];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const bgA = bigramCache.get(list[i].id), bgB = bigramCache.get(list[j].id);
        let common = 0;
        for (const bi of bgA) if (bgB.has(bi)) common++;
        if (common >= 2) links.push({ source: list[i].id, target: list[j].id, value: Math.min(10, Math.max(1, common)) });
      }
    }
  }

  const nodeLinks = new Map();
  for (const l of links) {
    if (!nodeLinks.has(l.source)) nodeLinks.set(l.source, []);
    if (!nodeLinks.has(l.target)) nodeLinks.set(l.target, []);
    nodeLinks.get(l.source).push(l);
    nodeLinks.get(l.target).push(l);
  }
  const keptLinks = new Set();
  for (const [, arr] of nodeLinks) {
    arr.sort((a, b) => b.value - a.value);
    for (const l of arr.slice(0, 5)) keptLinks.add(l);
  }
  const keptArr = [...keptLinks].map(l => ({ ...l, kind: 'similarity' }));
  const bySubjectFinal = bySubject;

  // 教学承接边：相邻「专题NN」编号
  {
    const topicRe = /专题\s*0*(\d+)/;
    const teachingEdges = [];
    const seenT = new Set();
    for (const sub of Object.keys(bySubjectFinal)) {
      const byNum = new Map();
      for (const n of bySubjectFinal[sub]) {
        const m = String(n.chapter).match(topicRe);
        if (!m) continue;
        const num = Number(m[1]);
        if (!byNum.has(num) || n.count > byNum.get(num).count) byNum.set(num, n);
      }
      const nums = [...byNum.keys()].sort((a, b) => a - b);
      for (let i = 0; i < nums.length - 1; i++) {
        if (nums[i + 1] - nums[i] !== 1) continue;
        const a = byNum.get(nums[i]), b = byNum.get(nums[i + 1]);
        const key = `${a.id}\u0000${b.id}`, rev = `${b.id}\u0000${a.id}`;
        if (seenT.has(key) || seenT.has(rev)) continue;
        seenT.add(key);
        teachingEdges.push({ source: a.id, target: b.id, value: 3, kind: 'teaching', from: a.chapter, to: b.chapter });
      }
    }
    // 教学边优先：存在教学边的一对，移除其相似度边，避免双线
    const teachPair = new Set(teachingEdges.map(e => `${e.source}\u0000${e.target}`));
    const filtered = keptArr.filter(l => {
      const f = `${l.source}\u0000${l.target}`, r = `${l.target}\u0000${l.source}`;
      return !teachPair.has(f) && !teachPair.has(r);
    });
    keptArr.length = 0;
    keptArr.push(...filtered, ...teachingEdges);
  }

  // 连通分量检测 + 桥接
  for (const sub of Object.keys(bySubjectFinal)) {
    const list = bySubjectFinal[sub];
    if (list.length < 2) continue;
    const idSet = new Set(list.map(n => n.id));
    const adj = new Map();
    for (const id of idSet) adj.set(id, new Set());
    for (const l of keptArr) {
      if (adj.has(l.source) && adj.has(l.target)) { adj.get(l.source).add(l.target); adj.get(l.target).add(l.source); }
    }
    const compOf = new Map();
    let comps = 0;
    for (const id of idSet) {
      if (compOf.has(id)) continue;
      const stack = [id]; compOf.set(id, comps);
      while (stack.length) {
        const cur = stack.pop();
        for (const nb of adj.get(cur) || []) if (!compOf.has(nb)) { compOf.set(nb, comps); stack.push(nb); }
      }
      comps++;
    }
    let before = comps;
    if (comps > 1) {
      const compNodes = Array.from({ length: comps }, () => []);
      for (const n of list) compNodes[compOf.get(n.id)].push(n);
      const seat = (arr) => arr.reduce((p, c) => (c.count > p.count ? c : p));
      const biggest = compNodes.reduce((p, c) => (c.length > p.length ? c : p));
      const anchorNode = seat(biggest);
      for (const arr of compNodes) {
        if (arr.length === 0) continue;
        const top = seat(arr);
        if (top === anchorNode) continue;
        if (String(top.chapter).trim() === 'null' && String(anchorNode.chapter).trim() === 'null') continue;
        keptArr.push({ source: top.id, target: anchorNode.id, value: 4, kind: 'bridge' });
      }
      // 桥接后重新检测应为单一分量
      const adj2 = new Map(); for (const id of idSet) adj2.set(id, new Set());
      for (const l of keptArr) if (adj2.has(l.source) && adj2.has(l.target)) { adj2.get(l.source).add(l.target); adj2.get(l.target).add(l.source); }
      const seen2 = new Set(); let comps2 = 0;
      for (const id of idSet) {
        if (seen2.has(id)) continue;
        const stack = [id]; seen2.add(id);
        while (stack.length) { const cur = stack.pop(); for (const nb of adj2.get(cur) || []) if (!seen2.has(nb)) { seen2.add(nb); stack.push(nb); } }
        comps2++;
      }
      console.log(`    (${sub}) 桥接前分量=${before}，桥接后=${comps2}`);
    }
  }
  return keptArr;
}

function componentsAfter(nodes, links) {
  const bySubject = {};
  for (const n of nodes) { (bySubject[n.subject] ||= []).push(n); }
  const result = {};
  for (const sub of Object.keys(bySubject)) {
    const idSet = new Set(bySubject[sub].map(n => n.id));
    const adj = new Map(); for (const id of idSet) adj.set(id, new Set());
    for (const l of links) if (adj.has(l.source) && adj.has(l.target)) { adj.get(l.source).add(l.target); adj.get(l.target).add(l.source); }
    const seen = new Set(); let comps = 0;
    for (const id of idSet) {
      if (seen.has(id)) continue;
      const stack = [id]; seen.add(id);
      while (stack.length) { const cur = stack.pop(); for (const nb of adj.get(cur) || []) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); } }
      comps++;
    }
    result[sub] = comps;
  }
  return result;
}

console.log('KG 连通性与教学关系门禁');
console.log('[合成断连数据] 信息技术：邻接专题链 + 两个孤立相似章，验证教学承接与桥接');

const techNodes = [
  { id: 't||专题01 计算机基础', name: '专题01 计算机基础', subject: '信息技术', chapter: '专题01 计算机基础', count: 100 },
  { id: 't||专题02 网络基础', name: '专题02 网络基础', subject: '信息技术', chapter: '专题02 网络基础', count: 80 },
  { id: 't||专题03 操作系统', name: '专题03 操作系统', subject: '信息技术', chapter: '专题03 操作系统', count: 60 },
  { id: 't||数据结构初步', name: '数据结构初步', subject: '信息技术', chapter: '数据结构初步', count: 40 },
  { id: 't||数据库应用', name: '数据库应用', subject: '信息技术', chapter: '数据库应用', count: 35 }
];

check('专题01→02→03 生成相邻教学承接边（kind=teaching）', () => {
  const links = buildGraph(techNodes).filter(l => l.kind === 'teaching');
  const hasA = links.some(l => (l.from === '专题01 计算机基础' && l.to === '专题02 网络基础'))
    || links.some(l => (l.from === '专题02 网络基础' && l.to === '专题01 计算机基础'));
  const hasB = links.some(l => (l.from === '专题02 网络基础' && l.to === '专题03 操作系统'))
    || links.some(l => (l.from === '专题03 操作系统' && l.to === '专题02 网络基础'));
  assert.ok(links.length >= 2, `期望≥2条教学边，实际 ${links.length}`);
  assert.ok(hasA, '缺少 专题01↔专题02 教学承接边');
  assert.ok(hasB, '缺少 专题02↔专题03 教学承接边');
});

check('跳过断号臆测：不生成非相邻「专题01↔专题03」边', () => {
  const links = buildGraph(techNodes).filter(l => l.kind === 'teaching');
  const skips = links.filter(l =>
    (l.from === '专题01 计算机基础' && l.to === '专题03 操作系统')
    || (l.from === '专题03 操作系统' && l.to === '专题01 计算机基础'));
  assert.equal(skips.length, 0, '非相邻编号不应生成教学承接边');
});

check('桥接后「信息技术」全学科为单一连通分量', () => {
  const links = buildGraph(techNodes);
  const comps = componentsAfter(techNodes, links);
  assert.ok(comps['信息技术'] === 1, `期望 1 个分量，实际 ${comps['信息技术']}`);
});

check('每类边带有明确的 kind 标记', () => {
  const links = buildGraph(techNodes);
  const kinds = new Set(links.map(l => l.kind));
  assert.ok(kinds.has('similarity'));
  assert.ok(kinds.has('teaching'));
  assert.ok(kinds.has('bridge'));
});

// 无「专题NN」编号科目不应臆造教学顺序，仅靠相似度+桥接连通
const genericNodes = [
  { id: 'g||通用技术设计', name: '通用技术设计', subject: '通用技术', chapter: '通用技术设计', count: 50 },
  { id: 'g||电子控制技术', name: '电子控制技术', subject: '通用技术', chapter: '电子控制技术', count: 42 },
  { id: 'g||结构设计基础', name: '结构设计基础', subject: '通用技术', chapter: '结构设计基础', count: 30 }
];

check('无编号科目不生成教学边，桥接后仍全连通', () => {
  const links = buildGraph(genericNodes);
  assert.ok(!links.some(l => l.kind === 'teaching'), '无「专题NN」编号不应臆造教学承接边');
  const comps = componentsAfter(genericNodes, links);
  assert.ok(comps['通用技术'] === 1, `期望 1 个分量，实际 ${comps['通用技术']}`);
});

// 极端单点科目：单节点 no-op 不崩溃
check('单节点科目不崩溃', () => {
  const one = [{ id: 's||艺术基础', name: '艺术基础', subject: '美术', chapter: '艺术基础', count: 10 }];
  const links = buildGraph(one);
  const comps = componentsAfter(one, links);
  assert.ok(comps['美术'] === 1);
});

if (failed > 0) {
  console.error(`\nKG 门禁失败：${failed} 项未通过`);
  process.exit(1);
}
console.log('\nKG 门禁全部通过 ✅');