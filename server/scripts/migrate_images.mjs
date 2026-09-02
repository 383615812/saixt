import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(join(__dirname, '..', 'data', 'saixt.db'));

// 检查现有列
const cols = db.prepare("PRAGMA table_info(questions)").all();
console.log('questions 表列:');
for (const c of cols) console.log(`  ${c.name} (${c.type})`);

if (!cols.some(c => c.name === 'images')) {
  db.exec("ALTER TABLE questions ADD COLUMN images TEXT");
  console.log('\n已添加 images 列');
} else {
  console.log('\nimages 列已存在');
}

// 将现有 image 同步到 images（单图）
const rows = db.prepare("SELECT id, image FROM questions WHERE image IS NOT NULL AND image != ''").all();
let n = 0;
for (const r of rows) {
  db.prepare("UPDATE questions SET images = ? WHERE id = ?").run(JSON.stringify([r.image]), r.id);
  n++;
}
console.log(`已同步 ${n} 题的 images 字段`);
