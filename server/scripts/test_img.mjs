const base = 'http://localhost:3000';
const paths = [
  '/qimages/周测五(65份)/img_001.png',
  '/qimages/通用周测四（60份）/img_005.jpg',
  '/qimages/通用周测三(125份）/img_011.jpg',
  '/qimages/信息周测二（125份）/img_001.jpg'
];
for (const p of paths) {
  try {
    const r = await fetch(base + encodeURI(p));
    console.log(`${r.status} ${r.headers.get('content-type')} | ${p}`);
  } catch (e) {
    console.log(`ERR ${p}: ${e.message}`);
  }
}
