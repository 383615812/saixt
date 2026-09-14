<template>
  <div class="container me-page">
    <div class="page-head">
      <h2>套卷模拟考试</h2>
      <p>按科目随机组卷、限时作答、交卷自动评分，可查看逐题解析与历史成绩</p>
    </div>

    <!-- ===================== 阶段一：考前配置 ===================== -->
    <template v-if="phase === 'setup'">
      <div v-if="ongoing" class="card resume-card">
        <div class="rc-info">
          <strong>有一场未完成的考试</strong>
          <span>{{ ongoing.subject }} · 共 {{ ongoing.total }} 题 · 剩余 {{ fmtClock(remainingOf(ongoing)) }}</span>
        </div>
        <div class="rc-act">
          <button class="btn btn-primary btn-sm" @click="resumeExam(ongoing)">继续作答</button>
          <button class="btn btn-ghost btn-sm" @click="discardOngoing">放弃</button>
        </div>
      </div>

      <div class="card setup">
        <div class="setup-block">
          <h3>1. 选择科目</h3>
          <div class="chips">
            <button
              v-for="s in meta.subjects"
              :key="s.subject"
              class="chip"
              :class="{ on: form.subject === s.subject }"
              @click="form.subject = s.subject"
            >{{ s.subject }}<em>{{ s.count }}</em></button>
          </div>
        </div>

        <div class="setup-block">
          <h3>2. 题量与时长</h3>
          <div class="preset-grid">
            <button
              v-for="p in meta.presets"
              :key="p.key"
              class="preset"
              :class="{ on: form.size === p.size }"
              @click="pickPreset(p)"
            >
              <strong>{{ p.label }}</strong>
              <span>{{ p.size }} 题</span>
              <em>{{ Math.round(p.durationSec / 60) }} 分钟</em>
            </button>
          </div>
        </div>

        <div class="setup-block">
          <h3>3. 难度</h3>
          <div class="chips">
            <button
              v-for="d in meta.difficulties"
              :key="d"
              class="chip"
              :class="{ on: form.difficulty === d }"
              @click="form.difficulty = d"
            >{{ d }}</button>
          </div>
        </div>

        <div class="setup-block">
          <div class="sec-head">
            <h3>4. 定向章节（可选）</h3>
            <button v-if="form.chapters.length" class="mini-btn" @click="form.chapters = []">清除，全部章节</button>
          </div>
          <p class="block-sub">不选则从本科目全部章节随机组卷；选中后仅从所选章节出题</p>
          <div v-if="loadingChapters" class="me-empty-sm">章节加载中…</div>
          <div v-else-if="!chapterList.length" class="me-empty-sm">该科目暂无章节数据</div>
          <div v-else class="chips">
            <button
              v-for="c in chapterList"
              :key="c.chapter"
              class="chip"
              :class="{ on: form.chapters.includes(c.chapter) }"
              @click="toggleChapter(c.chapter)"
            >{{ c.chapter }}<em>{{ c.c }}</em></button>
          </div>
        </div>

        <div class="setup-block">
          <div class="sec-head">
            <h3>5. 主观题（可选）</h3>
          </div>
          <label class="subj-toggle" :class="{ on: form.includeSubjective, off: !subjAvail }">
            <input type="checkbox" v-model="form.includeSubjective" :disabled="!subjAvail" />
            <span class="st-txt">
              <strong>加入主观题（最多 3 题）</strong>
              <em v-if="subjAvail">交卷后由你自评为「会 / 部分会 / 不会」，折算后计入总分；本科目可用 {{ subjAvail }} 题</em>
              <em v-else>本科目暂无可选主观题</em>
            </span>
          </label>
        </div>

        <p v-if="setupMsg" class="me-err">{{ setupMsg }}</p>
        <button class="btn btn-primary start-btn" :disabled="starting || !form.subject" @click="start">
          {{ starting ? '正在组卷…' : '开始考试' }}
        </button>
        <p class="me-note">客观题交卷即自动评分并计入学习统计；主观题交卷后需自评。考试中不显示答案，请独立作答</p>
      </div>

      <div class="card panel">
        <div class="panel-head">
          <h3>历史模考</h3>
          <span class="panel-count">{{ historyTotal }} 次</span>
        </div>
        <div v-if="loadingHistory" class="me-empty">加载中…</div>
        <div v-else-if="!history.length" class="me-empty">
          <p>还没有模考记录</p>
          <span class="empty-sub">选好科目与题量，开始你的第一场模拟考试</span>
        </div>
        <div v-else class="hist-list">
          <button v-for="h in history" :key="h.id" class="hist-item" @click="viewResult(h.id)">
            <span class="hi-subject">{{ h.subject }}</span>
            <span class="hi-tag">{{ h.difficulty }}</span>
            <span class="hi-score" :style="{ color: scoreColor(h.score) }">{{ h.score }}</span>
            <span class="hi-meta">{{ h.correct }}/{{ h.total }} · {{ fmtDur(h.used_sec) }}</span>
            <span class="hi-time">{{ (h.submitted_at || '').slice(5, 16) }}</span>
          </button>
        </div>
      </div>
    </template>

    <!-- ===================== 阶段二：考试中 ===================== -->
    <template v-else-if="phase === 'exam'">
      <div class="card exam-bar">
        <div class="eb-left">
          <span class="eb-subj">{{ exam.subject }}</span>
          <span class="eb-idx">第 {{ idx + 1 }} / {{ exam.total }} 题</span>
        </div>
        <div class="eb-timer" :class="{ warn: leftSec <= 300 }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          {{ fmtClock(leftSec) }}
        </div>
        <button class="btn btn-primary btn-sm" :disabled="submitting" @click="confirmSubmit">交卷</button>
      </div>

      <div class="exam-body">
        <div class="card q-card">
          <div class="q-tags">
            <span class="tag tag-blue">{{ cur.chapter || '综合' }}</span>
            <span class="tag tag-purple">{{ typeText(cur.type) }}</span>
            <span class="tag tag-gray">{{ diffText(cur.difficulty) }}</span>
          </div>
          <p class="q-stem">{{ cur.stem }}</p>
          <div v-if="cur.images && cur.images.length" class="q-img">
            <img v-for="(im, i) in cur.images" :key="i" :src="'/' + im" alt="题目配图" loading="lazy" @error="onImgError">
          </div>
          <div v-if="isSubjective(cur)" class="subj-answer">
            <p class="sa-hint">主观题：请写下你的作答要点（交卷后自行评分，不参与客观题自动判分）</p>
            <textarea
              class="sa-input"
              :value="answers[cur.id] || ''"
              placeholder="在此写下你的解答思路或要点…"
              rows="6"
              maxlength="50"
              @input="onSubjInput(cur, $event)"
            ></textarea>
          </div>
          <div v-else class="opts">
            <button
              v-for="(o, i) in cur.options"
              :key="i"
              class="opt"
              :class="{ on: isPicked(cur.id, optLetter(o, i)) }"
              @click="pick(cur, optLetter(o, i))"
            >
              <span class="opt-key">{{ optLetter(o, i) }}</span>
              <span class="opt-txt">{{ optText(o) }}</span>
            </button>
          </div>
          <p v-if="cur.type === 'multiple'" class="q-hint">多选题：可选择多个选项</p>
          <div class="q-nav">
            <button class="btn btn-ghost btn-sm" :disabled="idx === 0" @click="idx--">上一题</button>
            <button class="btn btn-ghost btn-sm" :disabled="idx >= exam.total - 1" @click="idx++">下一题</button>
          </div>
        </div>

        <div class="card sheet-card">
          <h3>答题卡</h3>
          <div class="sheet-grid">
            <button
              v-for="(q, i) in exam.questions"
              :key="q.id"
              class="sheet-cell"
              :class="{ done: !!answers[q.id], cur: i === idx, subj: isSubjective(q) }"
              @click="idx = i"
            >{{ i + 1 }}</button>
          </div>
          <p class="sheet-stat">已答 <b>{{ answeredN }}</b> / {{ exam.total }}</p>
          <div class="sheet-legend">
            <span><i class="lg done"></i>已答</span>
            <span><i class="lg"></i>未答</span>
            <span v-if="subjCount"><i class="lg subj"></i>主观题</span>
          </div>
          <button class="btn btn-primary sheet-submit" :disabled="submitting" @click="confirmSubmit">交卷评分</button>
        </div>
      </div>
    </template>

    <!-- ===================== 阶段三：成绩与解析 ===================== -->
    <template v-else>
      <div v-if="exam && exam.pendingSelfGrade" class="card selfgrade-card">
        <div class="sg-head">
          <h3>主观题自评</h3>
          <span class="sg-sub">共 {{ exam.subjTotal }} 道主观题，请如实自评；自评仅可提交一次，提交后总分合并生成</span>
        </div>
        <p class="sg-note">当前客观题得分：<b>{{ objOnlyScore }}</b> 分（答对 {{ result.correct }} / {{ exam.objTotal }}）。主观题按 会=1 分 / 部分会=0.5 分 / 不会=0 分折算后与客观题合并计算总分。</p>
        <div class="sg-list">
          <div v-for="(d, i) in subjectiveDetail" :key="d.id" class="sg-item">
            <div class="sg-q">
              <span class="sg-idx">主观题 {{ i + 1 }}</span>
              <p class="sg-stem">{{ stemOf(d.id) }}</p>
              <p v-if="d.your" class="sg-yours">你的作答：{{ d.your }}</p>
              <p v-else class="sg-yours empty">未作答</p>
            </div>
            <div class="sg-opts">
              <button
                v-for="g in SELF_GRADE_OPTS"
                :key="g.key"
                class="sg-opt"
                :class="[g.key, { on: selfGrades[d.id] === g.key }]"
                @click="selfGrades[d.id] = g.key"
              >{{ g.label }}<em>{{ g.hint }}</em></button>
            </div>
          </div>
        </div>
        <p v-if="gradeMsg" class="me-err">{{ gradeMsg }}</p>
        <button class="btn btn-primary sg-submit" :disabled="grading" @click="submitGrades">
          {{ grading ? '提交中…' : '提交自评并生成总分' }}
        </button>
      </div>

      <div class="card result-head">
        <div class="rh-score" :style="{ color: scoreColor(result.score) }">{{ result.score }}<em>分</em></div>
        <div class="rh-meta">
          <span>{{ exam.subject }} · {{ exam.difficulty }}难度</span>
          <span>答对 {{ result.correct }} / {{ result.total }} 题 · 用时 {{ fmtDur(result.used_sec) }}</span>
          <span v-if="exam.subjTotal" class="rh-split">
            客观题 {{ result.correct }}/{{ exam.objTotal }}
            <template v-if="exam.graded"> · 主观题自评 {{ selfScoreSum }}/{{ exam.subjTotal }}</template>
            <template v-else-if="exam.pendingSelfGrade"> · 主观题待自评</template>
          </span>
          <span class="rh-level">{{ scoreLevel(result.score) }}</span>
        </div>
        <div class="rh-act">
          <button class="btn btn-primary btn-sm" @click="reset">再考一次</button>
          <button class="btn btn-ghost btn-sm" @click="backToList">返回列表</button>
        </div>
      </div>

      <div class="card panel">
        <div class="panel-head"><h3>逐题解析</h3><span class="panel-count">{{ result.total }} 题</span></div>
        <div class="review-list">
          <div v-for="(q, i) in exam.questions" :key="q.id" class="review-item">
            <div class="rv-head">
              <span class="rv-idx">{{ i + 1 }}</span>
              <span class="tag" :class="isRight(q.id) ? 'tag-green' : 'tag-red'">{{ reviewTag(q.id) }}</span>
              <span v-if="!detailMap[q.id]?.subjective" class="rv-ans">正确答案：{{ detailMap[q.id]?.answer || '—' }}</span>
              <span v-else class="rv-ans subj">主观题</span>
              <span class="rv-yours">你的答案：{{ detailMap[q.id]?.your || '未作答' }}</span>
            </div>
            <p class="rv-stem">{{ q.stem }}</p>
            <div v-if="q.images && q.images.length" class="q-img">
              <img v-for="(im, k) in q.images" :key="k" :src="'/' + im" alt="题目配图" loading="lazy" @error="onImgError">
            </div>
            <div v-if="detailMap[q.id]?.analysis" class="rv-analysis">
              <strong>解析：</strong>{{ detailMap[q.id].analysis }}
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { api } from '../api'
import { toast } from '../toast'

