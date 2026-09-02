import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync('E:/saixt/exam_papers/image_match_full.json', 'utf-8'));
const arr = Array.isArray(d) ? d : (d.questions || d.data || []);
// 打印前3条完整结构
for (const r of arr.slice(0, 3)) {
  console.log('KEYS:', Object.keys(r));
  console.log(JSON.stringify(r, null, 2).slice(0, 1500));
  console.log('----------------------------------------');
}
