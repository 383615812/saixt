<template>
  <div class="container schools-page">
    <div class="page-head">
      <h2>院校库</h2>
      <p>云南省春季招生院校与专业计划查询，共收录 {{ total }} 所院校</p>
    </div>
    <!-- 搜索排序 -->
    <div class="card filter-bar">
      <div class="search">
        <input v-model="keyword" placeholder="搜索院校名称或代码…" aria-label="搜索院校名称或代码" @keyup.enter="load(0)" />
        <button class="btn btn-primary" @click="load(0)">搜索</button>
      </div>
      <div class="sorts">
        <button
          v-for="s in sorts"
          :key="s.value"
          class="chip"
          :class="{ on: sort === s.value }"
          @click="changeSort(s.value)"
        >{{ s.label }}</button>
      </div>
      <div class="filters">
        <div class="f-group">
          <span class="f-lbl">办学性质</span>
          <button class="chip" :class="{ on: !type }" @click="setType('')">全部</button>
          <button class="chip" :class="{ on: type === '公办' }" @click="setType('公办')">公办</button>
          <button class="chip" :class="{ on: type === '民办' }" @click="setType('民办')">民办</button>
        </div>
        <div class="f-group">
          <span class="f-lbl">所在地州</span>
          <select v-model="region" class="sel" @change="load(0)">
            <option value="">全部地州</option>
            <option v-for="r in regions" :key="r" :value="r">{{ r }}</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="loading" class="school-grid schools-skeleton">
      <div v-for="i in 6" :key="i" class="card school-card">
        <div class="sc-head">
          <span class="skeleton sk-sc-logo"></span>
          <div class="sc-info">
            <div class="skeleton sk-sc-name"></div>
            <div class="skeleton sk-sc-code"></div>
          </div>
        </div>
        <div class="sc-stats">
          <div v-for="j in 3" :key="j" class="sc-stat">
            <div class="skeleton sk-sc-num"></div>
            <div class="skeleton sk-sc-lbl"></div>
          </div>
        </div>
        <div class="sk-sc-foot">
          <span class="skeleton sk-sc-btn"></span>
        </div>
      </div>
    </div>
    <div v-else-if="!list.length" class="card empty">未找到匹配的院校</div>
    <div v-else class="school-grid">
      <router-link
        v-for="s in list"
        :key="s.code"
        :to="`/schools/${s.code}`"
        class="card school-card"
      >
        <div class="sc-head">
          <div class="sc-logo">{{ s.name.slice(0, 2) }}</div>
          <div class="sc-info">
            <h3>{{ s.name }}</h3>
            <span class="sc-code">院校代码 {{ s.code }}</span>
            <span v-if="s.estimate_score" class="sc-est">{{ s.estimate_score }}</span>
          </div>
        </div>
        <div class="sc-stats">
          <div class="sc-stat">
            <div class="num">{{ s.plans.toLocaleString() }}</div>
            <div class="lbl">招生计划（人）</div>
          </div>
          <div class="sc-stat">
            <div class="num">{{ s.majors }}</div>
            <div class="lbl">招生专业</div>
          </div>
          <div class="sc-stat">
            <div class="num tuition">{{ formatTuition(s.tuition_range) }}</div>
            <div class="lbl">学费区间（万元/年）</div>
          </div>
        </div>
        <div class="sc-foot">
          <span class="btn btn-ghost btn-sm">查看专业计划 <svg class="sc-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
        </div>
      </router-link>
    </div>

    <div v-if="total > limit" class="pager">
      <button class="btn btn-ghost" :disabled="offset === 0" @click="load(offset - limit)">上一页</button>
      <span class="pager-info">{{ offset + 1 }} - {{ Math.min(offset + limit, total) }} / 共 {{ total }} 所</span>
      <button class="btn btn-ghost" :disabled="offset + limit >= total" @click="load(offset + limit)">下一页</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'
import { toast } from '../toast'

const sorts = [
  { value: 'plans', label: '按计划人数' },
  { value: 'name', label: '按名称' },
  { value: 'code', label: '按代码' }
]
// 云南省 16 个地州（数据真实，用于院校所在地筛选）
const regions = [
  '昆明', '曲靖', '玉溪', '保山', '昭通', '丽江', '普洱', '临沧',
  '楚雄', '红河', '文山', '西双版纳', '大理', '德宏', '怒江', '迪庆'
]
const keyword = ref('')
const sort = ref('plans')
const type = ref('')
const region = ref('')
const list = ref([])
const total = ref(0)
const offset = ref(0)
const limit = 24
const loading = ref(false)

