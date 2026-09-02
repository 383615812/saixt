// 删除回归测试创建的临时用户（手机号 188/189 前缀 + 使用测试密码 + 今日创建；保留管理员账号）
import { db } from '../src/db.js';
import { hashPassword } from '../src/auth.js';

const admins = (process.env.ADMIN_PHONES || '').split(',').map(s => s.trim()).filter(Boolean);
const pwdHash = hashPassword('test123456');
const users = db.prepare(
  `SELECT id, phone, nickname FROM users
   WHERE (phone LIKE '188%' OR phone LIKE '189%') AND password = ? AND date(created_at) = date('now','localtime')`
).all(pwdHash).filter(u => !admins.includes(u.phone));

console.log(`待清理测试用户 ${users.length} 个`);
if (!users.length) { process.exit(0); }

const cleanTables = [
  'practice_records', 'practice_sessions', 'review_schedule', 'wrong_mastered',
  'points', 'point_logs', 'memberships', 'ai_usage', 'ai_topup', 'favorites',
  'checkins', 'user_profiles', 'reminder_settings', 'tasks',
  'achievements', 'weekly_reports', 'study_plans', 'ai_analysis',
  'report_logs', 'school_favorites', 'blind_box_results', 'user_achievements',
  'orders'
];
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
const toClean = cleanTables.filter(t => tables.includes(t));

const del = db.prepare('DELETE FROM users WHERE id = ?');
let removed = 0;
for (const u of users) {
  for (const t of toClean) {
    if (t === 'invites') {
      try { db.prepare('DELETE FROM invites WHERE inviter_id = ? OR invitee_id = ?').run(u.id, u.id); } catch (e) {}
      continue;
    }
    try { db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(u.id); } catch (e) { /* 表结构差异时忽略 */ }
  }
  del.run(u.id);
  removed++;
  console.log(`  - 已删除 user#${u.id} (${u.phone})`);
}
console.log(`清理完成，共删除测试用户 ${removed} 个`);
process.exit(0);