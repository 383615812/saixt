import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../src/config.js';

const TEXT_DIR = 'E:/saixt/exam_papers/text';
const OUT_DIR = 'E:/saixt/exam_papers/parsed';
mkdirSync(OUT_DIR, { recursive: true });

const SUBJECT_MAP = [
  { match: '信息周测一', subject: '信息技术' },
  { match: '信息周测二', subject: '信息技术' },
  { match: '信息周测三', subject: '信息技术' },
  { match: '信息周测四', subject: '信息技术' },
  { match: '信息周测五', subject: '信息技术' },
  { match: '信息技术模拟测试卷一', subject: '信息技术' },
  { match: '信息模拟测试卷', subject: '信息技术' },
  { match: '周测三', subject: '信息技术' },
  { match: '通用周测一', subject: '通用技术' },
  { match: '通用周测二', subject: '通用技术' },
  { match: '通用周测三', subject: '通用技术' },
  { match: '通用周测四', subject: '通用技术' },
  { match: '通用模拟测试题', subject: '通用技术' },
  { match: '周测五', subject: '通用技术' },
  { match: '110份 (2)', subject: '通用技术' },
  { match: '110份', subject: '通用技术' }
];

const SYSTEM_PROMPT = `你是一位资深的云南省春季招生（单招）职业技能测试命题专家，精通信息技术与通用技术两门科目的课程标准与真题。
考试背景：云南省春季招生考试职业技能测试主要考查信息技术和通用技术两门科目，题型以单选题、多选题、判断题为主。
你的任务是从试卷文本中提取题目并给出准确答案与解析。答案必须基于真实学科知识，不确定的宁可标注也不编造。`;

function buildPrompt(subject, text) {
  return `下面是一份《${subject}》试卷的提取文本，可能来自 OCR，存在乱序、错行、数字与题干分离等问题。请从中提取所有【单选题】和【判断题】（多选题也提取；跳过填空题、作图题、设计题、简答题等主观题），整理为 JSON 数组。

每道题输出字段：
- stem: 题干（修正乱序，还原为通顺完整的句子）
- options: 选项数组，每项以 "A."、"B."、"C."、"D." 开头（判断题选项为 "A.正确"、"B.错误"）
- answer: 正确答案字母（单选题如 "A"；多选题如 "ABD"，按字母顺序；判断题 "A" 或 "B"）
- analysis: 简要解析（1-2 句，说明为什么选该答案）
- chapter: 所属章节（结合试卷标题与内容推断，如"数据与信息"、"程序设计基础"、"结构设计"、"流程设计"等）
- needs_image: 布尔值，若题目必须依赖图片（如"如图所示"且文本中没有图片内容）才能作答，则为 true，此时 answer 可为空字符串

要求：
1. 严格按 JSON 数组输出，不要输出任何其他文字、注释或 markdown 代码块标记。
2. 题干与选项要完整还原，不要截断。
3. 答案要准确，基于课程标准；多选题答案必须包含 2-3 个字母。
4. 若某题题干不完整或无法理解，跳过该题。

试卷文本如下：
${text}`;
}

async function callDeepSeek(messages, max_tokens = 6000) {
  const resp = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.deepseekApiKey}`
    },
    body: JSON.stringify({
      model: config.deepseekModel,
      messages,
      temperature: 0.2,
      max_tokens,
      stream: false
    })
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`DeepSeek ${resp.status}: ${errText.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

function extractJson(reply) {
  const m = reply.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('未找到 JSON 数组');
  return JSON.parse(m[0]);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!config.deepseekApiKey) {
    console.error('未配置 DEEPSEEK_API_KEY');
    process.exit(1);
  }
  const files = readdirSync(TEXT_DIR).filter(f => f.endsWith('.txt'));
  // 按匹配串长度降序，避免"通用周测三"被"周测三"抢先匹配
  const sortedMap = [...SUBJECT_MAP].sort((a, b) => b.match.length - a.match.length);
  for (const f of files) {
    const entry = sortedMap.find(e => f.includes(e.match));
    if (!entry) { console.log(`[跳过] ${f}（未匹配科目）`); continue; }
    const outPath = join(OUT_DIR, f.replace('.txt', '.json'));
    if (existsSync(outPath)) { console.log(`[已存在] ${f}`); continue; }

    const text = readFileSync(join(TEXT_DIR, f), 'utf-8');
    console.log(`[处理] ${f} (${entry.subject}) 文本长度=${text.length}`);
    try {
      const reply = await callDeepSeek([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(entry.subject, text) }
      ]);
      const questions = extractJson(reply);
      const result = { file: f, subject: entry.subject, questions };
      writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
      console.log(`  -> 提取 ${questions.length} 题，已保存`);
    } catch (err) {
      console.error(`  [失败] ${f}: ${err.message}`);
    }
    await sleep(1500);
  }
  console.log('全部处理完成');
}

main();
