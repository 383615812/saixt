<template>
  <div class="container review-page">
    <div class="page-head">
      <h2>遗忘曲线复习</h2>
      <p>基于艾宾浩斯遗忘曲线，智能安排错题复习时间，对抗遗忘</p>
      <router-link to="/remind" class="btn btn-ghost btn-sm remind-link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>到期提醒设置</router-link>
    </div>

    <!-- 加载骨架屏 -->
    <template v-if="loading">
      <div class="ov-grid">
        <div v-for="i in 4" :key="i" class="card ov-item">
          <div class="skeleton sk-rv-num"></div>
          <div class="skeleton sk-rv-lbl"></div>
        </div>
      </div>
      <div class="card curve-card">
        <div class="curve-head">
          <div class="skeleton sk-rv-title"></div>
          <div class="skeleton sk-rv-sub"></div>
        </div>
        <div class="curve-steps">
          <div v-for="i in 6" :key="i" class="curve-step">
            <div class="skeleton sk-rv-dot"></div>
            <div class="skeleton sk-rv-step-lbl"></div>
            <div class="skeleton sk-rv-step-num"></div>
          </div>
        </div>
      </div>
      <div class="card review-list">
        <div v-for="i in 3" :key="i" class="review-item">
          <div class="skeleton sk-rv-tag"></div>
          <div class="skeleton sk-rv-stem"></div>
          <div class="skeleton sk-rv-stem short"></div>
        </div>
      </div>
    </template>
    <template v-else>
      <!-- 概览统计 -->
      <div class="ov-grid">
        <div class="card ov-item hot">
          <div class="ov-num">{{ data.dueToday }}</div>
          <div class="ov-lbl">今日待复习</div>
        </div>
        <div class="card ov-item">
          <div class="ov-num">{{ data.dueTomorrow }}</div>
          <div class="ov-lbl">明日待复习</div>
        </div>
        <div class="card ov-item">
          <div class="ov-num">{{ data.dueWeek }}</div>
          <div class="ov-lbl">本周待复习</div>
        </div>
        <div class="card ov-item">
          <div class="ov-num green">{{ data.masteredCount }}</div>
          <div class="ov-lbl">已掌握</div>
        </div>
      </div>

      <!-- 遗忘曲线阶段 -->
      <div class="card curve-card">
        <div class="curve-head">
          <h3>遗忘曲线复习节奏</h3>
          <span class="curve-sub">答错的题按 一 → 二 → 四 → 七 → 十五 → 三十 天间隔自动安排，连续答对 6 次即视为掌握</span>
        </div>
        <div class="curve-steps">
          <div v-for="(s, i) in intervalLabels" :key="i" class="curve-step" :class="{ done: stageCount(i) > 0 }">
            <div class="cs-dot">{{ i + 1 }}</div>
            <div class="cs-lbl">{{ numToCn(s) }} 天</div>
            <div class="cs-num" :class="{ zero: stageCount(i) === 0 }">{{ stageCount(i) }}</div>
          </div>
          <div class="curve-step master" :class="{ done: data.masteredCount > 0 }">
            <div class="cs-dot">✓</div>
            <div class="cs-lbl">已掌握</div>
            <div class="cs-num" :class="{ zero: data.masteredCount === 0 }">{{ data.masteredCount }}</div>
          </div>
        </div>
      </div>

      <!-- 复习日历 -->
      <div class="card cal-card">
        <h3>复习日历</h3>
        <p class="cal-sub">未来七天为复习高峰期，建议每天抽出时间完成当日复习</p>
        <div class="cal-scroll">
          <div v-for="d in data.calendar" :key="d.date" class="cal-day" :class="{ today: d.isToday, has: d.count > 0 }">
            <div class="cal-week">{{ weekLabel(d.date) }}</div>
            <div class="cal-date">{{ d.date.slice(8) }}日</div>
            <div class="cal-count" :class="{ zero: d.count === 0 }">{{ d.count }}</div>
          </div>
        </div>
      </div>

      <!-- 待复习列表 -->
      <div class="card due-card">
        <div class="due-head">
          <div>
            <h3>待复习题目</h3>
            <span class="due-sub">共 {{ data.due.length }} 题 · 按到期时间排序</span>
          </div>
          <button v-if="data.due.length && !reviewing" class="btn btn-primary" @click="startReview">开始复习</button>
        </div>
        <div v-if="!data.due.length" class="empty due-empty">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m9 14.5 2 2 4-4"/></svg></div>
          <p>当前没有待复习的题目，太棒了！</p>
          <span class="empty-sub">答错的题会自动进入遗忘曲线复习计划，去刷题积累待复习内容吧</span>
          <div class="empty-actions">
            <router-link to="/practice" class="btn btn-primary empty-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>去刷题</router-link>
            <router-link to="/wrong-book" class="btn btn-ghost empty-btn">查看错题本</router-link>
          </div>
        </div>
        <div v-else class="due-list">
          <div v-for="q in data.due" :key="q.id" class="due-item">
            <div class="due-meta">
              <span class="tag tag-blue">{{ q.subject }}</span>
              <span class="tag tag-purple">{{ q.chapter }}</span>
              <span class="due-stage" :class="'s' + q.stage">第 {{ numToCn(q.stage + 1) }} 轮</span>
              <span class="due-date">到期 {{ q.next_due }}</span>
            </div>
            <p class="due-stem">{{ q.stem }}</p>
            <div v-if="q.images && q.images.length" class="q-image">
              <img v-for="(img, idx) in q.images" :key="idx" :src="'/' + img" alt="题目配图" loading="lazy" @error="onImgError">
            </div>
            <div class="due-actions">
              <button class="btn btn-ghost btn-sm" @click="startAt(q)">复习此题</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 复习答题 -->
      <div v-if="reviewing" class="card question-card">
        <div class="q-top">
          <div class="q-top-left">
            <span class="tag tag-blue">{{ currentQuestion.subject }}</span>
            <span class="tag tag-purple">{{ currentQuestion.chapter }}</span>
            <span class="q-round">第 {{ numToCn(currentQuestion.stage + 1) }} 轮复习</span>
          </div>
          <span class="q-count">{{ reviewIndex + 1 }} / {{ reviewList.length }}</span>
        </div>
        <h3 class="q-stem">{{ currentQuestion.stem }}</h3>

        <div v-if="currentQuestion.images && currentQuestion.images.length" class="q-image">
          <img v-for="(img, idx) in currentQuestion.images" :key="idx" :src="'/' + img" alt="题目配图" loading="lazy" @error="onImgError">
        </div>

        <div v-if="qtype === 'subjective'" class="subjective-box">
          <div class="detail-ans"><span class="tag tag-green">参考答案：{{ currentQuestion.answer }}</span></div>
          <div class="analysis"><strong>解析：</strong>{{ currentQuestion.analysis }}</div>
          <template v-if="!answered">
            <div class="subjective-choice">
              <strong>对照参考答案后自评：</strong>
              <div class="sc-buttons">
                <button class="btn btn-primary" @click="submitSubjective(true)">我答对了，掌握</button>
                <button class="btn btn-ghost" @click="submitSubjective(false)">仍答错，重新复习</button>
              </div>
            </div>
          </template>
        </div>
        <template v-else>
          <div class="options">
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
              <span v-if="answered && qtype === 'multiple' && isCorrectOpt(opt[0]) && !isSelected(opt[0])" class="opt-miss">漏选</span>
            </button>
          </div>
          <p v-if="qtype === 'multiple'" class="multi-hint">多选题 · 可多选，需全部选对才算对</p>
        </template>

        <div v-if="answered" class="result" :class="lastResult.correct ? 'ok' : 'no'">
          <div class="result-head">
            <span class="result-icon">{{ lastResult.correct ? '✓' : '✗' }}</span>
            <strong>{{ qtype === 'subjective' ? '参考答案' : (lastResult.correct ? '回答正确' : '回答错误') }}</strong>
            <span class="right-ans">正确答案：{{ currentQuestion.answer }}</span>
          </div>
          <div class="stage-line">
            <template v-if="lastResult.mastered">
              <span class="mastered-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>已掌握此题，从复习计划移除</span>
            </template>
            <template v-else-if="lastResult.correct">
              <span class="stage-progress">复习进度：第 {{ numToCn(lastResult.stage + 1) }} 轮（下一轮 {{ lastResult.next_due }}）</span>
            </template>
            <template v-else>
              <span class="stage-reset">答错啦，重新从第一轮开始，明天再复习</span>
            </template>
          </div>
          <div class="analysis">
            <strong>解题讲解：</strong>{{ currentQuestion.analysis }}
          </div>
          <div class="ai-explain">
            <button
              v-if="!explaining && !explainText"
              class="btn btn-ghost btn-sm"
              :disabled="explaining"
              @click="explainThis"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              {{ explaining ? 'AI 讲解中…' : 'AI 讲解此题' }}
            </button>
            <div v-if="explainText" class="explain-card">
              <div class="explain-head">
                <span class="explain-title">AI 错题讲解</span>
                <button class="explain-x" @click="explainText = ''">✕</button>
              </div>
              <div class="explain-body">{{ explainText }}</div>
            </div>
          </div>
        </div>

        <div class="q-actions">
          <button v-if="!answered && qtype !== 'subjective'" class="btn btn-primary" :disabled="!canSubmit" @click="submitAnswer">提交答案</button>
          <button v-else-if="reviewIndex < reviewList.length - 1" class="btn btn-primary" @click="nextQuestion">下一题 →</button>
          <button v-else class="btn btn-primary" @click="finishReview">完成复习</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>

