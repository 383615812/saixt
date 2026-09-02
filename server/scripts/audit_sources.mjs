import { readFileSync } from 'node:fs';
import { db } from '../src/db.js';

const refined = JSON.parse(readFileSync('E:/saixt/exam_papers/refined_image.json', 'utf8'));

// 36 道在库但无图 + 13 道缺失 的 source 分布
const all = db.prepare('SELECT id, subject, chapter, stem, source FROM questions').all();
const byStem = new Map();
for (const q of all) byStem.set(norm(q.stem), q);

function norm(s) {
  return (s || '').replace(/[（(]\s*[）)]/g, '').replace(/[（(][A-D][）)]/g, '').replace(/\s+/g, '').trim();
}

const sources = {};
for (const r of refined) {
  const hit = byStem.get(norm(r.stem));
  if (hit && !hit.image) {
    const key = `${hit.source} <=> ${r.file}`;
    sources[key] = (sources[key] || 0) + 1;
  }
}
console.log('=== 在库但无图的 source 映射 ===');
for (const [k, v] of Object.entries(sources)) console.log(`${v} 题 | ${k}`);

const missingSrc = {};
for (const r of refined) {
  const hit = byStem.get(norm(r.stem));
  if (!hit) missingSrc[r.file] = (missingSrc[r.file] || 0) + 1;
}
console.log('\n=== 完全缺失题的 file 分布 ===');
for (const [k, v] of Object.entries(missingSrc)) console.log(`${v} 题 | ${k}`);
