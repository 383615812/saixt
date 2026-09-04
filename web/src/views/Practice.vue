<template>
  <div class="container practice-page">
    <div class="pp-head">
      <h2>{{ dailyMode ? '每日一练' : '在线刷题' }}</h2>
      <p>{{ dailyMode ? '今日智能推荐题目，优先巩固你的薄弱知识点' : '覆盖 11 门会考科目与职业技能测试，按科目、章节、题型精准练习' }}</p>
    </div>

    <!-- 设置区 -->
    <div v-if="!started" class="card setup">
      <div v-if="mode !== 'redo'" class="setup-block">
        <h3>选择科目 <span v-if="!metaLoading" class="setup-hint">题库共 {{ totalQuestions }} 题</span></h3>
        <div v-if="metaLoading" class="chips">
          <span v-for="i in 6" :key="i" class="skeleton sk-chip"></span>
        </div>
        <div v-else class="chips">
          <button
            v-for="s in subjects"
            :key="s.subject"
            class="chip"
            :class="{ on: subject === s.subject }"
            @click="selectSubject(s.subject)"
          >{{ s.subject }}<span class="chip-count">{{ s.count }}</span></button>
        </div>
      </div>
      <div v-if="mode !== 'redo' && chapters.length" class="setup-block">
        <h3>选择章节（可选）</h3>
        <div class="chips">
          <button class="chip" :class="{ on: chapter === '' }" @click="chapter = ''">全部章节</button>
          <button
            v-for="c in chapters"
            :key="c.chapter"
            class="chip"
            :class="{ on: chapter === c.chapter }"
            @click="chapter = chapter === c.chapter ? '' : c.chapter"
          >{{ c.chapter }}<span class="chip-count">{{ c.count }}</span></button>
        </div>
      </div>
      <div v-if="mode !== 'redo' && mode !== 'exam'" class="setup-block">
        <h3>选择题型</h3>
        <div class="chips">
          <button
            v-for="t in typeOptions"
            :key="t.value"
            class="chip"
            :class="{ on: type === t.value }"
            @click="type = t.value"
          >{{ t.label }}</button>
        </div>
        <p class="mode-tip">{{ typeTip }}</p>
      </div>
      <div class="setup-block">
        <h3>选择模式</h3>
        <div class="chips">
          <button class="chip" :class="{ on: mode === 'practice' }" @click="mode = 'practice'">专项练习</button>
          <button class="chip" :class="{ on: mode === 'exam' }" @click="mode = 'exam'">模拟考试</button>
          <button class="chip" :class="{ on: mode === 'redo' }" @click="mode = 'redo'">错题重练</button>
        </div>
        <p class="mode-tip">{{ modeTip }}</p>
      </div>
      <div class="setup-foot">
        <div class="fs-info">
          <span class="fs-label">当前筛选</span>
          <span class="fs-value">{{ filterSummary }}</span>
        </div>
        <div class="fs-count" :class="{ zero: filteredCount === 0 && !loadingCount }">
          <span v-if="loadingCount" class="skeleton sk-fs-count"></span>
          <template v-else>
            <strong>{{ filteredCount }}</strong><span class="fs-unit">题可练</span>
          </template>
        </div>
        <button class="btn btn-primary setup-start" :disabled="filteredCount === 0 && !loadingCount && mode !== 'redo'" @click="start">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          {{ filteredCount === 0 && mode !== 'redo' ? '暂无题目' : '开始' + (mode === 'exam' ? '考试' : mode === 'redo' ? '重练' : '练习') }}
        </button>
      </div>
    </div>

    <!-- 练习区 -->
    <div v-else>
      <!-- 题目加载骨架屏 -->
      <div v-if="starting" class="card question-card sk-question">
        <div class="q-meta">
          <div class="skeleton sk-q-tag"></div>
          <div class="skeleton sk-q-tag"></div>
          <div class="skeleton sk-q-tag"></div>
        </div>
        <div class="skeleton sk-q-stem"></div>
        <div class="skeleton sk-q-stem short"></div>
        <div v-for="i in 4" :key="i" class="skeleton sk-q-opt"></div>
      </div>

      <template v-else>
      <!-- 考试倒计时 -->
      <div v-if="mode === 'exam'" class="exam-timer" :class="{ urgent: examTimeLeft <= 60 }">
        <span class="timer-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/></svg></span>
        <span class="timer-text">剩余时间</span>
        <strong class="timer-num">{{ timerText }}</strong>
        <span class="timer-tip">时间到将自动交卷</span>
        <button class="sheet-btn" @click="sheetOpen = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
          答题卡
        </button>
      </div>

      <!-- 答题卡弹窗 -->
      <transition name="sheet">
        <div v-if="sheetOpen" class="sheet-mask" @click.self="sheetOpen = false">
          <div class="sheet-panel">
            <div class="sheet-head">
              <div>
                <strong>答题卡</strong>
                <span class="sheet-sub">已答 {{ sheetAnswered }} / {{ questions.length }} 题</span>
              </div>
              <button class="sheet-close" @click="sheetOpen = false" aria-label="关闭答题卡">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
            <div class="sheet-grid">
              <button
                v-for="(q, i) in questions"
                :key="q.id"
                class="sheet-cell"
                :class="{ answered: isSheetAnswered(i), current: i === current }"
                @click="jumpTo(i)"
              >{{ i + 1 }}</button>
            </div>
            <div class="sheet-legend">
              <span><i class="lg-dot current"></i>当前题</span>
              <span><i class="lg-dot answered"></i>已答</span>
              <span><i class="lg-dot"></i>未答</span>
            </div>
            <div class="sheet-foot">
              <button class="btn btn-ghost" @click="sheetOpen = false">继续答题</button>
              <button class="btn btn-primary" :disabled="!examAnswers.length" @click="finishExam">交卷</button>
            </div>
          </div>
        </div>
      </transition>

      <!-- 进度 -->
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progress + '%' }"></div>
        <span class="progress-text">{{ current + 1 }} / {{ questions.length }}</span>
      </div>

      <!-- 题目 -->
      <div class="card question-card">
        <div class="q-meta">
          <span class="tag tag-blue">{{ currentQuestion.subject || subject }}</span>
          <span class="tag tag-purple">{{ currentQuestion.chapter }}</span>
          <span class="tag" :class="typeTagClass">{{ typeLabel }}</span>
          <span class="q-source">来源：{{ currentQuestion.source }}</span>
          <button class="fav-btn" :class="{ on: favorited }" @click="toggleFavorite" title="收藏题目">
            <span class="fav-star">{{ favorited ? '★' : '☆' }}</span>
            <span class="fav-text">{{ favorited ? '已收藏' : '收藏' }}</span>
          </button>
        </div>
        <h3 class="q-stem">{{ currentQuestion.stem }}</h3>

        <div v-if="currentQuestion.images && currentQuestion.images.length" class="q-image">
          <img v-for="(img, idx) in currentQuestion.images" :key="idx" :src="'/' + img" alt="题目配图" loading="lazy" @error="onImgError">
        </div>

        <!-- 单选 / 判断 -->
        <div v-if="qtype === 'single' || qtype === 'judge'" class="options">
          <button
            v-for="opt in currentQuestion.options"
            :key="opt[0]"
            class="option"
            :class="{
              selected: isSelected(opt[0]),
              correct: answered && isCorrectOpt(opt[0]),
              wrong: answered && isWrongOpt(opt[0]),
              disabled: answered
            }"
            @click="choose(opt[0])"
          >
            <span class="opt-letter">{{ opt[0] }}</span>
            <span class="opt-text">{{ opt.slice(2) }}</span>
          </button>
        </div>

        <!-- 多选 -->
        <div v-else-if="qtype === 'multiple'" class="options">
          <button
            v-for="opt in currentQuestion.options"
            :key="opt[0]"
            class="option"
            :class="{
              selected: isSelected(opt[0]),
              correct: answered && isCorrectOpt(opt[0]),
              wrong: answered && isWrongOpt(opt[0]),
              disabled: answered
            }"
            @click="choose(opt[0])"
          >
            <span class="opt-letter">{{ opt[0] }}</span>
            <span class="opt-text">{{ opt.slice(2) }}</span>
            <span v-if="answered && isCorrectOpt(opt[0]) && !isSelected(opt[0])" class="opt-miss">漏选</span>
          </button>
          <p class="multi-hint">多选题 · 可多选，需全部选对才算对</p>
        </div>

        <!-- 主观题 -->
        <div v-else-if="qtype === 'subjective'" class="subjective-box">
          <textarea
            v-model="subjectiveAnswer"
            :disabled="answered"
            rows="4"
            placeholder="请写出你的答案（主观题不自动判分，作答后查看参考答案）"
            aria-label="主观题作答"
          ></textarea>
          <button v-if="!answered" class="btn btn-ghost" @click="showSubjectiveAnswer">查看参考答案</button>
        </div>

        <!-- 解析 -->
        <div v-if="answered" class="result" :class="isCorrect ? 'ok' : 'no'">
          <div class="result-head">
            <span class="result-icon">{{ isCorrect ? '✓' : '✗' }}</span>
            <strong>{{ qtype === 'subjective' ? '参考答案' : (isCorrect ? '回答正确' : '回答错误') }}</strong>
            <span class="right-ans">正确答案：{{ currentQuestion.answer }}</span>
          </div>
          <div class="analysis">
            <strong>解题讲解：</strong>{{ currentQuestion.analysis }}
          </div>
          <div v-if="isCorrect === false && mode !== 'exam'" class="ai-explain">
            <button class="btn btn-sm ai-btn" :disabled="aiLoading" @click="aiExplain">
              <svg class="ai-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a5 5 0 0 1 4.24 7.5A5 5 0 0 1 17 19h-2A7 7 0 0 0 12 6"/><path d="M12 2v4"/><path d="M12 6a7 7 0 0 0-3 13.5A5 5 0 0 1 7 19h2"/></svg>
              {{ aiLoading ? 'AI 正在讲解…' : (aiText ? '收起 AI 讲解' : 'AI 讲解这道错题') }}
            </button>
            <div v-if="aiLoading" class="ai-loading"><span class="r"></span><span class="r"></span><span class="r"></span> AI 正在分析错误原因，请稍候…</div>
            <p v-else-if="aiText" class="ai-text">{{ aiText }}<span v-if="aiTyping" class="tw-caret"></span></p>
          </div>
        </div>

        <div class="q-actions">
          <button v-if="!answered && qtype !== 'subjective'" class="btn btn-primary" :disabled="!canSubmit || submitting" @click="submitOne">{{ submitting ? '提交中…' : '提交答案' }}</button>
          <button v-else-if="!answered && qtype === 'subjective'" class="btn btn-primary" @click="showSubjectiveAnswer">查看参考答案</button>
          <template v-else>
            <button v-if="mode === 'exam' && examAnswers.length" class="btn btn-ghost" :disabled="submitting" @click="finishExam">提前交卷</button>
            <button v-if="current < questions.length - 1" class="btn btn-primary" @click="next">下一题 →</button>
            <button v-else-if="mode === 'practice' || mode === 'redo'" class="btn btn-primary" @click="finishSession">{{ mode === 'redo' ? '完成重练' : '完成本次练习' }}</button>
            <button v-else class="btn btn-primary" :disabled="submitting" @click="finishExam">交卷</button>
          </template>
        </div>
      </div>
      </template>
    </div>

    <!-- 考试结果 -->
    <div v-if="examResult" class="card result-panel">
      <h3>考试完成</h3>
      <div class="rp-stats">
        <div class="rp-stat"><div class="num">{{ examResult.score }}</div><div class="lbl">得分（百分制）</div></div>
        <div class="rp-stat"><div class="num">{{ examResult.correct }}</div><div class="lbl">答对</div></div>
        <div class="rp-stat"><div class="num">{{ examResult.total }}</div><div class="lbl">总题数</div></div>
      </div>
      <div class="rp-actions">
        <button class="btn btn-ghost" @click="reset">再来一套</button>
        <router-link to="/dashboard" class="btn btn-primary">查看学习报告</router-link>
      </div>
    </div>

    <!-- 练习/重练完成小结 -->
    <div v-if="practiceResult && !started" class="card result-panel">
      <div class="rp-badge" :class="{ good: practiceResult.correct === practiceResult.total }">{{ practiceResult.correct === practiceResult.total ? '🏆' : '📊' }}</div>
      <h3>{{ mode === 'redo' ? '错题重练完成' : '本次练习小结' }}</h3>
      <p class="rp-sub">
        <template v-if="mode === 'redo'">答对的错题已从错题本移除，仍有把握的错题会继续纳入遗忘曲线复习</template>
        <template v-else>每一题都已即时回写对应章节的掌握度，用于薄弱点排名与复习推荐</template>
      </p>
      <div class="rp-stats">
        <div class="rp-stat"><div class="num">{{ practiceResult.correct }}</div><div class="lbl">答对</div></div>
        <div class="rp-stat"><div class="num">{{ practiceResult.total }}</div><div class="lbl">练习题数</div></div>
        <div class="rp-stat"><div class="num">{{ practiceResult.total ? Math.round(practiceResult.correct / practiceResult.total * 100) : 0 }}%</div><div class="lbl">正确率</div></div>
      </div>

      <!-- 本场错题回顾：与复习计划/错题本联动，形成「答错→复习」闭环 -->
      <div v-if="wrongItems.length" class="rp-wrong">
        <div class="rp-wrong-head">本场错题回顾 · {{ wrongItems.length }} 道</div>
        <div v-for="(q, qi) in wrongItems" :key="q.id || qi" class="rp-wrong-item">
          <div class="rp-wq-meta">
            <span class="tag tag-blue">{{ q.subject }}</span>
            <span class="tag tag-purple">{{ q.chapter }}</span>
            <span class="tag" :class="typeTagClassOf(q.type)">{{ typeLabelOf(q.type) }}</span>
          </div>
          <div class="rp-wq-stem">{{ stripHtml(q.stem) }}</div>
          <div class="rp-wq-ans">
            <span class="rp-wq-your">你的作答：{{ q.userAnswer || '未作答' }}</span>
            <span class="rp-wq-right">正确答案：{{ q.answer || '—' }}</span>
          </div>
          <div v-if="q.analysis" class="rp-wq-analysis">{{ q.analysis }}</div>
        </div>
      </div>

      <div class="rp-actions">
        <button class="btn btn-ghost" @click="restartAgain">再来一组</button>
        <router-link v-if="wrongItems.length" to="/review" class="btn btn-primary">去复习错题 →</router-link>
        <router-link v-else to="/bank" class="btn btn-primary">继续刷题 →</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>

