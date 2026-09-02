import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('E:/saixt/server/data/saixt.db');
const all = db.prepare('SELECT id, subject, chapter, stem, answer, image FROM questions ORDER BY id').all();
function norm(s) { return (s || '').replace(/\s+/g, '').replace(/[（）()]/g, '').slice(0, 20); }

const seen = new Map();
let dupCount = 0;
for (const q of all) {
  const key = norm(q.stem);
  if (seen.has(key)) {
    dupCount++;
    const prev = seen.get(key);
    console.log(`重复: id=${prev.id} <-> id=${q.id} | ${q.stem.slice(0, 36)}`);
  } else {
    seen.set(key, q);
  }
}
console.log(`\n疑似重复 ${dupCount} 组`);
