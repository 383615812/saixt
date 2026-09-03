#!/usr/bin/env node
/**
 * 通用技术 .doc 试卷文本统一解析入库
 *
 * 把 LibreOffice 转换出的通用技术试卷/真题 txt 解析为规范题目并写入题库。
 * 支持 6 种常见排版：
 *   1) 题干内嵌答案（如 338选择题、试卷七）
 *   2) 文末"题号/答案"键（试卷九/十/十一/十三/十六）
 *   3) 单行答案键（答案 A B C ...）
 *   4) 参考答案表格键（浙江省/浙江卷）
 *   5) 试卷合订多答案键（24套/10套，严格安全对齐）
 *   6) 无答案纯题（600多道真题、汇总）——答案/解析交由 AI 补全
 *
 * 用法:
 *   node import_ty_docx.cjs <txt目录> <数据库路径>            # dry-run 统计
 *   TY_IMPORT=1 node import_ty_docx.cjs <txt目录> <数据库路径> # 真正写库
 *
 * 安全约束:
 *   - 默认 dry-run，必须显式 TY_IMPORT=1 才写库
 *   - 按 (subject, 归一化stem[:50]) 去重，幂等可重复执行
 *   - 合订试卷答案仅在"N.X 成对"或"字母数==选择题数"时对齐，避免错配
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const DIR = args[0] || 'E:/saixt/_ty_txt';
const DB_PATH = args[1] || 'E:/saixt/server/data/saixt.db';
const IMPORT = process.env.TY_IMPORT === '1';
const CHAPTER = '真题综合', SUBJECT = '通用技术';

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout=8000');

const existSet = new Set(db.prepare('select stem from questions where subject=?').all(SUBJECT).map(r => r.stem.trim()));
const clean = s => String(s).replace(/\s+/g, ' ').trim();
function normAns(a){ if(!a) return ''; const s=a.normalize('NFKC').toUpperCase().replace(/[^A-F]/g,''); if(!s) return ''; return s.length>1? s.split('').join(',') : s; }

// 全角/半角题目选项字母标记
const OPT_LETTER = '[A-Fa-fＡ-Ｆａ-ｆ]';
const OPT_PUNCT = '[．、.．]';
const OPT_MARK = new RegExp(OPT_LETTER + '\\s*' + OPT_PUNCT + '\\s*');
const OPT_MARK_ONLY = new RegExp('^' + OPT_LETTER + '\\s*' + OPT_PUNCT + '\\s*');

// 统一的"题目块"构造；blockLines = 含题号的第一行起的连续行
function buildQuestion(blockLines) {
  let first = blockLines[0];
  let num = 0;
  const nm = first.match(/^\s*(\d{1,4})\s*[、\.．]/);
  if (nm) num = Number(nm[1]);
  let t = clean(blockLines.join('\n'));
  // 剥离左侧题号数字
  t = t.replace(/^\d{1,4}\s*[、\.．]\s*/, '');
  t = t.replace(/^【\d+】\s*/, '');
  // 答案（括号内 A-F，含全角）
  const am = t.match(/[（(]\s*([A-Fa-fＡ-Ｆａ-ｆ]{1,6})\s*[）)]/);
  let answer = am ? normAns(am[1]) : '';
  t = t.replace(/[（(]\s*[A-Fa-fＡ-Ｆａ-ｆ]{1,6}\s*[）)]/, '（　）');
  // 解析（解释：/解析：文本）
  let analysis = '';
  const em = t.match(/(?:解释|解析)[：:]\s*([\s\S]*)$/);
  if (em) { analysis = clean(em[1]); t = t.replace(/(?:解释|解析)[：:]\s*[\s\S]*$/, ''); }
  // 排除已混入下一题的"题号/答案"行残留
  t = t.replace(/\n题号.*$/s, '').replace(/\n得分.*$/s, '');
  // 分隔选项：找首个 A．/A、/A. 
  const mi = t.search(OPT_MARK);
  let stem = t, options = [];
  if (mi >= 0) {
    stem = clean(t.slice(0, mi));
    const rest = t.slice(mi);
    options = rest.split(new RegExp('(?=' + OPT_LETTER + '\\s*' + OPT_PUNCT + '\\s*)')).map(s => clean(s.replace(OPT_MARK_ONLY, '').replace(/、\s*$/, ''))).filter(Boolean);
  }
  return { num, stem, options, answer, analysis };
}

