// 清理测试用户及其全部关联数据（E2E 配套）
// 用法: node clean-user.mjs <phone> [dbPath]
// 默认 dbPath = /opt/saixt/server/data/saixt.db
import { DatabaseSync } from 'node:sqlite';
const phone = process.argv[2];
const DB = process.argv[3] || '/opt/saixt/server/data/saixt.db';
if (!phone) { console.error('用法: node clean-user.mjs <phone> [dbPath]'); process.exit(1); }

const db = new DatabaseSync(DB);
const u = db.prepare('SELECT id, nickname FROM users WHERE phone = ?').get(phone);
if (!u) { console.log('NO_USER (phone=' + phone + ')'); process.exit(0); }
const uid = u.id;
console.log('FOUND uid=' + uid + ' nickname=' + u.nickname);

// 关联表（按外键依赖顺序删除）
const tables = [
  'practice_records', 'practice_sessions', 'review_schedule', 'wrong_mastered',
  'favorites', 'mock_exams', 'point_logs', 'points', 'checkins', 'ai_usage',
  'ai_analysis', 'plans', 'study_plans', 'weekly_reports', 'blind_box_draws',
  'blind_box_state', 'memberships', 'orders', 'invites', 'reminder_logs',
  'achievements', 'user_profiles', 'practice_records_archive'
];
db.exec('BEGIN');
try {
  for (const t of tables) {
    try {
      const info = db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(uid);
      if (info.changes) console.log('  ' + t + ': ' + info.changes);
    } catch { /* 表无 user_id 或不存在，跳过 */ }
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  db.exec('COMMIT');
  console.log('CLEANED uid=' + uid);
} catch (e) {
  db.exec('ROLLBACK');
  console.error('ROLLBACK: ' + e.message);
  process.exit(1);
}
console.log('USERS_TOTAL=' + db.prepare('SELECT COUNT(*) c FROM users').get().c);
