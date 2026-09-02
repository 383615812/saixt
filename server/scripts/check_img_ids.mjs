import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(join(__dirname, '..', 'data', 'saixt.db'));

for (const id of [38, 45, 46]) {
  const r = db.prepare('SELECT id, subject, chapter, stem, image, answer FROM questions WHERE id = ?').get(id);
  console.log('id', id, '=>', r ? JSON.stringify({ subject: r.subject, chapter: r.chapter, image: r.image, answer: r.answer, stem: (r.stem || '').slice(0, 30) }) : '不存在');
}

console.log('\n=== 全部带图题目 ===');
const rows = db.prepare("SELECT id, subject, chapter, image, answer FROM questions WHERE image IS NOT NULL AND image != '' ORDER BY id").all();
for (const r of rows) console.log(r.id, '|', r.subject, '|', r.chapter, '|', r.image, '|', r.answer);

console.log('\n=== 最大ID ===');
console.log(db.prepare('SELECT MAX(id) AS max FROM questions').get().max);
