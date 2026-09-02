import { db } from '../src/db.js';

// 添加 image 字段（若不存在）
const cols = db.prepare('PRAGMA table_info(questions)').all().map(c => c.name);
if (!cols.includes('image')) {
  db.exec('ALTER TABLE questions ADD COLUMN image TEXT');
  console.log('[OK] 已添加 image 字段');
}

const CHAPTER_MAP = {
  '结构及其设计': '结构设计',
  '流程及其设计': '流程设计',
  '算法与程序设计': '程序设计基础',
  '数据分析与可视化': '数据处理',
  '数据处理与分析': '数据处理',
  '人机关系': '技术与设计',
  '设计的评价': '技术与设计',
  '结构的受力': '结构设计',
  '木工工艺': '技术与设计',
  '设计的一般原则': '技术与设计',
  '结构与设计': '结构设计',
  '结构设计': '结构设计',
  '流程设计': '流程设计',
  '工艺与操作': '技术与设计',
  '三视图': '技术与设计'
};

// 已确认的图片题：stem 用于去重，image 为相对 public 的路径
const QUESTIONS = [
  {
    subject: '通用技术', chapter: '结构及其设计', type: 'single', difficulty: 1,
    stem: '如图是对某新型材料制成的砖块进行试验的示意图，该砖块在试验中的受力形式是（   ）',
    options: ['A.受压', 'B.受拉', 'C.受扭转', 'D.受剪切'],
    answer: 'A',
    analysis: '图中力F竖直向下施加在砖块顶部，砖块底部固定，属于典型的抗压强度试验，砖块主要受压力。',
    source: '110份',
    image: 'qimages/110份/img_004.png'
  },
  {
    subject: '通用技术', chapter: '流程及其设计', type: 'single', difficulty: 3,
    stem: '通用技术实践课上，小明用实心金属圆柱加工如图所示的六棱形螺纹连接件。该六棱形螺纹连接件的加工流程最合理的是（      ）',
    options: ['A.划线→锯割→锉削→钻孔→攻丝→倒角→淬火→电镀', 'B.划线→锯割→锉削→钻孔→倒角→攻丝→电镀→淬火', 'C.划线→钻孔→锯割→锉削→倒角→攻丝→电镀→淬火', 'D.划线→锯割→锉削→钻孔→倒角→攻丝→淬火→电镀'],
    answer: 'D',
    analysis: '加工六棱形螺纹连接件：先划线，再锯割下料、锉削成形六棱，钻孔后先倒角再攻丝（倒角便于丝锥导入），淬火（热处理）后再电镀（表面处理），顺序合理。',
    source: '110份_(2)',
    image: 'qimages/110份 (2)/img_008.png'
  },
  {
    subject: '通用技术', chapter: '流程及其设计', type: 'single', difficulty: 2,
    stem: '如图所示为某纯净水设备工艺流程图。下列关于该流程的说法中不正确的是（   ）',
    options: ['A.石英砂过滤器和活性炭过滤器属于串行工序', 'B.调大增压泵增压效果可以提高纯净水生产效率', 'C.在设计该流程时，需考虑原水的来源', 'D.该流程可以划分为过滤、灭菌、储水三个环节'],
    answer: 'B',
    analysis: '增压泵只负责向预处理过滤器供水，提高其增压效果并不能直接提高反渗透主机（RO）的产水效率；产水效率由高压泵和RO膜决定。A、C、D说法均正确。',
    source: '110份_(2)',
    image: 'qimages/110份 (2)/img_009.png'
  },
  {
    subject: '通用技术', chapter: '流程及其设计', type: 'single', difficulty: 2,
    stem: '如图所示的衣帽架主要由底盘、立柱、挂钩组装而成。其中，立柱段之间通过螺丝连接，大、小挂钩采用螺丝拧至对应立柱上。从流程的角度，下列分析不正确的是（   ）',
    options: ['A.挂钩安装应先小后大，时序不可颠倒', 'B.立柱1、2、3段的连接可设计为串行工序', 'C.挂钩安装在最后进行，便于立柱段之间的连接', 'D.多个挂钩安装可设计成并行工序，节省安装时间，但需增加人力'],
    answer: 'A',
    analysis: '小挂钩位于顶部立柱3段，大挂钩位于中部立柱2段，组装自下而上时应先装大挂钩再装小挂钩，故“应先小后大”说法错误。B、C、D分析均合理。',
    source: '110份_(2)',
    image: 'qimages/110份 (2)/img_010.png'
  },
  {
    subject: '信息技术', chapter: '算法与程序设计', type: 'single', difficulty: 2,
    stem: '身体质量指数（BMI）常用来衡量人体胖瘦程度以及是否健康的一个标准。当BMI值超过28时，说明身体肥胖，如图所示是根据BMI值判断人体胖瘦的部分流程图。假设某同学的BMI指数为30，则该流程的执行顺序为（ ）',
    options: ['A.①→②→③→④', 'B.①→②→③', 'C.①→②→④→③', 'D.①→②→④'],
    answer: 'D',
    analysis: 'BMI=30＞28，判断条件成立，走Y分支直接输出结果1（④），执行顺序为①→②→④。',
    source: '信息周测二（125份）',
    image: 'qimages/信息周测二（125份）/img_001.jpg'
  },
  {
    subject: '信息技术', chapter: '算法与程序设计', type: 'single', difficulty: 3,
    stem: '某算法的部分流程图如图所示，执行这部分流程后，输出s的值为（ ）',
    options: ['A.3', 'B.4', 'C.15', 'D.19'],
    answer: 'D',
    analysis: '流程：s=0,k=1,i=1。i≤5时循环：k=k×i，s=s+k，i=i+2。第1次i=1：k=1，s=1，i=3；第2次i=3：k=3，s=4，i=5；第3次i=5：k=15，s=19，i=7；i=7＞5退出，输出s=19。',
    source: '信息周测二（125份）',
    image: 'qimages/信息周测二（125份）/img_002.jpg'
  },
  {
    subject: '信息技术', chapter: '数据分析与可视化', type: 'single', difficulty: 2,
    stem: '某数据分析网站，运用Python中的matplotlib.pyplot库对我国2020年至2024年4G基站与5G基站的总数进行可视化呈现。下图用到了子库pyplot的函数是( )',
    options: ['A.pyplot.plot()', 'B.pyplot.bar()', 'C.pyplot.scatter()', 'D.pyplot.stackplot()'],
    answer: 'B',
    analysis: '图中为分组柱状图（4G与5G基站按年份并列显示），绘制柱状图应使用pyplot.bar()函数。',
    source: '信息周测五（65份）',
    image: 'qimages/信息周测五（65份）/img_002.jpg'
  },
  {
    subject: '信息技术', chapter: '数据处理与分析', type: 'single', difficulty: 3,
    stem: '如图所示为某代驾平台7月代驾情况数据表，现需要核算每位司机7月的出车次数，M3单元格运用COUNTIF函数统计368001陈师傅的出车次数后，可以用“自动填充”的功能统计得到其他司机的出车次数，以下COUNTIF函数的参数正确的是（ ）',
    options: ['A.B4:B65', 'B.B3:B65', 'C.$B$3:$B$65', 'D.$B$4:$B$65'],
    answer: 'C',
    analysis: '司机编号在B列，数据从第3行开始（第2行为表头），统计范围应为B3:B65；自动填充时范围必须绝对引用（加$），否则填充后范围会偏移，故选$B$3:$B$65。',
    source: '信息周测四（60份）',
    image: 'qimages/信息周测四（60份）/img_002.jpg'
  },
  {
    subject: '信息技术', chapter: '数据处理与分析', type: 'single', difficulty: 2,
    stem: '能完成下面电子表格中F2单元格数据统计的函数表达式为（ ）。',
    options: ['A.=countif(B2:B14,"男")', 'B.=sumif(B2:B14,"男")', 'C.=count(B2:B14,"男")', 'D.=sum(B2:B14,"男")'],
    answer: 'A',
    analysis: 'F2统计的是男员工人数，需按条件计数，使用COUNTIF函数：=countif(B2:B14,"男")，统计B2:B14中性别为“男”的单元格个数。',
    source: '信息周测四（60份）',
    image: 'qimages/信息周测四（60份）/img_003.jpg'
  },
  {
    subject: '通用技术', chapter: '人机关系', type: 'single', difficulty: 2,
    stem: '如图所示是一款实木结构的儿童床。从人机关系角度分析，以下说法中不正确的是（   ）',
    options: ['A.根据儿童好动活泼的特征设计床的形状与尺寸，考虑了静态人和动态人', 'B.将床板设计成栅栏结构，透气性好，实现了舒适目标', 'C.采用高强度螺栓连接，增强了结构的强度，实现了健康目标', 'D.床上用品采用了儿童喜欢的色调与风格，考虑了儿童的心理需求'],
    answer: 'C',
    analysis: '采用高强度螺栓连接增强结构强度，实现的是安全目标（防止结构松动倒塌），而非健康目标。A、B、D说法均正确。',
    source: '周测五(65份)',
    image: 'qimages/周测五(65份)/img_001.png'
  },
  {
    subject: '通用技术', chapter: '设计的评价', type: 'single', difficulty: 2,
    stem: '如图所示是一款壁挂式扬声器及其评价坐标图。扬声器一侧平台可以放置手机，通过数据线连接手机播放音乐，同时给手机充电。根据该评价坐标图，以下说法中不恰当的是(  )',
    options: ['A.造型新颖', 'B.实用性强', 'C.价格低', 'D.适合多种场合'],
    answer: 'C',
    analysis: '评价坐标图中“价格低”评分最低（约2分），说明该产品价格并不低，故说“价格低”不恰当。造型新颖、实用性强评分高，使用场合广评分中等偏上。',
    source: '周测五(65份)',
    image: 'qimages/周测五(65份)/img_003.png'
  },
  {
    subject: '通用技术', chapter: '结构的受力', type: 'single', difficulty: 2,
    stem: '如图，人字梯是一种常用的工具，在使用中1杆、2杆、3杆主要受到什么力的作用（   ）',
    options: ['A.1杆受压、2杆感受拉、3杆受压', 'B.1杆受弯曲、2杆感受拉、3杆受压', 'C.1杆受压、2杆感受到压、3杆受剪切', 'D.1杆受弯曲、2杆感受拉、3杆受扭转'],
    answer: 'B',
    analysis: '人字梯使用时：踏板（1杆）承受人体重量发生弯曲变形（受弯曲）；撑杆（2杆）阻止两梯腿张开，主要受拉力；梯框（3杆）将载荷传至地面，主要受压。',
    source: '周测五(65份)',
    image: 'qimages/周测五(65份)/img_007.png'
  },
  {
    subject: '通用技术', chapter: '木工工艺', type: 'single', difficulty: 2,
    stem: '某同学制作孔明锁时，需要将刨好的方木条加工成如图所示的零件，下列工具中需要用到的有（     ）\n①木工锯 ②凿子 ③锤子 ④电钻 ⑤角尺和铅笔',
    options: ['A.①②③⑤', 'B.②③④⑤', 'C.①③④⑤', 'D.①②③④'],
    answer: 'A',
    analysis: '加工孔明锁零件需锯割下料（木工锯）、凿削榫槽（凿子）、锤击凿子（锤子）、划线定位（角尺和铅笔）；该零件为简单榫槽结构，无需电钻。',
    source: '周测五(65份)',
    image: 'qimages/周测五(65份)/img_008.png'
  },
  {
    subject: '通用技术', chapter: '设计的一般原则', type: 'single', difficulty: 2,
    stem: '如图所示是一款环保保温水杯及其评价坐标图，保温水杯以玉米和玉米秆结晶物作为原材料，该产品有六种图案供不同消费人群选择。以下对坐标图的分析中，最恰当的是(    )。',
    options: ['A.该产品设计新颖、非常美观', 'B.该产品的设计成本大大低于同类产品', 'C.该产品很环保，符合可持续发展原则', 'D.该产品的杯盖密封性好、保湿性好、实用性强'],
    answer: 'C',
    analysis: '评价坐标图中“环保”评分高（约4分），且产品以玉米秆结晶物为原料，符合可持续发展原则。成本评分低说明成本较高，创新评分中等，“设计新颖”并非最突出。',
    source: '通用周测一（10份）',
    image: 'qimages/通用周测一（10份）/img_004.jpg'
  },
  {
    subject: '通用技术', chapter: '结构与设计', type: 'single', difficulty: 2,
    stem: '如图所示是一款家用拖把，在拖把拧干时，构件1、构件2 的主要受力形式是(   )。',
    options: ['A.构件1受拉力，构件2受弯曲力', 'B.构件1受弯曲力，构件2受拉力', 'C.构件1受弯曲力，构件2受压力', 'D.构件1受压力，构件2受拉力'],
    answer: 'B',
    analysis: '拧干拖把时，拖把头（构件1）被折叠挤压，发生弯曲变形（受弯曲力）；滑动套（构件2）通过连杆拉动拖把头折叠，主要受拉力。',
    source: '通用周测四（60份）',
    image: 'qimages/通用周测四（60份）/img_001.jpg'
  },
  {
    subject: '通用技术', chapter: '结构与设计', type: 'single', difficulty: 2,
    stem: '在加力杆上施加力 F 时，以下构件的主要受力形式是（    ）。',
    options: ['A.连杆受拉力，加力杆受弯曲力', 'B.连杆受压力，加力杆受弯曲力', 'C.连杆受拉力，加力杆受压力', 'D.连杆受压力，加力杆受压力'],
    answer: 'A',
    analysis: '力F施加在加力杆自由端，加力杆绕销轴转动，发生弯曲变形（受弯曲力）；连杆连接加力杆与夹紧机构，随加力杆转动被拉动，主要受拉力。',
    source: '通用周测四（60份）',
    image: 'qimages/通用周测四（60份）/img_020.jpg'
  },
  {
    subject: '通用技术', chapter: '结构设计', type: 'single', difficulty: 3,
    stem: '如图所示的连杆机构，在力F,和F的作用下处于平衡状态，此时推杆1、推杆2水平，摆杆处于垂直位置。下列对各个构件主要受力形式分析中正确的是（ ）',
    options: ['A.推杆1受压', 'B.摆杆受压、受弯曲', 'C.推杆2受压、受扭转', 'D.连杆2受扭转'],
    answer: 'B',
    analysis: '摆杆在销轴处与多根构件相连，属于多力构件，除承受轴向压力外还受弯曲作用（受压、受弯曲）。推杆1、推杆2为滑块沿轴向受力，不受扭转；连杆2为二力杆，只受轴向力，不受扭转。',
    source: '通用模拟测试题（130份）',
    image: 'qimages/通用模拟测试题（130份）/img_002.png'
  },
  {
    subject: '通用技术', chapter: '流程设计', type: 'single', difficulty: 3,
    stem: '如图所示是连杆机构中的摆杆，小明在通用技术实践课上用厚度正好的钢板加工该零件，据此回答第4题。下列是小明设计该零件加工流程时进行的分析，其中不合理的是（ ）',
    options: ['A.先划对称线和中心线，再冲眼、划圆，然后划轮廓线', 'B.加工外形轮廓时，根据划出的轮廓线进行锯割，然后削轮廓的平面和半圆弧面', 'C.加工大孔和螺纹孔时，先钻大孔，后钻螺纹底孔，加工完槽1再攻丝', 'D.外形轮廓和大孔及螺纹底孔加工后，再加工槽1'],
    answer: 'C',
    analysis: '攻丝应在钻完螺纹底孔后立即进行，若先加工槽1再攻丝，槽1加工产生的振动和变形会影响螺纹质量，且攻丝时工件夹持也会受影响，故“加工完槽1再攻丝”不合理。',
    source: '通用模拟测试题（130份）',
    image: 'qimages/通用模拟测试题（130份）/img_003.png'
  },
  {
    subject: '通用技术', chapter: '工艺与操作', type: 'single', difficulty: 2,
    stem: '加工该零件时，下列操作不合理的是（ ）',
    options: ['A.划轮廓线时，轮廓尺寸包含锉削余量', 'B.钻孔时不戴手套，工件用平口钳夹紧', 'C.正常锯割时，锯程不小于锯条长度的2/3为宜', 'D.攻丝时，丝锥的切削部分全部进入工件，就不再施加压力'],
    answer: 'D',
    analysis: '攻丝时，当丝锥的切削部分进入工件后，应继续均匀转动丝锥并适时反转断屑，同时不再施加压力；若完全不再转动只停止施压，丝锥会卡死，故该操作不合理。',
    source: '通用模拟测试题（130份）',
    image: 'qimages/通用模拟测试题（130份）/img_003.png'
  },
  {
    subject: '通用技术', chapter: '三视图', type: 'single', difficulty: 3,
    stem: '如图所示为某形体的三视图。图中存在的错误共有（ ）',
    options: ['A.1处', 'B.2处', 'C.3处', 'D.4处'],
    answer: 'C',
    analysis: '该三视图存在投影关系错误：主视图中U形槽底面的虚线表达不完整且与左视图槽底高度不一致；主视图顶部斜面与左视图对应位置缺少投影；俯视图中部分斜线结构在主视图、左视图中无对应投影。共约3处错误。',
    source: '通用模拟测试题（130份）',
    image: 'qimages/通用模拟测试题（130份）/img_004.png'
  }
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
  `INSERT INTO questions (subject, chapter, type, difficulty, stem, options, answer, analysis, source, image)
   VALUES (?,?,?,?,?,?,?,?,?,?)`
);

