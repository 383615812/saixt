import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('E:/saixt/exam_papers/refined_image.json', 'utf-8'));
const still = data.filter(r => r.needs_image);
console.log('仍需图片题数:', still.length);
still.forEach((r, i) => {
  console.log(`\n[${i + 1}] ${r.file} | 章节:${r.chapter || '?'}`);
  console.log('题干:', r.stem.slice(0, 120));
  if (r.options && r.options.length) console.log('选项:', r.options.join(' | ').slice(0, 150));
});
