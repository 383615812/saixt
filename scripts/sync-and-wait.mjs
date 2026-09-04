// 后台同步+CI 确认：直到 git push 成功，再轮询指定 head_sha 的 CI 直至完成。
// 用法: node sync-and-wait.mjs <ciHeadSha> [maxMinutes]
import { execFile } from 'node:child_process';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dir, '..');
const ciSha = process.argv[2];
const maxMin = Number(process.argv[3] || 120);
const waitPushMs = 45000;
const waitCiMs = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runGit(args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: REPO }, (err, stdout, stderr) => {
      resolve({ err, out: String(stdout || ''), errOut: String(stderr || '') });
    });
  });
}

async function pushOnce() {
  const r = await runGit(['push', 'origin', 'master']);
  if (!r.err) return { ok: true, msg: 'push ok' };
  if (/Everything up-to-date/i.test(r.out + r.errOut)) return { ok: true, msg: 'already up to date' };
  return { ok: false, msg: (r.err.message || '').split('\n')[0] };
}

function apiRuns(sha) {
  return new Promise((resolve, reject) => {
    // 直接按 head_sha 过滤有时命中不了工作流运行，改为拉最近运行再本地匹配，更稳妥
    const p = `/repos/383615812/saixt/actions/runs?per_page=20`;
    const req = https.get({ host: 'api.github.com', path: p, headers: { 'User-Agent': 'saixt-sync-watch' } }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try {
          const runs = JSON.parse(b).workflow_runs || [];
          if (!sha) return resolve({ run: runs[0] || null, list: runs });
          const run = runs.find(r => r.head_sha === sha) || runs[0];
          resolve({ run: run || null, list: runs, matched: !!runs.find(r => r.head_sha === sha) });
        } catch { reject(new Error('bad json')); }
      });
    });
    req.on('error', reject);
  });
}

(async () => {
  const deadline = Date.now() + maxMin * 60 * 1000;

  // Phase A: 重推直到成功
  console.log(`[${new Date().toISOString()}] [push] 开始自动重推（最多约 ${maxMin} 分钟）...`);
  while (Date.now() < deadline) {
    const r = await pushOnce();
    if (r.ok) { console.log(`[${new Date().toISOString()}] [push] 成功: ${r.msg}`); break; }
    console.log(`[${new Date().toISOString()}] [push] 未成功: ${r.msg}，${waitPushMs / 1000}s 后重试`);
    await sleep(waitPushMs);
  }
  const pushed = (await pushOnce()).ok;
  if (!pushed) { console.log(`[${new Date().toISOString()}] [push] 超时仍失败，退出`); process.exit(3); }

  if (!ciSha) { console.log(`[${new Date().toISOString()}] 无 ciSha，结束`); process.exit(0); }

  // Phase B: 轮询 CI
  console.log(`[${new Date().toISOString()}] [ci] 开始轮询 ${ciSha} 的 Actions 运行（按最近运行列表匹配）...`);
  let firstErrLogged = false;
  let rateLimitSleep = 0;
  while (Date.now() < deadline) {
    try {
      const { run, matched } = await apiRuns(ciSha);
      rateLimitSleep = 0;
      if (run) {
        console.log(`[${new Date().toISOString()}] [ci] id=${run.id} sha=${String(run.head_sha).slice(0, 7)} matched=${matched} status=${run.status} conclusion=${run.conclusion}`);
        if (run.head_sha !== ciSha && !matched) {
          // 目标 sha 运行尚未出现于列表，退避后再看
          firstErrLogged = false;
        } else if (run.status === 'completed') {
          console.log(`[${new Date().toISOString()}] [ci] 结束，结论=${run.conclusion}`);
          process.exit(run.conclusion === 'success' ? 0 : 1);
        }
      } else {
        console.log(`[${new Date().toISOString()}] [ci] 尚未发现运行`);
      }
      firstErrLogged = false;
    } catch (e) {
      if (e.message.startsWith('HTTP 403')) {
        // 命中匿名限额：退避到限额重置（1 小时），重置后继续
        if (!firstErrLogged) { console.log(`[${new Date().toISOString()}] [ci] 触发 GitHub 匿名限额，退避至整点再试`); firstErrLogged = true; }
        const now = new Date();
        const nextReset = new Date(now); nextReset.setMinutes(0, 10, 0);
        if (nextReset <= now) nextReset.setHours(nextReset.getHours() + 1);
        const wait = Math.min(Math.max(nextReset - now, 60000), maxMin * 60 * 1000);
        console.log(`[${new Date().toISOString()}] [ci] 退避 ${Math.round(wait / 60000)} 分钟`);
        await sleep(wait);
        continue;
      }
      if (!firstErrLogged) { console.log(`[${new Date().toISOString()}] [ci] api err: ${e.message}（继续重试）`); firstErrLogged = true; }
    }
    await sleep(waitCiMs);
  }
  console.log(`[${new Date().toISOString()}] 超过 ${maxMin} 分钟仍未完成`);
  process.exit(3);
})();