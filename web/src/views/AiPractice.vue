<template>
  <div class="container aip-page">
    <div class="page-head">
      <h2>AI 智能练习</h2>
      <p>让 AI 按科目、章节与题型生成练习题，针对性巩固薄弱知识点</p>
    </div>

    <QuotaBar kind="generate" label="AI 练习" />

    <!-- 设置区 -->
    <div v-if="!questions.length && !generating" class="card setup">
      <!-- 薄弱知识点专项 -->
      <div v-if="weakPoints.length" class="setup-block weak-block">
        <div class="weak-head">
          <div>
            <h3>薄弱知识点专项</h3>
            <p class="weak-sub">根据你的做题统计，以下知识点掌握较弱，建议优先巩固</p>
          </div>
          <div class="weak-btns">
            <button class="btn btn-ghost btn-sm weak-paper-btn" @click="goPaper">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>
              一键生成薄弱点专项套卷
            </button>
            <button class="btn btn-primary btn-sm" :disabled="generating" @click="focusWorst">一键针对最薄弱点出题</button>
          </div>
        </div>
        <div class="chips">
          <button
            v-for="w in weakPoints"
            :key="w.subject + ':' + w.chapter"
            class="chip weak-chip"
            :class="{ on: isWeakOn(w) }"
            @click="pickWeak(w)"
          >
            {{ w.subject }}·{{ w.chapter }}<span class="chip-count weak-rate">{{ w.accuracy }}%</span>
          </button>
        </div>
        <p v-if="weakHint" class="weak-hint">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
          {{ weakHint }}
        </p>
      </div>
      <div class="setup-block">
        <h3>选择科目</h3>
        <div v-if="metaLoading" class="chips">
          <span v-for="i in 6" :key="i" class="skeleton sk-chip"></span>
        </div>
        <div v-else class="chips">
          <button v-for="s in subjects" :key="s.subject" class="chip" :class="{ on: subject === s.subject }" @click="selectSubject(s.subject)">{{ s.subject }}<span class="chip-count">{{ s.count }}</span></button>
        </div>
      </div>
      <div class="setup-block">
        <h3>选择章节（可选）</h3>
        <div class="chips">
          <button v-for="c in chapters" :key="c" class="chip" :class="{ on: chapter === c }" @click="chapter = chapter === c ? '' : c">{{ c }}</button>
        </div>
      </div>
      <div class="setup-block">
        <h3>选择题型</h3>
        <div class="chips">
          <button v-for="t in types" :key="t.value" class="chip" :class="{ on: type === t.value }" @click="type = t.value">{{ t.label }}</button>
        </div>
        <p class="type-tip">{{ typeTip }}</p>
      </div>
      <div class="setup-block">
        <h3>选择难度</h3>
        <div class="chips">
          <button v-for="d in difficulties" :key="d" class="chip" :class="{ on: difficulty === d }" @click="difficulty = d">{{ d }}</button>
        </div>
      </div>
      <div class="setup-block">
        <h3>生成题数</h3>
        <div class="chips">
          <button v-for="n in [2, 3, 5]" :key="n" class="chip" :class="{ on: count === n }" @click="count = n">{{ n }} 题</button>
        </div>
      </div>
      <button class="btn btn-primary" :disabled="generating" @click="generate">
        {{ generating ? 'AI 正在出题…' : '开始生成' }}
      </button>
    </div>

    <!-- 出题中骨架屏 -->
    <div v-else-if="generating" class="card question-card sk-question">
      <div class="q-meta">
        <div class="skeleton sk-q-tag"></div>
        <div class="skeleton sk-q-tag"></div>
      </div>
      <div class="skeleton sk-q-stem"></div>
      <div class="skeleton sk-q-stem short"></div>
      <div v-for="i in 4" :key="i" class="skeleton sk-q-opt"></div>
      <p class="sk-gen-tip">AI 正在根据你的选择生成题目，请稍候…</p>
    </div>

    <!-- 题目区 -->
    <div v-else>
      <div class="card gen-bar">
        <div class="gen-info">
          <span class="tag tag-blue">{{ subject }}</span>
          <span v-if="chapter" class="tag tag-purple">{{ chapter }}</span>
          <span class="tag" :class="difficultyClass">{{ difficulty }}</span>
          <span class="tag tag-green">{{ typeLabel }}</span>
          <span class="gen-note">AI 生成题目 · 共 {{ questions.length }} 题</span>
        </div>
        <div class="gen-actions">
          <button class="btn btn-ghost" @click="reset">重新设置</button>
          <button class="btn btn-primary" :disabled="generating" @click="generate">换一批</button>
        </div>
      </div>

      <div class="card question-card">
        <div class="q-meta">
          <span class="q-no">第 {{ current + 1 }} / {{ questions.length }} 题</span>
          <span v-if="type === 'multi'" class="multi-hint">多选题 · 可多选</span>
        </div>
        <h3 class="q-stem">{{ currentQuestion.stem }}</h3>
        <div class="options">
          <button
            v-for="opt in currentQuestion.options"
            :key="opt[0]"
            class="option"
            :class="{
              selected: !answered && isSelected(opt[0]),
              correct: answered && isCorrectOpt(opt[0]),
              wrong: answered && isWrongOpt(opt[0]),
              disabled: answered
            }"
            @click="choose(opt[0])"
          >
            <span class="opt-letter">{{ opt[0] }}</span>
            <span class="opt-text">{{ opt.slice(2) }}</span>
            <span v-if="answered && type === 'multi' && isCorrectOpt(opt[0]) && !isSelected(opt[0])" class="opt-miss">漏选</span>
          </button>
        </div>

        <div v-if="answered" class="result" :class="isCorrect ? 'ok' : 'no'">
          <div class="result-head">
            <span class="result-icon">{{ isCorrect ? '✓' : '✗' }}</span>
            <strong>{{ isCorrect ? '回答正确' : '回答错误' }}</strong>
            <span class="right-ans">正确答案：{{ currentQuestion.answer }}</span>
          </div>
          <div class="analysis">
            <strong>解题讲解：</strong>{{ analysisTyping ? analysisText : currentQuestion.analysis }}<span v-if="analysisTyping" class="tw-caret"></span>
          </div>
        </div>

        <div class="q-actions">
          <button v-if="!answered" class="btn btn-primary" :disabled="!canSubmit || submitting" @click="submit">{{ submitting ? '提交中…' : '提交答案' }}</button>
          <button v-else-if="current < questions.length - 1" class="btn btn-primary" @click="next">下一题 →</button>
          <button v-else class="btn btn-primary" @click="finish">完成练习</button>
        </div>
      </div>
    </div>

    <!-- 完成面板 -->
    <div v-if="finished" class="card finish-panel">
      <h3>练习完成</h3>
      <div class="fp-stats">
        <div class="fp-stat"><div class="num">{{ correctCount }}</div><div class="lbl">答对</div></div>
        <div class="fp-stat"><div class="num">{{ questions.length }}</div><div class="lbl">总题数</div></div>
        <div class="fp-stat"><div class="num">{{ accuracy }}%</div><div class="lbl">正确率</div></div>
      </div>
      <div class="fp-actions">
        <button class="btn btn-ghost" @click="reset">换知识点再练</button>
        <button class="btn btn-primary" @click="generate">再来一组</button>
      </div>
    </div>
  </div>
