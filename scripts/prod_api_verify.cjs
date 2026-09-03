// 生产 API 验证：登录 + 知识图谱连通性（含新数据）
const BASE = 'http://127.0.0.1:3000';
async function jf(p, url, opts = {}) {
  const r = await fetch(BASE + url, opts);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { return { raw: t.slice(0, 120), status: r.status }; }
  return j;
}
(async () => {
  const lg = await jf('login', '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13800000099', password: 'Test@123456' })
  });
  const token = (lg?.data?.token) || lg?.token;
  console.log('登录 code:', lg?.code, 'token:', !!token, lg?.message || '');
  if (!token) return;
  const H = { 'Authorization': 'Bearer ' + token };
  const meta = await jf('meta', '/api/questions/meta', { headers: H });
  const subs = meta?.data?.subjects || [];
  const total = subs.reduce((s, x) => s + (x.count || 0), 0);
  console.log('meta 总题量:', total, '科目数:', subs.length);
  for (const subj of ['生物', '信息技术', '通用技术', '化学', '历史', '数学']) {
    const d = await jf('kg', '/api/questions/knowledge-graph?subject=' + encodeURIComponent(subj), { headers: H });
    if (d.code !== 0) { console.log('  KG', subj, 'FAIL', JSON.stringify(d).slice(0, 120)); continue; }
    const nodes = d?.data?.nodes || [], links = d?.data?.links || [];
    const types = {};
    for (const l of links) types[l.kind] = (types[l.kind] || 0) + 1;
    // 连通性
    const adj = {};
    for (const n of nodes) adj[n.id] = new Set();
    for (const l of links) { adj[l.source].add(l.target); adj[l.target].add(l.source); }
    const seen = new Set(); const st = nodes[0]?.id; if (st) { const stack = [st]; while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); for (const y of adj[x]) if (!seen.has(y)) stack.push(y); } }
    let iso = 0; for (const n of nodes) if (!adj[n.id] || adj[n.id].size === 0) iso++;
    console.log(`  KG ${subj}: nodes=${nodes.length} links=${links.length} ${JSON.stringify(types)} 连通=${seen.size}/${nodes.length} 孤立=${iso}`);
  }
})().catch(e => { console.error('ERR', e); process.exit(1); });