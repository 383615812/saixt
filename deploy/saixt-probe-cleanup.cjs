#!/usr/bin/env node
/**
 * 清理春招（saixt）巡检探测账号
 *
 * 背景：health-check-3sites.sh 第 10 段会真的注册一个探测账号，以对
 *       register → login → 鉴权接口 做**真实**回归（只测 200 无法证明链路可用）。
 *
 * 难点 1：探测账号原先用 `name` 字段传昵称，但注册接口读的是 `nickname`
 *         ⇒ 昵称被忽略，落库退化成「考生+手机尾号4位」，**与真实用户完全无法区分**，
 *         清理时必须靠「精确手机号」而非模式匹配。
 *         （已在 health-check 改为传 nickname=巡检探测，今后可按昵称精确识别。）
 * 难点 2：users 被 27 个子表外键引用（user_profiles/checkins/points/...），
 *         只删 users 会留下孤儿行。
 *
 * 安全原则：**只删明确指认的账号**
 *   - 默认按 nickname='巡检探测'（改动后新产生的探测账号，真实用户不会用这个昵称）
 *   - 或由命令行显式给出手机号（health-check 本机运行时用这条）
 *   - 绝不按「考生xxxx」这类会命中真实用户的模式删除
 *
 * 用法：
 *   saixt-probe-cleanup.cjs --dry-run
 *   saixt-probe-cleanup.cjs --phone 19991472276 --phone 19991475475
 *   saixt-probe-cleanup.cjs                 # 删 nickname='巡检探测'
 */
'use strict';
const { DatabaseSync } = require('node:sqlite');

const DB = process.env.SAIXT_DB || '/opt/saixt/server/data/saixt.db';
const PROBE_NICK = process.env.SAIXT_PROBE_NICK || '巡检探测';

const args = process.argv.slice(2);
let dry = false;
const phones = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry-run') dry = true;
  else if (args[i] === '--phone') phones.push(String(args[++i] || '').trim());
  else if (args[i] === '--help') {
    console.log('用法: saixt-probe-cleanup.cjs [--dry-run] [--phone <11位手机号> ...]');
    process.exit(0);
  }
}

const db = new DatabaseSync(DB);
db.exec('PRAGMA busy_timeout = 8000');

// ---- 选取目标账号 ----
let targets = [];
if (phones.length) {
  const ph = phones.filter(Boolean);
  const marks = ph.map(() => '?').join(',');
  targets = db.prepare(`SELECT id, phone, nickname, created_at FROM users WHERE phone IN (${marks})`).all(...ph);
  if (targets.length !== ph.length) {
    const found = new Set(targets.map(t => t.phone));
    console.log('提示: 以下手机号在库中不存在（可能已被清理）: ' + ph.filter(p => !found.has(p)).join(', '));
  }
} else {
  targets = db.prepare('SELECT id, phone, nickname, created_at FROM users WHERE nickname = ?').all(PROBE_NICK);
}

console.log(`库: ${DB}`);
console.log(`探测账号（${phones.length ? '按手机号指认' : `按昵称 '${PROBE_NICK}'`}）: ${targets.length} 个`);
for (const t of targets) console.log(`  id=${t.id} phone=${t.phone} nick=${t.nickname} at=${t.created_at}`);
if (!targets.length) { console.log('无需清理'); db.close(); process.exit(0); }

// ---- 外键图：所有指向 users 的子表列 ----
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
const kids = [];
for (const t of tables) {
  if (t === 'users') continue;
  let fks = [];
  try { fks = db.prepare(`PRAGMA foreign_key_list(${t})`).all(); } catch (e) { /* ignore */ }
  for (const fk of fks) if (fk.table === 'users') kids.push({ t, col: fk.from });
}
console.log(`\n子表外键列: ${kids.length} 个`);

const COL = c => '"' + String(c).replace(/"/g, '""') + '"';
const TBL = t => '"' + String(t).replace(/"/g, '""') + '"';

let totalKids = 0;
const plan = [];
for (const u of targets) {
  const per = [];
  for (const k of kids) {
    let n = 0;
    try { n = db.prepare(`SELECT count(*) c FROM ${TBL(k.t)} WHERE ${COL(k.col)} = ?`).get(u.id).c; } catch (e) { n = 0; }
    if (n > 0) per.push(`${k.t}.${k.col}=${n}`);
  }
  totalKids += per.reduce((a, s) => a + Number(s.split('=')[1]), 0);
  plan.push({ u, per });
}
for (const p of plan) console.log(`  id=${p.u.id} 子表行: ${p.per.length ? p.per.join(', ') : '(无)'}`);

if (dry) { console.log('\n--dry-run：未删除任何数据'); db.close(); process.exit(0); }

// ---- 执行：先删子表行，再删 users（同一事务）----
db.exec('BEGIN');
let delKids = 0, delUsers = 0;
try {
  for (const p of plan) {
    for (const k of kids) {
      const info = db.prepare(`DELETE FROM ${TBL(k.t)} WHERE ${COL(k.col)} = ?`).run(p.u.id);
      delKids += Number(info.changes || 0);
    }
    delUsers += Number(db.prepare('DELETE FROM users WHERE id = ?').run(p.u.id).changes || 0);
  }
  db.exec('COMMIT');
  console.log(`\n✓ 已删除子表行 ${delKids} 行，users ${delUsers} 行`);
} catch (e) {
  db.exec('ROLLBACK');
  console.error(`✗ 删除失败已回滚: ${e.name} ${e.message}`);
  db.close();
  process.exit(1);
}

const left = phones.length
  ? db.prepare(`SELECT count(*) c FROM users WHERE phone IN (${phones.map(() => '?').join(',')})`).get(...phones).c
  : db.prepare('SELECT count(*) c FROM users WHERE nickname = ?').get(PROBE_NICK).c;
console.log(left === 0 ? '✓ 复查：目标账号已全部清除' : `⚠ 复查：仍有 ${left} 个残留`);
db.close();
process.exit(left === 0 ? 0 : 1);
