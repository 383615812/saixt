import { config } from './config.js';

// 统一的 DeepSeek 调用封装：超时 + 错误映射（429 限流可识别）
export async function callDeepSeek(messages, { temperature = 0.7, max_tokens = 1200, timeoutMs = 90000 } = {}) {
  if (!config.deepseekApiKey) return null;
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
      // 上游限流或服务不稳定时抛出可识别错误，供上层提示重试
      throw new Error(resp.status === 429 ? 'DeepSeek 429 限流' : `DeepSeek ${resp.status}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  } finally {
    clearTimeout(timer);
  }
}

export function isAiConfigured() {
  return !!config.deepseekApiKey;
}
