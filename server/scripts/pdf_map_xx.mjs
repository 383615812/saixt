import { readFileSync } from 'node:fs';

const m = JSON.parse(readFileSync('E:/saixt/server/public/qimages/_pdf_mapping.json', 'utf-8'));
for (const [src, blocks] of Object.entries(m)) {
  if (!src.includes('信息周测二')) continue;
  console.log(`源: ${src} 块数: ${blocks.length}`);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const t = (b.text || '').replace(/\s+/g, ' ').slice(0, 60);
    const imgs = b.images || [];
    if (imgs.length || /流程图|图形表示|1\+2|求和|①/.test(b.text || '')) {
      console.log(`  块${i}: 图=${JSON.stringify(imgs)} | ${t}`);
    }
  }
}
