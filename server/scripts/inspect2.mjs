import { db } from '../src/db.js';

console.log('=== questions 表结构 ===');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE name='questions'").get().sql);

console.log('\n=== 空章节题目 ===');
console.log(db.prepare("SELECT id, subject, type, stem FROM questions WHERE chapter IS NULL OR chapter = ''").all());

console.log('\n=== 各来源数量 ===');
console.log(db.prepare('SELECT source, COUNT(*) c FROM questions GROUP BY source ORDER BY c DESC').all());