import { toast } from '../toast'
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { useImgError } from '../useImgError'
import { useTypewriter } from '../useTypewriter'

const { text: aiText, typing: aiTyping, type: typeAiText } = useTypewriter()

const route = useRoute()
const subjects = ref([])
const subject = ref('')
const chapter = ref('')
const type = ref('')
const dailyMode = ref(false)
const mode = ref('practice')
const started = ref(false)
const questions = ref([])
const current = ref(0)
const selected = ref('')
const subjectiveAnswer = ref('')
const answered = ref(false)
const isCorrect = ref(false)
const examAnswers = ref([])
const examResult = ref(null)
const favorited = ref(false)
const aiLoading = ref(false)
const totalQuestions = ref(0)
const filteredCount = ref(0)
const loadingCount = ref(false)
const metaLoading = ref(true)
const starting = ref(false)
let countTimer = null

const typeOptions = [
  { value: '', label: '全部客观题' },
  { value: 'single', label: '单选题' },
  { value: 'multiple', label: '多选题' },
  { value: 'judge', label: '判断题' },
  { value: 'subjective', label: '主观题' }
]
const typeLabelMap = { single: '单选题', multiple: '多选题', judge: '判断题', subjective: '主观题' }

const EXAM_MINUTES = 30
const examTimeLeft = ref(EXAM_MINUTES * 60)
let examTimer = null
const EXAM_KEY = 'saixt_exam_state'
const submitting = ref(false)
const sessionTotal = ref(0)
const sessionCorrect = ref(0)
const wrongItems = ref([])
const practiceResult = ref(null)