async function load(off) {
  if (loading.value) return
  loading.value = true
  const params = new URLSearchParams({ sort: sort.value, limit, offset: off })
  if (keyword.value.trim()) params.set('keyword', keyword.value.trim())
  if (type.value) params.set('type', type.value)
  if (region.value) params.set('region', region.value)
  try {
    const data = await api.get(`/schools?${params}`)
    list.value = data.list
    total.value = data.total
    offset.value = off
  } catch (e) {
    toast(e.message || '院校加载失败，请稍后重试', 'error')
  } finally {
    loading.value = false
  }
}

function setType(v) {
  if (type.value === v) return
  type.value = v
  load(0)
}

function changeSort(v) {
  sort.value = v
  load(0)
}

// 学费区间统一样式：解析“万/元”混用数据，全部归一为 “x万元” 展示（如 1.48万）
function formatTuition(v) {
  if (!v) return '—'
  const s = String(v).trim()
  if (!s || s === '待定' || s.includes('待定')) return '待定'
  const pairs = s.match(/\d+(?:\.\d+)?\s*(?:万|元)/g) || []
  let yuan
  if (!pairs.length) {
    const nums = s.match(/\d+(\.\d+)?/g) || []
    if (!nums.length) return s
    yuan = nums.map(n => parseFloat(n))
  } else {
    yuan = pairs.map(p => {
      const m = p.match(/[\d.]+/)
      const v = parseFloat(m[0])
      return p.includes('万') ? v * 10000 : v
    })
  }
  const fmt = n => {
    const w = n / 10000
    return (Math.round(w * 100) / 100).toString().replace(/\.?0+$/, '') + '万'
  }
  if (yuan.length === 1) return fmt(yuan[0])
  return fmt(Math.min(...yuan)) + ' – ' + fmt(Math.max(...yuan))
}

onMounted(() => load(0))

</script>

<style scoped>
.page-head { margin-bottom: 20px; }
.page-head h2 { font-size: 1.6rem; }
.page-head p { color: var(--muted); margin-top: 4px; }

