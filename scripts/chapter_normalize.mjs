#!/usr/bin/env node
/**
 * 章节名归一化工具
 *
 * 把题库中因历史导入管线遗留的「.docx 尾缀」章节名清理掉：
 *   - 若存在同名(去 .docx 后)章节 => 题行记录合并进该章节
 *   - 若不存在同名章节       => 直接去掉 .docx 尾缀重命名
 *
 * 用法:
 *   node chapter_normalize.mjs <数据库路径>            # dry-run，仅预览将要改变的行
 *   node chapter_normalize.mjs <数据库路径> --apply    # 真正执行更新
 *
 * 例:
 *   node chapter_normalize.mjs server/data/saixt.db --apply        # 本地
 *   node chapter_normalize.mjs /opt/saixt/server/data/saixt.db    # 生产(dry-run)
 *
 * 安全约束:
 *   - 默认 dry-run，必须显式加 --apply 才会写库
 *   - 全程 BEGIN IMMEDIATE + busy_timeout，避免并发写冲突
 *   - 运行前请自行备份数据库(尤其生产)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const dbPath = args.find(a => !a.startsWith('--')) || process.env.DB_PATH;
const apply = args.includes('--apply');

if (!dbPath) {
  console.error('用法: node chapter_normalize.mjs <数据库路径> [--apply]');
  process.exit(1);
}
if (!existsSync(dbPath)) {
  console.error(`数据库不存在: ${dbPath}`);
  process.exit(1);
}
if (!apply) {
  console.log('⚠️  dry-run 模式：仅预览，不写库。加 --apply 才真正执行。');
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout=8000');

const totalBefore = db.prepare('select count(*) n from questions').get().n;
const rows = db.prepare(
  `select chapter, count(*) n from questions group by chapter having chapter like '%.docx'`
).all();

console.log(`数据库: ${dbPath}`);
console.log(`总题数: ${totalBefore} | 待处理 .docx 章节: ${rows.length}`);

if (rows.length === 0) {
  console.log('✅ 无需归一化（无 .docx 尾缀章节）');
  process.exit(0);
}

if (!apply) {
  for (const r of rows) {
    const target = r.chapter.replace(/\.docx$/, '').trim() || '(空——将跳过)';
    const twin = db.prepare('select count(*) n from questions where chapter=?').get(target).n;
    const mode = twin > 0 ? `并入(已有${twin}题)` : '重命名';
    console.log(`  ${r.chapter} (${r.n}题) → ${target} [${mode}]`);
  }
  console.log(`\n共 ${rows.length} 章节、将影响记录见上。确认后加 --apply 执行。`);
  process.exit(0);
}

console.log('\n开始执行...');
db.exec('BEGIN IMMEDIATE');
let moved = 0;
for (const r of rows) {
  const target = r.chapter.replace(/\.docx$/, '').trim();
  if (!target) continue; // 防御：纯 ".docx" 这类空章节名跳过，交给空章节治理
  const info = db.prepare('update questions set chapter=? where chapter=?').run(target, r.chapter);
  moved += info.changes;
}
db.exec('COMMIT;');

const remain = db.prepare("select count(*) n from questions where chapter like '%.docx'").get().n;
const totalAfter = db.prepare('select count(*) n from questions').get().n;
const distinct = db.prepare('select count(distinct chapter) n from questions').get().n;
console.log(JSON.stringify({
  处理章节数: rows.length,
  移动记录: moved,
  残留docx章节: remain,
  总题数前后: `${totalBefore} → ${totalAfter}`,
  不同章节数: distinct,
}));
console.log(remain === 0 ? '🎉 归一化完成，无残留 .docx 章节' : `⚠️ 仍残留 ${remain} 个 .docx 章节，请检查`);