const currentQuestion = computed(() => questions.value[current.value] || {})
const qtype = computed(() => currentQuestion.value.type || 'single')
const typeLabel = computed(() => typeLabelMap[qtype.value] || '单选题')
const typeTagClass = computed(() => {
  if (qtype.value === 'multiple') return 'tag-amber'
  if (qtype.value === 'judge') return 'tag-green'
  if (qtype.value === 'subjective') return 'tag-purple'
  return 'tag-blue'
})
const progress = computed(() => questions.value.length ? ((current.value + (answered.value ? 1 : 0)) / questions.value.length) * 100 : 0)
const timerText = computed(() => {
  const m = Math.floor(examTimeLeft.value / 60)
  const s = examTimeLeft.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})
const canSubmit = computed(() => {
  if (qtype.value === 'multiple') return Array.isArray(selected.value) && selected.value.length > 0
  return !!selected.value
})
const sheetOpen = ref(false)
const sheetAnswered = computed(() => examAnswers.value.length)
function isSheetAnswered(i) {
  const q = questions.value[i]
  return q && examAnswers.value.some(a => a.question_id === q.id)
}
function jumpTo(i) {
  // 未提交的当前作答先暂存，避免跳题丢失
  if (selected.value && !answered.value && qtype.value !== 'subjective') {
    examAnswers.value = examAnswers.value.filter(a => a.question_id !== currentQuestion.value.id)
    examAnswers.value.push({ question_id: currentQuestion.value.id, answer: userAnswer() })
    saveExamState()
  }
  current.value = i
  selected.value = ''
  subjectiveAnswer.value = ''
  answered.value = false
  sheetOpen.value = false
}
const modeTip = computed(() => {
  if (mode.value === 'practice') return '逐题作答，即时查看解析，适合日常巩固'
  if (mode.value === 'exam') return '按试卷作答，全部完成后统一判分，适合考前自测'
  return '重练错题本中的题目，答对即从错题本移除，直到全部掌握'
})
const typeTip = computed(() => {
  if (type.value === 'multiple') return '多选题有 2-3 个正确答案，需全部选对才算对'
  if (type.value === 'judge') return '判断题判断陈述正确或错误，考查概念辨析'
  if (type.value === 'subjective') return '主观题不自动判分，作答后查看参考答案与解析'
  return '涵盖单选、多选、判断等客观题型，贴近春招真题'
})

const chapters = computed(() => {
  if (!subject.value) return []
  return metaChapters.value.filter(c => c.subject === subject.value)
})
const metaChapters = ref([])

const filterSummary = computed(() => {
  const parts = []
  if (subject.value) parts.push(subject.value)
  if (chapter.value) parts.push(chapter.value)
  if (mode.value !== 'exam' && type.value) {
    const t = typeOptions.find(o => o.value === type.value)
    if (t) parts.push(t.label)
  }
  return parts.length ? parts.join(' · ') : '全部题库'
})

