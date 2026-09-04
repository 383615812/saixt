import { Router } from 'express';
import { db } from '../db.js';
import { schoolRegion } from '../utils.js';

const router = Router();

// 院校列表
router.get('/', (req, res) => {
  const { keyword, sort = 'plans', limit = 50, offset = 0, type, region } = req.query;
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const conds = [];
  const args = [];
  if (keyword) { conds.push('(name LIKE ? OR code LIKE ?)'); args.push(`%${keyword}%`, `%${keyword}%`); }
  if (type === '公办') conds.push("nature = '公办'");
  else if (type === '民办') conds.push("nature = '民办'");
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const orderMap = { plans: 'plans DESC', name: 'name ASC', code: 'code ASC' };
  const order = orderMap[sort] || 'plans DESC';

  let rows = db.prepare(`SELECT * FROM schools ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...args, safeLimit, safeOffset);

  // 地区筛选：按校名在内存推断（SQL 无法表达），需先取全量再过滤
  if (region && String(region).trim()) {
    const reg = String(region).trim();
    let all = db.prepare(`SELECT * FROM schools ${where}`).all(...args);
    if (type === '公办') all = all.filter(s => s.nature === '公办');
    else if (type === '民办') all = all.filter(s => s.nature === '民办');
    const filtered = all.filter(s => schoolRegion(s.name) === reg);
    const list = filtered.slice(safeOffset, safeOffset + safeLimit);
    const plansTotal = db.prepare('SELECT COUNT(*) AS c FROM plans').get().c || 0;
    return res.json({ code: 0, data: { total: filtered.length, plans_total: plansTotal, list } });
  }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM schools ${where}`).get(...args).c;
  const plansTotal = db.prepare('SELECT COUNT(*) AS c FROM plans').get().c || 0;
  res.json({ code: 0, data: { total, plans_total: plansTotal, list: rows } });
});

// 院校详情 + 专业计划
router.get('/:code', (req, res) => {
  const school = db.prepare('SELECT * FROM schools WHERE code = ?').get(req.params.code);
  if (!school) return res.status(404).json({ code: 404, message: '院校不存在' });
  const plans = db.prepare('SELECT major_code, major_name, tuition, plan, lang, oral FROM plans WHERE school_code = ? ORDER BY major_code').all(req.params.code);
  res.json({ code: 0, data: { school, plans } });
});

// 专业计划检索
router.get('/plans/search', (req, res) => {
  const { keyword, school_code, limit = 100, offset = 0 } = req.query;
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const conds = [];
  const args = [];
  if (keyword) { conds.push('(major_name LIKE ? OR school_name LIKE ?)'); args.push(`%${keyword}%`, `%${keyword}%`); }
  if (school_code) { conds.push('school_code = ?'); args.push(school_code); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM plans ${where} ORDER BY plan DESC LIMIT ? OFFSET ?`)
    .all(...args, safeLimit, safeOffset);
  res.json({ code: 0, data: rows });
});

export default router;
