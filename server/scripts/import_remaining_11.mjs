import { db } from '../src/db.js';

const CHAPTER_MAP = {
  '算法与程序设计': '程序设计基础',
  '设计图样': '技术与设计',
  '三视图': '技术与设计',
  '结构设计': '结构设计',
  '技术图样': '技术与设计',
  '结构与设计': '结构设计',
};

// 11 道待导入题目
const QUESTIONS = [
  // === 信息技术 2 题 ===
  {
    subject: '信息技术', chapter: '算法与程序设计', type: 'single', difficulty: 1,
    stem: '流程图是描述算法的常用工具，图形 表示的是（ ）',
    options: ['A.输入输出', 'B.判断', 'C.开始', 'D.处理'],
    answer: 'D',
    analysis: '流程图中，矩形框（长方形）是标准的"处理框"，用于表示数据处理、赋值、计算等操作步骤。输入输出用平行四边形，判断用菱形，开始/结束用圆角矩形（椭圆形）。',
    source: '信息周测二（125份）',
    images: [], // 题目中符号较小未单独提取，题干文字已能明确题意
  },
  {
    subject: '信息技术', chapter: '算法与程序设计', type: 'single', difficulty: 3,
    stem: '如图所示求连分数值的流程图，则图中①处应填入的内容是（ ）',
    options: ['A. A ← 1 + 1/(2A)', 'B. A ← 2 + 1/A', 'C. A ← 1/(2+A)', 'D. A ← 1/(1+2A)'],
    answer: 'C',
    analysis: '流程图中A初始值为1/2，循环i从1到2执行两次。若①为A←1/(2+A)，则第1次：A=1/(2+1/2)=2/5；第2次：A=1/(2+2/5)=5/12，与连分数1/(2+1/(2+1/2))=5/12完全一致，故①处应填A←1/(2+A)。',
    source: '信息周测二（125份）',
    images: [
      'qimages/信息周测二（125份）/img_003.jpg', // 连分数题干图
      'qimages/信息周测二（125份）/img_004.jpg', // 流程图
    ],
  },

  // === 通用周测一 3 题 ===
  {
    subject: '通用技术', chapter: '设计图样', type: 'single', difficulty: 3,
    stem: '如图所示为一个零件的部分尺寸标注，其中不正确的标注共有（    ）。',
    options: ['A.4处', 'B.5处', 'C.6处', 'D.7处'],
    answer: 'B',
    analysis: '图中错误标注共5处：①左上角圆角标注为φ25，外圆弧应标半径R而非直径φ；②圆孔标注为R10，整圆应标直径φ20而非半径；③尺寸10为竖直方向的深度，却用水平尺寸线标注，方向错误；④尺寸16的基准不明确，与总高50形成封闭尺寸链；⑤尺寸8的尺寸界线起点模糊，基准不明确。',
    source: '通用周测一（10份）',
    images: ['qimages/通用周测一（10份）/img_006.jpg'],
  },
  {
    subject: '通用技术', chapter: '设计图样', type: 'single', difficulty: 2,
    stem: '下列为部分图纸的标注，其中尺寸标注正确的是（    ）。',
    options: ['A.选项A', 'B.选项B', 'C.选项C', 'D.选项D'],
    answer: 'D',
    analysis: '选项D中圆弧外凸，标注半径R8，尺寸线从圆心方向引出，箭头指向圆弧，符号和标注方式均符合半径标注规范。A图尺寸界线跨越多个特征、指向不明；B图水平尺寸数字写在尺寸线下方，违规；C图半圆凸起却标注直径φ12，半圆应标半径R。',
    source: '通用周测一（10份）',
    images: ['qimages/通用周测一（10份）/img_007.jpg'],
  },
  {
    subject: '通用技术', chapter: '三视图', type: 'single', difficulty: 3,
    stem: '如图所示是某工件的轴测图，以下为某学生所画该工件的三视图，正确的是(    )。',
    options: ['A.选项A', 'B.选项B', 'C.选项C', 'D.选项D'],
    answer: 'A',
    analysis: '该工件为长方体顶部开有U形（矩形截面）贯通槽。选项A主视图中凹槽为U形（两侧竖直、底部水平），与轴测图的垂直槽壁特征完全吻合；B为梯形槽、C为V形槽、D为阶梯形槽，均与轴测图的矩形截面不符。',
    source: '通用周测一（10份）',
    images: [
      'qimages/通用周测一（10份）/img_008.jpg', // 轴测图 + 选项A/B
      'qimages/通用周测一（10份）/img_009.jpg', // 选项C/D
    ],
  },

  // === 通用周测三 1 题 ===
  {
    subject: '通用技术', chapter: '结构设计', type: 'single', difficulty: 2,
    stem: '如图所示，在户外墙体上安装空调架，通常选用的连接件是（    ）。',
    options: ['A.塑料膨胀螺栓', 'B.普通螺栓', 'C.紧定螺钉', 'D.金属膨胀螺栓'],
    answer: 'D',
    analysis: '空调外机支架安装在户外混凝土/砖墙上，需承受外机重量、振动载荷和风载荷，必须选用金属膨胀螺栓（拉爆螺丝）。塑料膨胀螺栓承载力不足且易老化，普通螺栓无法在实体墙上固定，紧定螺钉仅用于零件间的定位，均不适用。',
    source: '通用周测三(125份）',
    images: [
      'qimages/通用周测三(125份）/img_011.jpg', // 选项A
      'qimages/通用周测三(125份）/img_012.jpg', // 选项B
      'qimages/通用周测三(125份）/img_013.jpg', // 选项C
      'qimages/通用周测三(125份）/img_014.jpg', // 选项D
      'qimages/通用周测三(125份）/img_015.jpg', // 空调架示意图
    ],
  },

  // === 通用周测四 5 题 ===
  {
    subject: '通用技术', chapter: '技术图样', type: 'single', difficulty: 3,
    stem: '如图所示是某零件的轴测图，其正确的左视图是（    ）。',
    options: ['A.选项A', 'B.选项B', 'C.选项C', 'D.选项D'],
    answer: 'A',
    analysis: '从左视方向观察，零件上部有凹形圆弧槽（V形/弧形凹口），下方底座有台阶，中间圆柱凸台在左视图中不可见，用虚线表示。选项A符合上述特征；B选项中间为矩形实线（错误，圆柱应不可见用虚线）；C、D为主视方向的台阶特征，与左视方向不符。',
    source: '通用周测四（60份）',
    images: [
      'qimages/通用周测四（60份）/img_005.jpg', // 选项A/B
      'qimages/通用周测四（60份）/img_006.jpg', // 轴测图 + 选项C/D
    ],
  },
  {
    subject: '通用技术', chapter: '技术图样', type: 'single', difficulty: 3,
    stem: '如图所示的图样，图中尺寸标注不正确的地方共有（    ）。',
    options: ['A.2处', 'B.3处', 'C.4处', 'D.5处'],
    answer: 'B',
    analysis: '图中有3处标注错误：①2×R28的尺寸线箭头指向内圆（小圆），应指向外圆弧（大圆）；②水平尺寸25的左侧尺寸界线从内竖直线引出，应从实际被测要素引出；③总高25的尺寸线与两圆心间距对应关系不准确，标注的是外形总高却以中心线为基准。',
    source: '通用周测四（60份）',
    images: [
      'qimages/通用周测四（60份）/img_007.png', // 图样
      'qimages/通用周测四（60份）/img_008.png', // 重复/局部图
    ],
  },
  {
    subject: '通用技术', chapter: '技术图样', type: 'single', difficulty: 3,
    stem: '如图所示是某模型的俯视图，以下与之对应的模型是（    ）。',
    options: ['A.选项A', 'B.选项B', 'C.选项C', 'D.选项D'],
    answer: 'B',
    analysis: '俯视图显示：顶部有一条通长的矩形凸起（占大部分宽度），底部有一条通长的矩形凸起，中间有两条竖直虚线（表示下方不可见的凸起/凹槽）。选项B顶部为大台阶面、底部为小凸块，与俯视图特征一致；A、D顶部有斜向V形分割线，俯视图会有斜线；C顶部台阶小、底部台阶大，与俯视图相反。',
    source: '通用周测四（60份）',
    images: [
      'qimages/通用周测四（60份）/img_009.jpg', // 选项A/B/C/D
      'qimages/通用周测四（60份）/img_010.jpg', // 俯视图
    ],
  },
  {
    subject: '通用技术', chapter: '技术图样', type: 'single', difficulty: 3,
    stem: '如图所示为一个零件的部分尺寸标注，其中不正确的标注共有（    ）。',
    options: ['A.2处', 'B.3处', 'C.4处', 'D.5处'],
    answer: 'C',
    analysis: '图中有4处标注错误：①2×R7标注在圆孔旁，但圆孔应标直径φ而非半径R；②尺寸7的右侧尺寸界线未明确指向被测要素；③尺寸10（竖直方向）使用水平尺寸线，方向错误；④R7的尺寸线箭头未正确指向圆弧，且与φ8标注混淆。',
    source: '通用周测四（60份）',
    images: ['qimages/通用周测四（60份）/img_011.jpg'],
  },
  {
    subject: '通用技术', chapter: '结构与设计', type: 'single', difficulty: 3,
    stem: '在如图甲所示的榫卯结构中，图乙为其榫头构件，则榫眼的结构是（    ）。',
    options: ['A.选项A', 'B.选项B', 'C.选项C', 'D.选项D'],
    answer: 'A',
    analysis: '图乙榫头为阶梯式凸出（两层台阶），与之配合的榫眼应为阶梯式凹入，形状互补。选项A的内部阶梯凹口与乙的榫头形状完全吻合，插入后可形成牢固的榫卯连接；B为V形槽、C为Y形开口、D为简单U形槽，均与乙的阶梯榫头不匹配。',
    source: '通用周测四（60份）',
    images: [
      'qimages/通用周测四（60份）/img_014.jpg', // 选项A
      'qimages/通用周测四（60份）/img_015.jpg', // 选项B
      'qimages/通用周测四（60份）/img_016.jpg', // 选项C
      'qimages/通用周测四（60份）/img_017.jpg', // 选项D
      'qimages/通用周测四（60份）/img_018.jpg', // 甲乙题干图
    ],
  },
];

