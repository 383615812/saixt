<template>
  <div class="container bank-page">
    <div class="page-head">
      <h2>题库中心</h2>
      <p>按科目与章节浏览全部真题，点击题目查看答案与解析</p>
    </div>

    <!-- 筛选区 -->
    <div class="card filter-bar">
      <div class="filter-row">
        <div class="chips">
          <button
            v-for="s in shownSubjects"
            :key="s.subject"
            class="chip"
            :class="{ on: subject === s.subject }"
            @click="selectSubject(s.subject)"
          >{{ s.subject }}<span class="chip-count">{{ s.count }}</span></button>
          <button
            v-if="subjectOverflow"
            class="chip chip-toggle"
            :class="{ on: !subjectCollapsed }"
            :aria-expanded="!subjectCollapsed"
            @click="subjectCollapsed = !subjectCollapsed"
          >
            {{ subjectCollapsed ? `+${hiddenCount} 更多` : '收起' }}
            <svg class="ct-chev" :class="{ up: !subjectCollapsed }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>
        <div class="search">
          <input v-model="keyword" placeholder="搜索题目关键词…" aria-label="搜索题目关键词" @keyup.enter="load(0)" />
          <button class="btn btn-primary" @click="load(0)">搜索</button>
        </div>
      </div>
      <div v-if="visibleChapters.length" class="filter-row chapters">
        <span class="filter-lbl">章节</span>
        <button
          v-for="c in visibleChapters"
          :key="c.chapter"
          class="chip chip-sm"
          :class="{ on: chapter === c.chapter }"
          @click="selectChapter(c.chapter)"
        >{{ c.chapter }}<span class="chip-count">{{ c.count }}</span></button>
        <button v-if="subject && chapter" class="btn btn-primary btn-sm chapter-practice" @click="practiceChapter">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          练习本章
        </button>
      </div>
      <div class="filter-row types">
        <button
          v-for="t in typeOptions"
          :key="t.value"
          class="chip chip-sm"
          :class="{ on: type === t.value }"
          @click="selectType(t.value)"
        >{{ t.label }}<span v-if="t.count" class="chip-count">{{ t.count }}</span></button>
      </div>
    </div>

    <!-- 题目列表 -->
    <div v-if="loading" class="q-list">
      <div v-for="i in 4" :key="i" class="card q-item">
        <div class="q-top">
          <div class="skeleton sk-qb-tag"></div>
          <div class="skeleton sk-qb-tag"></div>
          <div class="skeleton sk-qb-tag"></div>
          <div class="skeleton sk-qb-tag"></div>
        </div>
        <div class="skeleton sk-qb-stem"></div>
        <div class="skeleton sk-qb-stem short"></div>
        <div class="skeleton sk-qb-opt"></div>
        <div class="skeleton sk-qb-opt"></div>
      </div>
    </div>
    <div v-else-if="!list.length" class="card empty">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6M11 8v6"/></svg></div>
      <p>暂无符合条件的题目，换个筛选条件试试</p>
    </div>
    <div v-else class="q-list">
      <div v-for="q in list" :key="q.id" class="card q-item">
        <div class="q-top">
          <span class="tag tag-blue">{{ q.subject }}</span>
          <span class="tag tag-purple">{{ q.chapter }}</span>
          <span class="tag" :class="typeTagClass(q.type)">{{ typeLabel(q.type) }}</span>
          <span class="tag" :class="q.difficulty >= 3 ? 'tag-red' : q.difficulty === 2 ? 'tag-amber' : 'tag-green'">
            {{ q.difficulty >= 3 ? '较难' : q.difficulty === 2 ? '中等' : '基础' }}
          </span>
          <span class="q-source">来源：{{ q.source }}</span>
        </div>
        <p class="q-stem">{{ q.stem }}</p>
        <div v-if="q.images && q.images.length" class="q-image">
          <img v-for="(img, idx) in q.images" :key="idx" :src="'/' + img" alt="题目配图" loading="lazy" @error="onImgError">
        </div>
        <div class="q-opts">
          <p v-for="opt in q.options" :key="opt[0]" class="q-opt">
            <span class="opt-letter">{{ opt[0] }}</span>{{ opt.slice(2) }}
          </p>
        </div>
        <div class="q-foot">
          <button class="btn btn-primary btn-sm" @click="practice(q)">去练习</button>
          <button class="btn btn-sm btn-detail" :class="{ open: detailId === q.id }" @click="toggleDetail(q)">
            <svg v-if="detailId !== q.id" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="m6 9 6 6 6-6"/></svg>
            {{ detailId === q.id ? '收起解析' : '查看答案与解析' }}
          </button>
          <button class="btn btn-ghost btn-sm fav-btn" :class="{ on: favs[q.id] }" @click="toggleFav(q)">
            <span class="fav-star">{{ favs[q.id] ? '★' : '☆' }}</span>
            {{ favs[q.id] ? '已收藏' : '收藏' }}
          </button>
        </div>

        <!-- 解析 -->
        <div v-if="detailId === q.id" class="q-detail">
          <div v-if="detailLoading" class="spinner spinner-sm"></div>
          <template v-else-if="detail">
            <div v-if="detail.images && detail.images.length" class="q-image">
              <img v-for="(img, idx) in detail.images" :key="idx" :src="'/' + img" alt="题目配图" loading="lazy" @error="onImgError">
            </div>
            <div class="detail-ans">
              <span class="tag tag-green">正确答案：{{ detail.answer }}</span>
            </div>
            <div class="detail-analysis">
              <strong>解题讲解：</strong>{{ detail.analysis }}
            </div>
            <div class="detail-ai-row">
              <button class="btn btn-sm ai-btn" :disabled="aiLoading && aiExplainFor === q.id" @click="explainDetail(q)">
                <svg class="ai-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a5 5 0 0 1 4.24 7.5A5 5 0 0 1 17 19h-2A7 7 0 0 0 12 6"/><path d="M12 2v4"/><path d="M12 6a7 7 0 0 0-3 13.5A5 5 0 0 1 7 19h2"/></svg>
                {{ aiLoading && aiExplainFor === q.id ? '讲解中…' : (aiExplainFor === q.id && aiExplain ? '收起 AI 讲解' : 'AI 讲解') }}
              </button>
            </div>
            <div v-if="aiExplainFor === q.id && aiExplain" class="ai-explain">
              <div class="ai-explain-head">
                <span class="ai-badge">AI</span>
                <strong>智能讲解</strong>
              </div>
              <div class="ai-explain-body">{{ aiTyping ? aiText : aiExplain }}<span v-if="aiTyping" class="tw-caret"></span></div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="total > limit" class="pager">
      <button class="btn btn-ghost" :disabled="offset === 0" @click="load(offset - limit)">上一页</button>
      <span class="pager-info">{{ offset + 1 }} - {{ Math.min(offset + limit, total) }} / 共 {{ total }} 题</span>
      <button class="btn btn-ghost" :disabled="offset + limit >= total" @click="load(offset + limit)">下一页</button>
    </div>
  </div>