const phase = ref('setup')            // setup | exam | result
const meta = ref({ subjects: [], presets: [], difficulties: [] })
const form = reactive({ subject: '', size: 20, durationSec: 1800, difficulty: '综合', chapters: [], includeSubjective: false })
const chapterList = ref([])
const loadingChapters = ref(false)
const starting = ref(false)
const submitting = ref(false)
const setupMsg = ref('')

const exam = ref(null)                // 进行中/已完成的试卷
const answers = reactive({})          // qid -> 答案字符串（多选按字母排序拼接）
const idx = ref(0)
const leftSec = ref(0)
const result = ref({ score: 0, correct: 0, total: 0, used_sec: 0 })

// 主观题自评
const SELF_GRADE_OPTS = [
  { key: 'full', label: '会', hint: '1 分' },
  { key: 'half', label: '部分会', hint: '0.5 分' },
  { key: 'none', label: '不会', hint: '0 分' }
]
const selfGrades = reactive({})       // qid -> 'full' | 'half' | 'none'
const grading = ref(false)
const gradeMsg = ref('')

const history = ref([])
const historyTotal = ref(0)
const loadingHistory = ref(false)
const ongoing = ref(null)

let timer = null

const cur = computed(() => (exam.value && exam.value.questions[Math.min(idx.value, exam.value.questions.length - 1)]) || {})
const answeredN = computed(() => (exam.value ? exam.value.questions.filter(q => !!answers[q.id]).length : 0))
const detailMap = computed(() => {
  const m = {}
  for (const d of (exam.value && exam.value.detail) || []) m[d.id] = d
  return m
})
// 当前科目的主观题可选量（用于组卷开关提示与禁用）
const subjAvail = computed(() => {
  const s = (meta.value.subjects || []).find(x => x.subject === form.subject)
  return s ? (s.subjective || 0) : 0
})
const subjCount = computed(() => (exam.value ? (exam.value.subjTotal || 0) : 0))
const subjectiveDetail = computed(() => ((exam.value && exam.value.detail) || []).filter(d => d.subjective))
// 客观题单独得分（自评前展示，避免用户误以为已得总分）
const objOnlyScore = computed(() => {
  if (!exam.value || !exam.value.objTotal) return 0
  return Math.round((result.value.correct / exam.value.objTotal) * 100 * 10) / 10
})
// 已自评的主观题折算分合计
const selfScoreSum = computed(() => {
  const w = { full: 1, half: 0.5, none: 0 }
  return subjectiveDetail.value.reduce((a, d) => a + (w[d.selfGrade] || 0), 0)
})

