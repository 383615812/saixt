import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const db = new DatabaseSync('E:/saixt/server/data/saixt.db');
const review = JSON.parse(readFileSync('E:/saixt/exam_papers/image_match_review.json', 'utf-8'));

const all = db.prepare('SELECT id, subject, chapter, stem, image FROM questions').all();
function norm(s) { return (s || '').replace(/\s+/g, '').slice(0, 18); }

let inDb = 0, missing = 0;
for (const item of review) {
  const target = norm(item.stem);
  const found = all.find(q => norm(q.stem).startsWith(target.slice(0, 12)) || target.startsWith(norm(q.stem).slice(0, 12)));
  if (found) {
    inDb++;
    console.log(`[DB] id=${found.id} | img=${found.image ? 'YES' : 'NO '} | ${item.stem.slice(0, 30)}`);
  } else {
    missing++;
    console.log(`[MISS] | ${item.stem.slice(0, 30)}`);
  }
}
console.log(`\n共 ${review.length} 道图片题：已入库 ${inDb}，未入库 ${missing}`);
