// 套卷模拟考试自测：独立临时库（运行前须由 shell 设置 SAIXT_DB_PATH）
import { db } from '../src/db.js';
import { examMeta, startExam, submitExam, getExam, listExams } from '../src/exam.js';

let pass = 0, fail = 0;
const assert = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

// 测试用户
const uid = Number(db.prepare("INSERT INTO users (phone, password) VALUES ('13800000000','x')").run().lastInsertRowid);

// 造题：同一科目下 30 道客观题（single/multiple/judge，难度 1~3）
const ins = db.prepare('INSERT INTO questions (subject, chapter, type, difficulty, stem, options, answer, analysis) VALUES (?,?,?,?,?,?,?,?)');
for (let i = 0; i < 30; i++) {
  const t = ['single', 'multiple', 'judge'][i % 3];
  const ans = t === 'multiple' ? 'AB' : (t === 'judge' ? 'A' : 'A');
  ins.run('测试科', '章节' + (i % 3), t, (i % 3) + 1, `题目${i}`, JSON.stringify(['A.选项甲', 'B.选项乙', 'C.选项丙']), ans, `解析${i}`);
}

console.log('1) 组卷元数据');
const meta = examMeta();
assert(meta.subjects.some(s => s.subject === '测试科' && s.count === 30), 'examMeta 返回科目与题量');
assert(meta.presets.length >= 4 && meta.difficulties.includes('综合'), '包含预设与难度档');

console.log('2) 开始考试（组卷）');
const ex = startExam(uid, { subject: '测试科', size: 10, difficulty: '基础', durationSec: 600 });
assert(ex && ex.id, '组卷成功');
assert(ex.total === 10 && ex.questions.length === 10, '试卷 10 题');
assert(ex.questions.every(q => q.answer === undefined && q.analysis === undefined), '考试中不下发答案与解析');
assert(new Set(ex.questions.map(q => q.id)).size === 10, '同卷题目不重复');
assert(ex.duration_sec === 600 && ex.status === 'ongoing', '时长与状态正确');

console.log('3) 交卷评分（全对）');
const allRight = ex.questions.map(q => ({ question_id: q.id, answer: q.answer || (q.type === 'multiple' ? 'AB' : 'A') }));
const r1 = submitExam(uid, ex.id, allRight);
assert(r1.ok && r1.data.score === 100 && r1.data.correct === 10, '全对得 100 分');
assert(r1.data.detail.length === 10 && r1.data.detail.every(d => d.correct), '逐题结果均判对');

console.log('4) 幂等：重复交卷被拒');
const r2 = submitExam(uid, ex.id, allRight);
assert(!r2.ok && r2.code === 409, '重复交卷返回 409');

console.log('5) 详情与解析');
const g = getExam(uid, ex.id);
assert(g.status === 'submitted' && g.detail.length === 10, '已交卷详情含逐题解析');
assert(g.detail.every(d => typeof d.analysis === 'string'), '解析字段存在');

console.log('6) 部分作答评分');
const ex2 = startExam(uid, { subject: '测试科', size: 10, difficulty: '综合' });
const half = ex2.questions.slice(0, 5).map(q => ({ question_id: q.id, answer: q.answer || (q.type === 'multiple' ? 'AB' : 'A') }));
const wrong = ex2.questions.slice(5).map(q => ({ question_id: q.id, answer: 'C' }));
const r3 = submitExam(uid, ex2.id, [...half, ...wrong]);
assert(r3.ok && r3.data.correct === 5 && r3.data.score === 50, '5 对 5 错得 50 分');

console.log('7) 历史记录与统计打通');
const hist = listExams(uid, 20, 0);
assert(hist.total === 2 && hist.list.length === 2, '历史记录 2 次');
assert(hist.list[0].id === ex2.id, '按时间倒序返回');
const sessions = db.prepare("SELECT COUNT(*) c FROM practice_sessions WHERE user_id = ? AND mode = 'exam'").get(uid).c;
const records = db.prepare('SELECT COUNT(*) c FROM practice_records WHERE user_id = ?').get(uid).c;
assert(sessions === 2 && records === 20, '交卷写入 practice_sessions/records（学情与错题本打通）');

console.log('8) 参数校验');
let threw = false;
try { startExam(uid, { subject: '' }); } catch { threw = true; }
assert(threw, '未选科目被拒');
threw = false;
try { startExam(uid, { subject: '不存在的科目' }); } catch { threw = true; }
assert(threw, '题量不足的科目被拒');

console.log('9) 按章节定向组卷');
const exC = startExam(uid, { subject: '测试科', size: 10, difficulty: '综合', chapters: ['章节0'] });
assert(exC.id && exC.total === 10, '定向组卷成功(10题)');
const chSet = new Set();
for (const q of exC.questions) chSet.add(db.prepare('SELECT chapter FROM questions WHERE id = ?').get(q.id).chapter);
assert(chSet.size === 1 && chSet.has('章节0'), '所有题目均来自所选章节');
let threw2 = false;
try { startExam(uid, { subject: '测试科', size: 10, difficulty: '综合', chapters: ['不存在的章节'] }); } catch { threw2 = true; }
assert(threw2, '所选章节题量不足被拒');

console.log(`\n结果：通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
