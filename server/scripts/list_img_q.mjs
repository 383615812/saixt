import { db } from '../src/db.js';

const rows = db.prepare("SELECT id, subject, chapter, image, substr(stem,1,40) AS s FROM questions WHERE image IS NOT NULL AND image != '' ORDER BY id").all();
console.log('带图题数量:', rows.length);
for (const r of rows) console.log(`${r.id} | ${r.subject}/${r.chapter} | ${r.image} | ${r.s}`);