</template>

<script setup>

import { toast } from '../toast'
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useTypewriter } from '../useTypewriter'
import QuotaBar from '../components/QuotaBar.vue'

const { text: analysisText, typing: analysisTyping, type: typeAnalysis } = useTypewriter()

const route = useRoute()
const router = useRouter()
const subjects = ref([])
const difficulties = ['基础', '中等', '较难']
const types = [
  { value: 'single', label: '单选题' },
  { value: 'multi', label: '多选题' },
  { value: 'judge', label: '判断题' }
]
const subject = ref('')
const chapter = ref('')
const type = ref('single')
const difficulty = ref('中等')
const count = ref(3)
const chapters = ref([])
const generating = ref(false)
const metaLoading = ref(true)

const questions = ref([])
const current = ref(0)
const selected = ref('')
const answered = ref(false)
const isCorrect = ref(false)
const correctCount = ref(0)
const finished = ref(false)
const submitting = ref(false)

// 薄弱知识点
const weakPoints = ref([])
const weakHint = ref('')
async function loadWeak() {
  try {
    const m = await api.get('/stats/mastery')
    weakPoints.value = (m.weak || []).sort((a, b) => a.accuracy - b.accuracy)
  } catch (e) { /* 未登录等场景忽略 */ }
}
function isWeakOn(w) { return subject.value === w.subject && chapter.value === w.chapter }
function pickWeak(w) {
  subject.value = w.subject
  chapter.value = w.chapter
  weakHint.value = `已选定薄弱点「${w.subject}·${w.chapter}」，点击「开始生成」针对性巩固`
}
async function focusWorst() {
  if (!weakPoints.value.length) return
  const worst = weakPoints.value[0]
  subject.value = worst.subject
  chapter.value = worst.chapter
  weakHint.value = `正在针对最薄弱点「${worst.subject}·${worst.chapter}」（正确率 ${worst.accuracy}%）出题…`
  await generate()
}
function goPaper() {
  router.push('/paper')
}

