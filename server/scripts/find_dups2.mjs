import { db } from '../src/db.js';

const all = db.prepare('SELECT id, subject, chapter, stem, image, source FROM questions ORDER BY id').all();
function norm(s) {
  return (s || '').replace(/[\s（）()。，,、：:；;？?【】\[\]“”"\'．.\-]/g, '');
}
const groups = new Map();
for (const q of all) {
  const k = norm(q.stem);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(q);
}
let dupCount = 0;
for (const [k, list] of groups) {
  if (list.length > 1) {
    dupCount++;
    console.log(`=== 重复题干 (${list.length}条) ===`);
    for (const q of list) {
      console.log(`  id=${q.id} [${q.subject}/${q.chapter}] img=${q.image || '无'} src=${q.source} | ${q.stem.slice(0, 35)}`);
    }
  }
}
console.log('\n重复组数:', dupCount);