</template>

<script setup>

import { toast } from '../toast'
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { useImgError } from '../useImgError'
import { useTypewriter } from '../useTypewriter'

const router = useRouter()
const { text: aiText, typing: aiTyping, type: typeAi } = useTypewriter()

const subjects = ref([])
const chapters = ref([])
const subject = ref('')
const chapter = ref('')
const type = ref('')
const keyword = ref('')
const list = ref([])
const total = ref(0)
const offset = ref(0)
const limit = 20
const loading = ref(false)

// 科目筛选折叠：移动端收起为 5 项、桌面为 8 项，保证已选科目始终可见
const subjectCollapsed = ref(true)
const collapseLimit = ref(8)
const subjectOverflow = computed(() => subjects.value.length > collapseLimit.value)
const shownSubjects = computed(() => {
  if (!subjectOverflow.value || !subjectCollapsed.value) return subjects.value
  const subs = subjects.value
  const base = subs.slice(0, collapseLimit.value)
  const onIdx = subs.findIndex(s => s.subject === subject.value)
  if (onIdx >= collapseLimit.value && onIdx !== -1) base[collapseLimit.value - 1] = subs[onIdx]
  return base
})
const hiddenCount = computed(() => {
  if (!subjectCollapsed.value || !subjectOverflow.value) return 0
  const shown = new Set(shownSubjects.value.map(s => s.subject))
  return subjects.value.filter(s => !shown.has(s.subject)).length
})

// 章节仅展示当前所选科目的，避免跨科目混显
const visibleChapters = computed(() => {
  if (!subject.value) return []
  return chapters.value.filter(c => c.subject === subject.value)
})

const typeOptions = ref([
  { value: '', label: '全部' },
  { value: 'single', label: '单选题' },
  { value: 'multiple', label: '多选题' },
  { value: 'judge', label: '判断题' },
  { value: 'subjective', label: '主观题' }
])

const detailId = ref(null)
const detail = ref(null)
const detailLoading = ref(false)
const favs = ref({})