.filter-bar { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 20px; }
.search { display: flex; gap: 8px; }
.search input {
  width: 100%; max-width: 260px; padding: 9px 14px; border: 1px solid var(--rule);
  border-radius: var(--radius-sm); font-size: 0.9rem; outline: none; background: var(--surface);
  transition: border-color 0.25s var(--ease), box-shadow 0.25s var(--ease), background 0.25s var(--ease);
}
.search input:hover { border-color: #d6dae6; }
.search input:focus {
  border-color: var(--accent); background: var(--surface);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.search .btn { padding: 9px 16px; }
.sorts { display: flex; gap: 8px; }
.chip {
  padding: 7px 14px; border-radius: 999px; border: 1px solid var(--rule);
  background: var(--surface); color: var(--muted); font-size: 0.88rem; font-weight: 500;
  transition: border-color 0.25s var(--ease), color 0.25s var(--ease), background-color 0.25s var(--ease), box-shadow 0.25s var(--ease), transform 0.25s var(--ease);
}
.chip:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }
.chip.on { background: var(--accent); color: #fff; border-color: transparent; box-shadow: 0 4px 14px rgba(79, 95, 240, 0.25); }

.filters {
  display: flex; align-items: center; gap: 6px 20px; flex-wrap: wrap;
  padding-top: 12px; margin-top: 6px; border-top: 1px dashed var(--rule);
}
.f-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.f-lbl { font-size: 0.78rem; color: var(--muted); margin-right: 2px; }
.filters .chip { padding: 5px 12px; font-size: 0.8rem; }
.sel {
  padding: 6px 10px; border-radius: 999px; border: 1px solid var(--rule);
  background: var(--surface); color: var(--text); font-size: 0.84rem; cursor: pointer; outline: none;
}
.sel:focus { border-color: var(--accent); }

.school-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.school-card {
  display: flex; flex-direction: column; position: relative; overflow: hidden;
  transition: transform 0.2s var(--ease), box-shadow 0.2s var(--ease), border-color 0.2s var(--ease);
}
.school-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: var(--grad-accent); transform: scaleX(0); transform-origin: left;
  transition: transform 0.4s var(--ease);
}
.school-card:hover { transform: translateY(-3px); border-color: rgba(79, 95, 240, 0.24); box-shadow: var(--shadow-lg); }
.school-card:hover::before { transform: scaleX(1); }
.school-card:active { transform: translateY(0) scale(0.985); }

.sc-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.sc-logo {
  width: 46px; height: 46px; border-radius: 12px; flex-shrink: 0;
  background: linear-gradient(135deg, #4f5ff0 0%, #6b58e8 100%);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 0.95rem;
  box-shadow: 0 3px 10px rgba(79, 95, 240, 0.22);
  transition: transform 0.25s var(--ease), box-shadow 0.25s var(--ease);
}
.school-card:hover .sc-logo { transform: scale(1.06) rotate(-3deg); box-shadow: 0 6px 16px rgba(79, 95, 240, 0.3); }
.sc-info h3 {
  font-size: 1.02rem; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.sc-code { font-size: 0.78rem; color: var(--muted); }
.sc-est {
  display: inline-block; margin-top: 6px; padding: 2px 8px;
  font-size: 0.74rem; font-weight: 600; color: #fff;
  border-radius: 6px; background: linear-gradient(135deg, var(--accent), var(--accent-2));
}

.sc-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 12px 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
.sc-stat { text-align: center; }
.sc-stat .num { font-size: 1.05rem; font-weight: 700; color: var(--accent); }
.sc-stat .num.tuition { font-size: 0.82rem; color: var(--accent-2); }
.sc-stat .lbl { font-size: 0.76rem; color: var(--muted); margin-top: 2px; }

.sc-foot { margin-top: auto; padding-top: 14px; text-align: center; }
.btn-sm { padding: 8px 16px; font-size: 0.85rem; min-height: 40px; }
.sc-arrow { width: 14px; height: 14px; vertical-align: -2px; transition: transform 0.25s var(--ease); }
.school-card:hover .sc-arrow { transform: translateX(3px); }

.pager { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 24px; }
.pager-info { color: var(--muted); font-size: 0.9rem; }

@media (max-width: 900px) {
  .school-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .page-head h2 { font-size: 1.3rem; }
  .page-head p { font-size: 0.82rem; }
  .filter-bar { flex-direction: column; align-items: stretch; gap: 10px; }
  .search { width: 100%; }
  .search input { width: 100%; font-size: 1rem; }
  .sorts { width: 100%; justify-content: flex-start; overflow-x: auto; }
  .filters { width: 100%; padding-top: 10px; margin-top: 4px; gap: 8px 14px; }
  .f-group { flex: 1 1 auto; min-width: 0; }
  .sel { flex: 1 1 auto; max-width: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .school-grid { grid-template-columns: 1fr; gap: 12px; }
  .school-card { padding: 14px; }
  .sc-head { gap: 10px; margin-bottom: 8px; }
  .sc-logo { width: 40px; height: 40px; font-size: 0.88rem; }
  .sc-info h3 { font-size: 0.95rem; }
  .sc-code { font-size: 0.75rem; }
  .sc-stats { gap: 6px; padding: 8px 0; }
  .sc-stat .num { font-size: 0.95rem; }
  .sc-stat .num.tuition { font-size: 0.76rem; }
  .sc-stat .lbl { font-size: 0.75rem; }
  .sc-foot { padding-top: 10px; }
  .pager { gap: 10px; flex-wrap: wrap; }
  .pager-info { font-size: 0.82rem; width: 100%; text-align: center; order: -1; }
}
@media (max-width: 400px) {
  .sc-stats { grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .sc-stat .num { font-size: 0.9rem; }
  .sc-stat .num.tuition { font-size: 0.75rem; }
  .sc-stat .lbl { font-size: 0.75rem; }
}

/* ===== 骨架屏 ===== */
.sk-sc-logo { width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; }
.sk-sc-name { height: 16px; width: 120px; margin-bottom: 8px; }
.sk-sc-code { height: 12px; width: 90px; }
.sk-sc-num { height: 18px; width: 62px; margin-bottom: 8px; }
.sk-sc-lbl { height: 11px; width: 74px; }
.sk-sc-foot { margin-top: 16px; }
.sk-sc-btn { height: 30px; width: 104px; border-radius: 8px; display: inline-block; }
</style>
