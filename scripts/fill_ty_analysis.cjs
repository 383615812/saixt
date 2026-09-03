#!/usr/bin/env node
/**
 * 通用技术导入题 AI 补全（答案 + 解析）
 *
 * 为 import_ty_docx.cjs 导入的、缺答案或缺解析的通用技术题调用 DeepSeek 补全。
 * 幂等：只处理仍缺 answer 或 analysis 的题，可反复执行直至清零。
 *
 * 用法:
 *   node fill_ty_analysis.cjs [数据库路径] [起始id]        # 全量补全（默认 id>=23628）
 *   TYFILL_MAX=5 node fill_ty_analysis.cjs ...             # 只处理前 N 条（冒烟）
 *
 * 依赖: server/.env 中 DEEPSEEK_API_KEY
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const DB_PATH = args[0] || 'E:/saixt/server/data/saixt.db';
const MIN_ID = args[1] ? Number(args[1]) : 23628;

const env = {};
const envPath = path.join(path.dirname(DB_PATH), '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
const KEY = env.DEEPSEEK_API_KEY; if (!KEY) { console.error('无 DEEPSEEK_API_KEY'); process.exit(1); }

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout=8000');

const rows = db.prepare(`select id,stem,options,answer,analysis from questions where subject='通用技术' and chapter='真题综合' and source like '通用技术.docx资料导入%' and id>=?`).all(MIN_ID);
const need = rows.filter(q => !q.answer || !(q.analysis && q.analysis.length >= 3));
const MAX = process.env.TYFILL_MAX ? Number(process.env.TYFILL_MAX) : need.length;
console.log('新题总数', rows.length, '待补', need.length, '本轮处理', MAX);

async function fill(q) {
  const opts = JSON.parse(q.options || '[]').map((o, i) => `  ${String.fromCharCode(65 + i)}. ${o}`).join('\n');
  const wantAns = q.answer ? '' : '并给出正确选项字母';
  const wantAna = (q.analysis && q.analysis.length >= 3) ? '不需要重复解析' : '并给出1-3句解析';
  const msg = `【题目】${q.stem}\n【选项】\n${opts}\n请直接输出一个JSON对象：{"answer":"正确选项(A-D)", "analysis":"解析"}。${wantAns}，${wantAna}。不要输出多余文字，直接给JSON。`;
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: msg }], temperature: 0.4, max_tokens: 400 })
  });
  if (resp.status === 402) throw new Error('402');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const j = await resp.json();
  let txt = (j.choices?.[0]?.message?.content || '').trim();
  txt = txt.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  const m = txt.match(/\{[\s\S]*\}/);
  const obj = m ? JSON.parse(m[0]) : {};
  return { answer: (obj.answer || '').normalize('NFKC').toUpperCase().replace(/[^A-F]/g, ''), analysis: (obj.analysis || '').trim() };
}

(async () => {
  const good = [];
  for (let i = 0; i < MAX; i++) {
    const q = need[i];
    try {
      const r = await fill(q);
      const okAns = r.answer && /^[A-F]$/.test(r.answer);
      const okAna = r.analysis && r.analysis.length >= 3;
      if (okAna) {
        const set = { analysis: r.analysis };
        if (!q.answer && okAns) set.answer = r.answer;
        if (set.analysis || set.answer) {
          const keys = []; const vals = [];
          if (set.analysis) { keys.push('analysis=?'); vals.push(set.analysis); }
          if (set.answer) { keys.push('answer=?'); vals.push(set.answer); }
          vals.push(q.id);
          db.prepare(`update questions set ${keys.join(',')} where id=?`).run(...vals);
          good.push(q.id);
        }
        process.stdout.write(okAna ? '.' : '?');
      } else {
        process.stdout.write('x');
      }
    } catch (e) {
      console.error(`\n✗ ${q.id} ${e.message}`);
      if (String(e.message).includes('402')) process.exit(1);
      process.stdout.write('E');
    }
    if (i % 5 === 4) await new Promise(r => setTimeout(r, 300));
  }
  const remain = db.prepare(`select count(*) n from questions where subject='通用技术' and chapter='真题综合' and source like '通用技术.docx资料导入%' and id>=? and (answer is null or answer='' or length(trim(coalesce(analysis,'')))<3)`).get().n;
  console.log(`\n本轮补全 ${good.length} 题，仍缺 ${remain} 题`);
})();
