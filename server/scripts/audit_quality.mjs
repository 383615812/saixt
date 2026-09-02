import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('E:/saixt/server/data/saixt.db');
const all = db.prepare('SELECT id, subject, chapter, type, difficulty, stem, options, answer, analysis, source, image FROM questions ORDER BY id').all();

let noAnswer = 0, noOptions = 0, noAnalysis = 0, shortStem = 0, noChapter = 0;
console.log('=== 质量问题审计 ===');
for (const q of all) {
  const opts = (q.options || '').trim();
  const stem = (q.stem || '').trim();
  const ans = (q.answer || '').trim();
  const ana = (q.analysis || '').trim();
  const chap = (q.chapter || '').trim();
  const issues = [];
  if (!ans) { noAnswer++; issues.push('无答案'); }
  if (!opts || opts === '[]') { noOptions++; issues.push('无选项'); }
  if (!ana) { noAnalysis++; issues.push('无解析'); }
  if (stem.length < 8) { shortStem++; issues.push('题干过短'); }
  if (!chap) { noChapter++; issues.push('无章节'); }
  if (issues.length) console.log(`id=${q.id} [${q.subject}] ${issues.join('、')} | ${stem.slice(0, 40)}`);
}
console.log(`\n总计 ${all.length} 题`);
console.log(`无答案: ${noAnswer} | 无选项: ${noOptions} | 无解析: ${noAnalysis} | 题干过短: ${shortStem} | 无章节: ${noChapter}`);

// 章节分布
console.log('\n=== 章节分布 ===');
const bySub = {};
for (const q of all) {
  const key = `${q.subject} / ${q.chapter || '未分类'}`;
  bySub[key] = (bySub[key] || 0) + 1;
}
Object.entries(bySub).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`${v} 题 | ${k}`));

// 来源分布
console.log('\n=== 来源分布 ===');
const bySrc = {};
for (const q of all) bySrc[q.source || '未知'] = (bySrc[q.source || '未知'] || 0) + 1;
Object.entries(bySrc).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`${v} 题 | ${k}`));
