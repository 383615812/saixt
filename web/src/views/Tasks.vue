<template>
  <div class="container task-page">
    <div class="page-head">
      <h2>任务中心</h2>
      <p>每日完成小任务，养成学习习惯，稳步提升</p>
    </div>

    <!-- 加载骨架屏 -->
    <template v-if="loading">
      <div class="card progress-card">
        <div class="pc-main">
          <div class="skeleton sk-ring"></div>
          <div class="pc-info">
            <div class="skeleton sk-pc-title"></div>
            <div class="skeleton sk-pc-sub"></div>
          </div>
        </div>
        <div class="skeleton sk-pc-track"></div>
      </div>
      <div class="card task-list">
        <div v-for="i in 5" :key="i" class="task-item">
          <div class="skeleton sk-task-icon"></div>
          <div class="task-info">
            <div class="task-head">
              <div class="skeleton sk-task-name"></div>
              <div class="skeleton sk-task-status"></div>
            </div>
            <div class="skeleton sk-task-desc"></div>
            <div class="skeleton sk-task-track"></div>
          </div>
          <div class="skeleton sk-task-btn"></div>
        </div>
      </div>
    </template>
    <template v-else-if="loadFailed">
      <div class="card task-load-err">
        <p>任务加载失败，请稍后重试</p>
        <button class="btn btn-ghost btn-sm" @click="retry">重新加载</button>
      </div>
    </template>
    <template v-else>
      <!-- 全勤奖励 -->
      <div v-if="data.completed === data.total" class="card reward-banner">
        <div class="rb-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m20 13-2.5 1.5.5 3-2.5-1.5-2.5 1.5.5-3L10.5 13l2.5-1.5-.5-3 2.5 1.5 2.5-1.5-.5 3z"/><path d="M9 4 7.5 7 4 8l3.5 1L9 12l1.5-3L14 8l-3.5-1z"/></svg></div>
        <div class="rb-info">
          <h3>今日任务全部完成！</h3>
          <p>你已达成「全勤标兵」成就，坚持就是胜利</p>
        </div>
        <router-link to="/achievements" class="btn btn-primary btn-sm">查看成就</router-link>
      </div>

      <!-- 今日进度 -->
      <div class="card progress-card">
        <div class="pc-main">
          <div class="pc-ring" :style="{ '--pct': percent * 3.6 + 'deg' }">
            <span>{{ percent }}%</span>
          </div>
          <div class="pc-info">
            <h3>今日任务进度</h3>
            <p>已完成 {{ data.completed }} / {{ data.total }} 项任务</p>
            <span v-if="data.completed === data.total" class="pc-done"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>全部完成，太棒了</span>
            <span v-else class="pc-tip">坚持完成每日任务，离目标更近一步</span>
          </div>
        </div>
        <div class="pc-track">
          <div class="pc-fill" :style="{ width: percent + '%' }"></div>
        </div>
      </div>

      <!-- 任务列表 -->
      <div class="card task-list">
        <div v-if="!data.tasks.length" class="task-empty">
          <div class="te-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/></svg></div>
          <p>今天还没有任务</p>
          <p class="te-sub">去刷几道题，任务会自动生成</p>
          <router-link to="/practice" class="btn btn-primary btn-sm">去刷题</router-link>
        </div>
        <div v-for="t in data.tasks" :key="t.key" class="task-item" :class="{ done: t.done >= t.target }">
          <div class="task-icon">
            {{ t.icon }}
            <span v-if="t.done >= t.target" class="icon-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
          </div>
          <div class="task-info">
            <div class="task-head">
              <strong>{{ t.name }}</strong>
              <span class="task-status" :class="t.done >= t.target ? 'ok' : ''">
                {{ t.done >= t.target ? '已完成' : '进行中' }}
              </span>
            </div>
            <p class="task-desc">{{ t.desc }}</p>
            <div class="task-progress">
              <div class="tp-track">
                <div class="tp-fill" :style="{ width: taskPct(t) + '%' }"></div>
              </div>
              <span class="tp-num" :class="{ ok: t.done >= t.target }">{{ Math.min(t.done, t.target) }} / {{ t.target }}</span>
            </div>
          </div>
          <router-link :to="t.link" class="btn btn-sm task-btn" :class="t.done >= t.target ? 'btn-success' : 'btn-primary'">
            {{ t.done >= t.target ? '已完成' : t.done > 0 ? '继续完成' : '去完成' }}
          </router-link>
        </div>
      </div>

      <div class="card task-note">
        <strong>小贴士</strong>
        <p>任务每天 0 点重置。坚持每天完成全部任务，配合「学习计划」与「AI 学情分析」，备考效果更佳。</p>
      </div>
    </template>
  </div>
