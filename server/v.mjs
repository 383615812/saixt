import { DatabaseSync } from 'node:sqlite';
import { scryptSync, timingSafeEqual } from 'node:crypto';
const d = new DatabaseSync('E:/saixt/server/data/saixt.db');
const cols = d.prepare("PRAGMA table_info(users)").all().map(c=>c.name);
console.log('users 列=', JSON.stringify(cols));
// 找密码列
const pwdCol = cols.find(c=>/pass|pwd|secret|hash/i.test(c));
console.log('密码列=', pwdCol);
const u = d.prepare(`select id,phone,${pwdCol} ph from users where phone=?`).get('13800000099');
console.log('记录=', u ? {id:u.id, ph:u.ph.slice(0,12)+'... len='+u.ph.length} : 'NOT FOUND');
if (u && u.ph && u.ph.startsWith('scrypt$')) {
  const [tag,salt,hash]=u.ph.split('$');
  const calc=scryptSync('Test@123456', salt, 64, {N:16384,r:8,p:1});
  const ok=hash && calc.length===Buffer.from(hash,'hex').length && timingSafeEqual(calc, Buffer.from(hash,'hex'));
  console.log('本机db 13800000099 / Test@123456 校验 =', ok);
} else if (u) {
  const {createHash}=await import('node:crypto');
  console.log('非scrypt hash, head=', u.ph.slice(0,16));
}