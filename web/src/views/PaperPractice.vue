<template>
  <div class="container paper-page">
    <div class="page-head">
      <h2>薄弱知识点专项套卷</h2>
      <p>基于你的做题统计自动生成，覆盖最薄弱的章节，逐题作答即时回写掌握度</p>
    </div>

    <QuotaBar kind="generate" label="专项套卷" />

    <!-- 生成前：薄弱章节概览与生成设置 -->
    <div v-if="!paper && !generating" class="card setup">
      <div v-if="loadingWeak" class="setup-block">
        <h3>薄弱章节分析中…</h3>
        <div class="chips"><span v-for="i in 3" :key="i" class="skeleton sk-chip"></span></div>
      </div>
      <template v-else>
        <div v-if="weakPoints.length" class="setup-block weak-block">
          <div class="weak-head">
            <div>
              <h3>检测到 {{ weakPoints.length }} 个薄弱章节</h3>
              <p class="weak-sub">以下章节正确率均低于 60%，已按薄弱程度排序</p>
            </div>
          </div>
          <div class="weak-list">
            <div
              v-for="w in weakPoints"
              :key="w.subject + ':' + w.chapter"
              class="weak-item"
              :class="{ chosen: chosenSet.has(w.subject + ':' + w.chapter) }"
              @click="toggleWeak(w)"
            >
              <span class="weak-icon">{{ w.accuracy <= 40 ? '🔥' : (w.accuracy <= 50 ? '⚠️' : '💪') }}</span>
              <span class="weak-name">{{ w.subject }}·{{ w.chapter }}</span>
              <span class="weak-total">{{ w.total }}题</span>
              <span class="weak-acc" :style="{ color: accColor(w.accuracy) }">{{ w.accuracy }}%</span>
            </div>
          </div>
          <p class="weak-tip">默认勾选最薄弱的前 {{ formatCount(count) }} 节，点按可自定义选择</p>
        </div>
        <div v-else class="weak-block weak-empty">
          <div class="weak-empty-inner">
            <span class="weak-empty-icon">📭</span>
            <h3>暂无薄弱知识点</h3>
            <p>你在各章节的正确率均表现不错，或练习数据还不足。</p>
            <p>也可以直接从题库选择章节生成专项练习。</p>
          </div>
          <button class="btn btn-ghost" @click="goPractice">去在线刷题积累数据 →</button>
        </div>

        <div v-if="weakPoints.length" class="setup-block">
          <h3>生成章节数</h3>
          <div class="chips">
            <button v-for="n in [2, 3, 4]" :key="n" class="chip" :class="{ on: count === n }" @click="count = n; syncChosenFromCount()">{{ n }} 章</button>
          </div>
        </div>
        <div v-if="weakPoints.length" class="setup-block">
          <h3>每节题数</h3>
          <div class="chips">
            <button v-for="n in [2, 3, 4]" :key="n" class="chip" :class="{ on: perSection === n }" @click="perSection = n">{{ n }} 题</button>
          </div>
        </div>
        <div v-if="weakPoints.length" class="setup-block">
          <h3>生成难度</h3>
          <div class="chips">
            <button v-for="d in difficulties" :key="d" class="chip" :class="{ on: difficulty === d }" @click="difficulty = d">{{ d }}</button>
          </div>
          <p class="type-tip">套卷将按单选 → 判断 → 多选轮换题型，综合巩固核心知识点与易错点</p>
        </div>
        <button v-if="weakPoints.length" class="btn btn-primary gen-btn" :disabled="!selectedWeak.length" @click="generatePaper">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          一键生成{{ selectedWeak.length }}节薄弱专项套卷
        </button>
      </template>
    </div>

    <!-- 生成中：进度骨架屏（分节串行，预估耗时较久） -->
    <div v-else-if="generating" class="card question-card sk-wrap">
      <div class="sk-header">
        <div class="sk-progress" :style="{ width: genProgress + '%' }"></div>
        <div class="sk-percent">{{ genProgress }}%</div>
      </div>
      <p class="sk-title">AI 正在为您编制薄弱专项套卷…</p>
      <p class="sk-gen-tip">{{ genTip }}</p>
      <div v-if="genSectionsDone.length" class="sk-done-list">
        <div v-for="s in genSectionsDone" :key="s.subject + s.chapter" class="sk-done-item">
          <span class="sk-done-ok">✓</span> {{ s.subject }}·{{ s.chapter }} 已生成 {{ s.questions.length }} 题
        </div>
      </div>
      <div class="sk-blocks">
        <div v-for="i in 2" :key="i" class="sk-block">
          <div class="skeleton sk-q-stem"></div>
          <div class="skeleton sk-q-stem short"></div>
          <div v-for="j in 4" :key="j" class="skeleton sk-q-opt"></div>
        </div>
      </div>
    </div>

    <!-- 套卷概览：分节展示 -->
    <div v-else-if="paper && !answering" class="card overview">
      <div class="ov-head">
        <span class="ov-title-badge">📄 {{ paper.paper_title }}</span>
      </div>
      <div class="ov-stats">
        <div class="ov-stat"><div class="num">{{ paper.sections.length }}</div><div class="lbl">覆盖章节</div></div>
        <div class="ov-stat"><div class="num">{{ paper.total }}</div><div class="lbl">题目总数</div></div>
        <div class="ov-stat"><div class="num">{{ difficulty }}</div><div class="lbl">难度</div></div>
      </div>
      <div class="ov-sections">
        <div
          v-for="(s, i) in paper.sections"
          :key="i"
          class="ov-section"
          :style="{ '--ov-bar': accColor(s.accuracy) }"
        >
          <div class="ov-sec-head">
            <span class="ov-sec-no">第 {{ numToCn(i + 1) }} 节</span>
            <span class="tag tag-blue">{{ s.subject }}</span>
            <span class="tag tag-purple">{{ s.chapter }}</span>
          </div>
          <div class="ov-sec-body">
            <span class="ov-sec-label">当前掌握度</span>
            <div class="ov-sec-bar">
              <div class="ov-sec-fill" :style="{ width: s.accuracy + '%' }"></div>
            </div>
            <span class="ov-sec-acc" :style="{ color: accColor(s.accuracy) }">{{ s.accuracy }}%</span>
            <span class="ov-sec-type">{{ typeLabel(s.qtype) }} · {{ s.questions.length }} 题</span>
          </div>
        </div>
      </div>
      <p class="ov-note">套卷作答采用逐题即时评分，每答一题都会更新该章节的掌握度，用于后续排名与复习安排。</p>
      <div class="ov-actions">
        <button class="btn btn-ghost" @click="backToSetup">取消</button>
        <button class="btn btn-primary" @click="startAnswer">开始作答</button>
      </div>
    </div>

    <!-- 作答区：逐题作答，复用 /practice/submit 回写掌握度 -->
    <div v-else-if="paper">
      <div class="card answer-top">
        <button class="btn btn-ghost btn-sm" @click="confirmExit">← 返回卷面</button>
        <div class="at-center">
          <span class="at-sec">{{ curSectionLabel }}</span>
          <span class="at-progress">第 {{ current + 1 }} / {{ paper.total }} 题</span>
        </div>
        <div class="at-right">
          <span class="at-result-badge" :class="{ ok: results.length && lastCorrectRef }">答对 {{ results.filter(r => r).length }} 题</span>
        </div>
      </div>

      <div class="card question-card" :key="current + '-' + resetTick">
        <div class="q-meta">
          <span class="tag tag-blue">{{ curQ.subject }}</span>
          <span class="tag tag-purple">{{ curQ.chapter }}</span>
          <span class="tag" :class="typeTagClass(curQ.type)">{{ typeLabel(curQ.type) }}</span>
          <span v-if="curQ.type === 'multi'" class="multi-hint">多选题 · 全部选对才算对</span>
          <span v-if="curQ.type === 'judge'" class="judge-hint">判断题 · 判断陈述真伪</span>
        </div>
        <h3 class="q-stem">{{ curQ.stem }}</h3>
        <div class="options">
          <button
            v-for="opt in curQ.options"
            :key="curQ.id + '-' + opt[0]"
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
            <span class="opt-text">{{ optText(opt) }}</span>
            <span v-if="answered && curQ.type === 'multi' && isCorrectOpt(opt[0]) && !isSelected(opt[0])" class="opt-miss">漏选</span>
          </button>
        </div>

        <div v-if="answered" class="result" :class="lastCorrect ? 'ok' : 'no'">
          <div class="result-head">
            <span class="result-icon">{{ lastCorrect ? '✓' : '✗' }}</span>
            <strong>{{ lastCorrect ? '回答正确！' : '继续加油' }}</strong>
            <span class="right-ans">正确答案：{{ curQ.answer }}</span>
          </div>
          <div v-if="analysisTyping" class="analysis typewriting">
            <strong>解题讲解：</strong>{{ analysisText }}<span class="tw-caret"></span>
          </div>
          <div v-else-if="curQ.analysis" class="analysis">
            <strong>解题讲解：</strong>{{ curQ.analysis }}
          </div>
        </div>

        <div class="q-actions">
          <button v-if="!answered" class="btn btn-primary q-btn" :disabled="!canSubmit || submitting" @click="submit">
            <span v-if="submitting">提交中…</span>
            <template v-else>提交答案</template>
          </button>
          <button v-else class="btn btn-primary q-btn" @click="shouldFinish(current, paper.total) ? finish() : next()">
 {{ shouldFinish(current, paper.total) ? (isAllCorrect ? '完成套卷 🎉' : '完成并查看成绩') : '下一题 →' }}
          </button>
        </div>
        <p v-if="submitting" class="submit-tip">正在更新该章节掌握度…</p>
      </div>

      <!-- 答题卡 -->
      <div class="card answer-sheet">
        <div class="as-head">
          <span>答题卡</span>
          <span class="as-count">{{ answeredCount }}/{{ paper.total }}</span>
        </div>
        <div class="as-grid">
          <button
            v-for="(r, i) in results"
            :key="i"
            class="as-cell"
            :class="{ ok: r, no: r === false, now: i === current }"
            @click="jumpTo(i)"
          >{{ i + 1 }}</button>
        </div>
        <div class="as-legend">
          <span><i class="dot dot-green"></i>答对</span>
          <span><i class="dot dot-red"></i>答错</span>
          <span><i class="dot dot-now"></i>当前</span>
          <span><i class="dot dot-none"></i>未答</span>
        </div>
      </div>

      <div v-if="windowDone" class="answer-sheet-final">
        <button class="btn btn-primary" @click="finish">{{ results.filter(r => r).every(Boolean) ? '完成套卷' : '完成并查看成绩' }}</button>
      </div>
    </div>

    <!-- 完成面板 -->
    <div v-if="finished" class="card finish-panel">
      <div class="fp-badge">{{ isAllCorrect ? '🏆' : '📊' }}</div>
      <h3>{{ isAllCorrect ? '全部攻克！掌握度已刷新' : '套卷完成，继续巩固薄弱点' }}</h3>
      <div class="fp-stats">
        <div class="fp-stat"><div class="num">{{ correctCount }}</div><div class="lbl">答对</div></div>
        <div class="fp-stat"><div class="num">{{ paper.total }}</div><div class="lbl">总题数</div></div>
        <div class="fp-stat"><div class="num">{{ accuracy }}%</div><div class="lbl">正确率</div></div>
      </div>
      <p class="fp-tip">每一题作答都即时回写了对应章节的掌握度，这些数据将影响你的薄弱点排名与复习推荐。</p>
      <div class="fp-sections">
        <div v-for="(s, i) in paper.sections" :key="i" class="fp-section">
          <span class="fp-sec-name">{{ s.subject }}·{{ s.chapter }}</span>
          <span class="fp-sec-status">{{ sectionResultText(i) }}</span>
        </div>
      </div>
      <div class="fp-actions">
        <button class="btn btn-ghost" @click="backToSetup">返回上一页</button>
        <button class="btn btn-primary" @click="generateAgain">换一套薄弱专项卷</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from '../toast'
