const base = 'http://localhost:3000';
const r = await fetch(base + '/api/questions?limit=50');
const j = await r.json();
let withImg = 0;
for (const q of j.data.list) {
  if (q.images && q.images.length) {
    withImg++;
    if (withImg <= 8) console.log(`${q.id} | images=${JSON.stringify(q.images)} | ${String(q.stem).slice(0, 25)}`);
  }
}
console.log('\n前50题中带图题:', withImg);