function normStem(s) {
  return String(s || '')
    .replace(/[（(]+\s*[）)]+$/, '')
    .replace(/[？?。\s]+$/, '')
    .replace(/\s+/g, '')
    .trim();
}

const existing = new Set(db.prepare('SELECT stem FROM questions').all().map(r => normStem(r.stem)));

const insert = db.prepare(
  `INSERT INTO questions (subject, chapter, type, difficulty, stem, options, answer, analysis, source, image, images)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`
);

let inserted = 0, skipped = 0;
for (const q of QUESTIONS) {
  const key = normStem(q.stem);
  if (existing.has(key)) { console.log(`[跳过-重复] ${q.stem.slice(0, 40)}`); skipped++; continue; }
  const chapter = CHAPTER_MAP[q.chapter] || q.chapter;
  const firstImg = q.images?.[0] || null;
  const imagesJson = q.images?.length ? JSON.stringify(q.images) : null;
  insert.run(q.subject, chapter, q.type, q.difficulty, q.stem.trim(), JSON.stringify(q.options), q.answer, q.analysis, q.source, firstImg, imagesJson);
  existing.add(key);
  inserted++;
  console.log(`[导入] ${q.subject}/${chapter} | ${q.stem.slice(0, 40)}... | 答案${q.answer} | ${q.images?.length || 0}图`);
}

console.log(`\n成功导入: ${inserted}, 跳过: ${skipped}`);

const after = db.prepare('SELECT subject, COUNT(*) c FROM questions GROUP BY subject').all();
console.log('导入后题库分布:', JSON.stringify(after));
console.log('图片题数量:', db.prepare("SELECT COUNT(*) c FROM questions WHERE image IS NOT NULL AND image != ''").get().c);
console.log('多图题数量:', db.prepare("SELECT COUNT(*) c FROM questions WHERE images IS NOT NULL AND images != ''").get().c);