async function fetchFilteredCount() {
  if (mode.value === 'redo') { filteredCount.value = 0; return }
  loadingCount.value = true
  try {
    const params = new URLSearchParams()
    if (subject.value) params.set('subject', subject.value)
    if (chapter.value) params.set('chapter', chapter.value)
    if (mode.value !== 'exam' && type.value) params.set('type', type.value)
    else if (mode.value === 'exam') params.set('type', 'single,multiple,judge')
    const data = await api.get(`/questions/count?${params}`)
    filteredCount.value = data.count
  } catch (e) {
    console.warn('[practice] 题数获取失败:', e.message)
    // 题数获取失败时提示，避免用户看到"暂无题目"误以为真无题
    toast(e.message || '题数获取失败，请重试', 'error')
  } finally {
    loadingCount.value = false
  }
}

function debouncedFetchCount() {
  clearTimeout(countTimer)
  countTimer = setTimeout(fetchFilteredCount, 300)
}

function saveExamState() {
  if (mode.value !== 'exam' || !started.value) return
  sessionStorage.setItem(EXAM_KEY, JSON.stringify({
    startTime: Date.now(),
    initialTimeLeft: EXAM_MINUTES * 60,
    current: current.value,
    answers: examAnswers.value,
    subject: subject.value,
    questionIds: questions.value.map(q => q.id)
  }))
}

function clearExamState() {
  sessionStorage.removeItem(EXAM_KEY)
}

function restoreExamState() {
  const raw = sessionStorage.getItem(EXAM_KEY)
  if (!raw) return false
  try {
    const state = JSON.parse(raw)
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000)
    const remaining = state.initialTimeLeft - elapsed
    if (remaining <= 0) { clearExamState(); return false }
    examTimeLeft.value = remaining
    examAnswers.value = state.answers || []
    current.value = state.current || 0
    mode.value = 'exam'
    subject.value = state.subject || ''
    started.value = true
    selected.value = ''
    subjectiveAnswer.value = ''
    answered.value = state.answers.some(a => a.question_id === state.questionIds[state.current])
    return true
  } catch { clearExamState(); return false }
}

function isSelected(letter) {
  if (qtype.value === 'multiple') return Array.isArray(selected.value) && selected.value.includes(letter)
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
  if (qtype.value === 'multiple') {
    const arr = Array.isArray(selected.value) ? [...selected.value] : []
    const i = arr.indexOf(letter)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(letter)
    selected.value = arr.sort()
  } else {
    selected.value = letter
  }
}

function userAnswer() {
  if (qtype.value === 'multiple') return (Array.isArray(selected.value) ? selected.value.join('') : '')
  return selected.value || ''
}

const { onImgError } = useImgError()

function selectSubject(s) {
  subject.value = subject.value === s ? '' : s
  chapter.value = ''
}

async function start() {
  examResult.value = null
  starting.value = true
  try {
    if (dailyMode.value) {
      const data = await api.get('/daily')
      if (!data.questions.length) { toast('今日暂无推荐题目，请稍后再来', 'info'); return }
      questions.value = data.questions
    } else if (mode.value === 'redo') {
      const wrong = await api.get('/practice/wrong')
      if (!wrong.length) { toast('太棒了，错题本已清空，无需重练', 'success'); return }
      questions.value = wrong
    } else {
      const params = new URLSearchParams({ limit: 50 })
      if (subject.value) params.set('subject', subject.value)
      if (chapter.value) params.set('chapter', chapter.value)
      params.set('type', typeParam())
      const data = await api.get(`/questions?${params}`)
      if (!data.list.length) { toast('该筛选条件下暂无题目，请调整后重试', 'info'); return }
      questions.value = data.list
    }
    current.value = 0
    selected.value = ''
    subjectiveAnswer.value = ''
    answered.value = false
    aiText.value = ''
    examAnswers.value = []
    sessionTotal.value = 0
    sessionCorrect.value = 0
    wrongItems.value = []
    practiceResult.value = null
    started.value = true
    if (mode.value === 'exam') {
      examTimeLeft.value = EXAM_MINUTES * 60
      startTimer()
      saveExamState()
    } else {
      // 记录一次练习会话（计入"练习次数"；非核心，失败静默降级）
      try { await api.post('/practice/start', { subject: subject.value, mode: mode.value }) } catch (e) { /* 会话记录失败不阻断练习 */ }
    }
  } catch (e) {
    toast(e.message || '题目加载失败，请稍后重试', 'error')
  } finally {
    starting.value = false
  }
}

function typeParam() {
  if (mode.value === 'exam') return 'single,multiple,judge'
  if (type.value === '') return 'single,multiple,judge'
  return type.value
}

function startTimer() {
  clearInterval(examTimer)
  examTimer = setInterval(() => {
    examTimeLeft.value--
    if (examTimeLeft.value <= 0) {
      clearInterval(examTimer)
      examTimer = null
      finishExam()
    }
  }, 1000)
}

async function submitOne() {
  if (submitting.value) return
  submitting.value = true
  try {
    const data = await api.post('/practice/submit', { question_id: currentQuestion.value.id, answer: userAnswer() })
    isCorrect.value = data.correct
    currentQuestion.value.answer = data.answer
    currentQuestion.value.analysis = data.analysis
    answered.value = true
    if (mode.value === 'exam') {
      examAnswers.value = examAnswers.value.filter(a => a.question_id !== currentQuestion.value.id)
      examAnswers.value.push({ question_id: currentQuestion.value.id, answer: userAnswer() })
      saveExamState()
    } else {
      // 非考试模式下累计本次练习成绩，用于完成后小结与错题回顾
      sessionTotal.value++
      if (data.correct) sessionCorrect.value++
      else if (!wrongItems.value.some(x => x.id === currentQuestion.value.id)) wrongItems.value.push(questionSnapshot())
    }
    if (mode.value === 'redo' && data.correct) {
      try { await api.post('/practice/mastered', { question_id: currentQuestion.value.id }) } catch (e) { toast('标记掌握失败，请稍后重试', 'error') }
    }
  } catch (e) {
    toast(e.message || '提交失败，请稍后重试', 'error')
  } finally {
    submitting.value = false
  }
}

