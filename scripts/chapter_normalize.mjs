#!/usr/bin/env node
/**
 * 章节名归一化工具
 *
 * 清理题库章节名中的两类历史遗留"文件/来源型"尾缀，使章节名干净统一：
 *   1) 文件型尾缀：.docx / .doc / .do（历史把文件名残留进章节名）
 *   2) 括注型尾注：（解析版）/（原卷版）/(解析版)/(原卷版)——库内所有题均已带解析，
 *      此标注冗余无信息量
 *
 * 处理规则（均可合并或重命名）：
 *   - 若存在"去尾缀后同名"的目标章节 => 把原章节题行合并进目标章节
 *   - 若不存在同名章节             => 直接去掉尾缀重命名
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
 *   - 幂等：重复执行恒为 0 待处理
 *   - 运行前请自行备份数据库(尤其生产)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const dbPath = args.find(a => !a.startsWith('--')) || process.env.DB_PATH;
const apply = args.includes('--apply');
const HELP = '[--apply]';

// 需要清理的尾缀/尾注（按匹配到则剥离，可多重叠加，直至不再匹配）
const STRIP_REG = [
  /\.(?:docx|doc|do)$/,                       // 文件型尾缀
  /[（(]\s*(?:解析版|原卷版)\s*[）)]\s*$/,     // 括注型尾注
];
const LIKE_OR = [
  `(chapter like '%.docx' or chapter like '%.doc' or chapter like '%.do')`,
  `(chapter like '%(解析版)%' or chapter like '%(原卷版)%' or chapter like '%（解析版）%' or chapter like '%（原卷版）%')`,
].join(' or ');
const LABEL = '.docx/.doc/.do + (解析版/原卷版)';

if (!dbPath || !existsSync(dbPath)) {
  console.error(`用法: node chapter_normalize.mjs <数据库路径> ${HELP}\n缺数据库或路径不存在: ${dbPath || ''}`);
  process.exit(1);
}
if (!apply) console.log('⚠️  dry-run 模式：仅预览，不写库。加 --apply 才真正执行。');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout=8000');

// 反复剥离多重尾缀/尾注，返回最终目标名
function stripSuffix(raw) {
  let s = raw.trim();
  for (;;) {
    const next = STRIP_REG.reduce((acc, re) => acc.replace(re, '').trim(), s);
    if (next === s) break;
    s = next;
  }
  return s;
}

const totalBefore = db.prepare('select count(*) n from questions').get().n;
const rows = db.prepare(`select chapter, count(*) n from questions group by chapter having (${LIKE_OR})`).all();

console.log(`数据库: ${dbPath}`);
console.log(`总题数: ${totalBefore} | 待处理章节(${LABEL}): ${rows.length}`);

if (rows.length === 0) {
  console.log(`✅ 无需归一化（无 ${LABEL} 尾缀/尾注章节）`);
  process.exit(0);
}

if (!apply) {
  for (const r of rows) {
    const target = stripSuffix(r.chapter);
    if (!target || target === r.chapter) { console.log(`  ${r.chapter} (${r.n}题) → 跳过(无有效目标)`); continue; }
    const twin = db.prepare('select count(*) n from questions where chapter=?').get(target).n;
    const mode = twin > 0 ? `并入(已有${twin}题)` : '重命名';
    console.log(`  ${r.chapter} (${r.n}题) → ${target} [${mode}]`);
  }
  console.log(`\n共 ${rows.length} 章节。确认后加 --apply 执行。`);
  process.exit(0);
}

console.log('\n开始执行...');
db.exec('BEGIN IMMEDIATE');
let moved = 0;
for (const r of rows) {
  const target = stripSuffix(r.chapter);
  if (!target || target === r.chapter) continue;
  moved += db.prepare('update questions set chapter=? where chapter=?').run(target, r.chapter).changes;
}
db.exec('COMMIT;');

const remain = db.prepare(`select count(*) n from questions where (${LIKE_OR})`).get().n;
const totalAfter = db.prepare('select count(*) n from questions').get().n;
const distinct = db.prepare('select count(distinct chapter) n from questions').get().n;
console.log(JSON.stringify({
  处理章节数: rows.length,
  移动记录: moved,
  残留尾缀章节: remain,
  总题数前后: `${totalBefore} → ${totalAfter}`,
  不同章节数: distinct,
}));
console.log(remain === 0 ? '🎉 归一化完成，无残留文件尾缀/尾注章节' : `⚠️ 仍残留 ${remain} 个，请检查`);