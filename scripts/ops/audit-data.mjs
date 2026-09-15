// 生产库全量健康度体检（只读）
// 用法: node audit-data.mjs [dbPath]
// 默认 dbPath = /opt/saixt/server/data/saixt.db
import { DatabaseSync } from 'node:sqlite';
const DB = process.argv[2] || '/opt/saixt/server/data/saixt.db';
const db = new DatabaseSync(DB, { readOnly: true });
const q = (sql, ...a) => { try { return db.prepare(sql).get(...a); } catch (e) { return { ERR: e.message }; } };
const all = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch (e) { return [{ ERR: e.message }]; } };

const LEGAL_TYPES = ['single', 'multiple', 'judge', 'subjective'];
let problems = 0;
const warn = (label, cond, detail) => {
  if (!cond) problems++;
  console.log(`  ${cond ? '✓' : '✗'} ${label}${detail ? ' :: ' + detail : ''}`);
};

console.log('===== 1. 表行数 =====');
for (const t of all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(r => r.name)) {
  console.log(`  ${t}: ${q(`SELECT COUNT(*) c FROM ${t}`).c}`);
}

console.log('\n===== 2. 题库数据质量 =====');
const types = all("SELECT type, COUNT(*) c FROM questions GROUP BY type ORDER BY c DESC");
console.log('  题型分布: ' + JSON.stringify(types));
const illegal = types.filter(t => !LEGAL_TYPES.includes(t.type));
warn('题型枚举全合法', illegal.length === 0, illegal.length ? JSON.stringify(illegal) : 'OK');
warn('无空题干', q("SELECT COUNT(*) c FROM questions WHERE stem IS NULL OR stem=''").c === 0);
warn('无空答案', q("SELECT COUNT(*) c FROM questions WHERE answer IS NULL OR answer=''").c === 0);
warn('无空章节', q("SELECT COUNT(*) c FROM questions WHERE chapter IS NULL OR chapter=''").c === 0);
warn('客观题均有选项', q("SELECT COUNT(*) c FROM questions WHERE type IN ('single','multiple','judge') AND (options IS NULL OR options='[]' OR options='')").c === 0);
warn('难度值合法(1/2/3)', q("SELECT COUNT(*) c FROM questions WHERE difficulty NOT IN (1,2,3)").c === 0);

console.log('\n===== 3. options 可解析性 =====');
let badOpts = [];
for (const r of all("SELECT id, options FROM questions WHERE options IS NOT NULL AND options != ''")) {
  try { const v = JSON.parse(r.options); if (!Array.isArray(v)) badOpts.push(r.id); } catch { badOpts.push(r.id); }
}
warn('options 均为合法 JSON 数组', badOpts.length === 0, badOpts.length ? 'ids=' + badOpts.slice(0, 10).join(',') : 'OK');

console.log('\n===== 4. 用户数据完整性 =====');
warn('无空昵称用户', q("SELECT COUNT(*) c FROM users WHERE nickname IS NULL OR nickname=''").c === 0);
warn('无空手机号用户', q("SELECT COUNT(*) c FROM users WHERE phone IS NULL OR phone=''").c === 0);
const stray = all("SELECT id,nickname,phone FROM users WHERE nickname LIKE 'Wt%' OR nickname LIKE 'Test%' OR nickname LIKE 'Smoke%' OR nickname LIKE 'E2E%' OR nickname LIKE 'Dist%'");
warn('无测试号残留', stray.length === 0, stray.length ? JSON.stringify(stray) : 'OK');

console.log('\n===== 5. 孤儿/悬空外键 =====');
warn('practice_records 无孤儿题', q("SELECT COUNT(*) c FROM practice_records r WHERE NOT EXISTS(SELECT 1 FROM questions q WHERE q.id=r.question_id)").c === 0);
warn('practice_records 无孤儿用户', q("SELECT COUNT(*) c FROM practice_records r WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=r.user_id)").c === 0);
warn('review_schedule 无孤儿题', q("SELECT COUNT(*) c FROM review_schedule rs WHERE NOT EXISTS(SELECT 1 FROM questions q WHERE q.id=rs.question_id)").c === 0);
warn('review_schedule 无主观题', q("SELECT COUNT(*) c FROM review_schedule rs JOIN questions q ON q.id=rs.question_id WHERE q.type='subjective'").c === 0);
warn('wrong_mastered 无孤儿', q("SELECT COUNT(*) c FROM wrong_mastered wm WHERE NOT EXISTS(SELECT 1 FROM questions q WHERE q.id=wm.question_id)").c === 0);
warn('favorites 无孤儿', q("SELECT COUNT(*) c FROM favorites f WHERE NOT EXISTS(SELECT 1 FROM questions q WHERE q.id=f.question_id)").c === 0);

console.log('\n===== 6. 非法值/越界 =====');
warn('is_correct 均为 0/1', q("SELECT COUNT(*) c FROM practice_records WHERE is_correct NOT IN (0,1)").c === 0);
warn('订单金额非负', q("SELECT COUNT(*) c FROM orders WHERE amount < 0").c === 0);

console.log(`\n===== 结论: ${problems === 0 ? '全部通过 ✓' : problems + ' 项异常 ✗'} =====`);
