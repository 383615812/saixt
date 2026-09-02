import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(join(__dirname, '..', 'data', 'saixt.db'));

const total = db.prepare('SELECT COUNT(*) c FROM questions').get();
const withImg = db.prepare("SELECT COUNT(*) c FROM questions WHERE image IS NOT NULL AND image != ''").get();
console.log('总题数:', total.c, '带图题:', withImg.c);

const bySubject = db.prepare('SELECT subject, COUNT(*) c FROM questions GROUP BY subject ORDER BY c DESC').all();
console.log('\n按科目:');
for (const r of bySubject) console.log(`  ${r.subject}: ${r.c}`);

const byChapter = db.prepare("SELECT subject, chapter, COUNT(*) c FROM questions WHERE chapter IS NULL OR chapter = '' GROUP BY subject").all();
console.log('\n无章节题:');
for (const r of byChapter) console.log(`  ${r.subject}: ${r.c}`);

const noAns = db.prepare("SELECT COUNT(*) c FROM questions WHERE answer IS NULL OR answer = ''").get();
console.log('\n无答案题:', noAns.c);

const noAnalysis = db.prepare("SELECT COUNT(*) c FROM questions WHERE analysis IS NULL OR analysis = ''").get();
console.log('无解析题:', noAnalysis.c);
