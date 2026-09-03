// 生产数据库 WAL checkpoint，合并 WAL 到主文件
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/opt/saixt/server/data/saixt.db');
const r = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
console.log('checkpoint:', JSON.stringify(r));
console.log('题数:', db.prepare('SELECT COUNT(*) c FROM questions').get().c);
db.close();
