import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { withImages } from '../utils.js';

const router = Router();

// 转义 LIKE 通配符（% _ \），防止用户搜 "%" 匹配全库
function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, '\\$&');
}

// 题库列表（不返回答案与解析）
router.get('/', (req, res) => {
  const { subject, chapter, keyword, type, limit = 20, offset = 0 } = req.query;
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const conds = [];
  const args = [];
  if (subject) { conds.push('subject = ?'); args.push(subject); }
  if (chapter) { conds.push('chapter = ?'); args.push(chapter); }
  if (type) {
    const types = String(type).split(',').filter(t => ['single', 'multiple', 'judge', 'subjective'].includes(t));
    if (types.length) {
      conds.push(`type IN (${types.map(() => '?').join(',')})`);
      args.push(...types);
    }
  }
  if (keyword) { conds.push('(stem LIKE ? ESCAPE \'\\\' OR source LIKE ? ESCAPE \'\\\')'); args.push(`%${escapeLike(keyword)}%`, `%${escapeLike(keyword)}%`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM questions ${where}`).get(...args).c;
  const rows = db.prepare(
    `SELECT id, subject, chapter, type, difficulty, stem, options, source, image, images
     FROM questions ${where} ORDER BY id LIMIT ? OFFSET ?`
  ).all(...args, safeLimit, safeOffset);
  res.json({ code: 0, data: { total, list: rows.map(r => withImages({ ...r, options: JSON.parse(r.options) })) } });
});

// 知识点关联图谱
router.get('/knowledge-graph', (req, res) => {
  const { subject } = req.query;
  const conds = [];
  const args = [];
  if (subject) { conds.push('subject = ?'); args.push(subject); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  // 按科目+章节分组统计题目数量
  const rows = db.prepare(
    `SELECT subject, chapter, COUNT(*) AS count FROM questions ${where} GROUP BY subject, chapter`
  ).all(...args);

  // 构建节点
  const nodes = rows.map(r => ({
    id: `${r.subject}||${r.chapter}`,
    name: r.chapter,
    subject: r.subject,
    chapter: r.chapter,
    count: r.count
  }));

  // 字符 bigram 提取函数
  function getBigrams(str) {
    const s = String(str).replace(/\s+/g, '');
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s[i] + s[i + 1]);
    }
    return set;
  }

  // 按科目分组节点
  const bySubject = {};
  for (const n of nodes) {
    if (!bySubject[n.subject]) bySubject[n.subject] = [];
    bySubject[n.subject].push(n);
  }

  // 计算每个节点的 bigram 集合
  const bigramCache = new Map();
  for (const n of nodes) {
    bigramCache.set(n.id, getBigrams(n.chapter));
  }

  // 同一科目下计算关联
  const links = [];
  for (const sub of Object.keys(bySubject)) {
    const list = bySubject[sub];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const bgA = bigramCache.get(a.id);
        const bgB = bigramCache.get(b.id);
        let common = 0;
        for (const bi of bgA) {
          if (bgB.has(bi)) common++;
        }
        if (common >= 2) {
          // 将 value 归一化到 1-10 范围
          const value = Math.min(10, Math.max(1, common));
          links.push({ source: a.id, target: b.id, value });
        }
      }
    }
  }

  // 每个节点最多保留 5 条最强关联
  const nodeLinks = new Map();
  for (const l of links) {
    if (!nodeLinks.has(l.source)) nodeLinks.set(l.source, []);
    if (!nodeLinks.has(l.target)) nodeLinks.set(l.target, []);
    nodeLinks.get(l.source).push(l);
    nodeLinks.get(l.target).push(l);
  }

  const keptLinks = new Set();
  for (const [, arr] of nodeLinks) {
    arr.sort((a, b) => b.value - a.value);
    const top = arr.slice(0, 5);
    for (const l of top) keptLinks.add(l);
  }

  // 科目内兜底：不依赖自然 bigram 边是否足够，而是对每个科目做连通性检测
  // （自然大边聚类可能仍留下孤立章节散点），对每个孤立连通分量取题量最大的节点，
  // 桥接到最大分量的题量最大节点，保证单科目筛选时图谱全连通可导航
  const keptArr = [...keptLinks].map(l => ({ ...l, kind: 'similarity' }));
  const bySubjectFinal = {};
  for (const n of nodes) {
    if (!bySubjectFinal[n.subject]) bySubjectFinal[n.subject] = [];
    bySubjectFinal[n.subject].push(n);
  }

  // 教学关系（承接）边：从真实课程章节的「专题0N」科目编号中推导先后顺序
  // （专题 N → N+1），为带显式编号的科目构造一条可循的「前置→承接」教学主线。
  // 仅相邻编号之间建边、不跳过断号臆测；无编号科目（如信息技术/通用技术）不臆造顺序，
  // 仍由相似度 + 下方连通桥接保证可用。
  // 同名对若已被相似度边占用，则用教学边「取代」（教学边语义更强、且有方向 from→to），
  // 避免同一对节点画两条线、也确保教学承接在图上真实可见
  {
    const topicRe = /专题\s*0*(\d+)/;
    const teachingEdges = [];
    const seenT = new Set();
    for (const sub of Object.keys(bySubjectFinal)) {
      const byNum = new Map();
      for (const n of bySubjectFinal[sub]) {
        const m = String(n.chapter).match(topicRe);
        if (!m) continue;
        const num = Number(m[1]);
        if (!byNum.has(num) || n.count > byNum.get(num).count) byNum.set(num, n);
      }
      const nums = [...byNum.keys()].sort((a, b) => a - b);
      for (let i = 0; i < nums.length - 1; i++) {
        if (nums[i + 1] - nums[i] !== 1) continue;
        const a = byNum.get(nums[i]);
        const b = byNum.get(nums[i + 1]);
        const key = `${a.id}\u0000${b.id}`;
        const rev = `${b.id}\u0000${a.id}`;
        if (seenT.has(key) || seenT.has(rev)) continue;
        seenT.add(key);
        teachingEdges.push({ source: a.id, target: b.id, value: 3, kind: 'teaching', from: a.chapter, to: b.chapter });
      }
    }
    // 教学边优先：存在教学边的一对，移除其相似度边，避免双线
    const teachPair = new Set(teachingEdges.map(e => `${e.source}\u0000${e.target}`));
    const filtered = keptArr.filter(l => {
      const f = `${l.source}\u0000${l.target}`;
      const r = `${l.target}\u0000${l.source}`;
      return !teachPair.has(f) && !teachPair.has(r);
    });
    keptArr.length = 0;
    keptArr.push(...filtered, ...teachingEdges);
  }

  for (const sub of Object.keys(bySubjectFinal)) {
    const list = bySubjectFinal[sub];
    if (list.length < 2) continue;
    const idSet = new Set(list.map(n => n.id));
    // 用已有边构建邻接表
    const adj = new Map();
    for (const id of idSet) adj.set(id, new Set());
    for (const l of keptArr) {
      if (adj.has(l.source) && adj.has(l.target)) {
        adj.get(l.source).add(l.target);
        adj.get(l.target).add(l.source);
      }
    }
    // 广度优先求连通分量
    const compOf = new Map();
    let comps = 0;
    for (const id of idSet) {
      if (compOf.has(id)) continue;
      const stack = [id];
      compOf.set(id, comps);
      while (stack.length) {
        const cur = stack.pop();
        for (const nb of adj.get(cur) || []) if (!compOf.has(nb)) { compOf.set(nb, comps); stack.push(nb); }
      }
      comps++;
    }
    if (comps <= 1) continue;
    // 按分量归组
    const compNodes = Array.from({ length: comps }, () => []);
    for (const n of list) compNodes[compOf.get(n.id)].push(n);
    // 用例量最大的节点作为各分量的代表节点，最大分量的代表节点作为桥接锚点
    const seat = (arr) => arr.reduce((p, c) => (c.count > p.count ? c : p));
    const biggest = compNodes.reduce((p, c) => (c.length > p.length ? c : p));
    const anchorNode = seat(biggest);
    for (const arr of compNodes) {
      if (arr.length === 0) continue;
      const top = seat(arr);
      if (top === anchorNode) continue;
      if (String(top.chapter).trim() === 'null' && String(anchorNode.chapter).trim() === 'null') continue;
      const val = Math.min(6, Math.max(2, Math.round((top.count + anchorNode.count) / 12)));
      keptArr.push({ source: top.id, target: anchorNode.id, value: val, kind: 'bridge' });
    }
  }

  res.json({ code: 0, data: { nodes, links: keptArr } });
});

// 章节 / 科目统计
router.get('/meta', (req, res) => {
  const subjects = db.prepare('SELECT subject, COUNT(*) AS count FROM questions GROUP BY subject').all();
  const chapters = db.prepare('SELECT subject, chapter, COUNT(*) AS count FROM questions GROUP BY subject, chapter').all();
  const types = db.prepare('SELECT type, COUNT(*) AS count FROM questions GROUP BY type').all();
  res.json({
    code: 0,
    data: {
      subjects, chapters, types,
      // 平台配置：考试时间等，前端据此渲染倒计时，避免硬编码
      platform: {
        examDate: '2027-03-20',
        examName: '2027 年云南省春季招生考试'
      }
    }
  });
});

// 按筛选条件计数（轻量级，不返回题目数据）
router.get('/count', (req, res) => {
  const { subject, chapter, type } = req.query;
  const conds = [];
  const args = [];
  if (subject) { conds.push('subject = ?'); args.push(subject); }
  if (chapter) { conds.push('chapter = ?'); args.push(chapter); }
  if (type) {
    const types = String(type).split(',').filter(t => ['single', 'multiple', 'judge', 'subjective'].includes(t));
    if (types.length) {
      conds.push(`type IN (${types.map(() => '?').join(',')})`);
      args.push(...types);
    }
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const count = db.prepare(`SELECT COUNT(*) AS c FROM questions ${where}`).get(...args).c;
  res.json({ code: 0, data: { count } });
});

// 题目详情（含答案，用于练习后查看）——需登录，避免匿名枚举题目 id 直接拿到全部答案
router.get('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ code: 404, message: '题目不存在' });
  res.json({ code: 0, data: withImages({ ...row, options: JSON.parse(row.options) }) });
});

export default router;
