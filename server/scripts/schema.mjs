import Database from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database.DatabaseSync(join(__dirname, '..', 'data', 'saixt.db'));
const cols = db.prepare("PRAGMA table_info(questions)").all();
console.log('QUESTIONS COLS:', JSON.stringify(cols, null, 2));
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('TABLES:', JSON.stringify(tables));
for (const t of ['questions']) {
  try {
    const r = db.prepare("SELECT * FROM questions LIMIT 1").get();
    console.log('SAMPLE ROW', t, ':', JSON.stringify(r, null, 2));
  } catch (e) { console.log('sample err', t, e.message); }
}
db.close();