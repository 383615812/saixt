import { readFileSync } from 'node:fs';

function norm(s) { return (s || '').replace(/[\s（）()。，,、：:；;？?【】\[\]“”"\'．.\-]/g, ''); }

const target = norm('如图所示为一款轻巧折叠式USB笔记本散热垫。这款散热垫采用高耐磨且具有散热功能的合金材质制造，外形美观，深受消费者的喜爱。下列对该产品的评价中，不恰当的是');

for (const [name, path] of [['docx', 'E:/saixt/server/public/qimages/_docx_mapping.json'], ['pdf', 'E:/saixt/server/public/qimages/_pdf_mapping.json']]) {
  const m = JSON.parse(readFileSync(path, 'utf-8'));
  console.log(`\n===== ${name} mapping (${Object.keys(m).length} sources) =====`);
  for (const [src, blocks] of Object.entries(m)) {
    if (!src.includes('通用周测三')) continue;
    console.log(`源: ${src} 块数: ${blocks.length}`);
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const t = b.text || '';
      if (t.includes('USB笔记本散热垫') || t.includes('散热垫')) {
        console.log(`  块${i}: 图=${JSON.stringify(b.images)} | ${t.slice(0, 60)}`);
      }
    }
  }
}
