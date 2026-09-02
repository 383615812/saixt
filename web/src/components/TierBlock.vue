<template>
  <div class="tier-block">
    <div class="tier-head">
      <span class="tier-badge" :class="color">{{ title }}</span>
      <span class="tier-count">{{ schools.length }} 所</span>
    </div>
    <div class="tier-grid">
      <router-link v-for="s in schools" :key="s.code" :to="`/schools/${s.code}`" class="card tier-card">
        <div class="tc-head">
          <div class="tc-logo">{{ s.name.replace('(民办)', '').slice(0, 2) }}</div>
          <div class="tc-info">
            <h4>{{ s.name.replace('(民办)', '') }}</h4>
            <span class="tc-meta">
              <span class="tag" :class="s.isPublic ? 'tag-green' : 'tag-amber'">{{ s.isPublic ? '公办' : '民办' }}</span>
              <span class="tag tag-blue">{{ s.region }}</span>
              <span class="tc-code">代码 {{ s.code }}</span>
            </span>
          </div>
        </div>

        <!-- 匹配度 -->
        <div class="tc-match">
          <div class="tc-match-head">
            <span>匹配度</span>
            <strong>{{ s.matchScore }}%</strong>
          </div>
          <div class="tc-match-track">
            <div class="tc-match-fill" :style="{ width: s.matchScore + '%' }"></div>
          </div>
        </div>

        <div class="tc-line">
          <div class="tc-line-item">
            <span class="tc-line-lbl">
              预估录取线
              <em v-if="s.estimateScore" class="tc-est-tag">官方参考</em>
            </span>
            <strong>{{ s.line }} 分</strong>
          </div>
          <div class="tc-line-item">
            <span class="tc-line-lbl">与你的分差</span>
            <strong :class="diffClass(s.diff)">{{ s.diff >= 0 ? '+' : '' }}{{ s.diff }}</strong>
          </div>
        </div>

        <!-- 匹配专业 -->
        <div v-if="s.matchMajors && s.matchMajors.length" class="tc-majors">
          <div class="tc-majors-lbl">匹配专业</div>
          <div class="tc-majors-chips">
            <span v-for="m in s.matchMajors" :key="m.name" class="major-chip">{{ m.name }}</span>
          </div>
        </div>

        <div class="tc-stats">
          <span>计划 {{ s.plans > 0 ? s.plans.toLocaleString() : '—' }} 人</span>
          <span>{{ s.majors > 0 ? s.majors : '—' }} 个专业</span>
          <span v-if="s.tuition_range" class="tc-tuition">
            {{ formatTuition(s.tuition_range) }}
            <span v-if="s.tuitionStatus === 'over'" class="tag tag-amber">略超预算</span>
          </span>
        </div>

        <!-- 推荐理由 -->
        <div v-if="s.reason" class="tc-reason">{{ s.reason }}</div>
      </router-link>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: String,
  color: { type: String, default: 'blue' },
  schools: { type: Array, default: () => [] }
})

function diffClass(diff) {
  if (diff < 0) return 'diff-neg'
  if (diff < 15) return 'diff-mid'
  return 'diff-pos'
}

// 统一学费区间格式：与院校库/院校详情一致，解析“万/元”混用数据，归一为 “x万元” 展示
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
      const val = parseFloat(m[0])
      return p.includes('万') ? val * 10000 : val
    })
  }
  const fmt = n => {
    const w = n / 10000
    return (Math.round(w * 100) / 100).toString().replace(/\.?0+$/, '') + '万'
  }
  if (yuan.length === 1) return fmt(yuan[0])
  return fmt(Math.min(...yuan)) + ' – ' + fmt(Math.max(...yuan))
}
</script>

<style scoped>
.tier-block { margin-bottom: 24px; }
.tier-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.tier-badge {
  padding: 5px 14px; border-radius: 999px; font-size: 0.88rem; font-weight: 700;
}
.tier-badge.red { background: var(--red-soft); color: #be123c; }
.tier-badge.blue { background: var(--accent-soft); color: var(--accent); }
.tier-badge.green { background: var(--green-soft); color: #047857; }
.tier-count { font-size: 0.85rem; color: var(--muted); }

.tier-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.tier-card { display: flex; flex-direction: column; gap: 12px; transition: transform 0.2s var(--ease), box-shadow 0.2s var(--ease); }
.tier-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: rgba(79, 95, 240, 0.24); }
.tier-card:active { transform: translateY(0) scale(0.985); }

.tc-head { display: flex; align-items: center; gap: 10px; }
.tc-logo {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  background: var(--grad-accent);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 0.85rem;
}
.tc-info h4 { font-size: 0.95rem; line-height: 1.4; }
.tc-meta { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
.tc-code { font-size: 0.75rem; color: var(--muted); }
.tag { font-size: 0.7rem; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
.tag-green { background: var(--green-soft); color: #047857; }
.tag-amber { background: var(--amber-soft, #fef3c7); color: #b45309; }
.tag-blue { background: var(--accent-soft); color: var(--accent); }

.tc-reason {
  font-size: 0.76rem; line-height: 1.55; color: var(--muted);
  padding: 8px 10px; border-radius: 8px; background: var(--bg, #f6f8fb);
}

.tc-match { display: flex; flex-direction: column; gap: 5px; }
.tc-match-head { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--muted); }
.tc-match-head strong { color: var(--accent); font-size: 0.9rem; }
.tc-match-track { height: 6px; border-radius: 999px; background: var(--bg, #eef1f6); overflow: hidden; }
.tc-match-fill {
  height: 100%; border-radius: 999px;
  background: var(--accent);
  transition: width 0.5s var(--ease);
}

.tc-line { display: flex; gap: 18px; padding: 10px 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
.tc-line-item { display: flex; flex-direction: column; gap: 2px; }
.tc-line-lbl { font-size: 0.72rem; color: var(--muted); }
.tc-est-tag {
  font-style: normal; margin-left: 4px; padding: 1px 6px;
  font-size: 0.66rem; font-weight: 600; color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-radius: 5px; vertical-align: 1px;
}
.tc-line-item strong { font-size: 1.05rem; font-variant-numeric: tabular-nums; }
.diff-neg { color: var(--red); }
.diff-mid { color: var(--amber); }
.diff-pos { color: var(--green); }

.tc-majors { display: flex; flex-direction: column; gap: 6px; }
.tc-majors-lbl { font-size: 0.72rem; color: var(--muted); }
.tc-majors-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.major-chip {
  font-size: 0.72rem; padding: 3px 9px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent); font-weight: 500;
}

.tc-stats { display: flex; justify-content: space-between; gap: 6px; flex-wrap: wrap; font-size: 0.76rem; color: var(--muted); }
.tc-tuition { display: inline-flex; align-items: center; gap: 5px; }

@media (max-width: 900px) {
  .tier-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .tier-grid { grid-template-columns: 1fr; }
}
</style>