function showSubjectiveAnswer() {
  isCorrect.value = false
  answered.value = true
  // 主观题作答也入库沉淀：不自动判分，交由错题本/复习队列跟踪，逐遍自评直至掌握
  const ans = (subjectiveAnswer.value || '').trim().slice(0, 2000)
  api.post('/practice/submit', { question_id: currentQuestion.value.id, answer: ans, selfCorrect: false })
    .catch(e => { /* 作答沉淀失败不阻断查看参考答案 */ })
}

// AI 错题讲解：回答错误时提供深度讲解
async function aiExplain() {
  if (aiLoading.value) return
  if (aiText.value) { aiText.value = ''; return }
  aiLoading.value = true
  try {
    const data = await api.post('/ai/explain', { question_id: currentQuestion.value.id })
    typeAiText(data.reply)
    window.dispatchEvent(new Event('ai-quota-refresh'))
  } catch (e) {
    toast(e.message || 'AI 讲解失败，请稍后再试', 'error')
  } finally {
    aiLoading.value = false
  }
}

function next() {
  current.value++
  selected.value = ''
  subjectiveAnswer.value = ''
  answered.value = false
  aiText.value = ''
  saveExamState()
}

// 专项练习/错题重练最后一题作答完成后的收尾：快照成绩并回到设置页展示小结
function finishSession() {
  practiceResult.value = { total: sessionTotal.value, correct: sessionCorrect.value }
  reset()
  toast(mode.value === 'redo' ? '错题重练完成，继续保持！' : '本次专项练习已完成，继续加油！', 'success')
}

// 小结面板「再来一组」：清空小结，回到设置页重新开始
function restartAgain() {
  practiceResult.value = null
  wrongItems.value = []
  sessionTotal.value = 0
  sessionCorrect.value = 0
  reset()
}

// 小结/错题回顾辅助函数
function typeLabelOf(t) { return typeLabelMap[t] || '单选题' }
function typeTagClassOf(t) {
  if (t === 'multiple') return 'tag-amber'
  if (t === 'judge') return 'tag-green'
  if (t === 'subjective') return 'tag-purple'
  return 'tag-blue'
}
// 题干/解析去 HTML 标签，仅作展示净化，不改变数据
function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}
// 快照当前作答题目（客观题，供错题回顾），answer/analysis 已由提交结果回填
function questionSnapshot() {
  const q = currentQuestion.value
  return {
    id: q.id,
    subject: q.subject || subject.value,
    chapter: q.chapter,
    type: q.type,
    stem: q.stem,
    answer: q.answer || '',
    analysis: q.analysis || '',
    userAnswer: userAnswer()
  }
}

async function finishExam() {
  if (examTimer) { clearInterval(examTimer); examTimer = null }
  if (selected.value && !answered.value) {
    await submitOne()
  }
  if (!examAnswers.value.length) {
    toast('请至少完成一道题再交卷', 'warn')
    return
  }
  submitting.value = true
  try {
    const data = await api.post('/practice/session', { subject: subject.value, mode: 'exam', answers: examAnswers.value })
    examResult.value = data
    clearExamState()
  } catch (e) {
    toast(e.message || '交卷失败，请稍后重试', 'error')
  } finally {
    submitting.value = false
  }
}

async function toggleFavorite() {
  const q = currentQuestion.value
  if (!q.id) return
  try {
    const data = await api.post('/favorites/toggle', { question_id: q.id })
    favorited.value = data.favorited
    const fav = JSON.parse(localStorage.getItem('saixt_favs') || '{}')
    if (data.favorited) fav[q.id] = true
    else delete fav[q.id]
    localStorage.setItem('saixt_favs', JSON.stringify(fav))
  } catch (e) {
    toast(e.message || '操作失败，请稍后重试', 'error')
  }
}

// 装载时以后端收藏为真值重建本地缓存，避免跨页/跨端收藏状态不同步
async function syncFavsFromServer() {
  try {
    const list = await api.get('/favorites')
    const map = {}
    ;(list || []).forEach(x => { if (x && x.id) map[x.id] = true })
    localStorage.setItem('saixt_favs', JSON.stringify(map))
    if (currentQuestion.value?.id) favorited.value = !!map[currentQuestion.value.id]
  } catch (e) { /* 拉取失败保留本地缓存，不作为空态展示 */ }
}

function reset() {
  clearInterval(examTimer)
  examTimer = null
  started.value = false
  examResult.value = null
  clearExamState()
}

watch(currentQuestion, (q) => {
  if (q.id) {
    const fav = JSON.parse(localStorage.getItem('saixt_favs') || '{}')
    favorited.value = !!fav[q.id]
  }
})

watch([subject, chapter, type, mode], debouncedFetchCount)

onMounted(async () => {
  syncFavsFromServer()
  try {
    const meta = await api.get('/questions/meta')
    subjects.value = meta.subjects
    metaChapters.value = meta.chapters
    totalQuestions.value = (meta.subjects || []).reduce((s, x) => s + x.count, 0)
    if (!subject.value && subjects.value.length) subject.value = subjects.value[0].subject
    fetchFilteredCount()
  } catch (e) { toast('题库信息加载失败，请刷新重试', 'error') }
  finally { metaLoading.value = false }

  if (route.query.mode === 'redo') mode.value = 'redo'
  if (route.query.subject) subject.value = route.query.subject
  if (route.query.chapter) chapter.value = route.query.chapter
  if (route.query.qid) {
    // 全局搜索直达：加载指定题目并开始专项练习
    try {
      const q = await api.get(`/questions/${Number(route.query.qid)}`)
      if (q && q.id) {
        questions.value = [q]
        mode.value = 'practice'
        subject.value = q.subject
        current.value = 0
        selected.value = ''
        subjectiveAnswer.value = ''
        answered.value = false
        examAnswers.value = []
        started.value = true
        try { await api.post('/practice/start', { subject: q.subject, mode: 'practice' }) } catch (e) { /* 会话记录失败不阻断练习 */ }
      }
    } catch (e) { toast('题目加载失败，请稍后重试', 'error') }
  } else if (route.query.daily === '1') {
    dailyMode.value = true
    start()
  } else {
    const restored = restoreExamState()
    if (restored) {
      const params = new URLSearchParams({ subject: subject.value, limit: 50, type: 'single,multiple,judge' })
      try {
        const data = await api.get(`/questions?${params}`)
        if (data.list.length) {
          questions.value = data.list
          startTimer()
        }
      } catch (e) { clearExamState() }
    }
  }
})

