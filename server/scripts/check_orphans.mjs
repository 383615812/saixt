import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('E:/saixt/server/data/saixt.db');
const orphans = db.prepare(`
  SELECT r.id AS rec_id, r.question_id, r.user_id
  FROM practice_records r LEFT JOIN questions q ON q.id = r.question_id
  WHERE q.id IS NULL
`).all();
console.log('孤立练习记录数:', orphans.length);
if (orphans.length) orphans.forEach(o => console.log(`  记录${o.rec_id} -> 题目${o.question_id} (用户${o.user_id})`));

const favOrphans = db.prepare(`
  SELECT f.id, f.question_id FROM favorites f LEFT JOIN questions q ON q.id = f.question_id WHERE q.id IS NULL
`).all();
console.log('孤立收藏数:', favOrphans.length);

const rsOrphans = db.prepare(`
  SELECT rs.id, rs.question_id FROM review_schedule rs LEFT JOIN questions q ON q.id = rs.question_id WHERE q.id IS NULL
`).all();
console.log('孤立复习计划数:', rsOrphans.length);

const wmOrphans = db.prepare(`
  SELECT wm.question_id FROM wrong_mastered wm LEFT JOIN questions q ON q.id = wm.question_id WHERE q.id IS NULL
`).all();
console.log('孤立已掌握数:', wmOrphans.length);
