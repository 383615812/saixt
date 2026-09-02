import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(join(__dirname, '..', 'data', 'saixt.db'));

function norm(s) {
  return (s || '').replace(/[\s（）()。，,、：:；;？?【】\[\]“”"\'．.\-]/g, '');
}

const d = JSON.parse(readFileSync('E:/saixt/exam_papers/image_match_full.json', 'utf-8'));
const arr = Array.isArray(d) ? d : (d.questions || d.data || []);
console.log('image_match_full 记录数:', arr.length);

// 库中所有题目
const all = db.prepare('SELECT id, subject, chapter, stem, image, source FROM questions').all();
const byNorm = new Map();
for (const q of all) byNorm.set(norm(q.stem), q);

let inDb = 0, notInDb = 0;
const notInDbList = [];
for (const r of arr) {
  const q = byNorm.get(norm(r.stem));
  if (q) {
    inDb++;
    const hasImg = q.image ? '有图' : '无图';
    console.log(`[在库] id=${q.id} ${hasImg} | ${String(r.stem).slice(0, 30)}`);
  } else {
    notInDb++;
    notInDbList.push(r);
  }
}
console.log('\n在库:', inDb, '不在库:', notInDb);
console.log('\n=== 不在库的题目 ===');
for (const r of notInDbList) {
  const imgs = Array.isArray(r.images) ? r.images.length : (r.image ? 1 : 0);
  console.log(`[${r.source}] 图${imgs} | ${String(r.stem).slice(0, 40)}`);
}