import { toast } from '../toast'
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { useImgError } from '../useImgError'
import { numToCn } from '../utils/num'

const intervalLabels = [1, 2, 4, 7, 15, 30]
const loading = ref(true)
const data = ref({ due: [], dueToday: 0, dueTomorrow: 0, dueWeek: 0, total: 0, calendar: [], stages: [], masteredCount: 0 })

const reviewing = ref(false)
const reviewList = ref([])
const reviewIndex = ref(0)
const selected = ref('')
const answered = ref(false)
const lastResult = ref({})
const explaining = ref(false)
const explainText = ref('')

const currentQuestion = computed(() => reviewList.value[reviewIndex.value] || {})
const qtype = computed(() => currentQuestion.value.type || 'single')
const canSubmit = computed(() => {
  if (qtype.value === 'multiple') return Array.isArray(selected.value) && selected.value.length > 0
  return !!selected.value
})

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

function stageCount(i) {
  const s = (data.value.stages || []).find(x => x.stage === i)
  return s ? s.c : 0
}

function weekLabel(d) {
  const date = new Date(d + 'T00:00:00')
  const week = ['日', '一', '二', '三', '四', '五', '六']
  return '周' + week[date.getDay()]
}

async function load() {
  loading.value = true
  try {
    data.value = await api.get('/practice/review')
  } catch (e) {
    toast(e.message || '加载失败，请稍后重试', 'error')
  } finally {
    loading.value = false
  }
}

