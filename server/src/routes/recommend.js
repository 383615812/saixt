import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { schoolRegion } from '../utils.js';

const router = Router();

// 依据真实院校特征估算录取线（600 分制）：有真实预估分数线(estimate_score)时优先，否则启发式兜底
function estimateLine(school, medianPlans) {
  if (school.estimate_score) {
    const m = String(school.estimate_score).match(/\d+(?:\.\d+)?/);
    if (m) {
      const real = Number(m[0]);
      return Math.round(Math.min(600, Math.max(0, real)));
    }
  }
  const isPublic = school.nature === '公办';
  const base = isPublic ? 400 : 320;
  const line = base + (medianPlans - school.plans) * 0.06;
  return Math.round(Math.min(520, Math.max(300, line)));
}

// 解析学费区间（元/年）：支持 "5000元"、"0.5万-1.8万"、"待定" 等格式
function parseTuition(range) {
  if (!range || range === '待定') return null;
  const nums = String(range).match(/(\d+(?:\.\d+)?)\s*(万|元)/g) || [];
  const vals = nums.map(n => {
    const m = n.match(/(\d+(?:\.\d+)?)\s*(万|元)/);
    const v = parseFloat(m[1]);
    return m[2] === '万' ? v * 10000 : v;
  });
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

// 从校名提取地区由 utils.schoolRegion 统一提供（云南 16 州，无省外地州）

// 分数契合度（0-52 分）：分差越接近 0-15 越理想；超过 15 分后连续单调递减，避免分段斜率突变导致排序错误
// 上限从 60 让出 8 分给「招生计划容量」因子，保持整体满分仍为 100
function scoreFit(diff) {
  const d = Math.abs(diff);
  if (d <= 15) return 52;
  return Math.max(15, Math.round(52 - (d - 15) * (37 / 85)));
}

// 专业匹配度（0-25 分）：无关键词时给中性分，匹配专业越多越高
function majorMatch(count, hasKeyword) {
  if (!hasKeyword) return 12;
  if (count >= 5) return 25;
  if (count >= 3) return 20;
  if (count >= 2) return 16;
  if (count >= 1) return 12;
  return 0;
}

// 学费适配度（0-15 分）：无预算限制给满分；预算内满分，超出预算但在浮动比例内按超出比例线性降分
function tuitionFit(tuition, budget, tol) {
  if (!budget || !tuition) return 15;
  if (tuition.max <= budget) return 15;
  const cap = budget * (1 + tol / 100);
  if (tuition.max > cap) return 0;
  const overRatio = (tuition.max - budget) / budget;
  const maxOver = tol / 100;
  return Math.max(3, Math.round(15 - (overRatio / maxOver) * 12));
}

// 招生计划容量（0-8 分，真实招生数据）：计划越多、录取机会越大。
// 作为分数相近院校间的良性优序指标，帮助「稳/保」档筛选出更可依托的院校
function capacityScore(plans) {
  const p = Number(plans) || 0;
  if (p >= 1500) return 8;
  if (p >= 800) return 6;
  if (p >= 400) return 4;
  if (p >= 150) return 2;
  return 0;
}

// 生成推荐理由
function buildReason(item, hasKeyword, hasBudget, budget, tol) {
  const parts = [];
  if (item.diff < 0) parts.push('录取线略高于你的分数，可冲刺');
  else if (item.diff >= 30) parts.push('录取线明显低于你的分数，保底稳妥');
  else if (item.diff >= 15) parts.push('录取线低于你的分数，录取把握较大');
  else parts.push('录取线与你分数相当');
  if (hasKeyword && item.matchMajors.length) parts.push(`有 ${item.matchMajors.length} 个匹配专业`);
  if (hasBudget && item.tuition) {
    if (item.tuition.max <= budget) parts.push('学费在预算内');
    else if (item.tuition.max <= budget * (1 + tol / 100)) parts.push('学费略超预算，可接受');
  }
  if (item.planCapacity && item.planCapacity >= 800) parts.push(`招生计划 ${item.planCapacity} 人，名额充足`);
  return parts.join('，');
}

// 智能志愿推荐：按用户预估总分 + 真实院校数据分档（冲/稳/保）
router.get('/', requireAuth, (req, res) => {
  const { score, keyword, maxTuition, tuitionTolerance, region, limit = 50 } = req.query;
  const uid = req.userId;

  // 得分：优先用用户传入，否则用预测职业技能分 + 文化素质（优先真实会考成绩）
  let totalScore = Number(score);
  if (!totalScore) {
    const bySubject = db.prepare(
      `SELECT q.subject, COUNT(*) AS total, SUM(r.is_correct) AS correct
       FROM practice_records r JOIN questions q ON q.id = r.question_id
       WHERE r.user_id = ? GROUP BY q.subject`
    ).all(uid);
    const rate = (s) => (s?.correct || 0) / Math.max(1, s?.total || 1);
    const vocational = Math.round(150 * rate(bySubject.find(s => s.subject === '信息技术')) +
      150 * rate(bySubject.find(s => s.subject === '通用技术')));
    let cultural = 200; // 文化素质按中等水平估算
    try {
      const profile = db.prepare('SELECT hui_kao_scores FROM user_profiles WHERE user_id = ?').get(uid);
      if (profile?.hui_kao_scores) {
        const scores = JSON.parse(profile.hui_kao_scores);
        const gradeScore = { A: 90, B: 80, C: 70, D: 60 };
        const grades = Object.values(scores).map(g => gradeScore[String(g).toUpperCase()]).filter(v => v != null);
        if (grades.length) cultural = Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10 / 3);
      }
    } catch (e) { /* 忽略解析失败 */ }
    totalScore = vocational + cultural;
  }
  if (!totalScore || totalScore < 0 || totalScore > 600) {
    return res.status(400).json({ code: 400, message: '请输入 0-600 之间的预估总分' });
  }

  const budget = Number(maxTuition) || 0;
  // 学费浮动比例（百分比，0-100，默认 10%）：允许预算上浮的比例
  const tolRaw = Number(tuitionTolerance);
  const tol = (tolRaw >= 0 && tolRaw <= 100) ? tolRaw : 10;
  const reg = String(region || '').trim();

  let schools = db.prepare('SELECT * FROM schools').all();
  if (!schools.length) return res.json({ code: 0, data: { total: 0, tiers: [], score: totalScore } });

  // 地区筛选
  if (reg) schools = schools.filter(s => schoolRegion(s.name) === reg);

  const plansArr = schools.map(s => s.plans).sort((a, b) => a - b);
  const medianPlans = plansArr[Math.floor(plansArr.length / 2)];

  // 专业方向关键词：匹配招生专业名，并统计每校命中专业
  const kw = String(keyword || '').trim();
  const hasKeyword = !!kw;
  const majorMap = new Map(); // school_code -> [{major_name, plan}]
  if (kw) {
    const like = `%${kw}%`;
    const rows = db.prepare(
      'SELECT school_code, major_name, plan FROM plans WHERE major_name LIKE ? ORDER BY plan DESC'
    ).all(like);
    for (const r of rows) {
      if (!majorMap.has(r.school_code)) majorMap.set(r.school_code, []);
      majorMap.get(r.school_code).push({ name: r.major_name, plan: r.plan });
    }
  }

  const matched = [];
  for (const s of schools) {
    const matchMajors = majorMap.get(s.code) || [];
    if (kw && !matchMajors.length) continue;

    const tuition = parseTuition(s.tuition_range);
    // 学费预算筛选：超出「预算 × (1 + 浮动比例)」的院校过滤，浮动区间内的保留但降分
    const tuitionCap = budget ? budget * (1 + tol / 100) : 0;
    if (budget && tuition && tuition.max > tuitionCap) continue;

    const line = estimateLine(s, medianPlans);
    const diff = totalScore - line;
    const isPublic = s.nature === '公办';
    const fit = scoreFit(diff);
    const match = majorMatch(matchMajors.length, hasKeyword);
    const tFit = tuitionFit(tuition, budget, tol);
    const cFit = capacityScore(s.plans);
    const matchScore = fit + match + tFit + cFit;

    const item = {
      code: s.code,
      name: s.name,
      nature: s.nature || '',
      flagship: s.flagship || '',
      isPublic,
      region: schoolRegion(s.name),
      plans: s.plans,
      majors: s.majors,
      tuition_range: s.tuition_range,
      tuition,
      tuitionStatus: budget && tuition ? (tuition.max <= budget ? 'in' : 'over') : 'none',
      line,
      diff,
      estimateScore: s.estimate_score || null,
      capacity: cFit,
      planCapacity: s.plans,
      matchScore,
      matchMajors: matchMajors.slice(0, 4)
    };
    item.reason = buildReason(item, hasKeyword, !!budget, budget, tol);
    matched.push(item);
  }

  // 档内排序：匹配度优先，其次分差
  const fitSort = (arr) => arr.sort((a, b) => b.matchScore - a.matchScore || Math.abs(a.diff) - Math.abs(b.diff));
  // 分档 + 均衡收敛：拓宽「稳」档口径(录取线低于分数 0-45 分内)并对各档设上限，
  // 避免真实录取线双峰分布导致「保档十几所、稳妥仅一两所」这类失衡失用的方案。
  // 「稳」档不足时，就近从未入前两档上限的候选中补足，保证各档均衡可执行。
  const CHONG_MAX = 4, WEN_MAX = 6, BAO_MAX = 4;
  const chongCands = fitSort(matched.filter(it => it.diff >= -20 && it.diff < 0));
  const baoCands = fitSort(matched.filter(it => it.diff >= 45));
  const chong = chongCands.slice(0, CHONG_MAX);
  const bao = baoCands.slice(0, BAO_MAX);
  const wen = fitSort(matched.filter(it => it.diff >= 0 && it.diff < 45));
  const wenOver = [...chongCands.slice(CHONG_MAX), ...baoCands.slice(BAO_MAX)]
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
  for (const cand of wenOver) {
    if (wen.length >= WEN_MAX) break;
    wen.push(cand);
  }

  const result = { chong, wen: wen.slice(0, WEN_MAX), bao };

  // 推荐建议
  const tips = [];
  if (result.chong.length) tips.push(`冲档 ${result.chong.length} 所：录取线略高于你的分数，可大胆冲刺，建议勾选服从调剂`);
  if (result.wen.length) tips.push(`稳档 ${result.wen.length} 所：录取线与你分数相当，是录取概率最大的主力志愿`);
  if (result.bao.length) tips.push(`保档 ${result.bao.length} 所：录取线明显低于你的分数，确保有学可上`);
  // 志愿梯度优化建议：常规区间作参考，同时标注当前方案各档数量，避免与实际分布矛盾
  if (result.chong.length && result.wen.length && result.bao.length) {
    tips.push(`志愿梯度参考：常规 冲 2-3 所、稳 4-5 所、保 2-3 所；你的方案为 冲 ${result.chong.length} · 稳 ${result.wen.length} · 保 ${result.bao.length}，可据实微调各档数量`);
  } else if (result.chong.length && result.wen.length) {
    tips.push('建议再补充 1-2 所保底院校，确保有学可上');
  } else if (result.wen.length && result.bao.length) {
    tips.push('建议再补充 1-2 所冲刺院校，争取更好机会');
  }
  if (budget) tips.push(`已按学费预算筛选（每年不超过 ${budget.toLocaleString()} 元${tol > 0 ? `，允许上浮 ${tol}%` : ''}）`);
  if (reg) tips.push(`已按地区偏好筛选（${reg}）`);
  if (kw && !result.chong.length && !result.wen.length && !result.bao.length) {
    tips.push('没有找到匹配该专业方向的院校，可尝试更换关键词或去掉专业方向');
  }

  res.json({
    code: 0,
    data: {
      score: totalScore,
      keyword: kw,
      maxTuition: budget || null,
      tuitionTolerance: budget ? tol : null,
      region: reg || null,
      tiers: result,
      tips,
      total: result.chong.length + result.wen.length + result.bao.length
    }
  });
});

export default router;