function readFavs() {
  favs.value = JSON.parse(localStorage.getItem('saixt_favs') || '{}')
}

// 装载时以后端收藏为真值重建本地缓存，杜绝跨页/跨端收藏状态不同步
async function syncFavsCache() {
  try {
    const list = await api.get('/favorites')
    const map = {}
    ;(list || []).forEach(x => { if (x && x.id) map[x.id] = true })
    localStorage.setItem('saixt_favs', JSON.stringify(map))
  } catch (e) { /* 拉取失败保留本地缓存，不作为空态展示 */ }
  readFavs()
}

const typeLabelMap = { single: '单选题', multiple: '多选题', judge: '判断题', subjective: '主观题' }
function typeLabel(t) { return typeLabelMap[t] || '单选题' }
function typeTagClass(t) {
  if (t === 'multiple') return 'tag-amber'
  if (t === 'judge') return 'tag-green'
  if (t === 'subjective') return 'tag-purple'
  return 'tag-blue'
}

const { onImgError } = useImgError()

async function toggleFav(q) {
  try {
    const data = await api.post('/favorites/toggle', { question_id: q.id })
    const fav = JSON.parse(localStorage.getItem('saixt_favs') || '{}')
    if (data.favorited) fav[q.id] = true
    else delete fav[q.id]
    localStorage.setItem('saixt_favs', JSON.stringify(fav))
    readFavs()
  } catch (e) {
    toast(e.message || '操作失败，请稍后重试', 'error')
  }
}

async function loadMeta() {
  try {
    const data = await api.get('/questions/meta')
    subjects.value = data.subjects
    chapters.value = data.chapters
    if (data.types && data.types.length) {
      const countMap = Object.fromEntries(data.types.map(t => [t.type, t.count]))
      typeOptions.value = typeOptions.value.map(t => ({ ...t, count: countMap[t.value] || 0 }))
    }
  } catch (e) {
    toast(e.message || '题库信息加载失败，请刷新重试', 'error')
  }
}

function selectSubject(s) {
  subject.value = subject.value === s ? '' : s
  chapter.value = ''
  load(0)
}

function selectChapter(c) {
  chapter.value = chapter.value === c ? '' : c
  load(0)
}

function selectType(t) {
  type.value = type.value === t ? '' : t
  load(0)
}

async function load(off) {
  if (loading.value) return
  loading.value = true
  detailId.value = null
  detail.value = null
  aiExplain.value = ''
  aiExplainFor.value = null
  aiLoading.value = false
  const params = new URLSearchParams({ limit, offset: off })
  if (subject.value) params.set('subject', subject.value)
  if (chapter.value) params.set('chapter', chapter.value)
  if (type.value) params.set('type', type.value)
  if (keyword.value.trim()) params.set('keyword', keyword.value.trim())
  try {
    const data = await api.get(`/questions?${params}`)
    list.value = data.list
    total.value = data.total
    offset.value = off
  } catch (e) {
    toast(e.message || '题目加载失败，请稍后重试', 'error')
  } finally {
    loading.value = false
  }
}

async function toggleDetail(q) {
  if (detailId.value === q.id) {
    detailId.value = null
    detail.value = null
    return
  }
  detailId.value = q.id
  detail.value = null
  aiExplainFor.value = null
  aiExplain.value = ''
  aiLoading.value = false
  detailLoading.value = true
  try {
    detail.value = await api.get(`/questions/${q.id}`)
  } catch (e) {
    toast(e.message || '解析加载失败，请稍后重试', 'error')
  } finally {
    detailLoading.value = false
  }
}
// 从题库直达单题练习：跳转刷题页并定位到该题（qid 直达）
function practice(q) {
  router.push({ path: '/practice', query: { subject: q.subject, chapter: q.chapter, qid: q.id } })
}

// 选定章节后一键练习本章全部题目
function practiceChapter() {
  if (!subject.value || !chapter.value) return
  router.push({ path: '/practice', query: { subject: subject.value, chapter: chapter.value } })
}

// AI 智能讲解：复用 /ai/explain，消费 AI 配额后刷新全局剩余次数
const aiExplain = ref('')
const aiExplainFor = ref(null)
const aiLoading = ref(false)
async function explainDetail(q) {
  if (aiExplainFor.value === q.id && aiExplain.value) { aiExplain.value = ''; return }
  aiExplainFor.value = q.id
  aiLoading.value = true
  try {
    const data = await api.post('/ai/explain', { question_id: q.id })
    aiExplain.value = data.reply
    typeAi(data.reply)
    window.dispatchEvent(new Event('ai-quota-refresh'))
  } catch (e) {
    toast(e.message || 'AI 讲解失败，请稍后重试', 'error')
  } finally {
    aiLoading.value = false
  }
}