// 按行收集题目块，分文件用不同"块开始判定"
function collectBlocks(lines, isStart) {
  const blocks = [];
  let cur = [];
  for (const raw of lines) {
    const ln = raw.trim();
    if (!ln) continue;
    if (isStart(ln)) {
      if (cur.length) blocks.push(cur);
      cur = [ln];
    } else {
      if (cur.length) cur.push(ln);
    }
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

// 通用答案键解析 → Map<题号,答案>，并给出"单行答案"顺序字母
function resolveKey(lines, qs) {
  const rows = lines.map(l => l.replace(/\ufeff/g, '').trim()).filter(Boolean);
  const pairMap = new Map();
  const extra = [];
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    if (a.startsWith('题号')) {
      const nums = a.split(/\s+/).slice(1).map(Number).filter(n => n > 0);
      for (let j = i + 1; j < rows.length && j <= i + 2; j++) {
        const b = rows[j];
        if (b.startsWith('答案') || b.startsWith('得分')) {
          const lets = b.match(/[A-Fa-f]/g) || [];
          for (let k = 0; k < nums.length; k++) if (lets[k]) pairMap.set(nums[k], lets[k].toUpperCase());
          break;
        }
      }
    } else if (/^答案/.test(a) && a.length < 120) {
      const letters = a.match(/[A-Fa-f]/g);
      if (letters && letters.length >= 5) extra.push(...letters.map(x => x.toUpperCase()));
    }
  }
  // 按题号顺序给未确定答案的题赋值（优先 pairMap，其次 extra 顺序）
  const unanswered = qs.filter(q => q.num && !q.answer).sort((x, y) => x.num - y.num);
  let ei = 0;
  for (const q of unanswered) {
    if (pairMap.has(q.num)) { q.answer = normAns(pairMap.get(q.num)); continue; }
    if (ei < extra.length) q.answer = normAns(extra[ei++]);
  }
  return qs;
}

// ------- 各文件（含答案解析策略）-------
// 1) 题干内嵌答案（338选择题、试卷七）
function qInlineAnswer(lines) {
  const vs = collectBlocks(lines, ln => /^\s*\d{1,4}\s*[、\.．]\s*/.test(ln));
  return vs.map(b => buildQuestion(b));
}
// 2) 600多道真题（带【NN】，无答案）
function qCoded(lines) {
  const vs = collectBlocks(lines, ln => /^\s*\d{1,4}\s*\./.test(ln) && /【\d+】/.test(ln));
  return vs.map(b => buildQuestion(b));
}
// 3) 汇总（【单选题-###】，无答案）
function qMarked(lines) {
  const vs = collectBlocks(lines, ln => /^【单选题-\d+】/.test(ln));
  return vs.map(b => buildQuestion(b));
}
// 4) 末尾答案键（试卷九/十/十一/十三/十六）：题号/答案 或 单行答案
function qTailKey(lines) {
  const blocks = collectBlocks(lines, ln => /^\s*\d{1,4}\s*[、\.．]\s*/.test(ln));
  const qs = [];
  for (const b of blocks) {
    const joined = clean(b.join('\n'));
    if (/^(题号|得分|答案|选择题答案)/.test(joined) || (b[0] && /^(题号|得分|答案)/.test(b[0].trim()))) continue;
    qs.push(buildQuestion(b));
  }
  return resolveKey(lines, qs);
}
// 5) 浙江省/浙江：参考答案表格键
function qKeyTable(lines) {
  const blocks = collectBlocks(lines, ln => /^\s*\d{1,4}\s*．/.test(ln));
  const qs = [];
  for (const b of blocks) {
    const joined = clean(b.join('\n'));
    if (/^(参考答案|题号|答案|一、|二、|三、|四、|五、|得分)/.test(joined) || (b[0] && /^(参考答案|题号|答案|一、|二、|三、|四、|五、)/.test(b[0].trim()))) continue;
    qs.push(buildQuestion(b));
  }
  return resolveKey(lines, qs);
}
// 6) 试卷合订（24套/10套）：按答案键分段，安全对齐答案
function isKeyLine(ln) {
  if (/^(参考答案|答案|选择题答案|评分标准|评分)/.test(ln)) return true;
  if (/^\s*\d{1,3}\s*[.．、]\s*[A-Fa-f]/.test(ln)) return true;   // N. X 成对序列
  if (/^[A-Fa-f](?:\s+[A-Fa-f]){3,}\s*$/.test(ln)) return true;   // 紧凑字母行
  return false;
}
function parseKey(keyLines, qs) {
  const all = keyLines.join(' ');
  const map = new Map();
  let hasPair = false, m;
  const pairRe = /(\d{1,3})\s*[.．、]\s*([A-Fa-f])\b/g;
  while ((m = pairRe.exec(all))) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 300) { map.set(n, m[2].toUpperCase()); hasPair = true; }
  }
  if (hasPair) return map;
  const letters = (all.match(/[A-Fa-f]/g) || []).map(x => x.toUpperCase());
  const choices = qs.filter(q => q.options.length >= 2 && !q.answer).sort((x, y) => x.num - y.num);
  if (letters.length && letters.length === choices.length) {
    letters.forEach((L, i) => map.set(choices[i].num, L));
  }
  return map;
}
function qPaperSet(lines) {
  const segs = [];
  let buf = [];
  for (const raw of lines) {
    const ln = raw.replace(/\ufeff/g, '').trim();
    if (!ln) continue;
    if (isKeyLine(ln)) {
      if (buf.length) { buf.push(ln); segs.push(buf); buf = []; }
    } else buf.push(ln);
  }
  if (buf.length) segs.push(buf);
  const qs = [];
  for (const seg of segs) {
    const qLines = [], keyLines = [];
    for (const ln of seg) { if (isKeyLine(ln)) keyLines.push(ln); else qLines.push(ln); }
    const bqs = collectBlocks(qLines, l => /^\s*\d{1,3}\s*[、\.．]\s*/.test(l)).map(b => buildQuestion(b));
    const keyMap = parseKey(keyLines, bqs);
    for (const q of bqs) {
      if (!q.answer && q.num && keyMap.has(q.num)) q.answer = normAns(keyMap.get(q.num));
    }
    qs.push(...bqs);
  }
  return qs;
}

