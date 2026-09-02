import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('E:/saixt/server/data/saixt.db');

// id=41（无图版孔明锁）的练习记录改指到 id=330（带图版）
const moved = db.prepare('UPDATE practice_records SET question_id = 330 WHERE question_id = 41').run();
console.log('迁移 id=41 -> id=330 的练习记录:', moved.changes, '条');

const removeIds = [119, 221, 222, 224, 225, 228, 229, 230, 232, 234, 41];
let removed = 0;
for (const id of removeIds) {
  const info = db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  removed += info.changes;
}
console.log('删除重复题:', removed, '道');

const total = db.prepare('SELECT COUNT(*) AS c FROM questions').get().c;
console.log('清理后总题数:', total);
