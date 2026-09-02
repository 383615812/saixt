import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/db.js';

const PARSED_DIR = 'E:/saixt/exam_papers/parsed';

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
  for (const m of CHAPTER_MAP) {
    if (m.re.test(chapter)) return m.to;
  }
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
  // 涉及计算、进制转换、程序运行结果等偏难
  if (/计算|容量|大小|二进制|十六进制|十进制|运行.*结果|输出|表达式|存储|采样|量化|换算/.test(text)) return 3;
  if (/下列.*不正确|不正确|错误|不属于|不包括|不恰当|不是/.test(text)) return 2;
  return 1;
}

function main() {
  const files = readdirSync(PARSED_DIR).filter(f => f.endsWith('.json'));
  const insert = db.prepare(
    `INSERT INTO questions (subject, chapter, type, difficulty, stem, options, answer, analysis, source)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const existing = new Set();
  for (const r of db.prepare('SELECT stem FROM questions').all()) {
    existing.add(normStem(r.stem));
  }

  let total = 0, skippedImage = 0, skippedDup = 0, inserted = 0, insertedImage = 0;
  const bySubject = {};

  for (const f of files) {
    const data = JSON.parse(readFileSync(join(PARSED_DIR, f), 'utf-8'));
    const subject = data.subject;
    const source = data.file.replace('.txt', '');
    for (const q of data.questions || []) {
      total++;
      const stem = String(q.stem || '').trim();
      if (!stem) continue;
      const options = Array.isArray(q.options) ? q.options.filter(Boolean) : [];
      if (options.length < 2) continue;

      const key = normStem(stem);
      if (existing.has(key)) { skippedDup++; continue; }

      const needsImage = !!q.needs_image;
      const answer = String(q.answer || '').toUpperCase().replace(/[^A-D]/g, '');
      if (needsImage) {
        // 图片题先不导入，单独统计
        skippedImage++;
        continue;
      }
      if (!answer) continue;

      const type = options.length === 2 && /正确|错误/.test(options.join('')) ? 'judge' : (answer.length > 1 ? 'multi' : 'single');
      const chapter = mapChapter(subject, q.chapter);
      const difficulty = inferDifficulty(stem, options);

      insert.run(subject, chapter, type, difficulty, stem, JSON.stringify(options), answer, q.analysis || '', source);
      existing.add(key);
      inserted++;
      bySubject[subject] = (bySubject[subject] || 0) + 1;
    }
  }

  console.log(`总提取: ${total}`);
  console.log(`图片题(跳过): ${skippedImage}`);
  console.log(`重复(跳过): ${skippedDup}`);
  console.log(`成功导入: ${inserted}`);
  console.log('按科目:', JSON.stringify(bySubject));

  const after = db.prepare('SELECT subject, COUNT(*) c FROM questions GROUP BY subject').all();
  console.log('导入后题库分布:', JSON.stringify(after));
}

main();
