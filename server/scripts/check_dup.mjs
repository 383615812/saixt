import { db } from '../src/db.js';

const stems = [
  '如图所示是一款实木结构的儿童床。从人机关系角度分析，以下说法中不正确的是（   ）',
  '如图所示是一款壁挂式扬声器及其评价坐标图。扬声器一侧平台可以放置手机，通过数据线连接手机播放音乐，同时给手机充电。根据该评价坐标图，以下说法中不恰当的是(  )',
  '如图，人字梯是一种常用的工具，在使用中1杆、2杆、3杆主要受到什么力的作用（   ）'
];

for (const s of stems) {
  const rows = db.prepare('SELECT id, subject, chapter, answer, image, source FROM questions WHERE stem LIKE ?').all(s.slice(0, 20) + '%');
  console.log(JSON.stringify(rows, null, 1));
}
