// 会考题目导入脚本：将 parsed_huikao.json 导入 saixt.db
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'saixt.db');
const JSON_PATH = join(__dirname, '..', '..', 'exam_papers', 'parsed_huikao.json');

const db = new DatabaseSync(DB_PATH);

// 读取并去重
const raw = JSON.parse(readFileSync(JSON_PATH, 'utf-8'));
const seen = new Set();
const items = [];
for (const q of raw) {
  const key = `${q.subject}\u0000${q.stem.trim()}\u0000${JSON.stringify(q.options)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  items.push(q);
}

// 类型推断
function inferType(q) {
  if (!q.options || q.options.length === 0) return 'subjective';
  const ans = (q.answer || '').trim().toUpperCase();
  const letters = ans.replace(/[^A-H]/g, '');
  if (letters.length >= 2) return 'multiple';
  return 'single';
}

// 选项转 "A. xxx" 格式
function fmtOptions(opts) {
  return opts.map(([letter, text]) => `${letter}. ${text}`);
}

// 当前最大 id
const maxId = db.prepare('SELECT COALESCE(MAX(id),0) AS m FROM questions').get().m;
let id = maxId;

const insert = db.prepare(
  `INSERT INTO questions (id, subject, chapter, type, difficulty, stem, options, answer, analysis, source)
   VALUES (?,?,?,?,?,?,?,?,?,?)`
);

db.exec('BEGIN');
let ok = 0, err = 0;
for (const q of items) {
  id += 1;
  try {
    insert.run(
      id,
      q.subject,
      q.chapter,
      inferType(q),
      1,
      q.stem,
      JSON.stringify(fmtOptions(q.options)),
      q.answer,
      q.analysis,
      q.source
    );
    ok += 1;
  } catch (e) {
    err += 1;
    if (err <= 5) console.log('[ERR]', e.message, q.subject, q.stem.slice(0, 30));
  }
}
db.exec('COMMIT');

const total = db.prepare('SELECT COUNT(*) AS c FROM questions').get().c;
console.log(`原始 ${raw.length} 条，去重后 ${items.length} 条`);
console.log(`成功导入 ${ok} 条，失败 ${err} 条`);
console.log(`数据库题目总数: ${total}`);
db.close();
