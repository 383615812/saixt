<template>
  <div class="container fav-page">
    <div class="page-head">
      <h2>我的收藏</h2>
      <p>收藏的重点题目与好题，随时回来复习巩固</p>
    </div>

    <!-- 筛选区 -->
    <div class="card filter-bar">
      <div class="filter-row">
        <div class="chips">
          <button class="chip" :class="{ on: subject === '' }" @click="selectSubject('')">全部<span class="chip-count">{{ all.length }}</span></button>
          <button
            v-for="s in subjects"
            :key="s.subject"
            class="chip"
            :class="{ on: subject === s.subject }"
            @click="selectSubject(s.subject)"
          >{{ s.subject }}<span class="chip-count">{{ s.count }}</span></button>
        </div>
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
    <div v-if="loading" class="fav-skeleton">
      <div v-for="i in 3" :key="i" class="card q-item">
        <div class="q-top sk-q-top">
          <span class="skeleton sk-tag"></span>
          <span class="skeleton sk-tag"></span>
          <span class="skeleton sk-tag"></span>
        </div>
        <div class="skeleton sk-stem"></div>
        <div class="skeleton sk-stem short"></div>
        <div v-for="j in 3" :key="j" class="skeleton sk-opt"></div>
        <div class="sk-foot">
          <span class="skeleton sk-btn-sm"></span>
          <span class="skeleton sk-btn-sm"></span>
        </div>
      </div>
    </div>
    <div v-else-if="!list.length" class="card empty">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg></div>
      <p>还没有收藏的题目</p>
      <p class="empty-sub">在题库中心点击题目右下角的「收藏」即可加入这里</p>
      <router-link to="/bank" class="btn btn-primary empty-btn">去题库逛逛</router-link>
    </div>
    <div v-else class="q-list">
      <div v-for="q in list" :key="q.id" class="card q-item">
        <div class="q-top">
          <span class="tag tag-blue">{{ q.subject }}</span>
          <span class="tag tag-purple">{{ q.chapter }}</span>
          <span class="tag" :class="q.difficulty >= 3 ? 'tag-red' : q.difficulty === 2 ? 'tag-amber' : 'tag-green'">
            {{ q.difficulty >= 3 ? '较难' : q.difficulty === 2 ? '中等' : '基础' }}
          </span>
          <span class="q-time">收藏于 {{ formatTime(q.fav_time) }}</span>
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
          <button class="btn btn-ghost btn-sm" @click="toggleDetail(q)">
            {{ detailId === q.id ? '收起解析' : '查看答案与解析' }}
          </button>
          <button class="btn btn-ghost btn-sm fav-btn" @click="unfav(q)">
            <span class="fav-star">★</span> 取消收藏
          </button>
        </div>
        <div v-if="detailId === q.id" class="q-detail">
          <div class="detail-ans"><span class="tag tag-green">正确答案：{{ q.answer }}</span></div>
          <div class="detail-analysis"><strong>解析：</strong>{{ q.analysis }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>

import { toast } from '../toast'
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { useImgError } from '../useImgError'

const subject = ref('')
const chapter = ref('')
const chapters = ref([])
const all = ref([])
const list = ref([])
const loading = ref(false)
const detailId = ref(0)

const subjects = computed(() => {
  const map = new Map()
  for (const q of all.value) {
    if (!map.has(q.subject)) map.set(q.subject, 0)
    map.set(q.subject, map.get(q.subject) + 1)
  }
  return [...map.entries()].map(([subject, count]) => ({ subject, count })).sort((a, b) => b.count - a.count)
})

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
function toggleDetail(q) {
  detailId.value = detailId.value === q.id ? 0 : q.id
}
const { onImgError } = useImgError()
async function unfav(q) {
  try {
    await api.post('/favorites/toggle', { question_id: q.id })
  } catch (e) { /* 忽略 */ }
  all.value = all.value.filter(x => x.id !== q.id)
  applyFilter()
}
function formatTime(t) {
  if (!t) return ''
  const d = new Date(t)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

async function load() {
  loading.value = true
  try {
    all.value = await api.get('/favorites')
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
.page-head { margin-bottom: 20px; }
.page-head h2 { font-size: 1.6rem; }
.page-head p { color: var(--muted); margin-top: 4px; }

.filter-bar { margin-bottom: 16px; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; }
.filter-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip {
  padding: 7px 14px; border-radius: var(--radius-full); border: 1px solid var(--rule);
  background: var(--surface); color: var(--muted); font-size: 0.88rem; font-weight: 500;
  transition: border-color 0.25s var(--ease), color 0.25s var(--ease), background-color 0.25s var(--ease), box-shadow 0.25s var(--ease), transform 0.25s var(--ease);
}
.chip:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }
.chip.on { background: var(--accent); color: #fff; border-color: transparent; box-shadow: 0 4px 14px rgba(79, 95, 240, 0.25); }
.chip-sm { padding: 5px 12px; font-size: 0.8rem; }
.chip-count { font-size: 0.75rem; opacity: 0.68; margin-left: 5px; font-weight: 500; }

.q-list { display: flex; flex-direction: column; gap: 14px; }
.q-item { padding: 18px 20px; transition: box-shadow 0.3s var(--ease), transform 0.3s var(--ease); }
.q-item:hover { box-shadow: var(--shadow-lg); transform: translateY(-1px); }
.q-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.q-time { font-size: 0.8rem; color: var(--muted); margin-left: auto; }
.q-stem { font-size: 1rem; font-weight: 600; line-height: 1.7; margin-bottom: 12px; overflow-wrap: break-word; word-break: break-word; }

.q-image {
  margin: 0 0 12px; padding: 12px; border-radius: 10px;
  background: var(--surface-2, #f8fafc); border: 1px dashed var(--rule);
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; align-items: center;
}
.q-image img { max-width: 100%; max-height: 260px; object-fit: contain; border-radius: 6px; }

.q-opts { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.q-opt { display: flex; align-items: flex-start; gap: 8px; font-size: 0.93rem; color: var(--ink); line-height: 1.6; overflow-wrap: break-word; word-break: break-word; }
.opt-letter {
  width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 0.78rem;
}
.q-foot { display: flex; gap: 8px; flex-wrap: wrap; }
.fav-btn { color: var(--amber); }
.fav-star { color: var(--amber-light); }
.q-detail { margin-top: 12px; padding: 14px 16px; background: var(--surface-2); border: 1px solid var(--rule); border-left: 3px solid var(--accent); border-radius: 12px; }
.detail-ans { margin-bottom: 8px; }
.detail-analysis { font-size: 0.92rem; line-height: 1.9; overflow-wrap: break-word; word-break: break-word; }

@media (max-width: 600px) {
  .q-item { padding: 16px 14px; }
  .q-foot .btn { flex: 1; }
  .q-time { width: 100%; margin-left: 0; }
}
@media (max-width: 480px) {
  .q-item { padding: 14px 12px; }
  .q-foot .btn { padding: 10px 12px; font-size: 0.82rem; }
  .q-detail { padding: 12px 14px; }
}
@media (max-width: 400px) {
  .q-foot { flex-wrap: wrap; }
  .q-foot .btn { flex: 1 1 100%; }
  .chip-count { font-size: 0.75rem; }
}

/* ===== 骨架屏 ===== */
.sk-q-top { display: flex; gap: 8px; margin-bottom: 14px; }
.sk-tag { height: 22px; width: 56px; border-radius: 999px; }
.sk-stem { height: 14px; width: 92%; margin-bottom: 10px; }
.sk-stem.short { width: 65%; }
.sk-opt { height: 14px; width: 78%; margin: 8px 0; }
.sk-foot { display: flex; gap: 10px; margin-top: 18px; }
.sk-btn-sm { height: 30px; width: 96px; border-radius: 8px; }
</style>
