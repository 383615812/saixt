import { db } from '../src/db.js';

console.log('=== 现有章节 ===');
console.log(JSON.stringify(db.prepare('SELECT subject, chapter, COUNT(*) c FROM questions GROUP BY subject, chapter ORDER BY subject, c DESC').all(), null, 1));
console.log('=== 无章节题目详情 ===');
console.log(JSON.stringify(db.prepare("SELECT id, subject, stem, source FROM questions WHERE chapter = '' OR chapter IS NULL").all(), null, 1));