function isSubjective(q) {
  if (!q) return false
  if (q.subjective != null) return !!q.subjective
  return ['subjective', 'essay', 'short_answer'].includes(q.type)
}
function stemOf(qid) {
  const q = (exam.value && exam.value.questions || []).find(x => x.id === qid)
  return q ? q.stem : ''
}
function reviewTag(qid) {
  const d = detailMap.value[qid]
  if (d && d.subjective) return d.selfGrade === 'full' ? '会' : d.selfGrade === 'half' ? '部分会' : d.selfGrade === 'none' ? '不会' : '待自评'
  return isRight(qid) ? '答对' : '答错'
}
function onSubjInput(q, e) {
  answers[q.id] = String(e.target.value || '').slice(0, 50)
  saveDraft()
}

function optLetter(o, i) {
  const m = String(o || '').match(/^\s*([A-Ha-h])\s*[.、．]/)
  return m ? m[1].toUpperCase() : String.fromCharCode(65 + i)
}
function optText(o) {
  return String(o || '').replace(/^\s*[A-Ha-h]\s*[.、．]\s*/, '').trim()
}
function typeText(t) { return { single: '单选题', multiple: '多选题', judge: '判断题' }[t] || '客观题' }
function diffText(d) { return { 1: '基础', 2: '中等', 3: '较难' }[d] || '综合' }
function scoreColor(s) { return s >= 85 ? 'var(--green)' : s >= 60 ? 'var(--accent)' : 'var(--red)' }
function scoreLevel(s) { return s >= 85 ? '优秀，继续保持' : s >= 60 ? '及格，仍有提升空间' : '需要加强，建议结合错题本复习' }
function fmtClock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  const p = n => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`
}
function fmtDur(sec) {
  const s = Number(sec) || 0
  return s >= 60 ? `${Math.floor(s / 60)} 分 ${s % 60} 秒` : `${s} 秒`
}
function onImgError(e) { if (e && e.target) e.target.style.display = 'none' }

function isPicked(qid, L) { return String(answers[qid] || '').includes(L) }
function pick(q, L) {
  if (q.type === 'multiple') {
    const set = new Set(String(answers[q.id] || '').split('').filter(Boolean))
    set.has(L) ? set.delete(L) : set.add(L)
    answers[q.id] = [...set].sort().join('')
  } else {
    answers[q.id] = L
  }
  saveDraft()
}
function isRight(qid) { return !!(detailMap.value[qid] && detailMap.value[qid].correct) }

function draftKey(id) { return 'saixt_exam_draft_' + id }
function saveDraft() {
  if (!exam.value) return
  try { localStorage.setItem(draftKey(exam.value.id), JSON.stringify(answers)) } catch (e) { /* 忽略隐私模式失败 */ }
}
function loadDraft(id) {
  try {
    const raw = localStorage.getItem(draftKey(id))
    if (raw) Object.assign(answers, JSON.parse(raw))
  } catch (e) { /* 忽略 */ }
}
function clearDraft(id) { try { localStorage.removeItem(draftKey(id)) } catch (e) { /* 忽略 */ } }

function remainingOf(ex) {
  if (!ex) return 0
  const started = new Date(String(ex.started_at || '').replace(' ', 'T')).getTime()
  if (!Number.isFinite(started)) return ex.duration_sec
  return Math.max(0, ex.duration_sec - Math.round((Date.now() - started) / 1000))
}

function beginExam(ex) {
  exam.value = ex
  idx.value = 0
  for (const k of Object.keys(answers)) delete answers[k]
  loadDraft(ex.id)
  leftSec.value = remainingOf(ex)
  phase.value = 'exam'
  startTimer()
}

function startTimer() {
  stopTimer()
  timer = setInterval(() => {
    leftSec.value -= 1
    if (leftSec.value <= 0) { leftSec.value = 0; stopTimer(); autoSubmit() }
  }, 1000)
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null } }

async function loadMeta() {
  try { meta.value = await api.get('/exam/meta') } catch (e) { toast(e.message || '加载失败', 'error') }
  if (!form.subject && meta.value.subjects && meta.value.subjects.length) form.subject = meta.value.subjects[0].subject
}
async function loadHistory() {
  loadingHistory.value = true
  try {
    const d = await api.get('/exam/history?limit=20')
    history.value = d.list || []
    historyTotal.value = d.total || history.value.length
  } catch (e) { /* 静默 */ }
  loadingHistory.value = false
}
async function loadOngoing() {
  try { ongoing.value = await api.get('/exam/ongoing') } catch (e) { ongoing.value = null }
}

function pickPreset(p) { form.size = p.size; form.durationSec = p.durationSec }

// 定向章节：切换科目时重新加载章节列表并清空已选
async function loadChapters(subject) {
  if (!subject) { chapterList.value = []; return }
  loadingChapters.value = true
  try {
    const d = await api.get('/exam/chapters?subject=' + encodeURIComponent(subject))
    chapterList.value = d.chapters || []
  } catch (e) { chapterList.value = [] }
  loadingChapters.value = false
}
watch(() => form.subject, s => { form.chapters = []; loadChapters(s) })
function toggleChapter(name) {
  const i = form.chapters.indexOf(name)
  if (i >= 0) form.chapters.splice(i, 1)
  else form.chapters.push(name)
}

async function start() {
  setupMsg.value = ''
  starting.value = true
  try {
    const ex = await api.post('/exam/start', {
      subject: form.subject, size: form.size, durationSec: form.durationSec,
      difficulty: form.difficulty, chapters: form.chapters.slice(),
      includeSubjective: !!form.includeSubjective
    })
    beginExam(ex)
  } catch (e) { setupMsg.value = e.message || '组卷失败，请稍后重试' }
  finally { starting.value = false }
}

async function resumeExam(ex) {
  beginExam(ex)
  ongoing.value = null
}

async function discardOngoing() {
  if (!ongoing.value) return
  clearDraft(ongoing.value.id)
  ongoing.value = null
  toast('已放弃该场考试', 'success')
}

function buildAnswers() {
  return exam.value.questions.map(q => ({ question_id: q.id, answer: answers[q.id] || '' }))
}

function confirmSubmit() {
  const un = exam.value.total - answeredN.value
  let msg = un > 0 ? `还有 ${un} 题未作答，确认交卷？` : '确认交卷并评分？'
  if (subjCount.value) msg += `\n本卷含 ${subjCount.value} 道主观题，交卷后需你自评「会 / 部分会 / 不会」。`
  if (!window.confirm(msg)) return
  doSubmit()
}

async function autoSubmit() {
  toast('考试时间到，自动交卷', 'error')
  await doSubmit(true)
}

async function doSubmit(auto = false) {
  if (submitting.value || !exam.value) return
  submitting.value = true
  stopTimer()
  try {
    const r = await api.post(`/exam/${exam.value.id}/submit`, { answers: buildAnswers() })
    clearDraft(exam.value.id)
    result.value = { score: r.score, correct: r.correct, total: r.total, used_sec: r.used_sec }
    // 拉取含解析的完整试卷
    await loadExamDetail(exam.value.id)
    prepSelfGrade()
    phase.value = 'result'
    loadHistory()
    window.scrollTo({ top: 0, behavior: 'auto' })
  } catch (e) {
    toast(e.message || '交卷失败，请重试', 'error')
    if (!auto) startTimer()
  } finally { submitting.value = false }
}

// 准备自评：清空历史档位，默认全部标为「不会」（避免漏评无法提交，用户只需上调）
function prepSelfGrade() {
  gradeMsg.value = ''
  for (const k of Object.keys(selfGrades)) delete selfGrades[k]
  for (const d of subjectiveDetail.value) if (d.selfGrade) selfGrades[d.id] = d.selfGrade
}

async function submitGrades() {
  if (!exam.value) return
  const subs = subjectiveDetail.value
  const missing = subs.filter(d => !selfGrades[d.id])
  if (missing.length) {
    gradeMsg.value = `还有 ${missing.length} 道主观题未自评，请完成后提交`
    return
  }
  gradeMsg.value = ''
  grading.value = true
  try {
    const grades = {}
    for (const d of subs) grades[d.id] = selfGrades[d.id]
    const r = await api.post(`/exam/${exam.value.id}/grade`, { grades })
    result.value = { score: r.score, correct: result.value.correct, total: result.value.total, used_sec: result.value.used_sec }
    await loadExamDetail(exam.value.id)
    toast('自评完成，总分已生成', 'success')
    loadHistory()
    window.scrollTo({ top: 0, behavior: 'auto' })
  } catch (e) { gradeMsg.value = e.message || '自评提交失败，请重试' }
  finally { grading.value = false }
}

async function loadExamDetail(id) {
  try {
    const d = await api.get('/exam/' + id)
    exam.value = d
  } catch (e) { /* 保留已有 */ }
}

async function viewResult(id) {
  try {
    const d = await api.get('/exam/' + id)
    exam.value = d
    result.value = { score: d.score, correct: d.correct, total: d.total, used_sec: d.used_sec }
    prepSelfGrade()
    phase.value = 'result'
    window.scrollTo({ top: 0, behavior: 'auto' })
  } catch (e) { toast(e.message || '加载失败', 'error') }
}

function backToList() { reset() }

function reset() {
  stopTimer()
  exam.value = null
  idx.value = 0
  for (const k of Object.keys(answers)) delete answers[k]
  phase.value = 'setup'
  ongoing.value = null
  loadOngoing()
  loadHistory()
  window.scrollTo({ top: 0, behavior: 'auto' })
}

onMounted(async () => {
  await loadMeta()
  await loadOngoing()
  await loadHistory()
})
onUnmounted(stopTimer)
</script>

<style scoped>
.me-page { padding-bottom: 40px; }

/* 配置区 */
.setup { padding: 22px 20px 20px; }
.setup-block { margin-bottom: 20px; }
.setup-block h3 { font-size: 0.92rem; font-weight: 700; color: var(--ink); margin-bottom: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
  padding: 8px 14px; border-radius: var(--radius-full); border: 1px solid var(--rule);
  background: var(--surface); color: var(--ink-soft); font-size: 0.86rem; font-weight: 500;
  transition: all .18s ease;
}
.chip:hover { border-color: var(--accent-light); }
.chip.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.chip em { font-style: normal; font-size: 0.72rem; opacity: 0.7; }
.chip.on em { opacity: 0.85; }

.preset-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
.preset {
  cursor: pointer; text-align: center; padding: 14px 10px; border-radius: var(--radius-sm);
  border: 1px solid var(--rule); background: var(--surface); display: flex; flex-direction: column; gap: 3px;
  transition: all .18s ease;
}
.preset:hover { border-color: var(--accent-light); }
.preset.on { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 3px var(--accent-soft); }
.preset strong { font-size: 0.95rem; color: var(--ink); }
.preset span { font-size: 0.82rem; color: var(--muted); }
.preset em { font-style: normal; font-size: 0.72rem; color: var(--muted-2); }

.start-btn { width: 100%; padding: 14px; font-size: 1rem; margin-top: 6px; }
.me-note { text-align: center; color: var(--muted-2); font-size: 0.78rem; margin-top: 10px; }
.sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.sec-head h3 { margin-bottom: 0; }
.mini-btn { font-size: 0.76rem; color: var(--accent); background: none; border: none; cursor: pointer; padding: 0; }
.mini-btn:hover { text-decoration: underline; }
.block-sub { font-size: 0.76rem; color: var(--muted-2); margin-bottom: 10px; }
.me-empty-sm { font-size: 0.8rem; color: var(--muted-2); padding: 6px 0; }
.me-err { color: var(--red); font-size: 0.84rem; margin: 4px 0 10px; }
.me-empty { text-align: center; color: var(--muted-2); padding: 30px 12px; }
.me-empty p { color: var(--muted); font-weight: 500; margin-bottom: 4px; }

/* 续考提示 */
.resume-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px; margin-bottom: 14px; border-left: 4px solid var(--amber); }
.rc-info { display: flex; flex-direction: column; gap: 3px; }
.rc-info strong { font-size: 0.92rem; color: var(--ink); }
.rc-info span { font-size: 0.8rem; color: var(--muted); }
.rc-act { display: flex; gap: 8px; flex-shrink: 0; }

/* 历史 */
.hist-list { display: flex; flex-direction: column; }
.hist-item { display: flex; align-items: center; gap: 12px; padding: 12px 4px; border-bottom: 1px solid var(--rule-soft); background: none; border-left: 0; border-right: 0; border-top: 0; cursor: pointer; text-align: left; width: 100%; }
.hist-item:last-child { border-bottom: 0; }
.hist-item:hover { background: var(--accent-soft); }
.hi-subject { font-weight: 600; color: var(--ink); font-size: 0.9rem; min-width: 68px; }
.hi-tag { font-size: 0.72rem; color: var(--muted-2); background: var(--bg-soft); padding: 2px 8px; border-radius: var(--radius-full); }
.hi-score { font-size: 1.15rem; font-weight: 800; min-width: 46px; }
.hi-meta { color: var(--muted); font-size: 0.8rem; flex: 1; }
.hi-time { color: var(--muted-2); font-size: 0.74rem; }

/* 考试中 */
.exam-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; margin-bottom: 14px; position: sticky; top: calc(var(--safe-top) + 8px); z-index: 5; }
.eb-left { display: flex; flex-direction: column; gap: 2px; }
.eb-subj { font-weight: 700; color: var(--ink); font-size: 0.9rem; }
.eb-idx { font-size: 0.74rem; color: var(--muted-2); }
.eb-timer { display: inline-flex; align-items: center; gap: 5px; font-variant-numeric: tabular-nums; font-weight: 700; font-size: 1.05rem; color: var(--accent); }
.eb-timer.warn { color: var(--red); }

.exam-body { display: grid; grid-template-columns: 1fr 260px; gap: 14px; align-items: start; }
.q-card { padding: 20px 18px; }
.q-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.q-stem { font-size: 1rem; line-height: 1.7; color: var(--ink); margin-bottom: 14px; }
.q-img { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.q-img img { max-width: 100%; border-radius: var(--radius-sm); border: 1px solid var(--rule); }
.opts { display: flex; flex-direction: column; gap: 9px; }
.opt { display: flex; align-items: flex-start; gap: 10px; text-align: left; cursor: pointer; padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--rule); background: var(--surface); transition: all .15s ease; }
.opt:hover { border-color: var(--accent-light); }
.opt.on { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 3px var(--accent-soft); }
.opt-key { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: 700; border: 1px solid var(--rule-strong); color: var(--muted); }
.opt.on .opt-key { background: var(--accent); border-color: var(--accent); color: #fff; }
.opt-txt { font-size: 0.92rem; line-height: 1.6; color: var(--ink-soft); }
.q-hint { font-size: 0.76rem; color: var(--muted-2); margin-top: 10px; }
.q-nav { display: flex; justify-content: space-between; margin-top: 18px; }

/* 主观题作答 */
.subj-answer { display: flex; flex-direction: column; gap: 8px; }
.sa-hint { font-size: 0.78rem; color: var(--muted-2); }
.sa-input {
  width: 100%; box-sizing: border-box; resize: vertical; font-family: inherit;
  font-size: 0.92rem; line-height: 1.7; color: var(--ink-soft);
  padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--rule);
  background: var(--surface); outline: none; transition: border-color .15s ease;
}
.sa-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

.sheet-card { padding: 16px; position: sticky; top: calc(var(--safe-top) + 76px); }
.sheet-card h3 { font-size: 0.88rem; margin-bottom: 12px; color: var(--ink); }
.sheet-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; }
.sheet-cell { aspect-ratio: 1/1; border-radius: 8px; border: 1px solid var(--rule); background: var(--surface); color: var(--muted); font-size: 0.8rem; cursor: pointer; }
.sheet-cell.done { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.sheet-cell.cur { box-shadow: 0 0 0 2px var(--accent); border-color: var(--accent); }
.sheet-cell.subj { border-style: dashed; border-color: var(--accent-2); color: var(--accent-2); }
.sheet-cell.subj.done { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
.sheet-stat { text-align: center; font-size: 0.8rem; color: var(--muted); margin: 12px 0 8px; }
.sheet-legend { display: flex; justify-content: center; gap: 14px; font-size: 0.72rem; color: var(--muted-2); margin-bottom: 12px; flex-wrap: wrap; }
.sheet-legend .lg { display: inline-block; width: 10px; height: 10px; border-radius: 3px; border: 1px solid var(--rule); margin-right: 4px; vertical-align: -1px; }
.sheet-legend .lg.done { background: var(--accent); border-color: var(--accent); }
.sheet-legend .lg.subj { background: var(--accent-2); border-color: var(--accent-2); }
.sheet-submit { width: 100%; }

/* 组卷：主观题开关 */
.subj-toggle {
  display: flex; align-items: flex-start; gap: 10px; cursor: pointer; padding: 12px 14px;
  border-radius: var(--radius-sm); border: 1px solid var(--rule); background: var(--surface);
  transition: all .18s ease;
}
.subj-toggle:hover { border-color: var(--accent-light); }
.subj-toggle.on { border-color: var(--accent); background: var(--accent-soft); }
.subj-toggle.off { opacity: 0.62; cursor: not-allowed; }
.subj-toggle input { margin-top: 3px; accent-color: var(--accent); flex-shrink: 0; width: 16px; height: 16px; }
.st-txt { display: flex; flex-direction: column; gap: 3px; }
.st-txt strong { font-size: 0.88rem; color: var(--ink); }
.st-txt em { font-style: normal; font-size: 0.76rem; color: var(--muted); line-height: 1.5; }

/* 主观题自评 */
.selfgrade-card { padding: 20px 18px; margin-bottom: 14px; border-left: 4px solid var(--amber); }
.sg-head { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.sg-head h3 { font-size: 1rem; color: var(--ink); }
.sg-sub { font-size: 0.78rem; color: var(--muted); }
.sg-note { font-size: 0.82rem; color: var(--ink-soft); background: var(--bg-soft); padding: 10px 12px; border-radius: var(--radius-sm); margin-bottom: 14px; line-height: 1.6; }
.sg-note b { color: var(--accent); }
.sg-list { display: flex; flex-direction: column; gap: 14px; }
.sg-item { padding: 14px; border: 1px solid var(--rule); border-radius: var(--radius-sm); }
.sg-q { margin-bottom: 10px; }
.sg-idx { display: inline-block; font-size: 0.72rem; font-weight: 700; color: var(--accent-2); background: var(--accent2-soft); padding: 2px 8px; border-radius: var(--radius-full); margin-bottom: 6px; }
.sg-stem { font-size: 0.92rem; line-height: 1.65; color: var(--ink); }
.sg-yours { font-size: 0.8rem; color: var(--muted); margin-top: 6px; word-break: break-all; }
.sg-yours.empty { color: var(--muted-2); font-style: italic; }
.sg-opts { display: flex; gap: 8px; flex-wrap: wrap; }
.sg-opt {
  cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: var(--radius-full); border: 1px solid var(--rule);
  background: var(--surface); color: var(--ink-soft); font-size: 0.84rem; font-weight: 500;
  transition: all .15s ease;
}
.sg-opt:hover { border-color: var(--accent-light); }
.sg-opt em { font-style: normal; font-size: 0.72rem; opacity: 0.65; }
.sg-opt.full.on { background: var(--green); border-color: var(--green); color: #fff; }
.sg-opt.half.on { background: var(--amber); border-color: var(--amber); color: #fff; }
.sg-opt.none.on { background: var(--red); border-color: var(--red); color: #fff; }
.sg-submit { width: 100%; margin-top: 16px; padding: 13px; }
.rh-split { color: var(--ink-soft); }
.rv-ans.subj { color: var(--accent-2); }

/* 成绩 */
.result-head { display: flex; align-items: center; gap: 20px; padding: 22px 20px; margin-bottom: 14px; flex-wrap: wrap; }
.rh-score { font-size: 3rem; font-weight: 800; line-height: 1; }
.rh-score em { font-size: 1rem; font-weight: 600; margin-left: 3px; }
.rh-meta { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 180px; }
.rh-meta span { font-size: 0.84rem; color: var(--muted); }
.rh-level { color: var(--accent); font-weight: 600; }
.rh-act { display: flex; gap: 8px; }

.review-list { display: flex; flex-direction: column; gap: 14px; }
.review-item { padding: 14px; border: 1px solid var(--rule); border-radius: var(--radius-sm); }
.rv-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.rv-idx { width: 22px; height: 22px; border-radius: 50%; background: var(--bg-soft); color: var(--muted); font-size: 0.74rem; display: inline-flex; align-items: center; justify-content: center; }
.rv-ans { font-size: 0.8rem; color: var(--green); font-weight: 600; }
.rv-yours { font-size: 0.8rem; color: var(--muted); }
.rv-stem { font-size: 0.92rem; line-height: 1.65; color: var(--ink); margin-bottom: 8px; }
.rv-analysis { font-size: 0.84rem; line-height: 1.7; color: var(--ink-soft); background: var(--bg-soft); padding: 10px 12px; border-radius: var(--radius-sm); }
.tag-red { background: var(--red-soft); color: var(--red); }

@media (max-width: 860px) {
  .exam-body { grid-template-columns: 1fr; }
  .sheet-card { position: static; }
  .sheet-grid { grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); }
}
@media (max-width: 600px) {
  .result-head { gap: 14px; }
  .rh-score { font-size: 2.4rem; }
  .rh-act { width: 100%; }
  .rh-act .btn { flex: 1; }
  .hi-time { display: none; }
}
</style>
