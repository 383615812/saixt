// AI 就绪探测：验证 DeepSeek 是否能正常调用（用于确认充值后余额恢复）
// 用法: node scripts/ai-probe.mjs
// 说明: 仅发起一次极小调用（max_tokens=8），消耗极少额度；基于 __dirname 自动加载 server/.env
import { callDeepSeek, isAiConfigured } from '../src/aiClient.js';

function log(status, msg) {
  const icon = { ok: '✅', quota: '⚠️', key: '⚠️', nokey: '⛔', ratelimit: '⏳', timeout: '⏳', error: '❌' }[status] || 'ℹ️';
  console.log(`[AI] ${icon} 状态=${status} | ${msg}`);
}

if (!isAiConfigured()) {
  log('nokey', '未配置 DEEPSEEK_API_KEY（检查 server/.env）');
  process.exit(0);
}

try {
  const reply = await callDeepSeek(
    [{ role: 'user', content: '请只回复“正常”两个字，不要任何多余内容。' }],
    { temperature: 0, max_tokens: 8, timeoutMs: 20000, retries: 0 }
  );
  if (typeof reply === 'string' && reply.length > 0) {
    log('ok', `充值余额正常，DeepSeek 调用成功（回复: ${JSON.stringify(reply.slice(0, 20))}）`);
  } else {
    log('error', 'AI 返回为空（罕见，请检查模型/网络）');
  }
} catch (e) {
  const msg = e?.message || String(e);
  let status = 'error';
  if (e?.aiConfig && /402/.test(msg)) status = 'quota';   // 余额不足（充值后应消失）
  else if (e?.aiConfig) status = 'key';                    // 密钥 / 权限问题
  else if (/429/.test(msg)) status = 'ratelimit';
  else if (/timeout|abort|signal/i.test(msg)) status = 'timeout';
  log(status, msg.slice(0, 160));
}
