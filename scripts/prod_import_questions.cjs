// 生产增量导入新增题库行（只写 questions 表，保留生产用户数据）
// 用法: node prod_import_questions.cjs <json路径>
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');

const DB = '/opt/saixt/server/data/saixt.db';
const JSON_PATH = process.argv[2] || '/tmp/new_questions_export.json';

function norm(s) { return String(s || '').replace(/\s+/g, ''); }

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
const db = new DatabaseSync(DB);
db.exec('PRAGMA busy_timeout=5000');
db.exec('PRAGMA synchronous=FULL');

// 载入生产已有键
const existing = new Set();
for (const r of db.prepare('SELECT subject, stem FROM questions').all()) {
  existing.add(`${r.subject}\u0000${norm(r.stem).slice(0, 50)}`);
}
console.log('生产现有题量:', existing.size);

const ins = db.prepare(
  'INSERT INTO questions (subject, chapter, type, difficulty, stem, options, answer, analysis, source) VALUES (?,?,?,?,?,?,?,?,?)'
);
let inserted = 0, skipped = 0;
db.exec('BEGIN IMMEDIATE');
for (const r of data.rows) {
  const key = `${r.subject}\u0000${norm(r.stem).slice(0, 50)}`;
  if (existing.has(key)) { skipped++; continue; }
  existing.add(key);
  ins.run(r.subject, r.chapter, r.type, r.difficulty, r.stem, r.options, r.answer, r.analysis, r.source);
  inserted++;
}
db.exec('COMMIT');

const final = db.prepare('SELECT COUNT(*) c FROM questions').get().c;
console.log(`插入: ${inserted}, 跳过(生产已存在): ${skipped}`);
console.log(`生产题库总数: ${final}`);
db.close();