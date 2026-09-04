import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = process.env.SAIXT_DB_PATH || join(DATA_DIR, 'saixt.db');

mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  -- 并发写耐久：支付/订单为资金数据，采用 FULL 同步保证提交不丢（崩盘/断电不撕裂提交）
  PRAGMA synchronous = FULL;
  -- 多写者等待而非报错：即使未来多进程/集群部署，也避免 SQLITE_BUSY 直接 500
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nickname TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY,
    target_school TEXT,
    target_score INTEGER,
    hui_kao TEXT,
    hui_kao_scores TEXT,
    org TEXT,
    email TEXT,
    remind_email INTEGER DEFAULT 0,
    remind_sms INTEGER DEFAULT 0,
    remind_time TEXT DEFAULT '19:00',
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY,
    subject TEXT,
    chapter TEXT,
    type TEXT,
    difficulty INTEGER,
    stem TEXT,
    options TEXT,
    answer TEXT,
    analysis TEXT,
    source TEXT,
    image TEXT,
    images TEXT
  );
  CREATE TABLE IF NOT EXISTS practice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    subject TEXT,
    mode TEXT,
    total INTEGER,
    correct INTEGER,
    score REAL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS practice_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            question_id INTEGER,
            answer TEXT,
            is_correct INTEGER,
            session_id INTEGER,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
            FOREIGN KEY (session_id) REFERENCES practice_sessions(id) ON DELETE SET NULL
          );
          CREATE TABLE IF NOT EXISTS checkins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            date TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(user_id, date),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          );
          CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            question_id INTEGER,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(user_id, question_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
          );
  CREATE TABLE IF NOT EXISTS study_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    key TEXT,
    earned_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(user_id, key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS ai_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS review_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    question_id INTEGER,
    stage INTEGER DEFAULT 0,
    next_due TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(user_id, question_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS wrong_mastered (
    user_id INTEGER,
    question_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(user_id, question_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  );
  -- 盲盒抽题记录：服务端固化稀有度分数，提交时校验题目来源，防止客户端篡改得分
  CREATE TABLE IF NOT EXISTS blind_box_draws (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    rarity_score INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_blind_draws_user ON blind_box_draws(user_id, question_id);
  -- 盲盒连击状态：服务端维护连击数，防止客户端伪造连击加成
  CREATE TABLE IF NOT EXISTS blind_box_state (
    user_id INTEGER PRIMARY KEY,
    combo INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS weekly_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    week_start TEXT,
    week_end TEXT,
    data TEXT,
    ai_summary TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(user_id, week_start),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS reminder_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    content TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS schools (
    code TEXT PRIMARY KEY,
    name TEXT,
    plans INTEGER,
    majors INTEGER,
    tuition_range TEXT,
    estimate_score TEXT,
    nature TEXT,
    flagship TEXT
  );
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_code TEXT,
    school_name TEXT,
    major_code INTEGER,
    major_name TEXT,
    tuition TEXT,
    plan INTEGER,
    lang TEXT DEFAULT '不限',
    oral TEXT DEFAULT '否',
    FOREIGN KEY (school_code) REFERENCES schools(code) ON DELETE CASCADE
  );
  -- 商业运营：会员 / 订单 / 积分 / 邀请 / AI 配额
  CREATE TABLE IF NOT EXISTS memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    level TEXT NOT NULL DEFAULT 'vip',
    status TEXT NOT NULL DEFAULT 'active',
    start_at TEXT DEFAULT (datetime('now','localtime')),
    expire_at TEXT,
    source TEXT DEFAULT 'order',
    UNIQUE(user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    product_code TEXT NOT NULL,
    product_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    pay_method TEXT,
    paid_at TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS points (
    user_id INTEGER PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS point_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    change INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inviter_id INTEGER NOT NULL,
    invitee_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(invitee_id),
    FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS ai_usage (
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    kind TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date, kind),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS ai_topup (
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, kind),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'admin',
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    kind TEXT NOT NULL DEFAULT 'vip',
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    months INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_point_logs_user ON point_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invites(inviter_id);
  CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject);
  CREATE INDEX IF NOT EXISTS idx_plans_school ON plans(school_code);
  CREATE INDEX IF NOT EXISTS idx_records_user ON practice_records(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON practice_sessions(user_id);
  -- 高频统计/反查索引
  CREATE INDEX IF NOT EXISTS idx_records_question ON practice_records(question_id);
  CREATE INDEX IF NOT EXISTS idx_records_created_at ON practice_records(created_at);
  CREATE INDEX IF NOT EXISTS idx_records_user_created ON practice_records(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON practice_sessions(created_at);
  CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(date);
  CREATE INDEX IF NOT EXISTS idx_schedule_due ON review_schedule(user_id, next_due);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);
  -- 日志归档表：practice_records 超期数据归档于此，保留历史且主表保持轻量
  CREATE TABLE IF NOT EXISTS practice_records_archive (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    question_id INTEGER,
    answer TEXT,
    is_correct INTEGER,
    session_id INTEGER,
    created_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_archive_user ON practice_records_archive(user_id);
`);

// 旧库兼容：补充新增列
try { db.exec('ALTER TABLE user_profiles ADD COLUMN hui_kao_scores TEXT'); } catch (e) { /* 列已存在则忽略 */ }
try { db.exec('ALTER TABLE blind_box_draws ADD COLUMN used INTEGER DEFAULT 0'); } catch (e) { /* 列已存在则忽略 */ }
try { db.exec('ALTER TABLE practice_records ADD COLUMN session_id INTEGER'); } catch (e) { /* 列已存在则忽略 */ }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_records_session ON practice_records(session_id)'); } catch (e) { /* 索引已存在则忽略 */ }
try { db.exec('ALTER TABLE user_profiles ADD COLUMN email TEXT'); } catch (e) { /* 列已存在则忽略 */ }
try { db.exec('ALTER TABLE user_profiles ADD COLUMN remind_email INTEGER DEFAULT 0'); } catch (e) { /* 列已存在则忽略 */ }
try { db.exec('ALTER TABLE user_profiles ADD COLUMN remind_sms INTEGER DEFAULT 0'); } catch (e) { /* 列已存在则忽略 */ }
try { db.exec('ALTER TABLE user_profiles ADD COLUMN remind_time TEXT DEFAULT "19:00"'); } catch (e) { /* 列已存在则忽略 */ }
try { db.exec('ALTER TABLE users ADD COLUMN invite_code TEXT'); } catch (e) { /* 列已存在则忽略 */ }
try { db.exec('ALTER TABLE schools ADD COLUMN estimate_score TEXT'); } catch (e) { /* 列已存在则忽略 */ }
try { db.exec('ALTER TABLE schools ADD COLUMN nature TEXT'); } catch (e) { /* 列已存在则忽略 */ }
try { db.exec('ALTER TABLE schools ADD COLUMN flagship TEXT'); } catch (e) { /* 列已存在则忽略 */ }
try { db.exec("ALTER TABLE plans ADD COLUMN lang TEXT DEFAULT '不限'"); } catch (e) { /* 列已存在则忽略 */ }
try { db.exec("ALTER TABLE plans ADD COLUMN oral TEXT DEFAULT '否'"); } catch (e) { /* 列已存在则忽略 */ }
try { db.exec('ALTER TABLE users ADD COLUMN reg_ip TEXT'); } catch (e) { /* 列已存在则忽略 */ }
try { db.exec('ALTER TABLE invites ADD COLUMN redeem_ip TEXT'); } catch (e) { /* 列已存在则忽略 */ }

// ---- 种子数据 ----
function seedIfEmpty(table, file, mapper) {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get();
  if (row.c > 0) return;
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) return;
  const items = JSON.parse(readFileSync(path, 'utf-8'));
  const insert = db.prepare(mapper.stmt);
  db.exec('BEGIN');
  for (const it of items) {
    try { insert.run(...mapper.args(it)); } catch (e) { /* 忽略单条冲突 */ }
  }
  db.exec('COMMIT');
  console.log(`[seed] ${table}: ${items.length} 条`);
}

seedIfEmpty('questions', 'questions.json', {
  stmt: `INSERT INTO questions (id, subject, chapter, type, difficulty, stem, options, answer, analysis, source)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
  args: q => [q.id, q.subject, q.chapter, q.type, q.difficulty, q.stem, JSON.stringify(q.options), q.answer, q.analysis, q.source]
});

seedIfEmpty('schools', 'schools.json', {
  stmt: `INSERT INTO schools (code, name, plans, majors, tuition_range, estimate_score, nature, flagship) VALUES (?,?,?,?,?,?,?,?)`,
  args: s => [s.code, s.name, s.plans, s.majors, s.tuition_range, s.estimate_score || '', s.nature || '', s.flagship || '']
});

seedIfEmpty('plans', 'plans.json', {
  stmt: `INSERT INTO plans (school_code, school_name, major_code, major_name, tuition, plan, lang, oral) VALUES (?,?,?,?,?,?,?,?)`,
  args: p => [p.school_code, p.school_name, p.major_code, p.major_name, p.tuition, p.plan, p.lang || '不限', p.oral || '否']
});

// 默认商品目录（作为 products 表种子与兼容回退）
export const DEFAULT_PRODUCTS = [
  { code: 'vip_month', kind: 'vip', name: 'VIP 会员 · 月卡', price: 29, months: 1, sort: 1 },
  { code: 'vip_quarter', kind: 'vip', name: 'VIP 会员 · 季卡', price: 79, months: 3, sort: 2 },
  { code: 'vip_year', kind: 'vip', name: 'VIP 会员 · 年卡', price: 199, months: 12, sort: 3 }
];

// products 表为空时写入默认商品
{
  const c = db.prepare('SELECT COUNT(*) AS c FROM products').get().c || 0;
  if (c === 0) {
    const ins = db.prepare('INSERT INTO products (code, kind, name, price, months, active, sort) VALUES (?,?,?,?,?,1,?)');
    for (const p of DEFAULT_PRODUCTS) {
      try { ins.run(p.code, p.kind, p.name, p.price, p.months, p.sort); } catch (e) { /* 单条冲突忽略 */ }
    }
    console.log(`[seed] products: ${DEFAULT_PRODUCTS.length} 条`);
  }
}

// ---- 外键约束迁移：旧库表缺少外键时，清理孤儿数据并重建表以启用外键 ----
function rebuildTableWithFk(name, createSql, columns, orphanSqls, indexSqls) {
  const fks = db.prepare(`PRAGMA foreign_key_list(${name})`).all();
  if (fks.length) return; // 已含外键，跳过
  for (const sql of orphanSqls) db.prepare(sql).run();
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    db.exec(`ALTER TABLE ${name} RENAME TO ${name}__old`);
    db.exec(createSql);
    db.exec(`INSERT INTO ${name} (${columns.join(',')}) SELECT ${columns.join(',')} FROM ${name}__old`);
    db.exec(`DROP TABLE ${name}__old`);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  for (const sql of indexSqls) { try { db.exec(sql); } catch (e) { /* 索引已存在则忽略 */ } }
  console.log(`[migrate] ${name}: 外键约束已启用`);
}

const orphans = t => `DELETE FROM ${t} WHERE user_id NOT IN (SELECT id FROM users)`;
const orphanQ = t => `DELETE FROM ${t} WHERE question_id NOT IN (SELECT id FROM questions)`;

rebuildTableWithFk('user_profiles',
  `CREATE TABLE user_profiles (
    user_id INTEGER PRIMARY KEY, target_school TEXT, target_score INTEGER, hui_kao TEXT,
    hui_kao_scores TEXT, org TEXT, email TEXT, remind_email INTEGER DEFAULT 0,
    remind_sms INTEGER DEFAULT 0, remind_time TEXT DEFAULT '19:00',
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['user_id', 'target_school', 'target_score', 'hui_kao', 'hui_kao_scores', 'org', 'email', 'remind_email', 'remind_sms', 'remind_time', 'updated_at'],
  [orphans('user_profiles')], []);

rebuildTableWithFk('practice_sessions',
  `CREATE TABLE practice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, subject TEXT, mode TEXT,
    total INTEGER, correct INTEGER, score REAL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['id', 'user_id', 'subject', 'mode', 'total', 'correct', 'score', 'created_at'],
  [orphans('practice_sessions')],
  ['CREATE INDEX IF NOT EXISTS idx_sessions_user ON practice_sessions(user_id)',
   'CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON practice_sessions(created_at)']);

rebuildTableWithFk('practice_records',
  `CREATE TABLE practice_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, question_id INTEGER, answer TEXT,
    is_correct INTEGER, session_id INTEGER, created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES practice_sessions(id) ON DELETE SET NULL)`,
  ['id', 'user_id', 'question_id', 'answer', 'is_correct', 'session_id', 'created_at'],
  [orphans('practice_records'), orphanQ('practice_records'),
   `UPDATE practice_records SET session_id = NULL WHERE session_id IS NOT NULL AND session_id NOT IN (SELECT id FROM practice_sessions)`],
  ['CREATE INDEX IF NOT EXISTS idx_records_user ON practice_records(user_id)',
   'CREATE INDEX IF NOT EXISTS idx_records_question ON practice_records(question_id)',
   'CREATE INDEX IF NOT EXISTS idx_records_created_at ON practice_records(created_at)',
   'CREATE INDEX IF NOT EXISTS idx_records_user_created ON practice_records(user_id, created_at)',
   'CREATE INDEX IF NOT EXISTS idx_records_session ON practice_records(session_id)']);

rebuildTableWithFk('checkins',
  `CREATE TABLE checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, date TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')), UNIQUE(user_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['id', 'user_id', 'date', 'created_at'], [orphans('checkins')],
  ['CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(date)']);

rebuildTableWithFk('favorites',
  `CREATE TABLE favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, question_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')), UNIQUE(user_id, question_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE)`,
  ['id', 'user_id', 'question_id', 'created_at'], [orphans('favorites'), orphanQ('favorites')], []);

rebuildTableWithFk('study_plans',
  `CREATE TABLE study_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['id', 'user_id', 'content', 'created_at'], [orphans('study_plans')], []);

rebuildTableWithFk('achievements',
  `CREATE TABLE achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, key TEXT,
    earned_at TEXT DEFAULT (datetime('now','localtime')), UNIQUE(user_id, key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['id', 'user_id', 'key', 'earned_at'], [orphans('achievements')], []);

rebuildTableWithFk('ai_analysis',
  `CREATE TABLE ai_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['id', 'user_id', 'content', 'created_at'], [orphans('ai_analysis')], []);

rebuildTableWithFk('review_schedule',
  `CREATE TABLE review_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, question_id INTEGER, stage INTEGER DEFAULT 0,
    next_due TEXT, created_at TEXT DEFAULT (datetime('now','localtime')), UNIQUE(user_id, question_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE)`,
  ['id', 'user_id', 'question_id', 'stage', 'next_due', 'created_at'],
  [orphans('review_schedule'), orphanQ('review_schedule')],
  ['CREATE INDEX IF NOT EXISTS idx_schedule_due ON review_schedule(user_id, next_due)']);

rebuildTableWithFk('wrong_mastered',
  `CREATE TABLE wrong_mastered (
    user_id INTEGER, question_id INTEGER, created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(user_id, question_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE)`,
  ['user_id', 'question_id', 'created_at'], [orphans('wrong_mastered'), orphanQ('wrong_mastered')], []);

rebuildTableWithFk('weekly_reports',
  `CREATE TABLE weekly_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, week_start TEXT, week_end TEXT,
    data TEXT, ai_summary TEXT, created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(user_id, week_start),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['id', 'user_id', 'week_start', 'week_end', 'data', 'ai_summary', 'created_at'],
  [orphans('weekly_reports')], []);

rebuildTableWithFk('reminder_logs',
  `CREATE TABLE reminder_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT, content TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['id', 'user_id', 'type', 'content', 'created_at'], [orphans('reminder_logs')], []);

rebuildTableWithFk('memberships',
  `CREATE TABLE memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, level TEXT NOT NULL DEFAULT 'vip',
    status TEXT NOT NULL DEFAULT 'active', start_at TEXT DEFAULT (datetime('now','localtime')),
    expire_at TEXT, source TEXT DEFAULT 'order', UNIQUE(user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['id', 'user_id', 'level', 'status', 'start_at', 'expire_at', 'source'], [orphans('memberships')],
  ['CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status)']);

rebuildTableWithFk('orders',
  `CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL,
    product_code TEXT NOT NULL, product_name TEXT NOT NULL, amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', pay_method TEXT, paid_at TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['id', 'order_no', 'user_id', 'product_code', 'product_name', 'amount', 'status', 'pay_method', 'paid_at', 'created_at'],
  [orphans('orders')],
  ['CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)',
   'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)']);

rebuildTableWithFk('points',
  `CREATE TABLE points (
    user_id INTEGER PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['user_id', 'balance'], [orphans('points')], []);

rebuildTableWithFk('point_logs',
  `CREATE TABLE point_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, change INTEGER NOT NULL,
    reason TEXT NOT NULL, ref TEXT, created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['id', 'user_id', 'change', 'reason', 'ref', 'created_at'], [orphans('point_logs')],
  ['CREATE INDEX IF NOT EXISTS idx_point_logs_user ON point_logs(user_id)']);

rebuildTableWithFk('invites',
  `CREATE TABLE invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT, inviter_id INTEGER NOT NULL, invitee_id INTEGER NOT NULL,
    code TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now','localtime')), UNIQUE(invitee_id),
    FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['id', 'inviter_id', 'invitee_id', 'code', 'created_at'],
  [`DELETE FROM invites WHERE inviter_id NOT IN (SELECT id FROM users) OR invitee_id NOT IN (SELECT id FROM users)`],
  ['CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invites(inviter_id)']);

rebuildTableWithFk('ai_usage',
  `CREATE TABLE ai_usage (
    user_id INTEGER NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date, kind),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['user_id', 'date', 'kind', 'count'], [orphans('ai_usage')], []);

rebuildTableWithFk('ai_topup',
  `CREATE TABLE ai_topup (
    user_id INTEGER NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, kind),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['user_id', 'kind', 'count'], [orphans('ai_topup')], []);

rebuildTableWithFk('admins',
  `CREATE TABLE admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'admin',
    created_by INTEGER, created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ['id', 'user_id', 'role', 'created_by', 'created_at'], [orphans('admins')], []);

rebuildTableWithFk('plans',
  `CREATE TABLE plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT, school_code TEXT, school_name TEXT, major_code INTEGER,
    major_name TEXT, tuition TEXT, plan INTEGER,
    FOREIGN KEY (school_code) REFERENCES schools(code) ON DELETE CASCADE)`,
  ['id', 'school_code', 'school_name', 'major_code', 'major_name', 'tuition', 'plan'],
  ['DELETE FROM plans WHERE school_code NOT IN (SELECT code FROM schools)'],
  ['CREATE INDEX IF NOT EXISTS idx_plans_school ON plans(school_code)']);

export default db;
