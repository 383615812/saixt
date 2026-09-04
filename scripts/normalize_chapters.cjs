// 生产端章节名归一化（与本地 chapter 归一化保持一致，供 SQLite 生产库执行）
// 用法: node normalize_chapters.cjs [--db <path>]
// 说明: 只改章节名，不改题数；把同主题的旧变体章节并入标准章节。
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB = process.argv[2] ? path.resolve(process.argv[2]) : '/opt/saixt/server/data/saixt.db';

// 数学：旧章节 -> 标准章节
const MATH_MAP = [
  ['专题02 一元二次函数，方程和不等式', '专题02 一元二次函数、方程和不等式'],
  ['02第二章 不等式性质、一元二次函数、方程和不等式', '专题02 一元二次函数、方程和不等式'],
  ['专题04 指数函数、对数函数和幂函数', '专题04 指数函数与对数函数'],
  ['04第四章 幂函数与二次函数、指数与指数函数、对数与对数函数', '专题04 指数函数与对数函数'],
  ['01第一章 集合、常用逻辑用语', '专题01 集合与常用逻辑用语'],
  ['08第八章 统计和概率', '专题09 概率'],
];

// 政治：旧章节 -> 标准章节
const POL_MAP = [
  ['专题01 《中国特色社会主义》【精选高频考题100题】（选择题）', '专题01 《中国特色社会主义》'],
  ['专题02 《中国特色社会主义》【精选高频考题30题】（主观题）', '专题01 《中国特色社会主义》'],
  ['专题01  《中国特色社会主义》', '专题01 《中国特色社会主义》'],
  ['专题03 《经济与社会》【精选高频考题100题】（选择题）', '专题03 《经济与社会》'],
  ['专题04 《经济与社会》【精选高频考题30题】（主观题ABC卷）', '专题03 《经济与社会》'],
  ['专题02 《经济与社会》', '专题03 《经济与社会》'],
  ['专题03  《经济与社会》', '专题03 《经济与社会》'],
  ['专题05政治与法治【精选高频考题100题】（选择题）', '专题05 《政治与法治》'],
  ['专题06 《政治与法治》【精选高频考题30题】（主观题ABC卷）', '专题05 《政治与法治》'],
  ['专题03《政治与法治》', '专题05 《政治与法治》'],
  ['专题05  《政治与法治》', '专题05 《政治与法治》'],
  ['专题07 《哲学与文化》【精选高频考题100题】（选择题）', '专题07 《哲学与文化》'],
  ['专题08 《哲学与文化》【精选高频考题30题】（主观题ABC卷）', '专题07 《哲学与文化》'],
  ['专题04《哲学与文化》', '专题07 《哲学与文化》'],
  ['专题07  《哲学与文化》', '专题07 《哲学与文化》'],
];

function run(subject, map) {
  const db = new DatabaseSync(DB);
  db.exec('PRAGMA busy_timeout=5000');
  db.exec('BEGIN IMMEDIATE');
  let total = 0;
  for (const [oldName, newName] of map) {
    const row = db.prepare('SELECT COUNT(*) c FROM questions WHERE subject=? AND chapter=?')
      .get(subject, oldName);
    if (row.c > 0) {
      db.prepare('UPDATE questions SET chapter=? WHERE subject=? AND chapter=?')
        .run(newName, subject, oldName);
      console.log(`  [${subject}] ${oldName} (${row.c}) -> ${newName}`);
      total += row.c;
    }
  }
  db.exec('COMMIT');
  console.log(`\n[${subject}] 共合并 ${total} 题`);
  console.log('===== 归一化后章节 =====');
  for (const r of db.prepare('SELECT chapter, COUNT(*) c FROM questions WHERE subject=? GROUP BY chapter ORDER BY c DESC').all(subject)) {
    console.log(`  ${String(r.c).padStart(4)}  [${r.chapter}]`);
  }
  db.close();
}

console.log('DB:', DB);
run('数学', MATH_MAP);
run('政治', POL_MAP);