function startReview() {
  reviewList.value = [...data.value.due]
  reviewIndex.value = 0
  resetQuestion()
  reviewing.value = true
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function startAt(q) {
  const idx = data.value.due.findIndex(x => x.id === q.id)
  reviewList.value = [...data.value.due]
  reviewIndex.value = idx >= 0 ? idx : 0
  resetQuestion()
  reviewing.value = true
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function resetQuestion() {
  selected.value = ''
  answered.value = false
  lastResult.value = {}
  explainText.value = ''
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

async function submitAnswer() {
  try {
    const r = await api.post('/practice/review/submit', {
      question_id: currentQuestion.value.id,
      answer: userAnswer()
    })
    lastResult.value = r
    answered.value = true
  } catch (e) {
    toast(e.message || '提交失败，请稍后重试', 'error')
  }
}

async function submitSubjective(correct) {
  try {
    // 主观题无标准自动判分，由用户对照参考答案自评：答对推进遗忘阶段，答错重置重学
    const r = await api.post('/practice/review/submit', {
      question_id: currentQuestion.value.id,
      answer: correct ? '主观题自评：掌握' : '主观题自评：未掌握',
      correct
    })
    lastResult.value = r
    answered.value = true
  } catch (e) {
    toast(e.message || '提交失败，请稍后重试', 'error')
  }
}

async function explainThis() {
  try {
    explaining.value = true
    explainText.value = ''
    const r = await api.post('/ai/explain', { question_id: currentQuestion.value.id })
    explainText.value = r.reply || '暂无 AI 讲解，请参考上方解析'
    window.dispatchEvent(new Event('ai-quota-refresh'))
  } catch (e) {
    toast(e.message || 'AI 讲解失败，请稍后重试', 'error')
  } finally {
    explaining.value = false
  }
}

async function nextQuestion() {
  reviewIndex.value++
  resetQuestion()
}

async function finishReview() {
  reviewing.value = false
  await load()
  toast('本轮复习完成，继续保持！', 'success')
}

onMounted(load)
</script>

<style scoped>
.review-page { max-width: 860px; }
.page-head { text-align: center; margin-bottom: 26px; }
.page-head h2 { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.01em; }
.page-head p { color: var(--muted); margin-top: 4px; font-size: 0.92rem; }
.remind-link { margin-top: 12px; display: inline-flex; align-items: center; gap: 7px; }
.remind-link svg { width: 15px; height: 15px; }

.ov-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
.ov-item { text-align: center; padding: 18px 8px; transition: background-color 0.25s var(--ease); }

.review-list { display: flex; flex-direction: column; gap: 12px; }
.review-item { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--rule); border-radius: 12px; }
.ov-num { font-size: 1.8rem; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; transition: transform 0.25s var(--ease); }
.ov-item:hover .ov-num { transform: translateY(-1px); }
.ov-item.hot .ov-num { color: var(--amber); }
.ov-num.green { color: var(--green); }
.ov-lbl { color: var(--muted); font-size: 0.82rem; margin-top: 4px; }

/* 骨架屏 */
.sk-rv-num { width: 56px; height: 26px; margin: 0 auto; }
.sk-rv-lbl { width: 72px; height: 12px; margin: 8px auto 0; }
.sk-rv-title { width: 160px; height: 18px; }
.sk-rv-sub { width: 320px; height: 12px; margin-top: 8px; }
.sk-rv-dot { width: 30px; height: 30px; border-radius: 50%; margin: 0 auto; }
.sk-rv-step-lbl { width: 44px; height: 12px; margin: 10px auto 0; }
.sk-rv-step-num { width: 28px; height: 12px; margin: 6px auto 0; }
.sk-rv-tag { width: 64px; height: 22px; border-radius: var(--radius-sm); }
.sk-rv-stem { width: 82%; height: 16px; margin-top: 12px; }
.sk-rv-stem.short { width: 55%; }

.curve-card, .cal-card, .due-card { padding: 22px 26px; margin-bottom: 18px; }
.curve-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
.curve-head h3 { font-size: 1.12rem; }
.curve-sub { font-size: 0.82rem; color: var(--muted); }

.curve-steps { display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; }
.curve-step { flex: 1; min-width: 72px; text-align: center; position: relative; padding-top: 8px; }
.curve-step::before {
  content: ''; position: absolute; top: 22px; left: -50%; right: 50%;
  height: 3px; background: var(--rule); z-index: 0;
}
.curve-step:first-child::before { display: none; }
.curve-step.done::before { background: var(--accent); }
.cs-dot {
  width: 34px; height: 34px; border-radius: 50%; margin: 0 auto 6px;
  background: var(--rule); color: var(--muted); font-weight: 700; font-size: 0.9rem;
  display: flex; align-items: center; justify-content: center; position: relative; z-index: 1;
}
.curve-step.done .cs-dot { background: var(--accent); color: #fff; }
.curve-step.master .cs-dot { background: var(--green); }
.cs-lbl { font-size: 0.78rem; color: var(--muted); }
.cs-num { font-size: 0.78rem; font-weight: 700; color: var(--accent); margin-top: 2px; font-variant-numeric: tabular-nums; }
.cs-num.zero { color: var(--muted); font-weight: 400; }

.cal-card h3 { font-size: 1.12rem; margin-bottom: 4px; }
.cal-sub { color: var(--muted); font-size: 0.82rem; margin-bottom: 16px; }
.cal-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; }
.cal-day {
  flex: 0 0 62px; text-align: center; padding: 10px 4px;
  border: 1px solid var(--rule); border-radius: 12px; background: var(--surface);
  transition: transform 0.2s var(--ease), border-color 0.2s var(--ease), box-shadow 0.2s var(--ease);
}
.cal-day:hover { transform: translateY(-2px); border-color: var(--accent-2); box-shadow: var(--shadow-xs); }
.cal-day.today { border-color: var(--accent); background: var(--accent-soft); }
.cal-day.today:hover { box-shadow: 0 4px 12px rgba(79, 95, 240, 0.25); }
.cal-day.has { border-color: var(--accent-2); }
.cal-week { font-size: 0.75rem; color: var(--muted); }
.cal-date { font-size: 0.82rem; font-weight: 600; margin: 4px 0; }
.cal-day.today .cal-date { color: var(--accent); font-weight: 800; }
.cal-count {
  width: 22px; height: 22px; border-radius: 50%; margin: 0 auto;
  background: var(--accent);
  color: #fff; font-size: 0.75rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  font-variant-numeric: tabular-nums;
}
.cal-count.zero { background: var(--rule); color: var(--muted); }

.due-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.due-head h3 { font-size: 1.12rem; }
.due-sub { font-size: 0.82rem; color: var(--muted); }
.due-list { display: flex; flex-direction: column; gap: 12px; }
.due-item { padding: 14px 16px; border: 1px solid var(--rule); border-radius: 12px; }
.due-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.due-stage { font-size: 0.75rem; font-weight: 700; padding: 2px 10px; border-radius: 999px; }
.due-stage.s0 { background: var(--red-soft); color: #be123c; }
.due-stage.s1 { background: var(--amber-soft); color: #b45309; }
.due-stage.s2, .due-stage.s3, .due-stage.s4, .due-stage.s5 { background: var(--accent-soft); color: var(--accent); }
.due-date { margin-left: auto; font-size: 0.78rem; color: var(--muted); }
.due-stem { font-weight: 600; margin: 10px 0 12px; line-height: 1.7; overflow-wrap: break-word; word-break: break-word; }

.q-image {
  margin: 0 0 12px; padding: 12px; border-radius: 10px;
  background: var(--surface-2, #f8fafc); border: 1px dashed var(--rule);
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; align-items: center;
}
.q-image img { max-width: 100%; max-height: 260px; object-fit: contain; border-radius: 6px; }

.due-actions { display: flex; justify-content: flex-end; }

.due-empty { padding: 36px 20px; }
.due-empty .empty-btn svg { width: 15px; height: 15px; }
.empty-actions { display: flex; gap: 12px; margin-top: 6px; flex-wrap: wrap; justify-content: center; }

.question-card { padding: 26px; margin-bottom: 18px; border: 1px solid var(--accent); }
.q-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.q-top-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.q-round { font-size: 0.82rem; font-weight: 700; color: var(--accent); }
.q-count { font-size: 0.85rem; color: var(--muted); }
.q-stem { font-size: 1.08rem; line-height: 1.8; margin-bottom: 20px; overflow-wrap: break-word; word-break: break-word; }

.options { display: flex; flex-direction: column; gap: 10px; }
.option {
  display: flex; align-items: flex-start; gap: 12px; text-align: left;
  border: 1px solid var(--rule); background: var(--surface); border-radius: var(--radius-sm);
  padding: 13px 16px; font-size: 0.95rem; transition: border-color 0.25s var(--ease), background-color 0.25s var(--ease), box-shadow 0.25s var(--ease);
}
.option:hover:not(.disabled) { border-color: var(--accent); background: var(--accent-soft); box-shadow: var(--shadow-xs); }
.option.selected { border-color: var(--accent); background: var(--accent-soft); }
.option.correct { border-color: var(--green); background: var(--green-soft); }
.option.wrong { border-color: var(--red); background: var(--red-soft); }
.option.disabled { cursor: default; }
.opt-letter { font-weight: 700; color: var(--accent); flex: 0 0 auto; }
.opt-text { flex: 1; overflow-wrap: break-word; word-break: break-word; }
.opt-miss { margin-left: auto; font-size: 0.75rem; font-weight: 700; color: var(--amber); background: var(--amber-soft); padding: 2px 8px; border-radius: 999px; flex: 0 0 auto; }
.multi-hint { font-size: 0.82rem; color: var(--amber); font-weight: 600; margin-top: 8px; }
.subjective-box { display: flex; flex-direction: column; gap: 10px; }
.subjective-box .detail-ans { margin-bottom: 0; }
.subjective-choice { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
.subjective-choice > strong { font-size: 0.9rem; font-weight: 700; color: var(--ink); }
.subjective-choice .sc-buttons { display: flex; gap: 8px; flex-wrap: wrap; }

.result { border-radius: 12px; padding: 16px 18px; margin-top: 20px; }
.result.ok { background: var(--green-soft); border: 1px solid rgba(13,166,120,0.3); }
.result.no { background: var(--red-soft); border: 1px solid rgba(225,29,72,0.3); }
.result-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.result-icon {
  width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; font-size: 0.9rem;
}
.result.ok .result-icon { background: var(--green); }
.result.no .result-icon { background: var(--red); }
.right-ans { margin-left: auto; color: var(--ink); font-size: 0.88rem; font-weight: 600; }
.stage-line { margin: 8px 0; font-size: 0.88rem; font-weight: 600; }
.mastered-badge { color: var(--green); display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.mastered-badge svg { width: 15px; height: 15px; }
.stage-progress { color: var(--accent); }
.stage-reset { color: var(--red); }
.analysis { font-size: 0.93rem; line-height: 1.8; overflow-wrap: break-word; word-break: break-word; }
.ai-explain { margin-top: 14px; border-top: 1px dashed var(--rule); padding-top: 12px; }
.ai-explain .btn { display: inline-flex; align-items: center; gap: 6px; }
.ai-explain .btn svg { color: var(--accent); }
.explain-card {
  margin-top: 10px; padding: 14px 16px; border-radius: 12px;
  background: var(--surface-2); border: 1px solid var(--rule);
  border-left: 3px solid var(--accent);
}
.explain-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.explain-title { font-size: 0.82rem; font-weight: 700; color: var(--accent); }
.explain-x { border: none; background: none; cursor: pointer; color: var(--muted); font-size: 0.9rem; line-height: 1; padding: 2px; }
.explain-x:hover { color: var(--ink); }
.explain-body { font-size: 0.91rem; line-height: 1.85; white-space: pre-wrap; overflow-wrap: break-word; word-break: break-word; }

.q-actions { margin-top: 22px; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }

@media (max-width: 768px) {
  .ov-grid { grid-template-columns: repeat(2, 1fr); }
  .curve-step { min-width: 62px; }
}
@media (max-width: 600px) {
  .page-head h2 { font-size: 1.3rem; }
  .page-head p { font-size: 0.82rem; }
  .ov-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .ov-item { padding: 14px 6px; }
  .ov-num { font-size: 1.45rem; }
  .ov-lbl { font-size: 0.76rem; }
  .curve-card, .cal-card, .due-card { padding: 16px 14px; }
  .curve-step { min-width: 52px; padding-top: 6px; }
  .cs-dot { width: 30px; height: 30px; font-size: 0.82rem; }
  .cs-lbl { font-size: 0.75rem; }
  .cs-num { font-size: 0.75rem; }
  .cal-day { flex: 0 0 52px; padding: 8px 4px; }
  .cal-week { font-size: 0.72rem; }
  .cal-date { font-size: 0.78rem; }
  .cal-count { width: 24px; height: 24px; font-size: 0.72rem; }
  .due-item { padding: 12px 14px; }
  .due-stage { font-size: 0.72rem; padding: 2px 8px; }
  .due-date { margin-left: 0; width: 100%; font-size: 0.74rem; }
  .due-stem { font-size: 0.92rem; }
  .question-card { padding: 18px 14px; }
  .q-stem { font-size: 0.98rem; line-height: 1.7; }
  .option { padding: 11px 12px; font-size: 0.9rem; }
  .opt-miss { font-size: 0.72rem; padding: 2px 6px; }
  .result { padding: 14px 14px; }
  .analysis { font-size: 0.86rem; }
  .q-actions .btn { flex: 1; min-height: 40px; }
  .q-image img { max-height: 200px; }
}
@media (max-width: 400px) {
  .ov-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
  .ov-num { font-size: 1.2rem; }
  .cal-day { flex: 0 0 46px; }
  .curve-step { min-width: 44px; }
}
</style>
