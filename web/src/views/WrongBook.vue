<template>
  <div class="container wrong-page">
    <div class="page-head">
      <h2>错题本</h2>
      <p>集中复习做错的题目，重练答对后自动移出，直到真正掌握</p>
    </div>

    <!-- 筛选区 -->
    <div class="card filter-bar">
      <div class="filter-row">
        <div class="chips">
          <button class="chip" :class="{ on: subject === '' }" @click="selectSubject('')">全部<span class="chip-count">{{ allCount }}</span></button>
          <template v-if="loading">
            <span v-for="i in 4" :key="i" class="skeleton sk-chip"></span>
          </template>
          <template v-else>
            <button
              v-for="s in subjects"
              :key="s.subject"
              class="chip"
              :class="{ on: subject === s.subject }"
              @click="selectSubject(s.subject)"
            >{{ s.subject }}<span class="chip-count">{{ s.count }}</span></button>
          </template>
        </div>
        <button class="btn btn-ghost export-btn" :disabled="!list.length || exporting" @click="exportPDF">
          <span v-if="exporting">导出中...</span>
          <template v-else><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>导出 PDF</template>
        </button>
      </div>
      <div v-if="chapters.length" class="filter-row chapters">
        <button
          v-for="c in chapters"
          :key="c"
          class="chip chip-sm"
          :class="{ on: chapter === c }"
          @click="selectChapter(c)"
        >{{ c }}</button>
      </div>
    </div>

    <!-- 列表 -->
    <div v-if="loading" class="q-list">
      <div v-for="i in 4" :key="i" class="card q-item">
        <div class="q-top">
          <div class="skeleton sk-w-tag"></div>
          <div class="skeleton sk-w-tag"></div>
          <div class="skeleton sk-w-tag"></div>
        </div>
        <div class="skeleton sk-w-stem"></div>
        <div class="skeleton sk-w-stem short"></div>
        <div class="skeleton sk-w-opt"></div>
      </div>
    </div>
    <div v-else-if="!list.length" class="card empty">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg></div>
      <p>太棒了，当前筛选条件下没有错题</p>
      <p class="empty-sub">继续保持，把每道题都真正掌握</p>
    </div>
    <div v-else class="q-list">
      <div v-for="q in list" :key="q.id" class="card q-item">
        <div class="q-top">
          <span class="tag tag-blue">{{ q.subject }}</span>
          <span class="tag tag-purple">{{ q.chapter }}</span>
          <span class="q-wrong-tag">答错</span>
        </div>
        <p class="q-stem">{{ q.stem }}</p>
        <div v-if="q.images && q.images.length" class="q-image">
          <img v-for="(img, idx) in q.images" :key="idx" :src="'/' + img" alt="题目配图" loading="lazy" @error="onImgError">
        </div>

        <!-- 重练模式 -->
        <div v-if="practiceId === q.id" class="re-practice">
          <div v-if="qtypeOf(q) === 'subjective'" class="subjective-box">
            <div class="detail-ans"><span class="tag tag-green">参考答案：{{ q.answer }}</span></div>
            <div class="analysis"><strong>解析：</strong>{{ q.analysis }}</div>
            <button class="btn btn-ghost" @click="cancelPractice">收起</button>
          </div>
          <template v-else>
            <div class="options">
              <button
                v-for="opt in q.options"
                :key="opt[0]"
                class="option"
                :class="{
                  selected: isSelected(opt[0]),
                  correct: practiceAnswered && isCorrectOpt(opt[0]),
                  wrong: practiceAnswered && isWrongOpt(opt[0]),
                  disabled: practiceAnswered
                }"
                @click="practiceChoose(opt[0])"
              >
                <span class="opt-letter">{{ opt[0] }}</span>
                <span class="opt-text">{{ opt.slice(2) }}</span>
                <span v-if="practiceAnswered && qtypeOf(q) === 'multiple' && isCorrectOpt(opt[0]) && !isSelected(opt[0])" class="opt-miss">漏选</span>
              </button>
            </div>
            <p v-if="qtypeOf(q) === 'multiple'" class="multi-hint">多选题 · 可多选，需全部选对才算对</p>
            <div v-if="practiceAnswered" class="result" :class="practiceCorrect ? 'ok' : 'no'">
              <div class="result-head">
                <span class="result-icon">{{ practiceCorrect ? '✓' : '✗' }}</span>
                <strong>{{ practiceCorrect ? '重练答对，已掌握！' : '仍未答对，再看看解析' }}</strong>
              </div>
              <div class="detail-ans"><span class="tag tag-green">正确答案：{{ q.answer }}</span></div>
              <div class="analysis"><strong>解析：</strong>{{ q.analysis }}</div>
            </div>
            <div class="re-actions">
              <button v-if="!practiceAnswered" class="btn btn-primary" :disabled="!practiceSel.length || practiceSubmitting" @click="practiceSubmit(q)">{{ practiceSubmitting ? '提交中…' : '提交答案' }}</button>
              <button v-else-if="practiceCorrect" class="btn btn-primary" @click="mastered(q)">标记已掌握</button>
              <button v-else class="btn btn-ghost" @click="showAnalysis(q)">查看解析</button>
              <button class="btn btn-ghost" @click="cancelPractice">收起</button>
            </div>
          </template>
        </div>

        <!-- 默认展示 -->
        <template v-else>
          <div class="q-opts">
            <p v-for="opt in q.options" :key="opt[0]" class="q-opt">
              <span class="opt-letter">{{ opt[0] }}</span>{{ opt.slice(2) }}
            </p>
          </div>
          <div class="q-foot">
            <button class="btn btn-primary btn-sm" @click="startPractice(q)">重练</button>
            <button class="btn btn-ghost btn-sm" @click="showAnalysis(q)">
              {{ analysisId === q.id ? '收起解析' : '查看解析' }}
            </button>
            <button class="btn btn-sm ai-btn" :disabled="aiLoading" @click="aiExplain(q)">
              <svg class="ai-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a5 5 0 0 1 4.24 7.5A5 5 0 0 1 17 19h-2A7 7 0 0 0 12 6"/><path d="M12 2v4"/><path d="M12 6a7 7 0 0 0-3 13.5A5 5 0 0 1 7 19h2"/></svg>
              {{ aiExplainId === q.id && aiLoading ? '讲解中…' : 'AI 讲解' }}
            </button>
            <button class="btn btn-sm master-btn" @click="mastered(q)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M20 6 9 17l-5-5"/></svg>
              已掌握
            </button>
          </div>
          <div v-if="analysisId === q.id" class="q-detail">
            <div class="detail-ans"><span class="tag tag-green">正确答案：{{ q.answer }}</span></div>
            <div class="detail-analysis"><strong>解析：</strong>{{ q.analysis }}</div>
          </div>
          <div v-if="aiExplainId === q.id" class="ai-panel">
            <div class="ai-panel-head">
              <span class="ai-badge">AI 讲解</span>
              <span class="detail-ans" style="margin:0"><span class="tag tag-green">正确答案：{{ q.answer }}</span></span>
            </div>
            <p v-if="aiLoading" class="ai-loading"><span class="r"></span><span class="r"></span><span class="r"></span> AI 正在讲解，请稍候…</p>
            <p v-else-if="aiText" class="ai-text">{{ aiText }}<span v-if="aiTyping" class="tw-caret"></span></p>
            <p v-else class="ai-err">AI 讲解暂不可用，请稍后再试</p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>

