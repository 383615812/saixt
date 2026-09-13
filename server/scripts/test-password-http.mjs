// 修改密码 HTTP 冒烟：独立临时库 + 临时端口
process.env.SAIXT_DB_PATH = 'C:/Users/hp/AppData/Local/Temp/saixt_pwd_http.db';
process.env.SAIXT_SECRET = 'testsecret-for-pwd';
process.env.NODE_ENV = 'development';
process.env.PORT = '3998';

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3998;
const BASE = `http://127.0.0.1:${PORT}/api`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const assert = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, code: j.code, data: j.data, message: j.message };
}

console.log('启动服务器…');
const server = spawn('node', [join(__dirname, '..', 'src', 'index.js')], { env: process.env, stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch {} });
let ok = false;
for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + '/health'); if (r.ok) { ok = true; break; } } catch {} await sleep(250); }
assert(ok, '服务器启动且 /health 就绪');

const PH = '13800000000';
const PW = 'oldpass1';
const reg = await call('/auth/register', { method: 'POST', body: { phone: PH, password: PW, nickname: '改密测试' } });
assert(reg.status === 200 && reg.data && reg.data.token, '注册成功并取得 token');
const token = reg.data && reg.data.token;

assert((await call('/auth/password', { method: 'POST', body: { old_password: PW, new_password: 'newpass1' } })).status === 401, '未登录改密被拒(401)');
assert((await call('/auth/password', { method: 'POST', token, body: { old_password: 'wrong', new_password: 'newpass1' } })).status === 400, '原密码错误被拒(400)');
assert((await call('/auth/password', { method: 'POST', token, body: { old_password: PW, new_password: '123' } })).status === 400, '新密码过短被拒(400)');
assert((await call('/auth/password', { method: 'POST', token, body: { old_password: PW, new_password: PW } })).status === 400, '新旧密码相同被拒(400)');

const okc = await call('/auth/password', { method: 'POST', token, body: { old_password: PW, new_password: 'newpass1' } });
assert(okc.status === 200 && okc.code === 0, '正确原密码修改成功');

assert((await call('/auth/login', { method: 'POST', body: { phone: PH, password: PW } })).status === 401, '旧密码已失效(401)');
const nl = await call('/auth/login', { method: 'POST', body: { phone: PH, password: 'newpass1' } });
assert(nl.status === 200 && nl.data && nl.data.token, '新密码登录成功');

server.kill();
console.log(`\n改密冒烟结果：通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