onMounted(async () => {
  await syncFavsCache()
  const mqSmall = window.matchMedia('(max-width: 600px)')
  const applyCollapse = () => { collapseLimit.value = mqSmall.matches ? 5 : 8 }
  applyCollapse()
  mqSmall.addEventListener?.('change', applyCollapse)
  await loadMeta()
  await load(0)
})
</script>

<style scoped>
.page-head { margin-bottom: 22px; }
.page-head h2 { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.02em; }
.page-head p { color: var(--muted); margin-top: 4px; font-size: 0.92rem; }

.filter-bar { margin-bottom: 20px; }
.filter-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.filter-row + .filter-row { margin-top: 14px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; flex: 1; }
.chapter-practice { margin-left: auto; flex-shrink: 0; }
.chapter-practice svg { flex: 0 0 auto; }
.filter-lbl {
  flex-shrink: 0; align-self: center; font-size: 0.78rem; font-weight: 600;
  color: var(--muted); letter-spacing: 0.05em;
}
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: var(--radius-full); border: 1px solid var(--rule);
  background: var(--surface); color: var(--muted); font-size: 0.88rem; font-weight: 500;
  transition: border-color 0.25s var(--ease), color 0.25s var(--ease), background-color 0.25s var(--ease), transform 0.25s var(--ease), box-shadow 0.25s var(--ease);
}
.chip:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }
.chip.on { background: var(--accent); color: #fff; border-color: transparent; box-shadow: 0 4px 14px rgba(79, 95, 240, 0.25); }
.chip-count { font-size: 0.78rem; opacity: 0.68; margin-left: 5px; font-weight: 500; }
.chip-sm { padding: 4px 11px; font-size: 0.8rem; }
.chip-toggle {
  color: var(--accent); border-color: rgba(79, 95, 240, 0.4);
  background: var(--accent-soft);
}
.chip-toggle:hover { transform: none; background: var(--accent); color: #fff; }
.chip-toggle .ct-chev { width: 15px; height: 15px; transition: transform 0.3s var(--ease); }
.chip-toggle .ct-chev.up { transform: rotate(180deg); }
.search { display: flex; gap: 8px; }
.search input {
  width: 100%; max-width: 220px; padding: 9px 14px; border: 1px solid var(--rule);
  border-radius: var(--radius-sm); font-size: 0.9rem; outline: none;
  background: var(--surface-2); transition: border-color 0.25s var(--ease), background-color 0.25s var(--ease), box-shadow 0.25s var(--ease);
}
.search input:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }
.search .btn { padding: 9px 16px; }

.q-list { display: flex; flex-direction: column; gap: 14px; }
.q-item { padding: 18px 20px; transition: box-shadow 0.3s var(--ease), transform 0.3s var(--ease); }
.q-item:hover { box-shadow: var(--shadow-lg); transform: translateY(-1px); }
.q-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.q-source { font-size: 0.78rem; color: var(--muted); margin-left: auto; }
.q-stem { font-size: 1.02rem; font-weight: 600; margin: 12px 0 10px; line-height: 1.7; overflow-wrap: break-word; word-break: break-word; }

.q-image {
  margin: 0 0 12px; padding: 12px; border-radius: var(--radius-sm);
  background: var(--surface-2); border: 1px dashed var(--rule);
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; align-items: center;
}
.q-image img { max-width: 100%; max-height: 260px; object-fit: contain; border-radius: 6px; }

.q-opts { display: flex; flex-direction: column; gap: 6px; }
.q-opt { font-size: 0.92rem; color: var(--ink); overflow-wrap: break-word; word-break: break-word; }
.opt-letter {
  display: inline-block; width: 22px; height: 22px; line-height: 22px; text-align: center;
  border-radius: 6px; background: var(--accent-soft); color: var(--accent);
  font-weight: 700; font-size: 0.8rem; margin-right: 8px;
}
.q-foot { margin-top: 12px; display: flex; gap: 8px; }
.btn-sm { padding: 6px 14px; font-size: 0.85rem; }
.btn-detail {
  background: var(--surface); color: var(--accent);
  border: 1px solid rgba(79, 95, 240, 0.45); box-shadow: var(--shadow-xs);
}
.btn-detail:hover { background: var(--accent-soft); border-color: var(--accent); }
.btn-detail:active { transform: translateY(0) scale(0.98); }
.btn-detail.open { color: var(--muted); border-color: var(--rule); }
.btn-detail.open:hover { color: var(--accent); border-color: rgba(79, 95, 240, 0.45); background: var(--surface); }
.fav-btn.on { border-color: var(--amber); color: var(--amber); background: var(--amber-soft); }
.fav-star { font-size: 0.95rem; line-height: 1; }

.q-detail {
  margin-top: 14px; padding: 14px 16px; border-radius: 12px;
  background: var(--surface-2); border: 1px solid var(--rule); border-left: 3px solid var(--accent);
}
.detail-ans { margin-bottom: 8px; }
.detail-analysis { font-size: 0.92rem; color: var(--ink); line-height: 1.9; overflow-wrap: break-word; word-break: break-word; }
.detail-ai-row { margin-top: 12px; }
.ai-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: linear-gradient(135deg, #4f5ff0, #6b58e8); color: #fff;
  border: none; box-shadow: 0 4px 12px rgba(79, 95, 240, 0.28);
}
.ai-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(79, 95, 240, 0.34); }
.ai-btn:disabled { opacity: 0.7; cursor: not-allowed; transform: none; box-shadow: none; }
.ai-ico { width: 15px; height: 15px; flex: 0 0 auto; }
.ai-explain {
  margin-top: 12px; padding: 14px 16px; border-radius: 12px;
  background: linear-gradient(135deg, var(--accent-soft) 0%, var(--surface-2) 100%);
  border: 1px solid rgba(79, 95, 240, 0.2); border-left: 3px solid var(--accent);
}
.ai-explain-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.ai-explain-head strong { font-size: 0.9rem; }
.ai-badge {
  font-size: 0.78rem; font-weight: 800; color: #fff; padding: 2px 8px;
  border-radius: 6px; background: var(--grad-accent); letter-spacing: 0.02em;
}
.ai-explain-body { font-size: 0.92rem; line-height: 1.9; color: var(--ink); white-space: pre-wrap; overflow-wrap: break-word; word-break: break-word; }
.spinner-sm { margin: 10px auto; width: 20px; height: 20px; }

