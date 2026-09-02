import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('E:/saixt/server/data/saixt.db');
const r = db.prepare("SELECT COUNT(*) AS c FROM questions WHERE image IS NOT NULL AND image != ''").get();
console.log('带图片题目数:', r.c);
const r2 = db.prepare('SELECT COUNT(*) AS c FROM questions').get();
console.log('总题数:', r2.c);
const r3 = db.prepare("SELECT id, subject, chapter, image FROM questions WHERE image IS NOT NULL AND image != '' ORDER BY id").all();
r3.forEach(q => console.log(q.id, q.subject, q.chapter, q.image));
