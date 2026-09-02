import { readFileSync } from 'node:fs';
import { db } from '../src/db.js';

const REFINED = 'E:/saixt/exam_papers/refined_image.json';

const CHAPTER_MAP = [
  { re: /结构/, to: '结构设计' },
  { re: /流程/, to: '流程设计' },
  { re: /系统/, to: '系统设计' },
  { re: /控制/, to: '控制设计' },
  { re: /技术与设计|设计的一般过程|设计过程/, to: '技术与设计' },
  { re: /数据与信息|数据信息/, to: '数据与信息' },
  { re: /程序设计|程序/, to: '程序设计基础' },
  { re: /网络/, to: '网络基础' },
  { re: /计算机基础|计算机/, to: '计算机基础' },
  { re: /信息安全|安全/, to: '信息安全' },
  { re: /数据处理|数据/, to: '数据处理' }
];

function mapChapter(subject, chapter) {
  if (!chapter) return subject === '信息技术' ? '数据与信息' : '技术与设计';
  for (const m of CHAPTER_MAP) if (m.re.test(chapter)) return m.to;
  return subject === '信息技术' ? '数据与信息' : '技术与设计';
}

function normStem(s) {
  return String(s || '')
    .replace(/[（(]+\s*[）)]+$/, '')
    .replace(/[？?。\s]+$/, '')
    .replace(/\s+/g, '')
    .trim();
}

function inferDifficulty(stem, options) {
  const text = String(stem || '') + (options || []).join('');
  if (/计算|容量|大小|二进制|十六进制|十进制|运行.*结果|输出|表达式|存储|采样|量化|换算/.test(text)) return 3;
  if (/下列.*不正确|不正确|错误|不属于|不包括|不恰当|不是/.test(text)) return 2;
  return 1;
}

const data = JSON.parse(readFileSync(REFINED, 'utf-8'));
const recoverable = data.filter(r => !r.needs_image && r.answer);
const existing = new Set(db.prepare('SELECT stem FROM questions').all().map(r => normStem(r.stem)));
const insert = db.prepare(
  `INSERT INTO questions (subject, chapter, type, difficulty, stem, options, answer, analysis, source)
   VALUES (?,?,?,?,?,?,?,?,?)`
);

let inserted = 0, dup = 0;
for (const q of recoverable) {
  const stem = String(q.stem || '').trim();
  const options = Array.isArray(q.options) ? q.options.filter(Boolean) : [];
  if (!stem || options.length < 2) continue;
  const key = normStem(stem);
  if (existing.has(key)) { dup++; continue; }
  const answer = String(q.answer || '').toUpperCase().replace(/[^A-D]/g, '');
  if (!answer) continue;
  const type = options.length === 2 && /正确|错误/.test(options.join('')) ? 'judge' : (answer.length > 1 ? 'multi' : 'single');
  insert.run(
    q.subject, mapChapter(q.subject, q.chapter), type, inferDifficulty(stem, options),
    stem, JSON.stringify(options), answer, q.analysis || '', String(q.file || '').replace('.txt', '')
  );
  existing.add(key);
  inserted++;
}
console.log(`恢复导入 ${inserted} 题，重复跳过 ${dup} 题`);
const after = db.prepare('SELECT subject, COUNT(*) c FROM questions GROUP BY subject').all();
console.log('题库分布:', JSON.stringify(after));
