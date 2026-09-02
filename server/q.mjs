import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';
const d = new DatabaseSync('E:/saixt/server/data/saixt.db');
console.log('本机 users 数=', d.prepare('select count(*) c from users').get().c);
console.log('本机 users 全部手机号=', JSON.stringify(d.prepare('select id,phone,nickname from users').all().map(r=>({id:r.id,ph:r.phone,nk:r.nickname}))));
console.log('db mtime=', statSync('E:/saixt/server/data/saixt.db').mtime);
try {
  const rows = d.prepare("select id,phone,nickname,substr(password_hash,1,9) ph,length(password_hash) l from users where phone='13800000099'").all();
  console.log('13800000099 本机记录=', JSON.stringify(rows));
} catch(e){ console.log('ERR', e.message); }