/* 骨架屏 */
.sk-qb-tag { width: 56px; height: 22px; border-radius: var(--radius-sm); }
.sk-qb-stem { width: 82%; height: 17px; margin-top: 14px; }
.sk-qb-stem.short { width: 55%; }
.sk-qb-opt { width: 88%; height: 14px; border-radius: 6px; margin-top: 10px; }

.pager { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 24px; }
.pager-info { color: var(--muted); font-size: 0.9rem; }

@media (max-width: 768px) {
  .search { width: 100%; }
  .search input { flex: 1; width: auto; }
  .q-source { margin-left: 0; width: 100%; }
  .chip { min-height: 40px; display: inline-flex; align-items: center; }
}
@media (max-width: 600px) {
  .page-head h2 { font-size: 1.3rem; }
  .page-head p { font-size: 0.82rem; }
  .filter-bar { padding: 14px 12px; }
  .filter-row { gap: 8px; }
  .filter-row + .filter-row { margin-top: 10px; }
  .chip { padding: 8px 12px; font-size: 0.84rem; min-height: 44px; }
  .chip-sm { padding: 6px 11px; font-size: 0.78rem; min-height: 44px; }
  .search input { padding: 10px 12px; font-size: 1rem; }
  .search .btn { padding: 10px 14px; font-size: 0.85rem; }
  .q-item { padding: 14px 12px; }
  .q-stem { font-size: 0.95rem; line-height: 1.65; overflow-wrap: break-word; }
  .q-opt { font-size: 0.88rem; overflow-wrap: break-word; }
  .opt-letter { width: 20px; height: 20px; line-height: 20px; font-size: 0.78rem; margin-right: 6px; }
  .q-foot { flex-wrap: wrap; gap: 6px; }
  .q-foot .btn { flex: 1; justify-content: center; min-height: 40px; }
  .btn-sm { padding: 8px 14px; font-size: 0.82rem; }
  .pager { gap: 8px; flex-wrap: wrap; }
  .pager-info { font-size: 0.82rem; width: 100%; text-align: center; order: -1; }
  .q-detail { padding: 12px; }
  .detail-analysis { font-size: 0.86rem; }
  .q-image img { max-height: 200px; }
}
@media (max-width: 400px) {
  .chip { padding: 7px 10px; font-size: 0.8rem; }
  .chip-sm { padding: 5px 9px; font-size: 0.78rem; }
  .q-stem { font-size: 0.9rem; }
  .pager .btn { padding: 8px 12px; font-size: 0.8rem; }
}
</style>
