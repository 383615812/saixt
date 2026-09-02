import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(join(__dirname, '..', 'data', 'saixt.db'));

const q = db.prepare('SELECT * FROM questions WHERE id = 304').get();
console.log('id=304:', JSON.stringify(q, null, 2));

// 在 image_match_review.json 中查找
const rev = JSON.parse(readFileSync('E:/saixt/exam_papers/image_match_review.json', 'utf-8'));
const arr = Array.isArray(rev) ? rev : (rev.questions || rev.data || []);
function norm(s) { return (s || '').replace(/[\s（）()。，,、：:；;？?【】\[\]“”"\'．.\-]/g, ''); }
const hit = arr.find(r => norm(r.stem) === norm(q.stem));
console.log('\nimage_match_review 命中:', hit ? JSON.stringify(hit).slice(0, 800) : '无');
