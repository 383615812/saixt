// 数据库完整性门禁：结构约束 + 脏数据 + 外键孤儿检查。
// 纯 node 内置(node:sqlite)，无第三方依赖。用法：
//   node server/scripts/ci/db-integrity.cjs            # 默认 server/data/saixt.db
//   DB_PATH=/opt/saixt/server/data/saixt.db node ...   # 指定库文件
const { join } = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || join(__dirname, '..', '..', 'data', 'saixt.db');

let db;
try {
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode=WAL');
} catch (e) {
  console.error(`✗ 无法打开数据库 ${DB_PATH}: ${e.message}`);
  process.exit(1);
}
const q = (s, ...a) => db.prepare(s).get(...a);
const hasTable = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);

let pass = 0, fail = 0;
const add = (label, ok, detail) => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✓' : '✗'} ${label}${detail !== undefined ? ` → ${detail}` : ''}`);
};

add('基础表存在', hasTable('questions') && hasTable('users') && hasTable('practice_records'));
if (hasTable('schools')) add('schools 非空', q('SELECT COUNT(*) c FROM schools').c > 0, q('SELECT COUNT(*) c FROM schools').c);
if (hasTable('plans')) {
  add('plans 非空', q('SELECT COUNT(*) c FROM plans').c > 0, q('SELECT COUNT(*) c FROM plans').c);
  add('plans 无 tuition=0', q('SELECT COUNT(*) c FROM plans WHERE tuition IS NOT NULL AND tuition=0').c === 0,
    `${q('SELECT COUNT(*) c FROM plans WHERE tuition IS NOT NULL AND tuition=0').c} 条`);
}
if (hasTable('schools') && db.prepare('PRAGMA table_info(schools)').all().some((c) => c.name === 'estimate_score')) {
  const e = q('SELECT SUM(estimate_score IS NOT NULL) e, COUNT(*) c FROM schools');
  add('schools 预估分覆盖', e.e >= 46, `${e.e}/${e.c}`);
}

if (hasTable('questions')) {
  add('题目无空 chapter', q("SELECT COUNT(*) c FROM questions WHERE chapter IS NULL OR chapter=''").c === 0, 'y');
  add('题目无空 subject', q("SELECT COUNT(*) c FROM questions WHERE subject IS NULL OR subject=''").c === 0, 'y');
}
if (hasTable('practice_records')) {
  if (hasTable('users')) add('作答记录无孤儿 user',
    q('SELECT COUNT(*) c FROM practice_records r LEFT JOIN users u ON u.id=r.user_id WHERE u.id IS NULL').c === 0,
    `${q('SELECT COUNT(*) c FROM practice_records r LEFT JOIN users u ON u.id=r.user_id WHERE u.id IS NULL').c} 条`);
  if (hasTable('questions')) add('作答记录无孤儿 question',
    q('SELECT COUNT(*) c FROM practice_records r LEFT JOIN questions qu ON qu.id=r.question_id WHERE qu.id IS NULL').c === 0,
    `${q('SELECT COUNT(*) c FROM practice_records r LEFT JOIN questions qu ON qu.id=r.question_id WHERE qu.id IS NULL').c} 条`);
}

console.log(`\n==== 数据库完整性门禁：${pass} 通过, ${fail} 失败 ====`);
process.exit(fail ? 1 : 0);