// 只读数据库完整性体检脚本（不写、不改、不删）
// 用法: node scripts/audit-data.mjs [db路径]  默认 data/saixt.db
// 设计：动态读取表/列，对可疑列做通用体检，并做常见外键孤儿检查。
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB = process.argv[2] || path.join(here, '..', 'data', 'saixt.db');

let db;
try {
  db = new DatabaseSync(DB, { readOnly: true });
} catch (e) {
  console.error('无法以只读方式打开数据库:', DB, '\n', e.message);
  process.exit(2);
}

const out = [];
const L = (s = '') => out.push(s);
const ok = (s) => L(`  ✅ ${s}`);
const warn = (s) => L(`  ⚠️  ${s}`);
const err = (s) => L(`  ❌ ${s}`);

function all(sql, params = []) {
  try { return db.prepare(sql).all(...params); } catch (e) { return null; }
}
function one(sql, params = []) {
  try { return db.prepare(sql).get(...params); } catch (e) { return null; }
}
function colsOf(table) {
  const r = all(`PRAGMA table_info("${table}")`) || [];
  return r.map((x) => x.name);
}

L(`# 数据库完整性体检`);
L(`库文件: ${DB}`);

// 1) 表清单 + 行数
L(`\n## 1. 表清单与行数`);
const tables = all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`) || [];
L(`共 ${tables.length} 张表`);
for (const { name } of tables) {
  const r = one(`SELECT COUNT(*) c FROM "${name}"`);
  L(`- ${name}: ${(r && r.c) || 0}`);
}

// 2) 通用列体检
L(`\n## 2. 可疑列体检（超长 / 非法 / 负 / NULL / 重复）`);
const checkLen = ['nickname', 'content', 'answer', 'name', 'title', 'remark', 'intro'];
const checkPhone = ['phone'];
const checkNum = ['points', 'score', 'balance', 'price', 'amount'];
const checkEnum = ['type', 'status', 'kind', 'role'];
const checkNull = ['chapter', 'subject', 'content', 'answer', 'user_id', 'question_id'];
const checkDup = ['invite_code', 'phone'];

for (const { name } of tables) {
  const cols = colsOf(name);
  if (!cols.length) continue;
  let did = false;
  const line = (tag, msg) => { if (!did) { L(`\n### ${name}`); did = true; } L(`  ${tag} ${msg}`); };

  for (const c of checkLen) {
    if (cols.includes(c)) {
      const r = one(`SELECT MAX(LENGTH("${c}")) m, SUM(CASE WHEN LENGTH("${c}")>24 THEN 1 ELSE 0 END) big FROM "${name}"`);
      if (r) {
        if (r.big > 0) warn(`${c}: 最长 ${r.m} 字符，超长(>24) ${r.big} 行`);
        else ok(`${c}: 最长 ${r.m} 字符，无超长`);
      }
    }
  }
  for (const c of checkPhone) {
    if (cols.includes(c)) {
      const r = one(`SELECT SUM(CASE WHEN "${c}" IS NULL OR "${c}" NOT GLOB '1[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' THEN 1 ELSE 0 END) bad FROM "${name}"`);
      if (r && r.bad > 0) err(`${c}: ${r.bad} 行格式非法`); else if (r) ok(`${c}: 全部合法`);
    }
  }
  for (const c of checkNum) {
    if (cols.includes(c)) {
      const r = one(`SELECT SUM(CASE WHEN "${c}"<0 THEN 1 ELSE 0 END) neg, MIN("${c}") mn, MAX("${c}") mx FROM "${name}"`);
      if (r) {
        if (r.neg > 0) err(`${c}: ${r.neg} 行负数 (min ${r.mn})`);
        else ok(`${c}: 无负数 (范围 ${r.mn}~${r.mx})`);
      }
    }
  }
  for (const c of checkEnum) {
    if (cols.includes(c)) {
      const r = all(`SELECT "${c}" v, COUNT(*) c FROM "${name}" GROUP BY "${c}" ORDER BY c DESC`);
      if (r && r.length) line('枚举', `${c}: ` + r.map((x) => `${JSON.stringify(x.v)}=${x.c}`).join(', '));
    }
  }
  for (const c of checkNull) {
    if (cols.includes(c)) {
      const r = one(`SELECT SUM(CASE WHEN "${c}" IS NULL OR "${c}"='' THEN 1 ELSE 0 END) n FROM "${name}"`);
      if (r && r.n > 0) warn(`${c}: ${r.n} 行 NULL/空`); else if (r) ok(`${c}: 无 NULL/空`);
    }
  }
  for (const c of checkDup) {
    if (cols.includes(c)) {
      const r = all(`SELECT "${c}" v, COUNT(*) c FROM "${name}" WHERE "${c}" IS NOT NULL GROUP BY "${c}" HAVING COUNT(*)>1 LIMIT 20`);
      if (r && r.length) err(`${c}: 发现 ${r.length} 组重复 (示例 ${r.slice(0,5).map((x)=>`${JSON.stringify(x.v)}×${x.c}`).join(', ')})`);
      else if (r) ok(`${c}: 无重复`);
    }
  }
}

// 3) 外键孤儿（基于命名推断，表/列不存在则跳过）
L(`\n## 3. 外键孤儿检查`);
const orphans = [
  { name: 'user_profiles.user_id → users.id', sql: `SELECT COUNT(*) c FROM user_profiles p WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=p.user_id)` },
  { name: 'invite.inviter_id → users.id', sql: `SELECT COUNT(*) c FROM invite i WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=i.inviter_id)` },
  { name: 'invite.invitee_id → users.id', sql: `SELECT COUNT(*) c FROM invite i WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=i.invitee_id)` },
  { name: 'practice_records.user_id → users.id', sql: `SELECT COUNT(*) c FROM practice_records r WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=r.user_id)` },
  { name: 'practice_records.question_id → questions.id', sql: `SELECT COUNT(*) c FROM practice_records r WHERE NOT EXISTS (SELECT 1 FROM questions q WHERE q.id=r.question_id)` },
  { name: 'orders.user_id → users.id', sql: `SELECT COUNT(*) c FROM orders o WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=o.user_id)` },
  { name: 'points_log.user_id → users.id', sql: `SELECT COUNT(*) c FROM points_log l WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=l.user_id)` },
];
for (const o of orphans) {
  const r = one(o.sql);
  if (r == null) { L(`  (跳过) ${o.name} — 表/列不存在`); continue; }
  if (r.c > 0) err(`${o.name}: ${r.c} 条孤儿`); else ok(`${o.name}: 无孤儿`);
}

// 4) 完整性结论
L(`\n## 4. 结论`);
const hasErr = out.some((s) => s.includes('❌'));
const hasWarn = out.some((s) => s.includes('⚠️'));
if (!hasErr && !hasWarn) L('未发现明显数据完整性问题。');
else if (!hasErr) L('无致命问题（❌），仅有需关注项（⚠️），见上。');
else L('发现致命数据问题（❌），建议修复后复查。');

console.log(out.join('\n'));
