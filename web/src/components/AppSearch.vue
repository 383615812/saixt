<template>
  <transition name="sheet">
    <div v-if="open" class="search-mask" @click.self="$emit('close')">
      <div class="search-panel" role="dialog" aria-modal="true" aria-label="全局搜索">
        <div class="search-input-wrap">
          <svg class="si-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input
            ref="searchInput"
            v-model="searchQ"
            class="search-input"
            type="search"
            placeholder="搜索题目、院校、专业…"
            aria-label="全局搜索关键词"
            @input="onSearchInput"
            @keydown.enter.prevent="runSearch"
            @keydown.esc="$emit('close')"
          >
          <button v-if="searchQ" class="si-clear" @click="clearSearch" aria-label="清空搜索">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        <div class="search-body">
          <div v-if="searchLoading" class="search-loading" role="status">
            <span class="spinner"></span>
            <span>搜索中…</span>
          </div>

          <div v-else-if="searchError" class="search-error" role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
            <p>{{ searchError }}</p>
            <button class="sh-tag" @click="runSearch">重试</button>
          </div>

          <template v-else-if="searchQ && !searchResults.total">
            <div class="search-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/></svg>
              <p>未找到与「{{ searchQ }}」相关的内容</p>
              <span>换个关键词试试，或到题库中按科目浏览</span>
            </div>
          </template>

          <template v-else-if="searchQ">
            <div v-if="searchResults.questions.length" class="search-group">
              <div class="sg-head">题目 <span class="sg-count">{{ searchResults.questions.length }}</span></div>
              <button
                v-for="q in searchResults.questions"
                :key="'q' + q.id"
                class="sg-item"
                @click="goQuestion(q)"
              >
                <span class="sg-tag" :class="'tag-' + q.subject">{{ q.subject }}</span>
                <span class="sg-text" v-html="highlight(q.stem)"></span>
                <span class="sg-type">{{ typeLabel(q.type) }}</span>
              </button>
            </div>

            <div v-if="searchResults.schools.length" class="search-group">
              <div class="sg-head">院校 <span class="sg-count">{{ searchResults.schools.length }}</span></div>
              <button
                v-for="s in searchResults.schools"
                :key="'s' + s.code"
                class="sg-item"
                @click="goSchool(s)"
              >
                <span class="sg-tag tag-school">院校</span>
                <span class="sg-text" v-html="highlight(s.name)"></span>
                <span class="sg-meta">{{ s.city }} · {{ s.plans }} 个计划</span>
              </button>
            </div>

            <div v-if="searchResults.plans.length" class="search-group">
              <div class="sg-head">专业 <span class="sg-count">{{ searchResults.plans.length }}</span></div>
              <button
                v-for="(p, i) in searchResults.plans"
                :key="'p' + i"
                class="sg-item"
                @click="goPlan(p)"
              >
                <span class="sg-tag tag-major">专业</span>
                <span class="sg-text" v-html="highlight(p.major_name)"></span>
                <span class="sg-meta">{{ p.school_name }}</span>
              </button>
            </div>
          </template>

          <div v-else class="search-hint">
            <div class="sh-title">热门搜索</div>
            <div class="sh-tags">
              <button v-for="t in hotKeywords" :key="t" class="sh-tag" @click="searchQ = t; runSearch()">{{ t }}</button>
            </div>
            <div class="sh-tips">
              <p><strong>题目</strong>：按题干关键词搜索，直达刷题</p>
              <p><strong>院校</strong>：按名称或代码搜索，查看招生计划</p>
              <p><strong>专业</strong>：按专业名称搜索，了解开设院校</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'

const props = defineProps({
  open: { type: Boolean, default: false }
})
const emit = defineEmits(['close'])

const router = useRouter()
const searchQ = ref('')
const searchResults = ref({ questions: [], schools: [], plans: [], total: 0 })
const searchLoading = ref(false)
const searchError = ref('')
const searchInput = ref(null)
let searchTimer = null
const hotKeywords = ['信息技术', '通用技术', '计算机网络', '云南工程职业学院', '护理', '会计']

watch(() => props.open, async (open) => {
  if (open) {
    searchError.value = ''
    await nextTick()
    searchInput.value?.focus()
  } else {
    searchQ.value = ''
    searchResults.value = { questions: [], schools: [], plans: [], total: 0 }
    searchError.value = ''
  }
})

function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 350)
}
function clearSearch() {
  searchQ.value = ''
  searchResults.value = { questions: [], schools: [], plans: [], total: 0 }
  searchError.value = ''
  nextTick(() => searchInput.value?.focus())
}
async function runSearch() {
  const q = searchQ.value.trim()
  if (!q) {
    searchResults.value = { questions: [], schools: [], plans: [], total: 0 }
    searchError.value = ''
    return
  }
  searchLoading.value = true
  searchError.value = ''
  try {
    const res = await api.get('/search', { q })
    const d = res || {}
    searchResults.value = {
      questions: d.questions || [],
      schools: d.schools || [],
      plans: d.plans || [],
      total: (d.questions?.length || 0) + (d.schools?.length || 0) + (d.plans?.length || 0)
    }
  } catch (e) {
    searchError.value = e.message || '搜索失败，请稍后重试'
    searchResults.value = { questions: [], schools: [], plans: [], total: 0 }
  } finally {
    searchLoading.value = false
  }
}
function highlight(text) {
  const q = searchQ.value.trim()
  if (!q || !text) return text
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return String(text).replace(new RegExp(`(${esc})`, 'gi'), '<mark>$1</mark>')
}
function typeLabel(t) {
  return ({ single: '单选', multiple: '多选', judge: '判断', subjective: '主观' })[t] || t
}
function goQuestion(q) {
  emit('close')
  router.push({ path: '/practice', query: { qid: q.id } })
}
function goSchool(s) {
  emit('close')
  router.push(`/schools/${s.code}`)
}
function goPlan(p) {
  emit('close')
  router.push(`/schools/${p.school_code}`)
}

