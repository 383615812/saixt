import { db } from '../src/db.js';

const updates = [
  { id: 38, image: 'qimages/周测五(65份)/img_001.png', answer: 'C', analysis: '采用高强度螺栓连接增强结构强度，实现的是安全目标（防止结构松动倒塌），而非健康目标。A、B、D说法均正确。' },
  { id: 45, image: 'qimages/周测五(65份)/img_003.png', answer: 'C', analysis: '评价坐标图中“价格低”评分最低（约2分），说明该产品价格并不低，故说“价格低”不恰当。造型新颖、实用性强评分高，使用场合广评分中等偏上。' },
  { id: 46, image: 'qimages/周测五(65份)/img_007.png', answer: 'B', analysis: '人字梯使用时：踏板（1杆）承受人体重量发生弯曲变形（受弯曲）；撑杆（2杆）阻止两梯腿张开，主要受拉力；梯框（3杆）将载荷传至地面，主要受压。' }
];

for (const u of updates) {
  db.prepare('UPDATE questions SET image = ?, answer = ?, analysis = ? WHERE id = ?').run(u.image, u.answer, u.analysis, u.id);
  console.log(`[更新] id=${u.id} 答案=${u.answer} 图片=${u.image}`);
}

console.log('图片题总数:', db.prepare("SELECT COUNT(*) c FROM questions WHERE image IS NOT NULL AND image != ''").get().c);
console.log('题库总数:', db.prepare('SELECT subject, COUNT(*) c FROM questions GROUP BY subject').all());