onBeforeUnmount(() => clearInterval(examTimer))
</script>

<style scoped>
.practice-page { max-width: 820px; }
.pp-head { text-align: center; margin-bottom: 28px; }
.pp-head h2 { font-size: 1.55rem; font-weight: 800; letter-spacing: -0.01em; }
.pp-head p { color: var(--muted); font-size: 0.92rem; margin-top: 4px; }

.setup { padding: 28px; position: relative; overflow: hidden; }
.setup::before { content: ''; position: absolute; top: -90px; right: -70px; width: 260px; height: 260px; border-radius: 50%; background: radial-gradient(circle, rgba(79, 95, 240, 0.06) 0%, transparent 65%); pointer-events: none; }
.setup-block { margin-bottom: 22px; position: relative; }
.setup-block h3 { font-size: 1rem; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.setup-block h3::before { content: ''; width: 4px; height: 15px; border-radius: 2px; background: var(--grad-accent); }
.setup-hint { font-size: 0.8rem; color: var(--muted); font-weight: 400; margin-left: 6px; }
.chips { display: flex; gap: 10px; flex-wrap: wrap; }
.chip {
  border: 1px solid var(--rule); background: var(--surface); border-radius: var(--radius-full);
  padding: 9px 22px; font-size: 0.95rem; font-weight: 500; color: var(--muted);
  transition: border-color 0.25s var(--ease), color 0.25s var(--ease), background-color 0.25s var(--ease), box-shadow 0.25s var(--ease), transform 0.25s var(--ease);
}
.chip:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }
.chip.on { background: var(--accent); color: #fff; border-color: transparent; box-shadow: 0 4px 14px rgba(79, 95, 240, 0.25); }
.chip-count { font-size: 0.78rem; opacity: 0.7; margin-left: 5px; }
.mode-tip { color: var(--muted); font-size: 0.85rem; margin-top: 10px; }

.filter-summary {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 18px; border-radius: var(--radius-sm); margin-bottom: 16px;
  background: var(--surface-2); border: 1px solid var(--rule);
}
.fs-info { display: flex; flex-direction: column; gap: 2px; }
.fs-label { font-size: 0.78rem; color: var(--muted); }
.fs-value { font-size: 0.92rem; font-weight: 600; }
.fs-count { display: flex; align-items: baseline; gap: 3px; font-size: 0.85rem; color: var(--muted); }
.fs-count strong { font-size: 1.6rem; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
.fs-count.zero strong { color: var(--red); }
.fs-unit { font-size: 0.82rem; }

/* 骨架屏 */
.sk-chip { width: 96px; height: 36px; border-radius: 999px; display: inline-block; }
.sk-fs-count { width: 64px; height: 26px; border-radius: 8px; display: inline-block; align-self: center; }
.sk-q-tag { width: 64px; height: 24px; border-radius: var(--radius-sm); }
.sk-q-stem { width: 72%; height: 20px; margin-top: 18px; }
.sk-q-stem.short { width: 46%; }
.sk-q-opt { width: 100%; height: 52px; border-radius: var(--radius-sm); margin-top: 12px; }

.progress-bar { position: relative; height: 8px; background: var(--rule-soft); border-radius: var(--radius-full); margin-bottom: 20px; overflow: visible; box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04); }
.progress-fill { height: 100%; background: linear-gradient(90deg, #4f5ff0, #6b58e8); border-radius: var(--radius-full); transition: width 0.4s var(--ease); box-shadow: 0 1px 4px rgba(79, 95, 240, 0.3); }
.progress-text { position: absolute; right: 0; top: -22px; font-size: 0.82rem; color: var(--muted); font-variant-numeric: tabular-nums; }

.exam-timer {
  display: flex; align-items: center; gap: 10px; margin-bottom: 16px;
  padding: 12px 18px; border-radius: var(--radius-sm);
  background: var(--grad-accent-soft);
  border: 1px solid rgba(79, 95, 240, 0.25);
}
.exam-timer.urgent { background: var(--red-soft); border-color: var(--red); }
.timer-icon { display: flex; color: var(--accent); }
.exam-timer.urgent .timer-icon { color: var(--red); }
.timer-icon svg { width: 20px; height: 20px; }
.timer-text { font-size: 0.88rem; color: var(--muted); }
.timer-num { font-size: 1.5rem; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
.exam-timer.urgent .timer-num { color: var(--red); animation: pulse 1s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.timer-tip { margin-left: auto; font-size: 0.78rem; color: var(--muted); }

.sheet-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: var(--radius-full);
  border: 1px solid rgba(79, 95, 240, 0.3); background: var(--surface);
  color: var(--accent); font-size: 0.82rem; font-weight: 600;
  transition: transform 0.18s var(--ease), box-shadow 0.22s var(--ease), background-color 0.22s var(--ease);
}
.sheet-btn:hover { box-shadow: var(--shadow-sm); transform: translateY(-1px); }
.sheet-btn:active { transform: scale(0.96); }
.sheet-btn svg { width: 15px; height: 15px; }

/* 答题卡弹窗 */
.sheet-mask {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(30, 41, 59, 0.45);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.sheet-panel {
  width: 100%; max-width: 420px; max-height: 82vh; overflow-y: auto; overscroll-behavior: contain;
  background: var(--surface); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg); padding: 22px;
  animation: sheetPop 0.3s var(--ease-out);
}
@keyframes sheetPop { from { opacity: 0; transform: translateY(18px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.sheet-head strong { font-size: 1.05rem; }
.sheet-sub { margin-left: 8px; font-size: 0.8rem; color: var(--muted); font-weight: 400; }
.sheet-close {
  width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--rule);
  background: var(--surface-2); color: var(--muted);
  display: flex; align-items: center; justify-content: center;
  transition: background-color 0.2s var(--ease), color 0.2s var(--ease), transform 0.15s var(--ease);
}
.sheet-close:hover { background: var(--accent-soft); color: var(--accent); }
.sheet-close:active { transform: scale(0.92); }
.sheet-close svg { width: 15px; height: 15px; }
.sheet-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.sheet-cell {
  aspect-ratio: 1; border-radius: 9px;
  border: 1px solid var(--rule); background: var(--surface-2);
  color: var(--muted); font-size: 0.88rem; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.18s var(--ease), background-color 0.18s var(--ease), color 0.18s var(--ease), transform 0.15s var(--ease);
}
.sheet-cell:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }
.sheet-cell:active { transform: scale(0.94); }
.sheet-cell.answered { background: var(--green-soft); border-color: rgba(13, 166, 120, 0.35); color: var(--green); }
.sheet-cell.current { background: var(--accent); border-color: var(--accent); color: #fff; box-shadow: 0 3px 10px rgba(79, 95, 240, 0.3); }
.sheet-legend { display: flex; gap: 16px; margin: 16px 0 0; font-size: 0.78rem; color: var(--muted); }
.sheet-legend span { display: inline-flex; align-items: center; gap: 6px; }
.lg-dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; background: var(--surface-2); border: 1px solid var(--rule); }
.lg-dot.answered { background: var(--green-soft); border-color: rgba(13, 166, 120, 0.35); }
.lg-dot.current { background: var(--accent); border-color: var(--accent); }
.sheet-foot { display: flex; gap: 10px; margin-top: 18px; }
.sheet-foot .btn { flex: 1; }

.fav-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 12px; border-radius: var(--radius-full); border: 1px solid var(--rule);
  background: var(--surface); color: var(--muted); font-size: 0.82rem;
  transition: border-color 0.25s var(--ease), color 0.25s var(--ease), background-color 0.25s var(--ease), transform 0.15s var(--ease);
}
.fav-btn:hover { border-color: var(--amber); color: var(--amber); }
.fav-btn:active { transform: scale(0.93); }
.fav-btn.on { border-color: var(--amber); background: var(--amber-soft); color: var(--amber); }
.fav-star { font-size: 1rem; line-height: 1; }

.question-card { padding: 28px; position: relative; overflow: hidden; }
.question-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--grad-accent); transform: scaleX(0); transform-origin: left; transition: transform 0.4s var(--ease); }
.question-card:hover::before { transform: scaleX(1); }
.q-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.q-source { color: var(--muted); font-size: 0.8rem; margin-left: auto; }
.q-stem { font-size: 1.08rem; line-height: 1.8; margin-bottom: 20px; overflow-wrap: break-word; word-break: break-word; }

.q-image {
  margin: 0 0 18px; padding: 14px; border-radius: var(--radius-sm);
  background: var(--surface-2); border: 1px dashed var(--rule);
  display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; align-items: center;
}
.q-image img {
  max-width: 100%; max-height: 320px; object-fit: contain; border-radius: 8px;
}

.options { display: flex; flex-direction: column; gap: 10px; }
.option {
  display: flex; align-items: flex-start; gap: 12px; text-align: left;
  border: 1px solid var(--rule); background: var(--surface); border-radius: var(--radius-sm);
  padding: 13px 16px; font-size: 0.95rem;
  transition: border-color 0.25s var(--ease), background-color 0.25s var(--ease), box-shadow 0.25s var(--ease), transform 0.15s var(--ease);
}
.option:hover:not(.disabled) { border-color: var(--accent); background: var(--accent-soft); box-shadow: var(--shadow-xs); }
.option.selected { border-color: var(--accent); background: var(--accent-soft); }
.option.correct { border-color: var(--green); background: var(--green-soft); }
.option.wrong { border-color: var(--red); background: var(--red-soft); }
.option.disabled { cursor: default; }
.opt-letter {
  width: 28px; height: 28px; border-radius: 9px; flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 0.88rem;
  transition: background-color 0.2s var(--ease), color 0.2s var(--ease), transform 0.15s var(--ease);
}
.option:hover:not(.disabled) .opt-letter { transform: scale(1.06); }
.option.selected .opt-letter { background: var(--accent); color: #fff; }
.option.correct .opt-letter { background: var(--green); color: #fff; }
.option.wrong .opt-letter { background: var(--red); color: #fff; }
.opt-text { flex: 1; overflow-wrap: break-word; word-break: break-word; }
.opt-miss { margin-left: auto; font-size: 0.78rem; font-weight: 700; color: var(--amber); background: var(--amber-soft); padding: 2px 8px; border-radius: var(--radius-full); flex: 0 0 auto; }
.multi-hint { font-size: 0.82rem; color: var(--amber); font-weight: 600; }

.subjective-box { display: flex; flex-direction: column; gap: 12px; }
.subjective-box textarea {
  width: 100%; padding: 14px; border: 1px solid var(--rule); border-radius: var(--radius-sm);
  font-size: 0.95rem; line-height: 1.7; resize: vertical; outline: none;
  font-family: inherit; background: var(--surface-2);
  transition: border-color 0.25s var(--ease), background-color 0.25s var(--ease), box-shadow 0.25s var(--ease);
}
.subjective-box textarea:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 4px var(--accent-soft); }
.subjective-box textarea:disabled { background: var(--surface-2); color: var(--muted); }
.subjective-box .btn { align-self: flex-start; }

.result { border-radius: var(--radius-sm); padding: 16px 18px; margin-top: 20px; animation: result-in 0.4s var(--ease-out); }
@keyframes result-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.result.ok { background: var(--green-soft); border: 1px solid rgba(13,166,120,0.25); }
.result.no { background: var(--red-soft); border: 1px solid rgba(225,29,72,0.25); }
.result-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.result-icon {
  width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; font-size: 0.9rem;
}
.result.ok .result-icon { background: var(--green); }
.result.no .result-icon { background: var(--red); }
.right-ans { margin-left: auto; color: var(--ink); font-size: 0.88rem; font-weight: 600; }
.analysis { font-size: 0.93rem; line-height: 1.8; overflow-wrap: break-word; word-break: break-word; }

.ai-explain { margin-top: 14px; padding: 12px 14px; border-radius: 12px; background: linear-gradient(180deg, var(--accent-soft), var(--surface-2)); border: 1px solid rgba(79, 95, 240, 0.25); border-left: 3px solid var(--accent); }
.ai-btn { color: var(--accent); border: 1px solid rgba(79, 95, 240, 0.4); background: var(--surface); }
.ai-btn:hover { background: var(--accent); color: #fff; border-color: transparent; }
.ai-btn:disabled { opacity: 0.6; }
.ai-ico { width: 14px; height: 14px; vertical-align: -2px; margin-right: 4px; }
.ai-loading { display: flex; align-items: center; gap: 6px; margin-top: 10px; color: var(--muted); font-size: 0.86rem; }
.ai-loading .r { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: ai-dot 1.2s infinite ease-in-out; }
.ai-loading .r:nth-child(2) { animation-delay: 0.2s; }
.ai-loading .r:nth-child(3) { animation-delay: 0.4s; }
@keyframes ai-dot { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
.ai-text { margin-top: 10px; font-size: 0.93rem; line-height: 1.9; white-space: pre-wrap; overflow-wrap: break-word; word-break: break-word; }
.tw-caret { display: inline-block; width: 2px; height: 1.1em; background: var(--accent); vertical-align: text-bottom; margin-left: 2px; animation: caret-blink 0.9s steps(1) infinite; }
@keyframes caret-blink { 50% { opacity: 0; } }
.result.no .ai-btn { color: var(--accent); }

.q-actions { margin-top: 22px; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }

.result-panel { margin-top: 24px; text-align: center; padding: 32px; position: relative; overflow: hidden; }
.result-panel::before { content: ''; position: absolute; top: -110px; left: 50%; transform: translateX(-50%); width: 320px; height: 240px; border-radius: 50%; background: radial-gradient(circle, rgba(79, 95, 240, 0.1) 0%, transparent 65%); pointer-events: none; }
.rp-stats { display: flex; justify-content: center; gap: 40px; margin: 24px 0; position: relative; }
.rp-stat { padding: 12px 24px; border-radius: 12px; background: var(--grad-accent-soft); border: 1px solid rgba(79, 95, 240, 0.1); }
.rp-stat .num { font-size: 2.2rem; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; background: var(--grad-accent); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
.rp-stat .lbl { color: var(--muted); font-size: 0.85rem; }
.rp-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; position: relative; }

/* 练习/重练小结 */
.rp-badge {
  width: 68px; height: 68px; margin: 0 auto 12px; border-radius: 22px;
  display: flex; align-items: center; justify-content: center; font-size: 2rem;
  background: var(--grad-accent-soft); border: 1px solid rgba(79, 95, 240, 0.18);
  box-shadow: 0 4px 16px rgba(79, 95, 240, 0.14); position: relative;
}
.rp-badge.good { background: var(--green-soft); border-color: rgba(13,166,120,0.25); box-shadow: 0 4px 16px rgba(13,166,120,0.16); }
.rp-sub { color: var(--muted); font-size: 0.85rem; max-width: 480px; margin: 0 auto; line-height: 1.7; position: relative; }
.rp-wrong { width: 100%; max-width: 680px; margin: 8px auto 0; text-align: left; display: flex; flex-direction: column; gap: 10px; }
.rp-wrong-head { font-size: 0.95rem; font-weight: 800; color: var(--ink); padding-bottom: 4px; border-bottom: 1px dashed var(--rule); }
.rp-wrong-item { border: 1px solid var(--rule); border-left: 3px solid var(--red); border-radius: 12px; padding: 12px 14px; background: var(--surface-2); display: flex; flex-direction: column; gap: 8px; }
.rp-wq-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rp-wq-stem { font-size: 0.9rem; font-weight: 600; color: var(--ink); line-height: 1.7; overflow-wrap: break-word; word-break: break-word; }
.rp-wq-ans { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.85rem; }
.rp-wq-your { color: var(--red); font-weight: 700; background: var(--red-soft); padding: 3px 10px; border-radius: 999px; }
.rp-wq-right { color: var(--green); font-weight: 700; background: var(--green-soft); padding: 3px 10px; border-radius: 999px; }
.rp-wq-analysis { font-size: 0.82rem; color: var(--ink-soft); line-height: 1.75; background: var(--surface); border: 1px solid var(--rule); border-left: 3px solid var(--accent); padding: 10px 12px; border-radius: 10px; white-space: pre-wrap; overflow-wrap: break-word; word-break: break-word; }

@media (max-width: 768px) {
  .setup { padding: 22px 18px; }
  .chip { padding: 10px 18px; }
  .question-card { padding: 22px 16px; }
  .q-actions .btn { flex: 1; }
  .filter-summary { flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px 14px; }
  .fs-count strong { font-size: 1.4rem; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
}
@media (max-width: 600px) {
  .pp-head h2 { font-size: 1.25rem; }
  .pp-head p { font-size: 0.82rem; }
  .setup { padding: 18px 14px; }
  .setup-block { margin-bottom: 18px; }
  .setup-block h3 { font-size: 0.92rem; }
  .chip { padding: 8px 14px; font-size: 0.85rem; }
  .chip-count { font-size: 0.78rem; }
  .exam-timer { flex-wrap: wrap; gap: 6px 10px; padding: 12px 14px; }
  .timer-tip { margin-left: 0; width: 100%; }
  .sheet-btn { margin-left: auto; }
  .sheet-mask { padding: 12px; align-items: flex-end; }
  .sheet-panel { padding: 18px 16px calc(18px + var(--safe-bottom)); max-height: 92vh; max-height: 92dvh; border-radius: 18px 18px 14px 14px; }
  .sheet-grid { grid-template-columns: repeat(5, 1fr); gap: 7px; }
  .timer-num { font-size: 1.3rem; }
  .result-head { flex-wrap: wrap; }
  .right-ans { margin-left: 0; width: 100%; }
  .option { padding: 13px 10px; font-size: 0.9rem; min-height: 48px; align-items: center; }
  .opt-letter { font-size: 0.85rem; width: 32px; height: 32px; flex: 0 0 32px; }
  .q-stem { font-size: 0.98rem; line-height: 1.7; }
  .q-meta { gap: 6px; }
  .q-source { font-size: 0.78rem; width: 100%; margin-left: 0; }
  .fav-btn { font-size: 0.78rem; padding: 8px 12px; min-height: 40px; }
  .rp-stats { gap: 20px; }
  .rp-stat .num { font-size: 1.6rem; }
  .rp-stat .lbl { font-size: 0.78rem; }
  .result-panel { padding: 20px 14px; }
  .subjective-box .btn { width: 100%; }
  .subjective-box textarea { font-size: 1rem; padding: 12px; }
  .analysis { font-size: 0.86rem; }
  .multi-hint { font-size: 0.78rem; }
}
@media (max-width: 400px) {
  .chip { padding: 7px 11px; font-size: 0.8rem; }
  .option { padding: 10px 8px; }
  .q-stem { font-size: 0.92rem; }
  .progress-text { font-size: 0.78rem; }
  .rp-stats { gap: 14px; }
  .rp-stat .num { font-size: 1.4rem; }
}
</style>
