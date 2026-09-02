import { readFileSync, writeFileSync } from 'node:fs';
import { db } from '../src/db.js';

const docxMap = JSON.parse(readFileSync('E:/saixt/server/public/qimages/_docx_mapping.json', 'utf8'));
const pdfMap = JSON.parse(readFileSync('E:/saixt/server/public/qimages/_pdf_mapping.json', 'utf8'));
const refined = JSON.parse(readFileSync('E:/saixt/exam_papers/refined_image.json', 'utf8'));

const SRC_MAP = {
  '110份.txt': '110份', '110份_(2).txt': '110份 (2)',
  '信息周测二（125份）.txt': '信息周测二（125份）',
  '信息周测五（65份）.txt': '信息周测五（65份）',
  '信息周测四（60份）.txt': '信息周测四（60份）',
  '周测五(65份).txt': '周测五(65份)',
  '通用周测一（10份）.txt': '通用周测一（10份）',
  '通用周测三(125份）.txt': '通用周测三(125份）',
  '通用周测四（60份）.txt': '通用周测四（60份）',
  '通用模拟测试题（130份）.txt': '通用模拟测试题（130份）',
};

function norm(s) {
  return (s || '').replace(/[\s（）()。，,、：:；;？?【】\[\]“”"\'．.\-]/g, '');
}

function lcsLen(a, b) {
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  const dp = new Array(n + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      if (a[i - 1] === b[j - 1]) { dp[j] = prev + 1; if (dp[j] > best) best = dp[j]; }
      else dp[j] = 0;
      prev = tmp;
    }
  }
  return best;
}

function findDocxBest(source, stem) {
  const blocks = docxMap[source] || [];
  const key = norm(stem);
  let bestI = -1, bestScore = 0;
  for (let i = 0; i < blocks.length; i++) {
    const bt = norm(blocks[i].text);
    if (!bt) continue;
    const score = lcsLen(key, bt);
    if (score > bestScore) { bestScore = score; bestI = i; }
  }
  return { bestI, bestScore };
}

function collectDocxImgs(source, bi) {
  const blocks = docxMap[source] || [];
  const imgs = [];
  const push = (p) => { if (p && !imgs.includes(p)) imgs.push(p); };
  // 当前块有图则直接用
  if (blocks[bi]?.images?.length) {
    blocks[bi].images.forEach(push);
    return imgs;
  }
  // 向后找第一个带图的块，遇到新题号停止
  let found = false;
  for (let j = bi + 1; j < Math.min(blocks.length, bi + 6); j++) {
    const t = blocks[j].text || '';
    if (/^\s*\d+\s*[.．、]/.test(t)) break;
    if (blocks[j].images?.length) {
      blocks[j].images.forEach(push);
      found = true;
      break;
    }
  }
  // 向后没找到，回退看前一块（图可能在前一题的选项块里）
  if (!found && bi - 1 >= 0) {
    (blocks[bi - 1].images || []).forEach(push);
  }
  return imgs;
}

// 共享题干：若子题无图，回溯找"回答X、Y题"共享题干块的图片
function findSharedStemImg(source, bi) {
  const blocks = docxMap[source] || [];
  for (let j = bi - 1; j >= 0 && j >= bi - 6; j--) {
    const t = blocks[j].text || '';
    if (/回答\s*\d+\s*[、,，]\s*\d+\s*题/.test(t) || /据此回答/.test(t)) {
      const imgs = [];
      const push = (p) => { if (p && !imgs.includes(p)) imgs.push(p); };
      (blocks[j].images || []).forEach(push);
      for (let k = j + 1; k < Math.min(blocks.length, j + 5); k++) {
        (blocks[k].images || []).forEach(push);
      }
      return imgs;
    }
  }
  return [];
}

function findPdfBest(source, stem) {
  const pages = pdfMap[source] || [];
  const key = norm(stem);
  let bestP = -1, bestScore = 0;
  for (const p of pages) {
    const score = lcsLen(key, norm(p.text));
    if (score > bestScore) { bestScore = score; bestP = p.page; }
  }
  let imgs = [];
  if (bestP > 0) {
    const page = pages.find(p => p.page === bestP);
    if (page?.images?.length) {
      // 估算题干在页面中的垂直位置
      const idx = page.text.indexOf(stem.slice(0, 20));
      const totalLen = page.text.length || 1;
      const pageH = 842;
      const estTop = totalLen ? (idx / totalLen) * pageH : pageH / 2;
      let best = page.images[0];
      let bestDist = Infinity;
      for (const im of page.images) {
        const dist = Math.abs(im.top - estTop);
        if (dist < bestDist) { bestDist = dist; best = im; }
      }
      imgs = [best.path];
    }
  }
  return { bestP, bestScore, imgs };
}

const all = db.prepare('SELECT id, subject, chapter, stem, source, image FROM questions').all();
const byStem = new Map();
for (const q of all) byStem.set(norm(q.stem), q);

const results = [];
for (const r of refined) {
  const hit = byStem.get(norm(r.stem));
  const source = SRC_MAP[r.file] || r.file.replace('.txt', '');
  let matched = { images: [], score: 0, block: -1, page: -1 };
  if (docxMap[source]) {
    const { bestI, bestScore } = findDocxBest(source, r.stem);
    if (bestI >= 0 && bestScore >= 8) {
      let imgs = collectDocxImgs(source, bestI);
      if (!imgs.length) imgs = findSharedStemImg(source, bestI);
      matched = { images: imgs, score: bestScore, block: bestI, page: -1 };
    }
  } else if (pdfMap[source]) {
    const { bestP, bestScore, imgs } = findPdfBest(source, r.stem);
    if (bestP > 0 && bestScore >= 8) {
      matched = { images: imgs, score: bestScore, block: -1, page: bestP };
    }
  }
  results.push({
    dbId: hit?.id || null, inDb: !!hit, hasImg: !!(hit && hit.image),
    file: r.file, subject: r.subject, chapter: r.chapter,
    stem: r.stem, options: r.options, answer: r.answer, analysis: r.analysis,
    source, score: matched.score, block: matched.block, page: matched.page,
    images: matched.images,
  });
}

writeFileSync('E:/saixt/exam_papers/image_match_full.json', JSON.stringify(results, null, 1), 'utf8');

const needImg = results.filter(r => r.inDb && !r.hasImg);
const missing = results.filter(r => !r.inDb);
console.log(`=== 在库但无图（${needImg.length}）===`);
for (const r of needImg) {
  console.log(`id=${r.dbId} [${r.source}] 分${r.score} 块${r.block} 页${r.page} | 图:${JSON.stringify(r.images)}`);
}
console.log('\n=== 完全缺失（13）===');
for (const r of missing) {
  console.log(`[${r.source}] 分${r.score} 块${r.block} 页${r.page} | 图:${JSON.stringify(r.images)}`);
  console.log(`    ${r.stem.slice(0, 40)}`);
}