const currentQuestion = computed(() => questions.value[current.value] || {})

function selectSubject(s) {
  subject.value = subject.value === s ? '' : s
  chapter.value = ''
  if (subject.value) loadChapters()
}

async function loadChapters() {
  try {
    const meta = await api.get('/questions/meta')
    chapters.value = meta.chapters.filter(c => c.subject === subject.value).map(c => c.chapter)
  } catch (e) {
    // 章节加载失败直接影响选章节出题，需明确提示
    chapters.value = []
    toast(e.message || '章节加载失败，请重试', 'error')
  }
}

const typeTip = computed(() => {
  if (type.value === 'multi') return '多选题有 2-3 个正确答案，需全部选对才算对'
  if (type.value === 'judge') return '判断题判断陈述正确或错误，考查概念辨析'
  return '单选题只有一个正确答案，贴近春招真题'
})

const typeLabel = computed(() => {
  const t = types.find(t => t.value === (currentQuestion.value.type || type.value))
  return t ? t.label : '单选题'
})

const canSubmit = computed(() => {
  if (type.value === 'multi') return Array.isArray(selected.value) && selected.value.length > 0
  return !!selected.value
})

function isSelected(letter) {
  if (type.value === 'multi') return Array.isArray(selected.value) && selected.value.includes(letter)
  return selected.value === letter
}

function isCorrectOpt(letter) {
  return String(currentQuestion.value.answer || '').includes(letter)
}

function isWrongOpt(letter) {
  return isSelected(letter) && !isCorrectOpt(letter)
}

function choose(letter) {
  if (answered.value) return
  if (type.value === 'multi') {
    const arr = Array.isArray(selected.value) ? [...selected.value] : []
    const i = arr.indexOf(letter)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(letter)
    selected.value = arr.sort()
  } else {
    selected.value = letter
  }
}

async function submit() {
  if (submitting.value) return
  submitting.value = true
  const userAns = type.value === 'multi'
    ? (Array.isArray(selected.value) ? selected.value.join('') : '')
    : (selected.value || '')
  try {
    // 提交到后端：错题自动沉淀到错题本，计入学习统计
    const data = await api.post('/practice/submit', {
      question_id: currentQuestion.value.id,
      answer: userAns
    })
    isCorrect.value = data.correct
    if (data.correct) correctCount.value++
    if (data.answer) currentQuestion.value.answer = data.answer
    if (data.analysis) {
      currentQuestion.value.analysis = data.analysis
      typeAnalysis(data.analysis)
    }
  } catch (e) {
    isCorrect.value = userAns === String(currentQuestion.value.answer || '')
    if (isCorrect.value) correctCount.value++
  } finally {
    submitting.value = false
    answered.value = true
  }
}

function next() {
  current.value++
  selected.value = type.value === 'multi' ? [] : ''
  answered.value = false
}

async function finish() {
  finished.value = true
  await loadWeak()
  try {
    await api.post('/practice/ai-session', {
      subject: subject.value,
      total: questions.value.length,
      correct: correctCount.value
    })
  } catch (e) { /* 忽略记录失败 */ }
}

const accuracy = computed(() => questions.value.length ? Math.round((correctCount.value / questions.value.length) * 100) : 0)

const difficultyClass = computed(() =>
  difficulty.value === '较难' ? 'tag-red' : difficulty.value === '基础' ? 'tag-green' : 'tag-amber'
)

async function generate() {
  generating.value = true
  finished.value = false
  try {
    const data = await api.post('/ai/generate', {
      subject: subject.value,
      chapter: chapter.value,
      count: count.value,
      difficulty: difficulty.value,
      type: type.value
    })
    questions.value = data.questions
    current.value = 0
    selected.value = type.value === 'multi' ? [] : ''
    answered.value = false
    correctCount.value = 0
    window.dispatchEvent(new Event('ai-quota-refresh'))
  } catch (e) {
    toast(e.message || 'AI 生成失败，请稍后重试', 'error')
  } finally {
    generating.value = false
  }
}

