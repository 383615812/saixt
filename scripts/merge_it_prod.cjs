// 生产章节合并（信息技术）
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/opt/saixt/server/data/saixt.db');
db.exec('BEGIN IMMEDIATE');
const map = [
  ['专题02 数据采集与编码', '专题02 数据采集、编码与分析'],
  ['专题04 Python程序设计基础', '专题04 Python基础知识'],
  ['专题04 Python程序设计基础', '专题04 Python表达式'],
  ['专题09 传感与控制及信息系统软件', '专题09 传感控制及信息系统软件'],
  ['专题11 信息系统的搭建与使用', '专题11 信息系统的搭建']
];
for (const [to, frm] of map) {
  const r = db.prepare('UPDATE questions SET chapter=? WHERE subject=? AND chapter=?').run(to, '信息技术', frm);
  console.log(`${frm} -> ${to} : ${r.changes}`);
}
db.exec('COMMIT');
const total = db.prepare('SELECT COUNT(*) c FROM questions').get().c;
console.log('生产题库总数:', total);
db.close();
