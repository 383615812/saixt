import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../src/config.js';

const PARSED_DIR = 'E:/saixt/exam_papers/parsed';
const OUT_FILE = 'E:/saixt/exam_papers/refined_image.json';

const SYSTEM_PROMPT = `你是一位资深的云南省春季招生（单招）职业技能测试命题专家，精通信息技术与通用技术课程标准。
你的任务：判断试卷题目是否必须依赖图片才能作答。很多题目虽然写了"如图所示"，但题干文字本身已经完整描述了关键信息，仅凭文字就能确定唯一正确答案。`;

async function callDeepSeek(messages, max_tokens = 4000) {
  const resp = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.deepseekApiKey}`
    },
    body: JSON.stringify({
      model: config.deepseekModel,
      messages,
      temperature: 0.1,
      max_tokens,
      stream: false
    })
  });
  if (!resp.ok) throw new Error(`DeepSeek ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

function extractJson(reply) {
  const m = reply.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('未找到 JSON');
  return JSON.parse(m[0]);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!config.deepseekApiKey) { console.error('未配置密钥'); process.exit(1); }

  // 收集所有 needs_image 题目
  const imageQ = [];
  for (const f of readdirSync(PARSED_DIR).filter(f => f.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(join(PARSED_DIR, f), 'utf-8'));
    for (const q of data.questions || []) {
      if (q.needs_image) {
        imageQ.push({ file: data.file, subject: data.subject, ...q });
      }
    }
  }
  console.log(`共 ${imageQ.length} 道图片题待精炼`);

  const results = [];
  const BATCH = 12;
  for (let i = 0; i < imageQ.length; i += BATCH) {
    const batch = imageQ.slice(i, i + BATCH);
    const listText = batch.map((q, idx) => {
      const opts = (q.options || []).join('\n');
      return `【${idx}】(${q.subject})\n题干：${q.stem}\n选项：\n${opts}`;
    }).join('\n\n');

    const prompt = `以下是一批试卷题目（共 ${batch.length} 道）。请逐题判断：仅凭题干文字能否确定唯一正确答案？

判断规则：
- 若题干文字已完整描述关键信息，能确定唯一答案 → 输出 answer（字母）和 analysis（简要解析），needs_image=false
- 若必须查看图片才能作答（例如：要求看图选三视图、看图数标注错误、看图判断图形类型、看图分析受力方向等，文字无法替代图片）→ 输出 needs_image=true，answer 为空字符串

严格按 JSON 数组输出，每项包含：index（对应【idx】序号）、answer、analysis、needs_image。不要输出其他内容。

题目列表：
${listText}`;

    try {
      const reply = await callDeepSeek([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]);
      const parsed = extractJson(reply);
      for (const r of parsed) {
        const src = batch[Number(r.index)];
        if (src) {
          results.push({
            file: src.file,
            subject: src.subject,
            stem: src.stem,
            options: src.options,
            answer: String(r.answer || '').toUpperCase().replace(/[^A-D]/g, ''),
            analysis: r.analysis || '',
            chapter: src.chapter,
            needs_image: !!r.needs_image
          });
        }
      }
      console.log(`批次 ${i / BATCH + 1}: 处理 ${batch.length} 题`);
    } catch (err) {
      console.error(`批次 ${i / BATCH + 1} 失败: ${err.message}`);
    }
    await sleep(1500);
  }

  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2), 'utf-8');
  const recoverable = results.filter(r => !r.needs_image && r.answer);
  console.log(`精炼完成：可恢复 ${recoverable.length} 题，仍需图片 ${results.length - recoverable.length} 题`);
}

main();
