import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(join(__dirname, '..', 'data', 'saixt.db'));
const QIMG = join(__dirname, '..', 'public', 'qimages');

function norm(s) {
  return (s || '').replace(/[\s（）()。，,、：:；;？?【】\[\]“”"\'．.\-]/g, '');
}

const d = JSON.parse(readFileSync('E:/saixt/exam_papers/image_match_full.json', 'utf-8'));
const arr = Array.isArray(d) ? d : (d.questions || d.data || []);

// 库中所有题目
const all = db.prepare('SELECT id, subject, chapter, stem, image, source FROM questions').all();
const byNorm = new Map();
for (const q of all) byNorm.set(norm(q.stem), q);

let updated = 0, noMap = 0, fileMissing = 0;
const noMapList = [], fileMissingList = [];

for (const r of arr) {
  const q = byNorm.get(norm(r.stem));
  if (!q) continue; // 不在库
  if (q.image) continue; // 已有图
  const imgs = Array.isArray(r.images) ? r.images : [];
  if (!imgs.length) { noMap++; noMapList.push(q.id); continue; }
  // 验证文件存在
  const exist = imgs.filter(p => existsSync(join(QIMG, p)));
  if (!exist.length) { fileMissing++; fileMissingList.push({ id: q.id, imgs }); continue; }
  const image = exist[0].replace(/\\/g, '/');
  db.prepare('UPDATE questions SET image = ? WHERE id = ?').run(image, q.id);
  updated++;
  console.log(`[补图] id=${q.id} -> ${image} | ${String(q.stem).slice(0, 30)}`);
}

console.log('\n补图成功:', updated);
console.log('匹配到记录但无图映射:', noMap, noMapList.join(','));
console.log('图片文件缺失:', fileMissing);
for (const f of fileMissingList) console.log('  缺文件:', f.id, JSON.stringify(f.imgs));
