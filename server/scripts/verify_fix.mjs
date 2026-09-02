import Database from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database.DatabaseSync(join(__dirname, '..', 'data', 'saixt.db'));
// 取几道判断题
const judges = db.prepare("SELECT id, subject, chapter, type, stem, options, answer, analysis FROM questions WHERE type='judge' LIMIT 3").all();
for (const q of judges) console.log(JSON.stringify({id:q.id, sub:q.subject, type:q.type, opts:JSON.parse(q.options), ans:q.answer, ana:(q.analysis||'').slice(0,50)}));
// 那条复合题
const c = db.prepare("SELECT id, type, answer FROM questions WHERE id=13187").get();
console.log('13187 ->', JSON.stringify(c));
// 统计仍缺解析的数量
const noAna = db.prepare("SELECT COUNT(*) AS c FROM questions WHERE TRIM(analysis)='' OR analysis IS NULL").get();
console.log('questions without analysis:', noAna.c);
db.close();