let inserted = 0, skipped = 0;
for (const q of QUESTIONS) {
  const key = normStem(q.stem);
  if (existing.has(key)) { console.log(`[跳过-重复] ${q.stem.slice(0, 30)}`); skipped++; continue; }
  const chapter = CHAPTER_MAP[q.chapter] || (q.subject === '信息技术' ? '数据与信息' : '技术与设计');
  insert.run(q.subject, chapter, q.type, q.difficulty, q.stem.trim(), JSON.stringify(q.options), q.answer, q.analysis, q.source, q.image);
  existing.add(key);
  inserted++;
  console.log(`[导入] ${q.subject}/${chapter} | ${q.stem.slice(0, 30)}... | 答案${q.answer} | ${q.image}`);
}

console.log(`\n成功导入: ${inserted}, 跳过: ${skipped}`);

// 修复无章节题目
const fixes = [
  { id: 100, chapter: '系统设计' },
  { id: 101, chapter: '计算机基础' },
  { id: 102, chapter: '计算机基础' }
];
for (const f of fixes) {
  db.prepare('UPDATE questions SET chapter = ? WHERE id = ?').run(f.chapter, f.id);
}
console.log('已修复无章节题目');

const after = db.prepare('SELECT subject, COUNT(*) c FROM questions GROUP BY subject').all();
console.log('导入后题库分布:', JSON.stringify(after));
console.log('图片题数量:', db.prepare("SELECT COUNT(*) c FROM questions WHERE image IS NOT NULL AND image != ''").get().c);
