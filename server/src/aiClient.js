import { config } from './config.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 统一的 DeepSeek 调用封装：超时 + 错误映射 + 429/5xx 有限重试
export async function callDeepSeek(messages, { temperature = 0.7, max_tokens = 1200, timeoutMs = 90000, retries = 2 } = {}) {
  if (!config.deepseekApiKey) return null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(700 * attempt);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.deepseekApiKey}`
        },
        body: JSON.stringify({
          model: config.deepseekModel,
          messages,
          temperature,
          max_tokens,
          stream: false
        }),
        signal: controller.signal
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.error('[ai] DeepSeek 调用失败:', resp.status, errText.slice(0, 300));
        // 限流与服务端不稳定可重试；其余 4xx（如鉴权失败）不重试
        const retriable = resp.status === 429 || resp.status >= 500;
        if (retriable && attempt < retries) continue;
        throw new Error(resp.status === 429 ? 'DeepSeek 429 限流' : `DeepSeek ${resp.status}`);
      }
      const data = await resp.json();
      return data.choices?.[0]?.message?.content?.trim() || '';
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export function isAiConfigured() {
  return !!config.deepseekApiKey;
}
