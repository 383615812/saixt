import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(join(__dirname, '..', 'data', 'saixt.db'));

const keys = ['轴测图', '空调架', '左视图', '尺寸标注不正确', '俯视图', '榫卯'];
for (const k of keys) {
  const rows = db.prepare("SELECT id, subject, chapter, image, substr(stem,1,40) s FROM questions WHERE stem LIKE ?").all(`%${k}%`);
  console.log(`\n=== ${k} (${rows.length}) ===`);
  for (const r of rows) console.log(`  id=${r.id} | ${r.subject}/${r.chapter} | image=${r.image || '(无)'} | ${r.s}`);
}