const files = [
  ['通用技术学业水平考试题(2024年)特别全（338选择题)(xu).txt', qInlineAnswer],
  ['通用技术学业水平测试模拟试卷七.txt', qInlineAnswer],
  ['通用技术学业水平测试模拟试卷九.txt', qTailKey],
  ['通用技术学业水平测试模拟试卷十.txt', qTailKey],
  ['通用技术学业水平测试模拟试卷十一.txt', qTailKey],
  ['通用技术学业水平测试模拟试卷十三.txt', qTailKey],
  ['通用技术学业水平测试模拟试卷十六.txt', qTailKey],
  ['通用技术学考试题汇总.txt', qMarked],
  ['通用技术学业水平考试精华版600多道真题含答案(最新、最全).txt', qCoded],
  ['浙江省通用技术学业水平考试模拟卷及答案（徐）.txt', qKeyTable],
  ['浙江通用技术学业水平考试模拟试卷（徐）.txt', qKeyTable],
  ['通用技术-学业水平考试模拟试卷(24套)（徐）.txt', qPaperSet],
  ['通用技术-通用技术学业水平测试模拟卷(10套)XU.txt', qPaperSet],
];

const perFile = [];
const allQ = [];
let nnew = 0, dup = 0, hasAns = 0, full4 = 0, ok4ans = 0;
for (const [fn, parser] of files) {
  const fp = path.join(DIR, fn);
  if (!fs.existsSync(fp)) { console.log(`  [跳过] 缺文件: ${fn}`); continue; }
  const txt = fs.readFileSync(fp, 'utf8');
  const lines = txt.split(/\r?\n/);
  const qs = parser(lines);
  let fnew = 0, fdup = 0, fans = 0, f4 = 0, f4ans = 0;
  for (const q of qs) {
    if (!q.stem || q.stem.length < 6) continue;
    if (existSet.has(q.stem)) { fdup++; continue; }
    existSet.add(q.stem);
    fnew++;
    if (q.answer) fans++;
    if (q.options.length === 4) f4++;
    if (q.options.length === 4 && q.answer) f4ans++;
    q.type = q.options.length >= 4 ? 'single' : (q.options.length > 1 ? 'multiple' : 'subj');
    allQ.push({ stem: q.stem, options: q.options, answer: q.answer, analysis: q.analysis, type: q.type });
  }
  perFile.push({ fn, parsed: qs.filter(q=>q.stem&&q.stem.length>=6).length, fnew, fdup, fans, f4, f4ans });
  nnew += fnew; dup += fdup; hasAns += fans; full4 += f4; ok4ans += f4ans;
}
console.log('文件(前32) | 解析 | 新增 | 重复 | 有答案 | 4选项 | 4选项+答案');
for (const r of perFile) console.log(`  ${r.fn.slice(0,32)} | ${r.parsed} | ${r.fnew} | ${r.fdup} | ${r.fans} | ${r.f4} | ${r.f4ans}`);
console.log('\n合计 新增', nnew, '| 有答案', hasAns, '| 缺答案', nnew - hasAns, '| 4选项完整', full4, '| 4选项+答案', ok4ans);

if (IMPORT) {
  const maxid = db.prepare('select max(id) m from questions').get().m;
  let id = maxid + 1;
  const st = db.prepare(`insert into questions(id,subject,chapter,type,difficulty,stem,options,answer,analysis,source) values(?,?,?,?,?,?,?,?,?,?)`);
  db.exec('BEGIN IMMEDIATE');
  for (const q of allQ) {
    st.run(id++, SUBJECT, CHAPTER, q.type, 2, q.stem, JSON.stringify(q.options), q.answer, q.analysis, '通用技术.docx资料导入-真题综合');
  }
  db.exec('COMMIT');
  console.log(`已写库 ${allQ.length} 题 (id ${maxid + 1}~${id - 1})`);
} else {
  console.log('dry-run（TY_IMPORT=1 写库）');
}
