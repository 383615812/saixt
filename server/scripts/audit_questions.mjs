import Database from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database.DatabaseSync(join(__dirname, '..', 'data', 'saixt.db'));

// 统计每道题的质量
const rows = db.prepare(`
  SELECT id, subject, chapter, type, stem, options, answer, analysis,
         LENGTH(answer) as ans_len, LENGTH(TRIM(answer)) as ans_trim,
         LENGTH(analysis) as ana_len, LENGTH(TRIM(analysis)) as ana_trim,
         LENGTH(stem) as q_len
  FROM questions
`).all();

function classify(r) {
  const issues = [];
  if (!r.q_len || r.q_len < 2) issues.push('缺题干');
  if (!r.ans_trim) issues.push('缺答案');
  if (!r.ana_trim) issues.push('缺解析');
  let opts = [];
  try { opts = JSON.parse(r.options || '[]'); } catch (e) { opts = []; }
  const validOpts = opts.filter(o => o && o.trim());
  if (r.type !== 'subjective' && validOpts.length === 0) issues.push('缺选项');
  const ans = (r.answer || '').trim();
  if (r.type === 'single') {
    if (!/^[A-H]$/i.test(ans)) issues.push('单选答案非单字母[' + ans.slice(0, 30) + ']');
  } else if (r.type === 'multiple') {
    if (!/^[A-H]+$/i.test(ans)) issues.push('多选答案非纯字母[' + ans.slice(0, 30) + ']');
  } else if (r.type === 'judge') {
    if (!/^(正确|错误|对|错|A|B|√|×|T|F)$/i.test(ans)) issues.push('判断答案异常[' + ans.slice(0, 50) + ']');
  }
  return issues;
}

const summary = { total: rows.length };
const byType = {};
const bySubject = {};
let issues = [];
for (const r of rows) {
  byType[r.type] = (byType[r.type] || 0) + 1;
  bySubject[r.subject] = (bySubject[r.subject] || 0) + 1;
  const iss = classify(r);
  if (iss.length) {
    issues.push({ id: r.id, subject: r.subject, type: r.type, chapter: r.chapter, issues: iss, q: (r.stem || '').slice(0, 40) });
  }
}
// 单选题应非纯字母的（如判断 A=正确）已涵盖
summary.byType = byType;
summary.bySubject = bySubject;
summary.issueCount = issues.length;
summary.issueRate = (issues.length / rows.length * 100).toFixed(2) + '%';

console.log('=== 总体 ===');
console.log(JSON.stringify(summary, null, 2));

const byIssue = {};
const byIssSubj = {};
for (const i of issues) {
  for (const z of i.issues) byIssue[z] = (byIssue[z] || 0) + 1;
  const key = i.subject + '|' + i.type + '|' + i.issues.join(',');
  byIssSubj[key] = (byIssSubj[key] || 0) + 1;
}
console.log('\n=== 问题类型分布 ===');
console.log(JSON.stringify(byIssue, null, 2));
console.log('\n=== 按 科目/题型/问题 分布 ===');
console.log(JSON.stringify(byIssSubj, null, 2));

console.log('\n=== 问题样本（前 50）===');
console.log(JSON.stringify(issues.slice(0, 50), null, 2));

db.close();