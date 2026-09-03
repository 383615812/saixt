#!/usr/bin/env node
/**
 * 固定映射章节归并执行器
 * 读取 merge_map_*.json（手工/半自动制作的 {subject,from,to} 映射清单），把 from 章节题行并入 to 章节。
 * 用于跨命名体系的"语义级"归并（非启发式，映射表由人工确认）。
 *
 * 用法:
 *   node merge_mapped.mjs <数据库路径> <映射文件> [--apply]
 *     --apply   执行；缺省 dry-run 预览
 * 安全:
 *   - 默认只读，--apply 才写；BEGIN IMMEDIATE 事务 + busy_timeout
 *   - 执行前校验每个 from 在本库确实存在(且非空)、to 存在；缺失会终止，避免误并
 *   - 幂等：重复执行源 from 已不存在 → 0 移动并提示跳过
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const dbPath = args.find((a, i) => !a.startsWith('--') && typeof a === 'string' && (i === 0 || args[i - 1]?.startsWith('--'))) || args[0];
const mapPath = args.find(a => a.endsWith('.json'));
const apply = args.includes('--apply');

if (!dbPath || !mapPath || !existsSync(dbPath) || !existsSync(mapPath)) {
  console.error('用法: node merge_mapped.mjs <数据库路径> <merge_map_*.json> [--apply]');
  process.exit(1);
}
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
if (!Array.isArray(map)) { console.error('映射文件须为数组'); process.exit(1); }

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout=8000');

console.log(`数据库: ${dbPath} | 映射: ${map.length} 条`);
console.log(apply ? '--- 执行模式 ---' : '⚠️  dry-run 模式，加 --apply 才写库');

// 校验：from 需在本库存在(>0 题)且非空，to 需存在
const missing = [];
for (const m of map) {
  const f = db.prepare('select count(*) c from questions where chapter=?').get(m.from).c;
  const t = db.prepare('select count(*) c from questions where chapter=?').get(m.to).c;
  if (f === 0) missing.push(`${m.subject}|from缺失: ${m.from}`);
  if (t === 0) missing.push(`${m.subject}|to缺失: ${m.to}`);
  if (m.to === m.from) missing.push(`${m.subject}|from==to: ${m.from}`);
}
if (missing.length) {
  console.log('校验失败，终止：');
  for (const x of missing) console.log('  ' + x);
  process.exit(1);
}

let willMove = 0;
for (const m of map) willMove += db.prepare('select count(*) c from questions where chapter=?').get(m.from).c;

if (!apply) {
  console.log(`将并入 ${willMove} 题:`);
  let cur = '';
  for (const m of map) {
    const n = db.prepare('select count(*) c from questions where chapter=?').get(m.from).c;
    if (m.subject !== cur) { cur = m.subject; console.log(`\n【${cur}】`); }
    console.log(`  ${m.from} (${n}) → ${m.to}`);
  }
  process.exit(0);
}

console.log('开始执行...');
db.exec('BEGIN IMMEDIATE');
let moved = 0;
for (const m of map) {
  moved += db.prepare('update questions set chapter=? where chapter=?').run(m.to, m.from).changes;
}
db.exec('COMMIT');

// 复验
let leftover = 0;
for (const m of map) leftover += db.prepare('select count(*) c from questions where chapter=?').get(m.from).c;
const total = db.prepare('select count(*) n from questions').get().n;
const distinct = db.prepare('select count(distinct chapter) n from questions').get().n;
console.log(JSON.stringify({ 映射条数: map.length, 移动行: moved, 残留来源行: leftover, 总题数: total, 不同章节数: distinct }));
console.log(moved === willMove && leftover === 0 ? '✅ 全部归并完成' : `⚠️ 期望移动${willMove} 实际${moved} 残留${leftover}`);