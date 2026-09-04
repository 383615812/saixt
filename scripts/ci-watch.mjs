// 轻量 CI 状态轮询：Poll GitHub Actions run for the given head_sha until completed.
// 用法: node ci-watch.mjs <head_sha> [timeoutMinutes]
import https from 'node:https';

const sha = process.argv[2];
const timeoutMin = Number(process.argv[3] || 30);
if (!sha) { console.error('usage: node ci-watch.mjs <head_sha> [timeoutMinutes]'); process.exit(2); }

function apiRuns() {
  return new Promise((resolve, reject) => {
    const path = `/repos/383615812/saixt/actions/runs?head_sha=${sha}&per_page=3`;
    const req = https.get({ host: 'api.github.com', path, headers: { 'User-Agent': 'saixt-ci-watch' } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) { return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 120)}`)); }
        try { resolve(JSON.parse(body).workflow_runs || []); } catch (e) { reject(new Error('bad json')); }
      });
    });
    req.on('error', reject);
  });
}

const deadline = Date.now() + timeoutMin * 60 * 1000;
let firstFailLogged = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  while (Date.now() < deadline) {
    try {
      const runs = await apiRuns();
      const run = runs[0];
      if (run) {
        console.log(`[${new Date().toISOString()}] run=${run.id} sha=${run.head_sha.slice(0, 7)} status=${run.status} conclusion=${run.conclusion} url=${run.html_url}`);
        if (run.status === 'completed') process.exit(run.conclusion === 'success' ? 0 : 1);
      } else {
        console.log(`[${new Date().toISOString()}] no run yet for ${sha}`);
      }
      firstFailLogged = false;
    } catch (e) {
      if (!firstFailLogged) { console.log(`[${new Date().toISOString()}] api err: ${e.message} (retrying...`); firstFailLogged = true; }
    }
    await sleep(30000);
  }
  console.log(`[${new Date().toISOString()}] timeout after ${timeoutMin}min; run not completed`);
  process.exit(3);
})();