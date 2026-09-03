#!/usr/bin/env node
/**
 * 章节语义归并工具（保守版）
 *
 * 把题库中因历史多种命名体系（专题0N / 专题一 / 第N讲 / 第N章 / 考点巩固卷0N /
 * 单元提升卷0N / 通关卷0N / 考点通关卷0N 等）而"同名异构"的碎片章节，归并为一个
 * 规范章节名，消除章节计数摊薄、缓解知识图谱近似重复节点。
 *
 * 归并判定（保守，仅合并"同一课程章节被多套编号体系重复导入"）：
 *   - 同科目内，剥离开头编号前缀后，"核心名"完全相同的一组章节才进入归并；
 *   - 排除英语"阅读理解"子类型组（应用文/记叙文/说明文/议论文/新闻报道 为有意细分）；
 *   - canonical 目标名：
 *       · 信息技术：真题章节以裸名为主，取题量最大的成员名；
 *       · 其他科目：组内存在阿拉伯 "专题N" 成员时，选其中题量最大者（统一为阿拉伯专题0N
 *         风格）；否则取题量最大者（多为考点巩固卷/单元提升卷/中文专题等既有规范名）。
 *
 * 用法:
 *   node chapter_merge.mjs <数据库路径> [--apply] [--json]
 *     <db>       必填，SQLite 数据库路径（也支持 DB_PATH 环境变量）
 *     --apply    执行归并；缺省为 dry-run 仅预览，不写库
 *     --json     仅输出归并计划 JSON，便于脚本化对接
 *
 * 例:
 *   node chapter_merge.mjs server/data/saixt.db                    # 本地 dry-run
 *   node chapter_merge.mjs server/data/saixt.db --apply            # 本地执行
 *   node chapter_merge.mjs /opt/saixt/server/data/saixt.db --apply # 生产执行
 *
 * 安全约束:
 *   - 默认只读，必须显式 --apply 才改写 questions.chapter；
 *   - 全程 BEGIN IMMEDIATE + busy_timeout，规避并发写冲突；
 *   - 只改 questions.chapter 一列，不影响用户数据；
 *   - 幂等：重复执行恒为 0 归并；不改动题量。
 *   - 运行前建议先行备份数据库（尤其生产）。
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const HELP = '[--apply] [--json]';
const args = process.argv.slice(2);
const dbPath = args.find(a => !a.startsWith('--')) || process.env.DB_PATH;
const apply = args.includes('--apply');
const json = args.includes('--json');

if (!dbPath || !existsSync(dbPath)) {
  console.error(`用法: node chapter_merge.mjs <数据库路径> ${HELP}\n缺数据库或路径不存在: ${dbPath || ''}`);
  process.exit(1);
}

// 剥离开头编号前缀，保留描述性核心名（用于识别"同名异构"碎片）
function coreName(raw) {
  let s = raw.trim();
  s = s.replace(/[（(].*?[）)]/g, '').trim();
  s = s.replace(/^(?:专题考点巩固卷|专题考点通关卷|考点巩固卷|考点通关卷|单元提升卷|热点专项|通关卷|专题|第|卷)?[0-9一二三四五六七八九十]{1,3}(?:讲|卷|章|节|部分)?[、.\s]*/, '');
  s = s.replace(/^\d{1,2}\s*第[一二三四五六七八九十]{0,3}(章|节|部分|讲)\s*/, '');
  s = s.replace(/^第[一二三四五六七八九十]{0,3}(章|节|部分|讲|题)\s*/, '').trim();
  return s;
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout=8000');
const rows = db.prepare('select subject, chapter, count(*) n from questions group by subject, chapter').all();
rows.forEach(r => r.core = coreName(r.chapter));

const groups = new Map();
for (const r of rows) {
  if (!r.core || r.core.length < 2) continue;
  const k = `${r.subject}||${r.core}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

// 英语"阅读理解"子类型为有意细分，保留不合并
const SUBTYPE_RE = /（应用文|记叙文|说明文|议论文|新闻报道/;
const merges = [];
for (const g of groups.values()) {
  if (g.length < 2 || g.some(r => SUBTYPE_RE.test(r.chapter))) continue;
  const subj = g[0].subject;
  let canonical;
  if (subj === '信息技术') {
    canonical = g.reduce((a, b) => b.n > a.n ? b : a, g[0]);
  } else {
    const arabic = g.filter(r => /^专题\s*\d[0-9]*\s/.test(r.chapter));
    const pool = arabic.length ? arabic : g;
    canonical = pool.reduce((a, b) => b.n > a.n ? b : a, pool[0]);
  }
  for (const r of g) if (r.chapter !== canonical.chapter) merges.push({ from: r.chapter, to: canonical.chapter, subject: r.subject, rows: r.n });
}
const totalRows = merges.reduce((s, m) => s + m.rows, 0);

if (json) { console.log(JSON.stringify(merges)); process.exit(0); }
console.log(`数据库: ${dbPath}`);
console.log(`归并对=${merges.length}, 受影响行=${totalRows}${apply ? '' : ' (dry-run，加 --apply 执行)'}`);

if (apply) {
  db.exec('BEGIN IMMEDIATE');
  let moved = 0;
  for (const m of merges) moved += db.prepare('update questions set chapter=? where chapter=?').run(m.to, m.from).changes;
  db.exec('COMMIT');
  const remain = db.prepare('select count(*) n from questions').get().n;
  const distinct = db.prepare('select count(distinct chapter) n from questions').get().n;
  console.log(JSON.stringify({ mergePairs: merges.length, moved, total: remain, distinctChapters: distinct }));
  console.log(moved === totalRows ? '✅ 全部归并移动完成' : `⚠️ 期望${totalRows}实际${moved}，请核对`);
} else {
  for (const m of merges) console.log(`  ${m.subject} | ${m.from} (${m.rows}) → ${m.to}`);
}