import { api } from '../api'
import { useTypewriter } from '../useTypewriter'
import QuotaBar from '../components/QuotaBar.vue'
import { accColor, formatCount, shouldFinish } from '../utils/quiz'
import { numToCn } from '../utils/num'

const { text: analysisText, typing: analysisTyping, type: typeAnalysis } = useTypewriter()
const router = useRouter()

const difficulties = ['基础', '中等', '较难']
const loadingWeak = ref(true)
const weakPoints = ref([])
const chosenSet = ref(new Set())
const count = ref(3)
const perSection = ref(3)
const difficulty = ref('中等')

const paper = ref(null)
const generating = ref(false)
const genProgress = ref(0)
const genTip = ref('')
const genSectionsDone = ref([])
const answering = ref(false)

const current = ref(0)
const selected = ref('')
const answered = ref(false)
const submitting = ref(false)
const results = ref([])
const lastCorrect = ref(false)
const lastCorrectRef = ref(false)
const correctCount = ref(0)
const finished = ref(false)
const resetTick = ref(0)
let analysisTimer = null

const curQ = computed(() => {
  if (!paper.value || !paper.value.sections?.length) return {}
  // 将分节题目展平，记录每题所属章节
  let idx = 0
  for (const s of paper.value.sections) {
    if (current.value < idx + s.questions.length) {
      return { ...s.questions[current.value - idx], subject: s.subject, chapter: s.chapter, qtype: s.qtype }
    }
    idx += s.questions.length
  }
  return {}
})