function reset() {
  questions.value = []
  finished.value = false
  current.value = 0
  correctCount.value = 0
}

onMounted(async () => {
  loadWeak()
  try {
    const meta = await api.get('/questions/meta')
    subjects.value = meta.subjects
    if (!subject.value && subjects.value.length) subject.value = subjects.value[0].subject
  } catch (e) { /* 忽略 */ }
  finally { metaLoading.value = false }
  if (route.query.subject && subjects.value.some(s => s.subject === route.query.subject)) {
    subject.value = route.query.subject
  }
  if (route.query.chapter) chapter.value = route.query.chapter
  if (subject.value) await loadChapters()
  if (route.query.subject || route.query.chapter) generate()
})
</script>

<style scoped>
.page-head { margin-bottom: 20px; }
.page-head h2 { font-size: 1.6rem; }
.page-head p { color: var(--muted); margin-top: 4px; }

.setup { display: flex; flex-direction: column; gap: 18px; }
.setup-block h3 { font-size: 0.95rem; margin-bottom: 10px; color: var(--ink); }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip {
  padding: 8px 16px; border-radius: var(--radius-full); border: 1px solid var(--rule);
  background: var(--surface); color: var(--muted); font-size: 0.9rem; font-weight: 500;
  transition: border-color 0.25s var(--ease), color 0.25s var(--ease), background-color 0.25s var(--ease), box-shadow 0.25s var(--ease), transform 0.25s var(--ease);
}
.chip:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }
.chip.on { background: var(--accent); color: #fff; border-color: transparent; box-shadow: 0 4px 14px rgba(79, 95, 240, 0.25); }
.chip-count { font-size: 0.75rem; opacity: 0.75; margin-left: 5px; }
.type-tip { font-size: 0.8rem; color: var(--muted); margin-top: 8px; }
.setup .btn-primary { align-self: flex-start; margin-top: 4px; }

/* 薄弱知识点专项 */
.weak-block {
  border: 1px solid var(--accent-soft);
  background: linear-gradient(135deg, var(--accent-soft) 0%, transparent 60%);
  border-radius: var(--radius-sm); padding: 14px 16px;
}
.weak-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.weak-head h3 { font-size: 0.95rem; }
.weak-sub { font-size: 0.78rem; color: var(--muted); margin-top: 3px; }
.weak-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.weak-paper-btn { display: inline-flex; align-items: center; gap: 6px; color: var(--accent); border-color: var(--accent-light, rgba(79,95,240,0.4)); }
.weak-paper-btn:hover { background: var(--accent-soft); }
.weak-hint { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 0.82rem; color: var(--accent); font-weight: 600; }
.weak-rate { font-weight: 700; color: var(--amber); }

.gen-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; padding: 14px 18px; }
.gen-info { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gen-note { font-size: 0.85rem; color: var(--muted); }
.gen-actions { display: flex; gap: 8px; }

.question-card { margin-bottom: 16px; }
.q-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.q-no { font-size: 0.85rem; color: var(--muted); font-weight: 600; }
.multi-hint { font-size: 0.8rem; color: var(--amber); font-weight: 600; }
.q-stem { font-size: 1.05rem; font-weight: 600; line-height: 1.7; margin-bottom: 16px; overflow-wrap: break-word; word-break: break-word; }

.options { display: flex; flex-direction: column; gap: 10px; }
.option {
  display: flex; align-items: center; gap: 12px; text-align: left;
  padding: 12px 14px; border: 1px solid var(--rule); border-radius: var(--radius-sm);
  background: var(--surface); font-size: 0.95rem;
  transition: border-color 0.2s var(--ease), background-color 0.2s var(--ease), box-shadow 0.2s var(--ease), transform 0.15s var(--ease);
}
.option:hover:not(.disabled) { border-color: var(--accent); background: var(--accent-soft); box-shadow: var(--shadow-xs); }
.option.selected { border-color: var(--accent); background: var(--accent-soft); box-shadow: var(--shadow-xs); }
.option.correct { border-color: var(--green); background: var(--green-soft); }
.option.wrong { border-color: var(--red); background: var(--red-soft); }
.option.disabled { cursor: default; }
.opt-text { overflow-wrap: break-word; word-break: break-word; }
.opt-letter {
  width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 0.85rem;
}
.option.correct .opt-letter { background: var(--green); color: #fff; }
.option.wrong .opt-letter { background: var(--red); color: #fff; }
.opt-miss { margin-left: auto; font-size: 0.72rem; font-weight: 700; color: var(--amber); background: var(--amber-soft); padding: 2px 8px; border-radius: 999px; flex: 0 0 auto; }

.result { margin-top: 16px; padding: 14px 16px; border-radius: 12px; }
.result.ok { background: var(--green-soft); border: 1px solid rgba(13,166,120,0.25); }
.result.no { background: var(--red-soft); border: 1px solid rgba(225,29,72,0.25); }
.result-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.result-icon { font-weight: 800; }
.result.ok .result-icon { color: var(--green); }
.result.no .result-icon { color: var(--red); }
.right-ans { margin-left: auto; font-size: 0.88rem; font-weight: 600; color: var(--ink); }
.analysis {
  font-size: 0.92rem; line-height: 1.9;
  margin-top: 12px; padding: 14px 16px; border-radius: 12px;
  background: var(--surface-2); border: 1px solid var(--rule);
  border-left: 3px solid var(--accent); white-space: pre-wrap; overflow-wrap: break-word; word-break: break-word;
}

.q-actions { margin-top: 16px; }

/* 骨架屏 */
.sk-chip { width: 96px; height: 36px; border-radius: 999px; display: inline-block; }
.sk-q-tag { width: 64px; height: 24px; border-radius: var(--radius-sm); }
.sk-q-stem { width: 72%; height: 20px; margin-top: 18px; }
.sk-q-stem.short { width: 46%; }
.sk-q-opt { width: 100%; height: 52px; border-radius: var(--radius-sm); margin-top: 12px; }
.sk-gen-tip { margin-top: 18px; font-size: 0.85rem; color: var(--muted); text-align: center; }

.finish-panel { text-align: center; padding: 30px; }
.finish-panel h3 { font-size: 1.3rem; margin-bottom: 18px; }
.fp-stats { display: flex; justify-content: center; gap: 40px; margin-bottom: 22px; }
.fp-stat .num { font-size: 2rem; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
.fp-stat .lbl { color: var(--muted); font-size: 0.85rem; }
.fp-actions { display: flex; justify-content: center; gap: 12px; }

@media (max-width: 768px) {
  .setup { padding: 22px 18px; }
  .setup .btn-primary { align-self: stretch; }
  .chip { padding: 10px 16px; }
  .question-card { padding: 22px 16px; }
}
@media (max-width: 600px) {
  .page-head h2 { font-size: 1.3rem; }
  .page-head p { font-size: 0.82rem; }
  .setup { padding: 18px 14px; gap: 14px; }
  .setup-block h3 { font-size: 0.9rem; }
  .chip { padding: 8px 14px; font-size: 0.85rem; }
  .chip-count { font-size: 0.7rem; }
  .gen-bar { flex-direction: column; align-items: stretch; padding: 12px 14px; gap: 10px; }
  .gen-note { font-size: 0.8rem; }
  .gen-actions { width: 100%; gap: 8px; }
  .gen-actions .btn { flex: 1; min-height: 40px; font-size: 0.85rem; }
  .question-card { padding: 16px 14px; }
  .q-stem { font-size: 0.95rem; line-height: 1.65; }
  .option { padding: 11px 10px; font-size: 0.9rem; }
  .opt-letter { width: 24px; height: 24px; font-size: 0.8rem; }
  .opt-miss { font-size: 0.7rem; padding: 2px 6px; }
  .multi-hint { font-size: 0.76rem; }
  .result-head { flex-wrap: wrap; }
  .right-ans { margin-left: 0; width: 100%; }
  .result { padding: 12px 14px; }
  .analysis { font-size: 0.85rem; }
  .fp-stats { gap: 20px; }
  .fp-stat .num { font-size: 1.6rem; }
  .fp-stat .lbl { font-size: 0.8rem; }
  .finish-panel { padding: 22px 14px; }
  .finish-panel h3 { font-size: 1.15rem; }
  .fp-actions { flex-wrap: wrap; }
  .fp-actions .btn { flex: 1; min-width: 120px; }
}
@media (max-width: 400px) {
  .chip { padding: 7px 11px; font-size: 0.8rem; }
  .fp-stats { gap: 14px; }
  .fp-stat .num { font-size: 1.4rem; }
  .fp-actions .btn { min-width: 100%; }
}
</style>