import { toast } from '../toast'
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { useImgError } from '../useImgError'
import { useTypewriter } from '../useTypewriter'

const { text: aiText, typing: aiTyping, type: typeAiText } = useTypewriter()

const subject = ref('')
const chapter = ref('')
const chapters = ref([])
const all = ref([])
const list = ref([])
const loading = ref(false)

const practiceId = ref(0)
const practiceSel = ref('')
const practiceAnswered = ref(false)
const practiceCorrect = ref(false)
const practiceSubmitting = ref(false)
const analysisId = ref(0)
const exporting = ref(false)
const aiExplainId = ref(0)
const aiLoading = ref(false)

// AI 错题讲解：逐题调用后端 /ai/explain，讲解内容以打字机呈现
async function aiExplain(q) {
  if (aiLoading.value) return
  aiExplainId.value = q.id
  analysisId.value = 0
  // 若当前题目已缓存讲解且不在加载，则收起
  if (!q._aiLoaded && !aiLoading.value) { /* 首次展开 */ }
  if (q._aiLoaded) {
    q._aiLoaded = false
    aiExplainId.value = 0
    return
  }
  aiLoading.value = true
  aiText.value = ''
  try {
    const data = await api.post('/ai/explain', { question_id: q.id })
    q._aiLoaded = true
    typeAiText(data.reply)
    window.dispatchEvent(new Event('ai-quota-refresh'))
  } catch (e) {
    toast(e.message || 'AI 讲解失败，请稍后再试', 'error')
    aiExplainId.value = 0
  } finally {
    aiLoading.value = false
  }
}

