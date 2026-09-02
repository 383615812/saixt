import { DatabaseSync } from 'node:sqlite';
import { existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(join(__dirname, '..', 'data', 'saixt.db'));
const publicDir = join(__dirname, '..', 'public');

const total = db.prepare('SELECT COUNT(*) AS c FROM questions').get().c;
const withImg = db.prepare("SELECT COUNT(*) AS c FROM questions WHERE image IS NOT NULL AND image != ''").get().c;
const missingAns = db.prepare("SELECT COUNT(*) AS c FROM questions WHERE answer IS NULL OR answer = ''").get().c;
const missingAna = db.prepare("SELECT COUNT(*) AS c FROM questions WHERE analysis IS NULL OR analysis = ''").get().c;
const missingChapter = db.prepare("SELECT COUNT(*) AS c FROM questions WHERE chapter IS NULL OR chapter = ''").get().c;

console.log('=== 题库总览 ===');
console.log('题目总数:', total);
console.log('带图片题目:', withImg);
console.log('缺答案:', missingAns);
console.log('缺解析:', missingAna);
console.log('缺章节:', missingChapter);

console.log('\n=== 图片文件校验 ===');
const imgRows = db.prepare("SELECT id, subject, chapter, image FROM questions WHERE image IS NOT NULL AND image != '' ORDER BY id").all();
let missing = 0;
for (const r of imgRows) {
  const p = join(publicDir, r.image);
  if (!existsSync(p)) {
    console.log('缺失文件:', r.id, r.image);
    missing++;
  }
}
console.log('带图题目数:', imgRows.length, '| 文件缺失:', missing);

console.log('\n=== 各来源图片题分布 ===');
const bySrc = db.prepare("SELECT source, COUNT(*) AS c FROM questions WHERE image IS NOT NULL AND image != '' GROUP BY source ORDER BY c DESC").all();
for (const s of bySrc) console.log(' ', s.source, ':', s.c, '题');

console.log('\n=== 答案分布 ===');
const ansDist = db.prepare("SELECT answer, COUNT(*) AS c FROM questions WHERE image IS NOT NULL AND image != '' GROUP BY answer ORDER BY c DESC").all();
for (const a of ansDist) console.log(' ', a.answer || '(空)', ':', a.c);
