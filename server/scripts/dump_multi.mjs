import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync('E:/saixt/exam_papers/image_match_full.json', 'utf-8'));
const arr = Array.isArray(d) ? d : (d.questions || d.data || []);
console.log('总记录数:', arr.length);
const multi = arr.filter(r => Array.isArray(r.images) && r.images.length > 1);
for (const r of multi) {
  console.log('\n----------------------------------------');
  console.log('stem:', r.stem);
  console.log('images:', JSON.stringify(r.images));
  console.log('answer:', r.answer);
  console.log('source:', r.source);
  console.log('needs_image:', r.needs_image);
}