const curSectionLabel = computed(() => {
  const q = curQ.value
  return q.subject ? `${q.subject} · ${q.chapter}` : ''
})

const canSubmit = computed(() => {
  const t = curQ.value.type
  if (t === 'multi') return Array.isArray(selected.value) && selected.value.length > 0
  return !!selected.value
})

const answeredCount = computed(() => results.value.filter(r => r !== undefined && r !== null).length)
const windowDone = computed(() => answeredCount.value === paper.value?.total)
const isAllCorrect = computed(() => results.value.length > 0 && results.value.filter(r => r).length === results.value.length)
const accuracy = computed(() => results.value.length ? Math.round((correctCount.value / results.value.length) * 100) : 0)

function typeLabel(t) {
  return ({ single: '单选题', multiple: '多选题', multi: '多选题', judge: '判断题' })[t] || '单选题'
}
function typeTagClass(t) {
  return t === 'judge' ? 'tag-amber' : t === 'multi' || t === 'multiple' ? 'tag-purple' : 'tag-blue'
}
function optText(opt) {
  // 选项形如 "A. 文本"，剥离字母前缀
  return String(opt).replace(/^[A-H]\s*[.、．]?\s*/, '')
}

async function loadWeak() {
  loadingWeak.value = true
  try {
    const m = await api.get('/stats/mastery')
    weakPoints.value = (m.weak || []).sort((a, b) => a.accuracy - b.accuracy)
  } catch (e) {
    toast(e.message || '薄弱点加载失败', 'error')
  } finally {
    loadingWeak.value = false
    syncChosenFromCount()
  }
}
function syncChosenFromCount() {
  chosenSet.value = new Set(weakPoints.value.slice(0, count.value).map(w => w.subject + ':' + w.chapter))
}
function toggleWeak(w) {
  const key = w.subject + ':' + w.chapter
  const s = new Set(chosenSet.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  chosenSet.value = s
}
const selectedWeak = computed(() => weakPoints.value.filter(w => chosenSet.value.has(w.subject + ':' + w.chapter)))

watch(count, () => { if (!selectedWeak.value.length) syncChosenFromCount() })

function goPractice() { router.push('/practice') }

async function generatePaper() {
  if (generating.value) return
  const targets = selectedWeak.value
  if (!targets.length) { toast('请至少选择一个薄弱章节', 'warning'); return }
  generating.value = true
  genProgress.value = 0
  genSectionsDone.value = []
  genTip.value = '正在分析薄弱章节并调用 AI，共 ' + targets.length + ' 节，请耐心等待…'
  const timer = setInterval(() => {
    genProgress.value = Math.min(genProgress.value + Math.random() * 4, 95)
  }, 600)
  try {
    const data = await api.post('/ai/paper', {
      count: targets.length,
      perSection: perSection.value,
      difficulty: difficulty.value
    })
    if (data.empty) {
      toast(data.message || '当前暂无可生成的薄弱点', 'warning')
      return
    }
    paper.value = data
    results.value = new Array(data.total).fill(undefined)
    genSectionsDone.value = data.sections || []
    genProgress.value = 100
    window.dispatchEvent(new Event('ai-quota-refresh'))
  } catch (e) {
    // 失败时清空模拟进度，避免残留"已生成到 XX%"的误导进度条
    genProgress.value = 0
    genSectionsDone.value = []
    genTip.value = ''
    toast(e.message || '套卷生成失败，请稍后重试', 'error')
  } finally {
    clearInterval(timer)
    setTimeout(() => { generating.value = false }, 400)
  }
}

function backToSetup() {
  paper.value = null
  answering.value = false
  finished.value = false
  current.value = 0
  results.value = []
  correctCount.value = 0
  loadWeak()
}
function startAnswer() {
  answering.value = true
  current.value = 0
  selected.value = curQ.value.type === 'multi' ? [] : ''
  answered.value = false
}

function isSelected(letter) {
  const t = curQ.value.type
  if (t === 'multi') return Array.isArray(selected.value) && selected.value.includes(letter)
  return selected.value === letter
}
function isCorrectOpt(letter) { return String(curQ.value.answer || '').includes(letter) }
function isWrongOpt(letter) { return isSelected(letter) && !isCorrectOpt(letter) }

function choose(letter) {
  if (answered.value || submitting.value) return
  const t = curQ.value.type
  if (t === 'multi') {
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
  const t = curQ.value.type
  const userAns = t === 'multi'
    ? (Array.isArray(selected.value) ? selected.value.join('') : '')
    : (selected.value || '')
  try {
    // 逐题提交，后端回写 practice_records，联动掌握度与错题本
    const data = await api.post('/practice/submit', {
      question_id: curQ.value.id,
      answer: userAns
    })
    lastCorrect.value = !!data.correct
    if (data.correct) correctCount.value++
    if (data.answer) curQ.value.answer = data.answer
    if (data.analysis) {
      curQ.value.analysis = data.analysis
      typeAnalysis(data.analysis)
    }
  } catch (e) {
    lastCorrect.value = userAns === String(curQ.value.answer || '')
    if (lastCorrect.value) correctCount.value++
  } finally {
    submitting.value = false
    answered.value = true
    results.value[current.value] = lastCorrect.value
    lastCorrectRef.value = lastCorrect.value
  }
}

function next() {
  current.value++
  selected.value = curQ.value.type === 'multi' ? [] : ''
  answered.value = false
  resetTick.value++
}
function jumpTo(i) {
  if (i <= answeredCount.value && i <= current.value + 1) {
    current.value = i
    selected.value = curQ.value.type === 'multi' ? [] : ''
    answered.value = false
    resetTick.value++
  }
}
function confirmExit() {
  if (answeredCount.value > 0) {
    if (!confirm('当前作答进度将丢失，确定返回卷面吗？')) return
  }
  answering.value = false
}
function finish() {
  finished.value = true
  answering.value = false
  // 记录一次 AI 练习会话，计入任务与历史
  try {
    api.post('/practice/ai-session', {
      subject: '综合',
      total: paper.value.total,
      correct: correctCount.value
    }).catch(() => {})
  } catch (e) { /* 忽略 */ }
}
function generateAgain() {
  finished.value = false
  backToSetup()
  setTimeout(() => loadWeak(), 0)
}

function sectionResultText(i) {
  const s = paper.value.sections[i]
  const qs = s.questions
  // 找到该节题目在展平结果中的位置并统计
  let idx = 0
  let ok = 0
  for (const prev of paper.value.sections.slice(0, i)) idx += prev.questions.length
  for (let j = 0; j < qs.length; j++) {
    if (results.value[idx + j] === true) ok++
  }
  return results.value[idx] === undefined ? '未作答' : `答对 ${ok}/${qs.length}`
}

onMounted(() => {
  loadWeak()
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
.type-tip { font-size: 0.8rem; color: var(--muted); margin-top: 8px; }

/* 薄弱章节 */
.weak-block { border: 1px solid var(--accent-soft); background: linear-gradient(135deg, var(--accent-soft) 0%, transparent 60%); border-radius: var(--radius-sm); padding: 14px 16px; }
.weak-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.weak-head h3 { font-size: 0.95rem; }
.weak-sub { font-size: 0.8rem; color: var(--muted); margin-top: 3px; }
.weak-list { display: flex; flex-direction: column; gap: 8px; }
.weak-item {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  border: 1px solid var(--rule); border-radius: var(--radius-sm); background: var(--surface);
  cursor: pointer; transition: border-color 0.2s var(--ease), background-color 0.2s var(--ease), box-shadow 0.2s var(--ease);
}
.weak-item:hover { border-color: var(--accent); box-shadow: var(--shadow-xs); }
.weak-item.chosen { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 1px var(--accent); }
.weak-icon { font-size: 1rem; }
.weak-name { font-weight: 600; color: var(--ink); font-size: 0.92rem; flex: 1; }
.weak-total { font-size: 0.78rem; color: var(--muted); }
.weak-acc { font-weight: 800; font-size: 0.9rem; min-width: 46px; text-align: right; font-variant-numeric: tabular-nums; }
.weak-tip { margin-top: 10px; font-size: 0.8rem; color: var(--muted); }

.weak-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 28px 16px; }
.weak-empty-inner h3 { font-size: 1rem; margin-bottom: 6px; }
.weak-empty-inner p { font-size: 0.85rem; color: var(--muted); line-height: 1.7; }
.weak-empty-icon { font-size: 2rem; }

.gen-btn { align-self: flex-start; margin-top: 4px; display: inline-flex; align-items: center; gap: 8px; }

/* 生成进度 */
.sk-wrap { padding: 22px 20px; }
.sk-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.sk-progress { height: 8px; border-radius: 999px; background: linear-gradient(90deg, var(--accent), #2563eb); transition: width 0.4s var(--ease); flex: 1; }
.sk-percent { font-weight: 800; color: var(--accent); font-size: 0.95rem; font-variant-numeric: tabular-nums; }
.sk-title { font-size: 1rem; font-weight: 700; margin-bottom: 6px; }
.sk-gen-tip { font-size: 0.85rem; color: var(--muted); margin-bottom: 12px; }
.sk-done-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.sk-done-item { font-size: 0.85rem; color: var(--green, #0da678); display: flex; align-items: center; gap: 6px; }
.sk-done-ok { font-weight: 800; }
.sk-blocks { display: flex; flex-direction: column; gap: 16px; }
.sk-chip { width: 96px; height: 36px; border-radius: 999px; display: inline-block; flex-shrink: 0; }
.sk-q-stem { width: 70%; height: 18px; margin: 6px 0 10px; }
.sk-q-stem.short { width: 44%; height: 18px; margin-bottom: 14px; }
.sk-q-opt { width: 100%; height: 46px; border-radius: var(--radius-sm); margin-top: 8px; }

/* 卷面概览 */
.overview { padding: 22px 20px; display: flex; flex-direction: column; gap: 18px; }
.ov-head {}
.ov-title-badge { font-size: 1.15rem; font-weight: 800; color: var(--accent); }
.ov-stats { display: flex; gap: 32px; flex-wrap: wrap; }
.ov-stat .num { font-size: 1.7rem; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
.ov-stat .lbl { color: var(--muted); font-size: 0.82rem; }
.ov-sections { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.ov-section { border: 1px solid var(--rule); border-radius: var(--radius-sm); padding: 14px; background: var(--surface); }
.ov-sec-head { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
.ov-sec-no { font-size: 0.75rem; font-weight: 700; color: var(--muted); background: var(--surface-2); border: 1px solid var(--rule); padding: 2px 8px; border-radius: 999px; }
.ov-sec-body { display: flex; align-items: center; gap: 8px; }
.ov-sec-label { font-size: 0.75rem; color: var(--muted); }
.ov-sec-bar { flex: 1; height: 7px; background: var(--rule-soft); border-radius: 999px; overflow: hidden; }
.ov-sec-fill { height: 100%; background: var(--ov-bar); border-radius: 999px; }
.ov-sec-acc { font-weight: 800; font-size: 0.82rem; min-width: 36px; text-align: right; }
.ov-sec-type { font-size: 0.75rem; color: var(--muted); margin-left: auto; }
.ov-note { font-size: 0.82rem; color: var(--muted); line-height: 1.7; background: var(--surface-2); padding: 10px 12px; border-radius: var(--radius-sm); border-left: 3px solid var(--accent); }
.ov-actions { display: flex; justify-content: flex-end; gap: 10px; }

/* 作答 */
.answer-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; margin-bottom: 14px; }
.at-center { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.at-sec { font-size: 0.85rem; font-weight: 700; color: var(--ink); }
.at-progress { font-size: 0.75rem; color: var(--muted); }
.at-right {}
.at-result-badge { font-size: 0.8rem; font-weight: 700; color: var(--muted); background: var(--surface-2); border: 1px solid var(--rule); padding: 4px 10px; border-radius: 999px; }
.at-result-badge.ok { color: var(--green, #0da678); border-color: rgba(13,166,120,0.3); background: var(--green-soft, rgba(13,166,120,0.09)); }

.question-card { margin-bottom: 16px; }
.q-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.multi-hint { font-size: 0.8rem; color: var(--amber); font-weight: 600; }
.judge-hint { font-size: 0.8rem; color: var(--accent-deep); font-weight: 600; }
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
.option.correct { border-color: var(--green, #0da678); background: var(--green-soft, rgba(13,166,120,0.09)); }
.option.wrong { border-color: var(--red, #e11d48); background: var(--red-soft, rgba(225,29,72,0.09)); }
.option.disabled { cursor: default; }
.opt-text { overflow-wrap: break-word; word-break: break-word; }
.opt-letter {
  width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 0.85rem;
}
.option.correct .opt-letter { background: var(--green, #0da678); color: #fff; }
.option.wrong .opt-letter { background: var(--red, #e11d48); color: #fff; }
.opt-miss { margin-left: auto; font-size: 0.72rem; font-weight: 700; color: var(--amber); background: var(--amber-soft, rgba(217,119,6,0.09)); padding: 2px 8px; border-radius: 999px; flex: 0 0 auto; }

.result { margin-top: 16px; padding: 14px 16px; border-radius: 12px; }
.result.ok { background: var(--green-soft, rgba(13,166,120,0.09)); border: 1px solid rgba(13,166,120,0.25); }
.result.no { background: var(--red-soft, rgba(225,29,72,0.09)); border: 1px solid rgba(225,29,72,0.25); }
.result-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.result-icon { font-weight: 800; }
.result.ok .result-icon { color: var(--green, #0da678); }
.result.no .result-icon { color: var(--red, #e11d48); }
.right-ans { margin-left: auto; font-size: 0.88rem; font-weight: 600; color: var(--ink); }
.analysis {
  font-size: 0.92rem; line-height: 1.9; margin-top: 12px; padding: 14px 16px; border-radius: 12px;
  background: var(--surface-2); border: 1px solid var(--rule); border-left: 3px solid var(--accent);
  white-space: pre-wrap; overflow-wrap: break-word; word-break: break-word;
}
.q-actions { margin-top: 16px; }
.q-btn { min-width: 140px; }
.submit-tip { font-size: 0.8rem; color: var(--muted); margin-top: 10px; }

/* 答题卡 */
.answer-sheet { padding: 16px; }
.as-head { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 12px; font-size: 0.9rem; }
.as-count { color: var(--accent); }
.as-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(34px, 1fr)); gap: 8px; }
.as-cell {
  aspect-ratio: 1; border-radius: 8px; border: 1px solid var(--rule); background: var(--surface);
  display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600; color: var(--muted);
  cursor: pointer; transition: all 0.15s var(--ease);
}
.as-cell:hover { border-color: var(--accent); }
.as-cell.ok { background: var(--green-soft, rgba(13,166,120,0.09)); border-color: var(--green, #0da678); color: var(--green, #0da678); }
.as-cell.no { background: var(--red-soft, rgba(225,29,72,0.09)); border-color: var(--red, #e11d48); color: var(--red, #e11d48); }
.as-cell.now { border-color: var(--accent); background: var(--accent); color: #fff; }
.as-legend { display: flex; gap: 14px; margin-top: 12px; font-size: 0.75rem; color: var(--muted); flex-wrap: wrap; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; vertical-align: middle; }
.dot-green { background: var(--green, #0da678); }
.dot-red { background: var(--red, #e11d48); }
.dot-now { background: var(--accent); }
.dot-none { background: var(--rule); border: 1px solid var(--rule); }

.answer-sheet-final { margin-top: 12px; text-align: center; }
.answer-sheet-final .btn { min-width: 200px; padding: 12px 28px; }

/* 完成 */
.finish-panel { text-align: center; padding: 30px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.fp-badge { font-size: 3rem; }
.finish-panel h3 { font-size: 1.3rem; }
.fp-stats { display: flex; justify-content: center; gap: 40px; margin-bottom: 4px; }
.fp-stat .num { font-size: 2rem; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
.fp-stat .lbl { color: var(--muted); font-size: 0.85rem; }
.fp-tip { font-size: 0.85rem; color: var(--muted); max-width: 480px; line-height: 1.7; }
.fp-sections { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.fp-section { display: flex; align-items: center; gap: 8px; border: 1px solid var(--rule); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 0.82rem; }
.fp-sec-name { font-weight: 600; }
.fp-sec-status { color: var(--accent); font-weight: 700; }
.fp-actions { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }

@media (max-width: 768px) {
  .setup { padding: 22px 18px; }
  .gen-btn { align-self: stretch; }
  .chip { padding: 10px 16px; }
  .question-card { padding: 22px 16px; }
  .answer-top { flex-wrap: wrap; }
  .at-right { margin-left: auto; }
}
@media (max-width: 600px) {
  .page-head h2 { font-size: 1.3rem; }
  .page-head p { font-size: 0.82rem; }
  .setup { padding: 18px 14px; gap: 14px; }
  .setup-block h3 { font-size: 0.9rem; }
  .chip { padding: 8px 14px; font-size: 0.85rem; }
  .overview { padding: 16px 14px; }
  .ov-stats { gap: 20px; }
  .ov-sections { grid-template-columns: 1fr; }
  .question-card { padding: 16px 14px; }
  .q-stem { font-size: 0.95rem; line-height: 1.65; }
  .option { padding: 11px 10px; font-size: 0.9rem; }
  .opt-letter { width: 24px; height: 24px; font-size: 0.8rem; }
  .result-head { gap: 6px; }
  .right-ans { margin-left: 0; width: 100%; }
  .analysis { font-size: 0.85rem; }
  .answer-top { padding: 10px 12px; }
  .fp-stats { gap: 20px; }
  .fp-stat .num { font-size: 1.6rem; }
  .fp-stat .lbl { font-size: 0.8rem; }
  .finish-panel { padding: 22px 14px; }
  .finish-panel h3 { font-size: 1.15rem; }
  .fp-actions .btn { flex: 1; min-width: 140px; }
  .q-btn { margin-top: 4px; }
}
@media (max-width: 400px) {
  .chip { padding: 7px 11px; font-size: 0.8rem; }
  .fp-stats { gap: 14px; }
  .fp-stat .num { font-size: 1.4rem; }
  .fp-actions { flex-direction: column; }
  .fp-actions .btn { width: 100%; }
}
</style>