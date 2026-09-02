import { readFileSync } from 'node:fs';
import { db } from '../src/db.js';

const refined = JSON.parse(readFileSync('E:/saixt/exam_papers/refined_image.json', 'utf8'));
console.log('refined_image.json 图片依赖题总数:', refined.length);

const all = db.prepare('SELECT id, subject, chapter, stem, image FROM questions').all();const byStem = new Map();
for (const q of all) byStem.set(norm(q.stem), q);

function norm(s) {
  return (s || '').replace(/[\s（）()。，,、：:；;？?【】\[\]“”"\'．.\-]/g, '');
}

let inDb = 0, inDbNoImg = 0, missing = 0;
const missingList = [];
const noImgList = [];
for (const r of refined) {
  const hit = byStem.get(norm(r.stem));
  if (hit) {
    inDb++;
    if (!hit.image) { inDbNoImg++; noImgList.push({ id: hit.id, subject: hit.subject, chapter: hit.chapter, stem: r.stem.slice(0, 30), file: r.file }); }
  } else {
    missing++;
    missingList.push({ subject: r.subject, stem: r.stem.slice(0, 40), file: r.file });
  }
}

console.log('在库中:', inDb, '| 在库但无图:', inDbNoImg, '| 完全缺失:', missing);
console.log('\n=== 在库但无图（需补图）===');
for (const m of noImgList) console.log(`id=${m.id} [${m.subject}/${m.chapter}] ${m.stem} | ${m.file}`);
console.log('\n=== 完全缺失（需导入）===');
for (const m of missingList) console.log(`[${m.subject}] ${m.stem} | ${m.file}`);