// 导出 PDF
function exportPDF() {
  if (exporting.value) return
  exporting.value = true
  const token = localStorage.getItem('saixt_token')
  const params = new URLSearchParams()
  if (subject.value) params.set('subject', subject.value)
  const url = `/api/practice/wrong/export${params.toString() ? '?' + params.toString() : ''}`
  
  fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
    .then(res => {
      if (!res.ok) throw new Error('导出失败')
      return res.blob()
    })
    .then(blob => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      // 从响应头提取文件名
      a.download = `错题本_${new Date().toISOString().slice(0,10)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
    })
    .catch(e => {
      toast('导出失败：' + e.message, 'error')
    })
    .finally(() => {
      exporting.value = false
    })
}

const subjects = computed(() => {
  const map = new Map()
  for (const q of all.value) {
    if (!map.has(q.subject)) map.set(q.subject, 0)
    map.set(q.subject, map.get(q.subject) + 1)
  }
  return [...map.entries()].map(([subject, count]) => ({ subject, count })).sort((a, b) => b.count - a.count)
})

const allCount = computed(() => all.value.length)
function subjectCount(s) { return all.value.filter(q => q.subject === s).length }

function selectSubject(s) {
  subject.value = s
  chapter.value = ''
  chapters.value = s ? [...new Set(all.value.filter(q => q.subject === s).map(q => q.chapter))] : []
  applyFilter()
}
function selectChapter(c) {
  chapter.value = chapter.value === c ? '' : c
  applyFilter()
}
function applyFilter() {
  list.value = all.value.filter(q =>
    (!subject.value || q.subject === subject.value) &&
    (!chapter.value || q.chapter === chapter.value)
  )
}

function qtypeOf(q) { return q.type || 'single' }

function isSelected(letter) {
  if (qtypeOf(currentPractice) === 'multiple') return Array.isArray(practiceSel.value) && practiceSel.value.includes(letter)
  return practiceSel.value === letter
}

function isCorrectOpt(letter) {
  return String(currentPractice.value.answer || '').includes(letter)
}

function isWrongOpt(letter) {
  return isSelected(letter) && !isCorrectOpt(letter)
}

const currentPractice = ref({})
function startPractice(q) {
  practiceId.value = q.id
  currentPractice.value = q
  practiceSel.value = qtypeOf(q) === 'multiple' ? [] : ''
  practiceAnswered.value = false
  practiceCorrect.value = false
  analysisId.value = 0
}
const { onImgError } = useImgError()
function practiceChoose(letter) {
  if (practiceAnswered.value) return
  if (qtypeOf(currentPractice.value) === 'multiple') {
    const arr = Array.isArray(practiceSel.value) ? [...practiceSel.value] : []
    const i = arr.indexOf(letter)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(letter)
    practiceSel.value = arr.sort()
  } else {
    practiceSel.value = letter
  }
}
function practiceUserAnswer() {
  if (qtypeOf(currentPractice.value) === 'multiple') return (Array.isArray(practiceSel.value) ? practiceSel.value.join('') : '')
  return practiceSel.value || ''
}
async function practiceSubmit(q) {
  if (practiceSubmitting.value) return
  practiceSubmitting.value = true
  practiceAnswered.value = true
  try {
    // 复用后端判分：正确则沉淀练习记录，答错则自动进入遗忘曲线复习队列
    const res = await api.post('/practice/submit', {
      question_id: q.id,
      answer: practiceUserAnswer()
    })
    practiceCorrect.value = !!res.correct
    // 用后端权威结果回写答案/解析，确保重练后展示与题库一致
    if (res.answer) q.answer = res.answer
    if (res.analysis) q.analysis = res.analysis
  } catch (e) {
    practiceAnswered.value = false
    toast(e.message || '提交失败，请稍后重试', 'error')
  } finally {
    practiceSubmitting.value = false
  }
}
function cancelPractice() {
  practiceId.value = 0
  practiceSel.value = ''
  practiceAnswered.value = false
}
function showAnalysis(q) {
  analysisId.value = analysisId.value === q.id ? 0 : q.id
  practiceId.value = 0
}
async function mastered(q) {
  try {
    await api.post('/practice/mastered', { question_id: q.id })
  } catch (e) { /* 忽略 */ }
  all.value = all.value.filter(x => x.id !== q.id)
  applyFilter()
  if (practiceId.value === q.id) cancelPractice()
}

async function load() {
  loading.value = true
  try {
    all.value = await api.get('/practice/wrong')
    chapters.value = subject.value ? [...new Set(all.value.filter(q => q.subject === subject.value).map(q => q.chapter))] : []
    applyFilter()
  } catch (e) {
    toast(e.message || '加载失败，请稍后重试', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.page-head { margin-bottom: 22px; }
.page-head h2 { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.01em; }
.page-head p { color: var(--muted); margin-top: 4px; font-size: 0.92rem; }

.filter-bar { margin-bottom: 16px; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; }
.filter-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.export-btn { flex-shrink: 0; white-space: nowrap; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip {
  padding: 7px 14px; border-radius: var(--radius-full); border: 1px solid var(--rule);
  background: var(--surface); color: var(--muted); font-size: 0.88rem; font-weight: 500;
  transition: border-color 0.25s var(--ease), color 0.25s var(--ease), background-color 0.25s var(--ease), box-shadow 0.25s var(--ease), transform 0.25s var(--ease);
}
.chip:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }
.chip.on { background: var(--accent); color: #fff; border-color: transparent; box-shadow: 0 4px 14px rgba(79, 95, 240, 0.25); }
.chip-sm { padding: 5px 12px; font-size: 0.82rem; }
.chip-count { font-size: 0.75rem; opacity: 0.7; margin-left: 4px; }

.q-list { display: flex; flex-direction: column; gap: 14px; }
.q-item {
  position: relative; overflow: hidden;
  padding: 18px 20px; transition: box-shadow 0.3s var(--ease), transform 0.3s var(--ease), border-color 0.3s var(--ease);
}
.q-item::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: var(--grad-accent); transform: scaleX(0); transform-origin: left;
  transition: transform 0.4s var(--ease);
}
.q-item:hover { box-shadow: var(--shadow-lg); transform: translateY(-1px); border-color: rgba(79, 95, 240, 0.2); }
.q-item:hover::before { transform: scaleX(1); }
.q-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.q-wrong-tag { font-size: 0.78rem; font-weight: 700; color: var(--red); background: var(--red-soft); padding: 3px 10px; border-radius: var(--radius-full); }
.q-stem {
  font-size: 1rem; font-weight: 600; line-height: 1.7; margin-bottom: 12px; overflow-wrap: break-word; word-break: break-word;
  padding-left: 12px; border-left: 3px solid var(--accent-soft);
}

.q-image {
  margin: 0 0 12px; padding: 12px; border-radius: var(--radius-sm);
  background: var(--surface-2); border: 1px dashed var(--rule);
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; align-items: center;
}
.q-image img { max-width: 100%; max-height: 260px; object-fit: contain; border-radius: 6px; }

.q-opts { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.q-opt { display: flex; align-items: flex-start; gap: 8px; font-size: 0.93rem; color: var(--ink); line-height: 1.6; }
.opt-letter {
  width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 0.78rem;
}
.q-foot { display: flex; gap: 8px; flex-wrap: wrap; }
.master-btn {
  color: var(--amber); background: var(--surface);
  border: 1px dashed rgba(217, 119, 6, 0.55); box-shadow: var(--shadow-xs);
}
.master-btn:hover { background: var(--amber-soft); border-style: solid; border-color: var(--amber); }
.master-btn:active { transform: translateY(0) scale(0.98); }
.q-detail { margin-top: 12px; padding: 14px 16px; background: var(--surface-2); border: 1px solid var(--rule); border-left: 3px solid var(--accent); border-radius: 12px; }
.detail-ans { margin-bottom: 8px; }
.detail-analysis {
  font-size: 0.92rem; line-height: 1.9; overflow-wrap: break-word; word-break: break-word;
}

.re-practice { margin-top: 4px; }
.options { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.option {
  display: flex; align-items: center; gap: 12px; text-align: left;
  padding: 11px 14px; border: 1px solid var(--rule); border-radius: var(--radius-sm);
  background: var(--surface); font-size: 0.93rem;
  transition: border-color 0.25s var(--ease), background-color 0.25s var(--ease), box-shadow 0.25s var(--ease), transform 0.15s var(--ease);
}
.option:hover:not(.disabled) { border-color: var(--accent); background: var(--accent-soft); box-shadow: var(--shadow-xs); }
.option.selected { border-color: var(--accent); background: var(--accent-soft); }
.option.correct { border-color: var(--green); background: var(--green-soft); }
.option.wrong { border-color: var(--red); background: var(--red-soft); }
.option.disabled { cursor: default; }
.opt-text { overflow-wrap: break-word; word-break: break-word; }
.option .opt-letter {
  width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 0.85rem;
}
.option.correct .opt-letter { background: var(--green); color: #fff; }
.option.wrong .opt-letter { background: var(--red); color: #fff; }
.opt-miss { margin-left: auto; font-size: 0.75rem; font-weight: 700; color: var(--amber); background: var(--amber-soft); padding: 2px 8px; border-radius: var(--radius-full); flex: 0 0 auto; }
.multi-hint { font-size: 0.82rem; color: var(--amber); font-weight: 600; margin-bottom: 8px; }
.subjective-box { display: flex; flex-direction: column; gap: 10px; }
.subjective-box .btn { align-self: flex-start; }
.result { margin-top: 12px; padding: 12px 16px; border-radius: var(--radius-sm); }
.result.ok { background: var(--green-soft); border: 1px solid rgba(13,166,120,0.25); }
.result.no { background: var(--red-soft); border: 1px solid rgba(225,29,72,0.25); }
.result-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.result-icon { font-weight: 800; }
.result.ok .result-icon { color: var(--green); }
.result.no .result-icon { color: var(--red); }
.analysis {
  font-size: 0.92rem; line-height: 1.9; overflow-wrap: break-word; word-break: break-word;
  margin-top: 10px; padding: 12px 14px; border-radius: 12px;
  background: var(--surface-2); border: 1px solid var(--rule);
  border-left: 3px solid var(--accent);
}
.re-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.export-btn svg { width: 17px; height: 17px; }

.ai-btn { color: var(--accent); border: 1px solid rgba(79, 95, 240, 0.4); background: var(--accent-soft); }
.ai-btn:hover { background: var(--accent); color: #fff; border-color: transparent; }
.ai-btn:disabled { opacity: 0.6; }
.ai-ico { width: 14px; height: 14px; vertical-align: -2px; margin-right: 3px; }

.ai-panel { margin-top: 12px; padding: 14px 16px; background: linear-gradient(180deg, var(--accent-soft), var(--surface-2)); border: 1px solid rgba(79, 95, 240, 0.25); border-left: 3px solid var(--accent); border-radius: 12px; }
.ai-panel-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.ai-badge { font-size: 0.78rem; font-weight: 700; color: #fff; background: var(--accent); padding: 3px 10px; border-radius: var(--radius-full); }
.ai-text { font-size: 0.94rem; line-height: 1.9; color: var(--ink); white-space: pre-wrap; overflow-wrap: break-word; word-break: break-word; }
.tw-caret { display: inline-block; width: 2px; height: 1.1em; background: var(--accent); vertical-align: text-bottom; margin-left: 2px; animation: caret-blink 0.9s steps(1) infinite; }
@keyframes caret-blink { 50% { opacity: 0; } }
.ai-loading { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 0.9rem; }
.ai-loading .r { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: ai-dot 1.2s infinite ease-in-out; }
.ai-loading .r:nth-child(2) { animation-delay: 0.2s; }
.ai-loading .r:nth-child(3) { animation-delay: 0.4s; }
@keyframes ai-dot { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
.ai-err { font-size: 0.9rem; color: var(--muted); }

/* 骨架屏 */
.sk-chip { width: 84px; height: 32px; border-radius: 999px; display: inline-block; }
.sk-w-tag { width: 56px; height: 22px; border-radius: var(--radius-sm); }
.sk-w-stem { width: 78%; height: 18px; margin-bottom: 10px; }
.sk-w-stem.short { width: 52%; }
.sk-w-opt { width: 100%; height: 14px; border-radius: 6px; margin-top: 6px; }

@media (max-width: 600px) {
  .page-head h2 { font-size: 1.3rem; }
  .filter-bar { padding: 12px 14px; }
  .chip { padding: 8px 13px; font-size: 0.84rem; }
  .chip-sm { padding: 7px 12px; font-size: 0.78rem; min-height: 36px; }
  .q-item { padding: 14px 12px; }
  .q-stem { font-size: 0.95rem; }
  .q-opt { font-size: 0.88rem; }
  .opt-letter { width: 20px; height: 20px; line-height: 20px; font-size: 0.75rem; }
  .q-foot { gap: 6px; }
  .q-foot .btn { flex: 1; min-height: 40px; }
  .btn-sm { padding: 8px 12px; font-size: 0.82rem; }
  .option { padding: 12px 10px; font-size: 0.9rem; }
  .option .opt-letter { width: 24px; height: 24px; font-size: 0.8rem; }
  .detail-analysis { font-size: 0.86rem; }
  .q-image img { max-height: 200px; }
}
@media (max-width: 400px) {
  .chip { padding: 7px 10px; font-size: 0.8rem; }
  .chip-sm { padding: 6px 10px; font-size: 0.74rem; }
  .q-foot { flex-direction: column; }
  .q-foot .btn { width: 100%; }
}
</style>