</template>

<script setup>

import { toast } from '../toast'
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'

const data = ref({ tasks: [], completed: 0, total: 5, percent: 0 })
const loading = ref(true)
const loadFailed = ref(false)

// 进度环 = 各任务完成度的平均值，与下方任务进度条一致
const percent = computed(() => {
  const tasks = data.value.tasks
  if (!tasks.length) return 0
  const sum = tasks.reduce((acc, t) => acc + Math.min(1, t.done / t.target), 0)
  return Math.round((sum / tasks.length) * 100)
})

function taskPct(t) {
  return Math.min(100, Math.round((t.done / t.target) * 100))
}

async function load() {
  loadFailed.value = false
  loading.value = true
  try {
    data.value = await api.get('/tasks')
  } catch (e) {
    toast(e.message || '加载失败，请稍后重试', 'error')
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}
const retry = load
onMounted(load)
</script>

<style scoped>
.task-page { max-width: 760px; }
.task-load-err { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 20px; color: var(--muted-2); font-size: 0.92rem; }
.page-head { text-align: center; margin-bottom: 26px; }
.page-head h2 { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.01em; }
.page-head p { color: var(--muted); margin-top: 4px; font-size: 0.92rem; }

.progress-card { padding: 24px 26px; margin-bottom: 16px; }

.reward-banner {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 18px 22px; margin-bottom: 16px;
  background: linear-gradient(135deg, var(--green-soft), var(--surface));
  border-color: rgba(13, 166, 120, 0.3);
}
.rb-icon { display: flex; align-items: center; justify-content: center; color: var(--amber); }
.rb-icon svg { width: 38px; height: 38px; }
.rb-info { flex: 1; min-width: 180px; }
.rb-info h3 { font-size: 1.1rem; color: var(--green); }
.rb-info p { color: var(--muted); font-size: 0.85rem; margin-top: 2px; }
.pc-main { display: flex; align-items: center; gap: 20px; margin-bottom: 18px; flex-wrap: wrap; }
.pc-ring {
  position: relative; width: 84px; height: 84px; border-radius: 50%; flex-shrink: 0;
  background: conic-gradient(var(--accent) var(--pct), var(--rule-soft) 0);
  display: flex; align-items: center; justify-content: center;
}
.pc-ring::before {
  content: ''; position: absolute; width: 64px; height: 64px; border-radius: 50%;
  background: var(--surface);
}
.pc-ring span { position: relative; font-size: 1.1rem; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
.pc-info { flex: 1; min-width: 200px; }
.pc-info h3 { font-size: 1.15rem; }
.pc-info p { color: var(--muted); font-size: 0.88rem; margin-top: 2px; }
.pc-done { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; color: var(--green); font-weight: 600; font-size: 0.9rem; }
.pc-done svg { width: 15px; height: 15px; }
.pc-tip { display: inline-block; margin-top: 6px; color: var(--muted); font-size: 0.82rem; }
.pc-track { height: 8px; border-radius: var(--radius-full); background: var(--rule-soft); overflow: hidden; }
.pc-fill { height: 100%; border-radius: var(--radius-full); background: var(--accent); transition: width 0.5s var(--ease); }

/* 骨架屏 */
.sk-ring { width: 84px; height: 84px; border-radius: 50%; flex-shrink: 0; }
.sk-pc-title { width: 160px; height: 20px; }
.sk-pc-sub { width: 200px; height: 13px; margin-top: 10px; }
.sk-pc-track { width: 100%; height: 8px; border-radius: var(--radius-full); margin-top: 18px; }
.sk-task-icon { width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; }
.sk-task-name { width: 120px; height: 16px; }
.sk-task-status { width: 64px; height: 18px; border-radius: 999px; }
.sk-task-desc { width: 78%; height: 12px; margin-top: 10px; }
.sk-task-track { width: 100%; height: 6px; border-radius: 999px; margin-top: 12px; }
.sk-task-btn { width: 76px; height: 32px; border-radius: var(--radius-sm); flex-shrink: 0; }

.task-list { padding: 12px 10px; margin-bottom: 16px; }
.task-item { position: relative; display: flex; align-items: center; gap: 14px; padding: 14px 12px; border-radius: 12px; transition: background 0.25s var(--ease), box-shadow 0.25s var(--ease); }
.task-item + .task-item::before { content: ''; position: absolute; left: 12px; right: 12px; top: 0; border-top: 1px dashed var(--rule-soft); }
.task-item:hover { background: color-mix(in srgb, var(--accent-soft) 46%, var(--surface)); box-shadow: var(--shadow-xs); }
.task-item:hover + .task-item::before { border-top-color: transparent; }
.task-icon {
  position: relative;
  width: 46px; height: 46px; border-radius: 13px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 1.3rem;
  background: var(--accent-soft);
  transition: background-color 0.25s var(--ease), transform 0.25s var(--ease);
}
.task-item.done .task-icon { background: var(--green-soft); }
.icon-badge {
  position: absolute; right: -5px; top: -5px;
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--green); color: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 6px rgba(13, 166, 120, 0.35);
}
.icon-badge svg { width: 10px; height: 10px; }
.task-info { flex: 1; min-width: 0; }
.task-head { display: flex; align-items: center; gap: 8px; }
.task-head strong { font-size: 1rem; }
.task-status {
  font-size: 0.72rem; font-weight: 600;
  padding: 2px 10px; border-radius: var(--radius-full);
  background: var(--accent-soft); color: var(--accent);
}
.task-status.ok { background: var(--green-soft); color: var(--green); }
.task-desc { color: var(--muted); font-size: 0.82rem; margin-top: 2px; }
.task-progress { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.tp-track { flex: 1; height: 6px; border-radius: var(--radius-full); background: var(--rule-soft); overflow: hidden; }
.tp-fill { height: 100%; border-radius: var(--radius-full); background: var(--accent); transition: width 0.4s var(--ease); }
.task-item.done .tp-fill { background: var(--green); }
.tp-num { font-size: 0.78rem; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.tp-num.ok { color: var(--green); font-weight: 700; }
.task-btn { flex-shrink: 0; }

.task-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 36px 20px; text-align: center; }
.te-icon { display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 16px; background: var(--accent-soft); color: var(--accent); margin-bottom: 6px; }
.te-icon svg { width: 26px; height: 26px; }
.task-empty p { color: var(--muted); font-size: 0.95rem; font-weight: 600; }
.task-empty .te-sub { color: var(--muted-2); font-size: 0.82rem; font-weight: 400; margin-bottom: 8px; }

.task-note { padding: 18px 22px; background: var(--amber-soft); border-color: transparent; }
.task-note strong { color: #b45309; font-size: 0.95rem; }
.task-note p { color: #b45309; font-size: 0.85rem; margin-top: 4px; line-height: 1.8; }

@media (max-width: 600px) {
  .page-head h2 { font-size: 1.3rem; }
  .page-head p { font-size: 0.82rem; }
  .progress-card { padding: 18px 16px; }
  .pc-ring { width: 60px; height: 60px; }
  .pc-ring::before { width: 46px; height: 46px; }
  .pc-ring span { font-size: 0.95rem; }
  .pc-info h3 { font-size: 1.05rem; }
  .pc-info p { font-size: 0.82rem; }
  .pc-main { gap: 14px; }
  .task-list { padding: 8px 4px; }
  .task-item { flex-wrap: wrap; gap: 10px; padding: 14px 12px; }
  .task-icon { width: 40px; height: 40px; font-size: 1.15rem; border-radius: 11px; }
  .task-head strong { font-size: 0.92rem; }
  .task-status { font-size: 0.72rem; }
  .task-desc { font-size: 0.78rem; }
  .tp-num { font-size: 0.74rem; }
  .task-btn { width: 100%; min-height: 40px; }
  .task-note { padding: 14px 16px; }
  .task-note strong { font-size: 0.9rem; }
  .task-note p { font-size: 0.82rem; }
}
@media (max-width: 400px) {
  .pc-ring { width: 52px; height: 52px; }
  .pc-ring::before { width: 40px; height: 40px; }
}
</style>
