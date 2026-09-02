import { db } from '../src/db.js';

console.log('=== questions 表结构 ===');
console.log(JSON.stringify(db.prepare('PRAGMA table_info(questions)').all(), null, 1));
console.log('=== 题目总数 ===');
console.log(JSON.stringify(db.prepare('SELECT subject, COUNT(*) c FROM questions GROUP BY subject').all()));
console.log('=== 无章节题目 ===');
console.log(JSON.stringify(db.prepare("SELECT COUNT(*) c FROM questions WHERE chapter = '' OR chapter IS NULL").get()));
console.log('=== 无答案题目 ===');
console.log(JSON.stringify(db.prepare("SELECT COUNT(*) c FROM questions WHERE answer = '' OR answer IS NULL").get()));
console.log('=== 各来源统计 ===');
console.log(JSON.stringify(db.prepare('SELECT source, COUNT(*) c FROM questions GROUP BY source ORDER BY c DESC LIMIT 20').all(), null, 1));
