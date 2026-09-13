// AI 上游错误映射自测：用假 DeepSeek 返回 402/429/500，验证路由返回码与提示
process.env.SAIXT_DB_PATH = 'C:/Users/hp/AppData/Local/Temp/saixt_ai_err.db';
process.env.SAIXT_SECRET = 'testsecret-ai';
process.env.NODE_ENV = 'development';
process.env.PORT = '3997';
process.env.DEEPSEEK_API_KEY = 'test-key';
process.env.DEEPSEEK_BASE_URL = 'http://127.0.0.1:4999';

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:3997/api';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const assert = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

let fakeStatus = 402;
const fake = createServer((req, res) => {
  if (req.url.startsWith('/__set')) { fakeStatus = Number(new URL(req.url, 'http://x').searchParams.get('code')) || 402; res.end('ok'); return; }
  res.writeHead(fakeStatus, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'Insufficient Balance' } }));
});
await new Promise(r => fake.listen(4999, '127.0.0.1', r));

const server = spawn('node', [join(__dirname, '..', 'src', 'index.js')], { env: process.env, stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch {} try { fake.close(); } catch {} });

let ok = false;
for (let i = 0; i < 40; i++) { try { const r = await fetch('http://127.0.0.1:3997/api/health'); if (r.ok) { ok = true; break; } } catch {} await sleep(250); }
assert(ok, '服务器就绪');

async function newUser(phone) {
  const r = await (await fetch(BASE + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password: 'pass1234', nickname: 'AI测试' }) })).json();
  return r.data.token;
}
async function plan(token) {
  const r = await fetch(BASE + '/ai/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: '{}' });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

fakeStatus = 402;
const t402 = await newUser('13800000001');
const r402 = await plan(t402);
assert(r402.status === 503 && /额度不足|密钥/.test(r402.body.message || ''), `402 余额不足 → 503 明确提示（实际 ${r402.status}: ${r402.body.message}）`);

fakeStatus = 429;
const t429 = await newUser('13800000002');
const r429 = await plan(t429);
assert(r429.status === 429 && /限流/.test(r429.body.message || ''), `429 限流 → 429 提示（实际 ${r429.status}: ${r429.body.message}）`);

fakeStatus = 500;
const t500 = await newUser('13800000003');
const r500 = await plan(t500);
assert(r500.status === 502 && /连接失败/.test(r500.body.message || ''), `500 上游故障 → 502 连接失败（实际 ${r500.status}: ${r500.body.message}）`);

server.kill(); fake.close();
console.log(`\nAI 错误映射自测：通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
