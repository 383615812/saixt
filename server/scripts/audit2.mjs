import Database from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database.DatabaseSync(join(__dirname, '..', 'data', 'saixt.db'));
const judgeNoOpts = db.prepare("SELECT id, subject, chapter, type, stem, options, answer, analysis FROM questions WHERE type='judge'").all();
console.log('judge total:', judgeNoOpts.length);
const withOpts = judgeNoOpts.filter(r => { try { return JSON.parse(r.options||'[]').length>0; } catch(e){ return false; } });
const withoutOpts = judgeNoOpts.filter(r => { try { return JSON.parse(r.options||'[]').length===0; } catch(e){ return true; } });
console.log('judge with options:', withOpts.length, '| without options:', withoutOpts.length);
console.log('\n--- sample judge WITH options (to know format) ---');
for (const r of withOpts.slice(0,3)) console.log(JSON.stringify({id:r.id, options:r.options, answer:r.answer, analysis:(r.analysis||'').slice(0,60)}));
console.log('\n--- sample judge WITHOUT options (answers distribution) ---');
const ansCount={};
for (const r of withoutOpts) { const a=(r.answer||'').trim(); ansCount[a]=(ansCount[a]||0)+1; }
console.log('answer distribution:', JSON.stringify(ansCount));
console.log('\n--- sample WITHOUT options full rows ---');
for (const r of withoutOpts.slice(0,3)) console.log(JSON.stringify({id:r.id, stem:(r.stem||'').slice(0,50), options:r.options, answer:r.answer, analysis:(r.analysis||'').slice(0,50)}));
console.log('\n--- complex single 13187 ---');
console.log(JSON.stringify(db.prepare("SELECT * FROM questions WHERE id=13187").get()));
// also check: any single/multiple that have multi-part answer "(1)..."
const complexSingle = db.prepare("SELECT id, subject, type, answer, stem FROM questions WHERE type IN ('single','multiple') AND answer LIKE '%(%'").all();
console.log('\n--- complex answers in single/multiple ---', complexSingle.length);
for (const r of complexSingle.slice(0,10)) console.log(JSON.stringify({id:r.id,type:r.type,ans:(r.answer||'').slice(0,60),q:(r.stem||'').slice(0,40)}));
db.close();