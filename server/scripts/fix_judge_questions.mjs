import Database from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const dbPath = join(dataDir, 'saixt.db');

// 备份
const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const bakPath = join(dataDir, `saixt_backup_${ts}_judge_fix.db`);
let idx = 1;
let finalBak = bakPath;
while (existsSync(finalBak)) { finalBak = join(dataDir, `saixt_backup_${ts}_judge_fix_${idx}.db`); idx++; }
copyFileSync(dbPath, finalBak);
console.log('[backup]', finalBak);

const db = new Database.DatabaseSync(dbPath);

const JUDGE_OPTS = JSON.stringify(['A. 正确', 'B. 错误']);
// 判断题答案统一：正确->A，错误->B
const updJudge = db.prepare("UPDATE questions SET options = ?, answer = CASE WHEN TRIM(answer) IN ('正确','A','√','T','对') THEN 'A' WHEN TRIM(answer) IN ('错误','B','×','F','错') THEN 'B' ELSE answer END WHERE type = 'judge'");
const r1 = updJudge.run(JUDGE_OPTS);
console.log('[judge] updated rows:', r1.changes);

// 复合多选题(13187) 从 single 改为 subjective（多小题主观评分，答案保留逐小题标注）
const upd13187 = db.prepare("UPDATE questions SET type = 'subjective' WHERE id = 13187");
const r2 = upd13187.run();
console.log('[13187] updated rows:', r2.changes);

// 验证
const judgeRows = db.prepare("SELECT id, type, options, answer FROM questions WHERE type='judge' LIMIT 5").all();
console.log('[verify judge samples]');
for (const row of judgeRows) console.log(' ', JSON.stringify(row));
const judgeBad = db.prepare("SELECT COUNT(*) AS c FROM questions WHERE type='judge' AND (answer NOT IN ('A','B') OR options IS NULL OR options='')").get();
console.log('[verify judge remaining bad]:', judgeBad.c);
const singleBad = db.prepare("SELECT COUNT(*) AS c FROM questions WHERE type='single' AND answer NOT GLOB '[A-Z]'").get();
console.log('[verify single non-alpha remain]:', singleBad.c);
db.close();