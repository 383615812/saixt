import { readFileSync } from 'node:fs';

const m = JSON.parse(readFileSync('E:/saixt/server/public/qimages/_docx_mapping.json', 'utf-8'));
const blocks = m['通用周测三(125份）'];
for (let i = 0; i < blocks.length; i++) {
  const b = blocks[i];
  if (b.images && b.images.length) {
    console.log(`块${i}: 图=${JSON.stringify(b.images)} | ${(b.text || '').slice(0, 50)}`);
  }
}
