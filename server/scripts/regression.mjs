// ---------------------------------------------------------------------------
// 云智学 · 全链路回归验证脚本
// 用法：node scripts/regression.mjs [--ai]
//   --ai 可选：额外调用一次 /ai/generate + /ai/explain 做真实 AI 联动验证
// ---------------------------------------------------------------------------
// Node 18+ 自带全局 fetch，无需 import

const BASE = 'http://localhost:3000/api';
const P = (path, token, body, method = 'GET') =>
  fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));

let pass = 0, fail = 0;
const results = [];
const R = (name, ok, extra = '') => {
  if (ok) pass++; else fail++;
  results.push(`${ok ? '✅' : '❌'} ${name}${extra ? ' → ' + extra : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'} :: ${name}${extra ? ' | ' + extra : ''}`);
};

// 通用校验：{ code: 0 } 或 2xx
const okResp = (r, allowedCodes = [0]) => r && r.data && (allowedCodes.includes(r.data.code) || r.data.code === undefined);

async function main() {
  console.log('\n========== 云智学 全链路回归 ==========\n');

  // ---- 0. 健康检查 ----
  const health = await P('/health');
  R('GET /api/health', health.status === 200 && okResp(health), `status=${health.status}`);

  // ---- 1. 注册新测试用户 ----
  const phone = `188${String(Date.now()).slice(-8)}`;
  const reg = await P('/auth/register', null, { phone, password: 'test123456', nickname: '回归测试' }, 'POST');
  const token = reg.data?.data?.token;
  const uid = reg.data?.data?.user?.id;
  R('POST /auth/register', okResp(reg), `uid=${uid}`);
  if (!token) { console.log('无法注册，终止'); process.exit(1); }

  // ---- 2. 登录（逐个密码/错密码）----
  const badLogin = await P('/auth/login', null, { phone, password: 'wrong' }, 'POST');
  R('登录-错误密码被拒', badLogin.status === 401, `status=${badLogin.status}`);
  const login = await P('/auth/login', null, { phone, password: 'test123456' }, 'POST');
  R('POST /auth/login', okResp(login) && !!login.data?.data?.token);

  // ---- 3. 个人信息 ----
  R('GET /auth/me', okResp(await P('/auth/me', token)));
  const prof = await P('/auth/profile', token, { target_school: '昆明冶金高等专科学校', target_score: 540, hui_kao: { yu: '语文:A', shu: '数学:B' } }, 'PUT');
  R('PUT /auth/profile', okResp(prof));

  // ---- 4. 题库 ----
  const meta = await P('/questions/meta');
  R('GET /questions/meta', okResp(meta) && Array.isArray(meta.data?.data?.subjects), `科目数=${meta.data?.data?.subjects?.length}`);
  const subj = meta.data?.data?.subjects?.[0]?.subject;
  const params = new URLSearchParams({ subject: subj || '', type: 'single' });
  const qlist = await P('/questions?' + params.toString());
  R('GET /questions (拉取题目)', okResp(qlist) && qlist.data?.data?.list?.length > 0, `返回=${qlist.data?.data?.list?.length}题`);
  const firstQ = qlist.data?.data?.list?.[0];
  let qId = firstQ?.id;
  let rightAnswer;
  if (qId) {
    const qDetail = await P(`/questions/${qId}`);
    rightAnswer = qDetail.data?.data?.answer;
    R('GET /questions/:id', okResp(qDetail));
  }
  R('GET /questions/count', okResp(await P('/questions/count')));

  // ---- 5. 专项练习流程 ----
  R('POST /practice/start', okResp(await P('/practice/start', token, { subject: subj, mode: 'practice' }, 'POST')));
  if (qId) {
    const wrongAnswer = firstQ.answer === 'A' ? 'B' : 'A';
    const sub = await P('/practice/submit', token, { question_id: qId, answer: wrongAnswer }, 'POST');
    R('POST /practice/submit (答错入错题本)', okResp(sub) && sub.data?.data?.correct === false, `correct=${sub.data?.data?.correct}`);
  }
  R('GET /practice/records', okResp(await P('/practice/records', token)));
  const wrong = await P('/practice/wrong', token);
  R('GET /practice/wrong (错题本含刚错题)', okResp(wrong) && wrong.data?.data?.some(x => x.id === qId), `错题数=${wrong.data?.data?.length}`);

  // ---- 6. 复习（遗忘曲线）----
  R('GET /practice/review/summary', okResp(await P('/practice/review/summary', token)));
  const review = await P('/practice/review', token);
  R('GET /practice/review', okResp(review));
  R('POST /practice/review/submit (答对推进)', okResp(await P('/practice/review/submit', token, { question_id: qId, answer: rightAnswer }, 'POST')));

  // ---- 7. 模拟考试 ----
  const exam = await P('/practice/session', token, { subject: subj, mode: 'exam', answers: [{ question_id: qId, answer: rightAnswer }] }, 'POST');
  R('POST /practice/session (交卷计分)', okResp(exam) && exam.data?.data?.correct === 1 && Number(exam.data?.data?.score) === 100, `correct=${exam.data?.data?.correct} score=${exam.data?.data?.score}`);
  const sess = await P('/practice/sessions', token);
  const examId = sess.data?.data?.[0]?.id;
  if (examId) R('GET /practice/sessions/:id', okResp(await P(`/practice/sessions/${examId}`, token)));

  // ---- 8. 盲盒 ----
  const blind = await P('/practice/blind-box/draw', token, null, 'GET');
  R('GET /practice/blind-box/draw (不下发答案)', okResp(blind) && blind.data?.data?.question && blind.data?.data?.question?.answer === undefined, `稀有度=${blind.data?.data?.rarity?.name}`);
  const bqId = blind.data?.data?.question?.id;
  if (bqId) {
    const bqDetail = await P(`/questions/${bqId}`);
    const bqAnswer = bqDetail.data?.data?.answer;
    const bbSub = await P('/practice/blind-box/submit', token, { question_id: bqId, answer: bqAnswer, rarity_score: blind.data.data.rarity.score }, 'POST');
    R('POST /practice/blind-box/submit (答对返回答案)', okResp(bbSub) && bbSub.data?.data?.correct_answer === bqAnswer, `correct=${bbSub.data?.data?.is_correct} 返回答案=${bbSub.data?.data?.correct_answer}`);
  }

  // ---- 9. 每日一练 / 打卡 ----
  const daily = await P('/daily');
  const dailyQs = daily.data?.data?.questions;
  R('GET /api/daily', okResp(daily) && Array.isArray(dailyQs), `题目数=${Array.isArray(dailyQs) ? dailyQs.length : '-'}`);
  R('POST /api/checkin', okResp(await P('/checkin', token, {}, 'POST')));
  R('GET /api/checkin/me', okResp(await P('/checkin/me', token)));
  R('GET /api/practice/daily-status', okResp(await P('/practice/daily-status', token)));

  // ---- 10. 收藏 ----
  if (qId) {
    const fav = await P('/favorites/toggle', token, { question_id: qId }, 'POST');
    R('POST /favorites/toggle', okResp(fav), `fav=${JSON.stringify(fav.data?.data)}`);
  }
  R('GET /favorites', okResp(await P('/favorites', token)));

  // ---- 11. 统计 / 学习报告 / 任务 / 成就 / 提醒 ----
  R('GET /stats/dashboard', okResp(await P('/stats/dashboard', token)));
  R('GET /stats/me', okResp(await P('/stats/me', token)));
  R('GET /stats/mastery', okResp(await P('/stats/mastery', token)));
  R('GET /stats/trend', okResp(await P('/stats/trend', token)));
  R('GET /report/weekly', okResp(await P('/report/weekly', token)));
  R('GET /tasks', okResp(await P('/tasks', token)));
  R('GET /achievements', okResp(await P('/achievements', token)));
  R('GET /remind/settings', okResp(await P('/remind/settings', token)));
  R('PUT /remind/settings', okResp(await P('/remind/settings', token, { enabled: true, time: '19:00' }, 'PUT')));
  R('GET /remind/due', okResp(await P('/remind/due', token)));

  // ---- 12. 积分 / 会员 / 邀请 ----
  R('GET /points/me', okResp(await P('/points/me', token)));
  R('GET /membership/me', okResp(await P('/membership/me', token)));
  R('GET /invite/me', okResp(await P('/invite/me', token)));
  const inviteInfo = await P('/invite/me', token);
  const inviteCode = inviteInfo.data?.data?.code;
  if (inviteCode) {
    R('POST /invite/redeem (格式校验)', (await P('/invite/redeem', token, { code: 'BAD!' }, 'POST')).status === 400, '非法邀请码 → 400');
    // 用第二个新用户真实兑换第一个用户的邀请码（双方各得积分）
    const phone2 = `188${String(Date.now()).slice(-8)}`;
    const reg2 = await P('/auth/register', null, { phone: phone2, password: 'test123456' }, 'POST');
    if (reg2.data?.data?.token) {
      const redeem = await P('/invite/redeem', reg2.data.data.token, { code: inviteCode }, 'POST');
      R('POST /invite/redeem (真实兑换)', okResp(redeem), `result=${redeem.data?.data?.message ?? redeem.data?.message ?? redeem.status}`);
    } else {
      R('POST /invite/redeem (真实兑换)', false, '第二个用户注册失败');
    }
  }

  // ---- 13. 院校库 / 志愿推荐 / 排行榜 / 搜索 ----
  const schools = await P('/schools');
  const schoolList = schools.data?.data?.list;
  R('GET /schools', okResp(schools) && Array.isArray(schoolList), `院校数=${Array.isArray(schoolList) ? schoolList.length : '-'}`);
  const schoolCode = Array.isArray(schoolList) && schoolList[0]?.code;
  if (schoolCode) R('GET /schools/:code', okResp(await P(`/schools/${schoolCode}`)));
  R('GET /api/recommend', okResp(await P('/recommend', token)));
  R('GET /api/ranking', okResp(await P('/ranking', token)));
  const search = await P('/search?q=' + encodeURIComponent('计算机'));
  R('GET /api/search?q=计算机', okResp(search), `命中=${search.data?.data?.length ?? '-'}`);

  // ---- 14. AI 配额（非真实调用）----
  R('GET /ai/quota', okResp(await P('/ai/quota', token)));
  const quick = await P('/ai/quick', token);
  R('GET /ai/quick', okResp(quick) && Array.isArray(quick.data?.data), `条目=${Array.isArray(quick.data?.data) ? quick.data.data.length : '-'}`);
  R('POST /ai/generate (无科目被拒)', (await P('/ai/generate', token, {}, 'POST')).status === 400, '缺科目参数 → 400');

  // ---- 15. 未授权访问被拒（安全验证）----
  R('GET /stats/me (无 token 被拒)', (await P('/stats/me')).status === 401 || (await P('/stats/me')).status !== 200, `status=${(await P('/stats/me')).status}`);

  // ---- 可选：真实 AI 联动（--ai）----
  if (process.argv.includes('--ai') && process.env.DEEPSEEK_API_KEY) {
    console.log('\n---- 真实 AI 调用验证（消耗 DeepSeek 额度）----');
    try {
      const gen = await P('/ai/generate', token, { subject: subj, count: 2, type: 'single', difficulty: '基础' }, 'POST');
      const genQ = gen.data?.data?.questions;
      R('POST /ai/generate (真实出题)', okResp(gen) && Array.isArray(genQ) && genQ.length > 0, `生成=${genQ?.length}题`);
      if (genQ?.[0]?.id) {
        const exp = await P('/ai/explain', token, { question_id: genQ[0].id }, 'POST');
        R('POST /ai/explain (真实讲解)', okResp(exp) && exp.data?.data?.reply?.length > 50, `讲解字数=${exp.data?.data?.reply?.length}`);
      }
    } catch (e) { R('真实 AI 调用', false, e.message); }
  }

  // ---- 汇总 ----
  console.log('\n========== 汇总 ==========');
  console.log(`通过 ${pass} / 失败 ${fail} / 共 ${pass + fail}`);
  if (fail) {
    console.log('\n失败项：');
    results.filter(r => r.startsWith('❌')).forEach(r => console.log(`  ${r}`));
  }
  console.log('');
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('脚本异常:', err); process.exit(2); });