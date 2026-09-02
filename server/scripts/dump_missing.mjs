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

const all = db.prepare('SELECT id, stem FROM questions').all();
const byNorm = new Map();
for (const q of all) byNorm.set(norm(q.stem), q.id);

for (const r of arr) {
  if (byNorm.has(norm(r.stem))) continue;
  console.log('========================================');
  console.log('stem:', r.stem);
  console.log('options:', JSON.stringify(r.options));
  console.log('answer:', r.answer);
  console.log('analysis:', r.analysis);
  console.log('subject:', r.subject, '| chapter:', r.chapter, '| source:', r.source);
  console.log('images:', JSON.stringify(r.images));
}