onBeforeUnmount(() => clearTimeout(searchTimer))
</script>

<style scoped>
.search-mask {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(30, 41, 59, 0.45);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: flex-start; justify-content: center; padding: 9vh 20px 20px;
}
.search-panel {
  width: 100%; max-width: 560px; max-height: 78vh; overflow: hidden;
  background: var(--surface); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg); display: flex; flex-direction: column;
  animation: sheetPop 0.3s var(--ease-out);
}
.search-input-wrap {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-bottom: 1px solid var(--rule);
}
.si-icon { width: 19px; height: 19px; color: var(--muted); flex-shrink: 0; }
.search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 1rem; color: var(--ink); min-width: 0;
}
.search-input::placeholder { color: var(--muted-2); }
.si-clear {
  width: 28px; height: 28px; border-radius: 8px; border: none;
  background: var(--surface-2); color: var(--muted); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  transition: background-color 0.2s var(--ease), color 0.2s var(--ease);
}
.si-clear:hover { background: var(--accent-soft); color: var(--accent); }
.si-clear svg { width: 14px; height: 14px; }
.search-body { overflow-y: auto; padding: 8px 0; }
.search-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 40px 0; color: var(--muted); font-size: 0.88rem; }
.search-loading .spinner { width: 20px; height: 20px; border-width: 2px; }
.search-error { text-align: center; padding: 40px 20px; color: var(--muted); }
.search-error svg { width: 44px; height: 44px; color: var(--red); margin-bottom: 12px; }
.search-error p { font-size: 0.92rem; color: var(--ink); margin-bottom: 14px; }
.search-empty { text-align: center; padding: 44px 20px; color: var(--muted); }
.search-empty svg { width: 44px; height: 44px; color: var(--muted-2); margin-bottom: 12px; }
.search-empty p { font-size: 0.95rem; color: var(--ink); margin-bottom: 6px; }
.search-empty span { font-size: 0.82rem; }
.search-group { padding: 6px 0; }
.sg-head {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 18px 6px; font-size: 0.76rem; font-weight: 700;
  color: var(--muted); letter-spacing: 0.04em;
}
.sg-count {
  font-size: 0.7rem; font-weight: 600; color: var(--accent);
  background: var(--accent-soft); border-radius: var(--radius-full); padding: 1px 8px;
}
.sg-item {
  width: 100%; display: flex; align-items: center; gap: 10px;
  padding: 10px 18px; border: none; background: transparent; text-align: left;
  cursor: pointer; transition: background-color 0.15s var(--ease);
}
.sg-item:hover { background: var(--surface-2); }
.sg-item:active { background: var(--accent-soft); }
.sg-tag {
  flex-shrink: 0; font-size: 0.7rem; font-weight: 600;
  padding: 2px 8px; border-radius: var(--radius-full);
  background: var(--surface-2); color: var(--muted);
}
.sg-tag.tag-school { background: var(--blue-soft, rgba(37, 99, 235, 0.08)); color: var(--blue, #2563eb); }
.sg-tag.tag-major { background: var(--accent2-soft); color: var(--accent-2); }
.sg-text {
  flex: 1; min-width: 0; font-size: 0.88rem; color: var(--ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sg-text mark { background: #fff3bf; color: inherit; border-radius: 2px; padding: 0 1px; }
.sg-type, .sg-meta { flex-shrink: 0; font-size: 0.74rem; color: var(--muted-2); }
.search-hint { padding: 12px 18px 18px; }
.sh-title { font-size: 0.78rem; font-weight: 700; color: var(--muted); margin-bottom: 10px; letter-spacing: 0.04em; }
.sh-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.sh-tag {
  padding: 6px 14px; border-radius: var(--radius-full);
  border: 1px solid var(--rule); background: var(--surface);
  color: var(--ink); font-size: 0.82rem; cursor: pointer;
  transition: border-color 0.2s var(--ease), color 0.2s var(--ease), background-color 0.2s var(--ease);
}
.sh-tag:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.sh-tips { border-top: 1px dashed var(--rule); padding-top: 14px; }
.sh-tips p { font-size: 0.8rem; color: var(--muted); line-height: 1.9; }
.sh-tips strong { color: var(--ink); }
@media (max-width: 600px) {
  .search-mask { padding: 4vh 12px 12px; align-items: flex-start; }
  .search-panel { max-height: 82vh; }
}
</style>
