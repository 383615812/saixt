<template>
  <div class="home">
    <!-- Hero -->
    <section class="hero">
      <div class="hero-bg" aria-hidden="true"></div>
      <div class="hero-blob hero-blob-a" aria-hidden="true"></div>
      <div class="hero-blob hero-blob-b" aria-hidden="true"></div>
      <div class="container hero-inner">
        <div class="hero-text">
          <span class="hero-badge hero-anim">云南省春季招生 · 2027 备考</span>
          <h1 class="hero-anim">刷题 · 排名 · 志愿推荐<br />一站式春招智能学习平台</h1>
          <p class="hero-anim">覆盖信息技术、通用技术及 11 门会考科目，每道题配解题讲解；收录全省 66 所高职院校、4.5 万个招生计划，帮你科学预测分数、精准填报志愿。</p>
          <div class="hero-actions hero-anim">
            <router-link to="/practice" class="btn btn-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              立即开始刷题
            </router-link>
            <router-link to="/ai" class="btn btn-ghost">AI 答疑</router-link>
            <router-link to="/recommend" class="btn btn-ghost">志愿推荐</router-link>
          </div>
          <div class="hero-trust hero-anim">
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>真题讲解</span>
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>错题追踪</span>
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>数据预测</span>
          </div>
        </div>
        <div class="hero-card hero-anim">
          <div class="hc-glow" aria-hidden="true"></div>
          <div class="hc-head">
            <span class="hc-title">2027 春招考试构成</span>
            <span class="tag tag-blue">满分 600 分</span>
          </div>
          <div class="hc-item">
            <div class="hc-label"><strong>文化素质</strong><span>11 门会考科目等级量化</span></div>
            <div class="hc-bar"><div class="hc-fill hc-fill-a" style="width:50%"></div></div>
            <div class="hc-num">300 分</div>
          </div>
          <div class="hc-item">
            <div class="hc-label"><strong>职业技能</strong><span>信息技术 + 通用技术</span></div>
            <div class="hc-bar"><div class="hc-fill hc-fill-b" style="width:50%"></div></div>
            <div class="hc-num">300 分</div>
          </div>
          <div class="hc-sub">
            <span>信息技术 150 分</span><span>通用技术 150 分</span>
          </div>
          <div class="hc-foot">
            <span>先刷题摸清底细</span>
            <router-link to="/practice" class="hc-link">去刷题 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></router-link>
          </div>
        </div>
      </div>
    </section>

    <!-- Countdown -->
    <section class="container">
      <div class="countdown" :class="{ passed: countdown.passed }">
        <div class="cd-label">
          <span class="cd-kicker">{{ countdown.passed ? '备考进行时' : '春招倒计时' }}</span>
          <strong>{{ countdown.passed ? '2027 春招考试已开始' : '距离 2027 春招考试还有' }}</strong>
          <span class="cd-sub">预计三月开考 · 以云南省招生考试院公布为准</span>
        </div>
        <div v-if="!countdown.passed" class="cd-nums">
          <div class="cd-num"><div class="cd-v">{{ countdown.days }}</div><div class="cd-u">天</div></div>
          <div class="cd-sep">:</div>
          <div class="cd-num"><div class="cd-v">{{ String(countdown.hours).padStart(2, '0') }}</div><div class="cd-u">时</div></div>
          <div class="cd-sep">:</div>
          <div class="cd-num"><div class="cd-v">{{ String(countdown.minutes).padStart(2, '0') }}</div><div class="cd-u">分</div></div>
          <div class="cd-sep">:</div>
          <div class="cd-num"><div class="cd-v">{{ String(countdown.seconds).padStart(2, '0') }}</div><div class="cd-u">秒</div></div>
        </div>
      </div>
    </section>

    <!-- 登录用户学习概览（骨架屏） -->
    <section v-if="user && overviewLoading" class="container">
      <div class="card overview">
        <div class="ov-head">
          <div class="skeleton sk-ov-title"></div>
          <div class="skeleton sk-ov-chip"></div>
        </div>
        <div class="ov-grid">
          <div v-for="i in 4" :key="i" class="ov-item">
            <div class="skeleton sk-ov-num"></div>
            <div class="skeleton sk-ov-lbl"></div>
          </div>
        </div>
        <div class="ov-actions">
          <div v-for="i in 3" :key="i" class="skeleton sk-ov-btn"></div>
        </div>
      </div>
    </section>

    <!-- 登录用户学习概览 -->
    <section v-if="user && overview" class="container">
      <div class="card overview">
        <div class="ov-head">
          <h3>学习概览</h3>
          <span v-if="overview.streak > 0" class="ov-streak"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>连续打卡 {{ overview.streak }} 天</span>
          <span v-else class="ov-streak off"><span class="ov-user">{{ user.nickname }}</span> · <button class="ov-checkin" @click="goTasks">今日去打卡保持节奏</button></span>
        </div>
        <div class="ov-grid">
          <div class="ov-item"><div class="ov-num">{{ overview.total }}</div><div class="ov-lbl">累计答题</div></div>
          <div class="ov-item"><div class="ov-num">{{ overview.accuracy }}%</div><div class="ov-lbl">正确率</div></div>
          <div class="ov-item"><div class="ov-num">{{ overview.predict }}</div><div class="ov-lbl">职业技能预测</div></div>
          <div class="ov-item">
            <router-link v-if="overview.totalScore == null" to="/dashboard" class="ov-link">去测评 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 12h14M13 6l6 6-6 6"/></svg></router-link>
            <div v-else class="ov-num">{{ overview.totalScore }}</div>
            <div class="ov-lbl">总分测算</div>
          </div>
        </div>

        <!-- 本周学习对比 -->
        <div v-if="weekly" class="ov-week">
          <div class="ow-head">
            <span class="ow-title">本周学习</span>
            <span class="ow-sub">与上周对比</span>
          </div>
          <div class="ow-grid">
            <div class="ow-item">
              <div class="ow-num">
                {{ weekly.thisWeek.total }}
                <span class="ow-delta" :class="deltaClass(weekly.thisWeek.total - weekly.lastWeek.total)">
                  {{ deltaText(weekly.thisWeek.total - weekly.lastWeek.total) }}
                </span>
              </div>
              <div class="ow-lbl">本周答题</div>
              <div class="ow-bar">
                <div class="ow-fill" :style="{ width: barPct(weekly.thisWeek.total, Math.max(weekly.thisWeek.total, weekly.lastWeek.total)) }"></div>
              </div>
            </div>
            <div class="ow-item">
              <div class="ow-num">
                {{ weekly.thisWeek.accuracy }}%
                <span class="ow-delta" :class="deltaClass(weekly.thisWeek.accuracy - weekly.lastWeek.accuracy)">
                  {{ deltaText(weekly.thisWeek.accuracy - weekly.lastWeek.accuracy) }}
                </span>
              </div>
              <div class="ow-lbl">本周正确率</div>
              <div class="ow-bar">
                <div class="ow-fill" :style="{ width: barPct(weekly.thisWeek.accuracy, 100) }"></div>
              </div>
            </div>
            <div class="ow-item">
              <div class="ow-num">
                {{ weekly.thisWeek.checkinDays }} 天
                <span class="ow-delta" :class="deltaClass(weekly.thisWeek.checkinDays - weekly.lastWeek.checkinDays)">
                  {{ deltaText(weekly.thisWeek.checkinDays - weekly.lastWeek.checkinDays) }}
                </span>
              </div>
              <div class="ow-lbl">本周打卡</div>
              <div class="ow-bar">
                <div class="ow-fill" :style="{ width: barPct(weekly.thisWeek.checkinDays, 7) }"></div>
              </div>
            </div>
            <div class="ow-item">
              <div class="ow-num">
                {{ weekly.thisWeek.examCount }} 次
                <span class="ow-delta" :class="deltaClass(weekly.thisWeek.examCount - weekly.lastWeek.examCount)">
                  {{ deltaText(weekly.thisWeek.examCount - weekly.lastWeek.examCount) }}
                </span>
              </div>
              <div class="ow-lbl">本周模拟考</div>
              <div class="ow-bar">
                <div class="ow-fill" :style="{ width: barPct(weekly.thisWeek.examCount, Math.max(weekly.thisWeek.examCount, weekly.lastWeek.examCount, 1)) }"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="ov-actions">
          <router-link to="/practice" class="btn btn-primary">继续刷题</router-link>
          <router-link to="/tasks" class="btn btn-ghost">今日任务</router-link>
          <router-link to="/ai-practice" class="btn btn-ghost">AI 练习</router-link>
          <router-link to="/dashboard" class="btn btn-ghost">学习报告</router-link>
          <router-link to="/recommend" class="btn btn-ghost">志愿推荐</router-link>
        </div>
      </div>
    </section>

    <!-- 志愿速查：依据预估总分实时推荐冲稳保院校（登录且有分时显示） -->
    <section v-if="user && rec.ready && !rec.loading" class="container">
      <div class="card rec-quick">
        <div class="rq-head">
          <h3>目标院校速查</h3>
          <span class="rq-score">按预估总分 <strong>{{ rec.score }}</strong> 分</span>
        </div>
        <div v-if="rec.total === 0" class="rq-empty">
          <p>当前分数暂无可匹配院校，去 <router-link to="/practice">多刷题提分</router-link>，或 <router-link to="/recommend">调整筛选条件</router-link></p>
        </div>
        <div v-else>
          <div v-for="t in rec.tiers" :key="t.key" class="rq-tier">
            <div class="rq-tier-head">
              <span class="rq-tag" :class="t.color">{{ t.title }}</span>
              <span class="rq-count">{{ t.items.length }} 所</span>
            </div>
            <div class="rq-list">
              <router-link v-for="s in t.items" :key="s.code" :to="`/schools/${s.code}`" class="rq-item">
                <span class="rq-name">{{ s.name.replace(/^\(民办\)/, '') }}</span>
                <span v-if="s.region" class="rq-region">{{ s.region }}</span>
                <span v-if="s.estimateScore" class="rq-line">{{ s.estimateScore }}</span>
                <span class="rq-diff" :class="rqDiffClass(s.diff)">{{ s.diff >= 0 ? '+' : '' }}{{ s.diff }}</span>
              </router-link>
            </div>
          </div>
          <div class="rq-more">
            <router-link to="/recommend" class="btn btn-ghost btn-sm">查看完整冲稳保方案 →</router-link>
          </div>
        </div>
      </div>
    </section>

    <!-- 每日一练 -->
    <section class="container">
      <div class="card daily" :class="{ done: daily.done }">
        <div class="daily-main">
          <div class="daily-icon">{{ daily.done ? '✓' : '今' }}</div>
          <div class="daily-info">
            <h3>每日一练 · {{ daily.date }}</h3>
            <p>{{ dailyTip }}</p>
            <div v-if="daily.done" class="daily-done-tip">今日已完成 {{ daily.answeredToday }} 题，坚持就是胜利！</div>
            <div v-else-if="weakChapters.length" class="daily-weak">
              <span class="daily-weak-lbl">今日重点：</span>
              <router-link
                v-for="w in weakChapters"
                :key="w.subject + ':' + w.chapter"
                :to="'/ai-practice?subject=' + encodeURIComponent(w.subject) + '&chapter=' + encodeURIComponent(w.chapter)"
                class="tag tag-red weak-link"
                @click.stop
              >{{ w.subject }} · {{ w.chapter }} <span class="weak-link-arrow">»</span></router-link>
              <span class="weak-link-hint">点击即可生成针对性练习</span>
            </div>
          </div>
        </div>
        <router-link v-if="!daily.done" to="/practice?daily=1" class="btn btn-primary">开始今日练习</router-link>
        <router-link v-else to="/practice" class="btn btn-ghost">继续刷题</router-link>
      </div>
    </section>

    <!-- Stats -->
    <section class="container">
      <div v-if="statsLoading" class="stats">
        <div v-for="i in 4" :key="i" class="stat sk-stat">
          <div class="skeleton sk-num"></div>
          <div class="skeleton sk-lbl"></div>
        </div>
      </div>
      <div v-else-if="statsFailed" class="stats-err">
        <p>统计数据加载失败</p>
        <button class="btn btn-ghost btn-sm" @click="loadStats">点击重试</button>
      </div>
      <div v-else class="stats" v-reveal>
        <div class="stat">
          <span class="stat-ic ic-indigo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3z"/></svg></span>
          <div class="num">600</div><div class="lbl">春招考试满分</div>
        </div>
        <div class="stat">
          <span class="stat-ic ic-blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/><path d="M22 10v6"/></svg></span>
          <div class="num">{{ stats.schools ?? '—' }}</div><div class="lbl">收录高职院校</div>
        </div>
        <div class="stat">
          <span class="stat-ic ic-green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg></span>
          <div class="num">{{ stats.plans ?? '—' }}</div><div class="lbl">招生计划</div>
        </div>
        <div class="stat">
          <span class="stat-ic ic-amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span>
          <div class="num">{{ displayQuestions.toLocaleString() }}</div><div class="lbl">真实题目（持续更新）</div>
        </div>
      </div>
    </section>

    <!-- 题库科目分布（骨架屏） -->
    <section v-if="statsLoading" class="container">
      <div class="card bank-overview">
        <div class="bo-head">
          <div>
            <div class="skeleton sk-bo-title"></div>
            <div class="skeleton sk-bo-sub"></div>
          </div>
          <div class="skeleton sk-bo-btn"></div>
        </div>
        <div class="bo-grid">
          <div v-for="i in 6" :key="i" class="bo-item">
            <div class="bo-top">
              <div class="skeleton sk-bo-name"></div>
              <div class="skeleton sk-bo-count"></div>
            </div>
            <div class="skeleton sk-bo-track"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- 题库科目分布 -->
    <section v-if="subjectDist.length" class="container">
      <div class="card bank-overview" v-reveal>
        <div class="bo-head">
          <div>
            <h3>题库科目分布</h3>
            <span class="bo-sub">共 {{ stats.questions.toLocaleString() }} 道真题与优质练习题，覆盖职业技能测试与全部会考科目</span>
          </div>
          <router-link to="/bank" class="btn btn-ghost btn-sm">进入题库 →</router-link>
        </div>
        <div class="bo-grid">
          <div v-for="s in subjectDist" :key="s.subject" class="bo-item" role="button" tabindex="0" @click="goPractice(s.subject)" @keydown.enter.prevent="goPractice(s.subject)">
            <div class="bo-top">
              <span class="bo-name">{{ s.subject }}</span>
              <span class="bo-count">{{ s.count.toLocaleString() }} 题</span>
            </div>
            <div class="bo-track">
              <div class="bo-fill" :style="{ width: s.pct + '%', background: s.color }"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="container">
      <div class="sec-head">
        <h2>六大核心能力</h2>
        <p>学 · 练 · 测 · 评 · 报 · 问 完整闭环</p>
      </div>
      <div class="feat-grid">
        <div v-for="(f, i) in features" :key="f.title" class="feat" v-reveal="(i % 3) * 80">
          <div class="feat-icon" :style="f.iconStyle" v-html="f.icon"></div>
          <h3>{{ f.title }}</h3>
          <p>{{ f.desc }}</p>
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section class="container">
      <div class="sec-head">
        <h2>三步开启备考</h2>
        <p>从注册到报考，全程指引</p>
      </div>
      <div class="steps">
        <div v-for="(s, i) in steps" :key="s.title" class="step" v-reveal="i * 100">
          <div class="step-no">{{ s.no }}</div>
          <h3>{{ s.title }}</h3>
          <p>{{ s.desc }}</p>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="container">
      <div class="cta" v-reveal>
        <div>
          <h2>2027 春招备考，现在开始</h2>
          <p>每年 1—2 万考生参加春招培训，早一步刷题，多一分把握。</p>
        </div>
        <router-link to="/login?mode=register" class="btn btn-primary">免费注册</router-link>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api, getUser } from '../api'

const user = ref(getUser() || null)
const router = useRouter()
const overview = ref(null)
const overviewLoading = ref(false)
const weekly = ref(null)
const now = ref(Date.now())
const daily = ref({ date: '', count: 0, done: false, answeredToday: 0 })
const weakChapters = ref([])
const stats = ref({ schools: null, plans: null, questions: 0 })
const subjectDist = ref([])
const displayQuestions = ref(0)
const statsLoading = ref(true)
const statsFailed = ref(false)
// 目标院校速查
const rec = ref({ ready: false, loading: false, score: null, total: 0, tiers: [] })

const vReveal = {
  mounted(el, binding) {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('reveal-in')
      return
    }
    el.classList.add('reveal')
    if (binding.value) el.style.transitionDelay = binding.value + 'ms'
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          el.classList.add('reveal-in')
          io.unobserve(el)
        }
      })
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' })
    io.observe(el)
  }
}

const SUBJECT_COLORS = {
  '生物': '#10b981',
  '历史': '#f59e0b',
  '物理': '#60a5fa',
  '化学': '#22d3ee',
  '语文': '#fb7185',
  '政治': '#a78bfa',
  '地理': '#34d399',
  '数学': '#f472b6',
  '英语': '#fbbf24',
  '通用技术': '#6d28d9',
  '信息技术': '#4f5ff0',
}
const DEFAULT_COLOR = '#4f5ff0'

const features = [
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/></svg>', title: '在线刷题', desc: '信息技术、通用技术与 11 门会考科目专项练习，每道题配解题讲解与知识点注释。', iconStyle: 'background:var(--accent-soft);color:var(--accent)' },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/><path d="M22 10v6"/></svg>', title: '院校专业库', desc: '收录云南省 66 所高职院校，专业、学费、招生计划一查便知。', iconStyle: 'background:rgba(37, 99, 235, 0.09);color:#2563eb' },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>', title: '分数预测', desc: '根据刷题正确率与模拟成绩，预测职业技能得分，估算文化素质折算分与总分。', iconStyle: 'background:var(--green-soft);color:var(--green)' },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>', title: '全省排名', desc: '基于平台用户池的全省排名，让你清楚自己处于什么位置，备考更有方向。', iconStyle: 'background:var(--amber-soft);color:var(--amber)' },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>', title: '志愿推荐', desc: '结合平行志愿规则，按冲刺 / 稳妥 / 保底梯度推荐可报考的院校与专业。', iconStyle: 'background:var(--red-soft);color:var(--red)' },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>', title: 'AI 智能答疑', desc: 'AI 老师随时在线，解答学科知识点、考试政策与备考规划，不懂就问。', iconStyle: 'background:var(--accent);color:#fff' }
]
const steps = [
  { no: 1, title: '注册登录', desc: '手机号一键注册，建立个人学习档案，设定目标院校与目标分数。' },
  { no: 2, title: '刷题提分', desc: '按科目、章节专项练习，错题自动入错题本，正确率实时统计。' },
  { no: 3, title: '预测报考', desc: '查看预测得分与排名，匹配院校专业库，生成志愿填报方案。' }
]

const EXAM_DATE = ref(new Date('2027-03-20T00:00:00'))
const countdown = computed(() => {
  const diff = EXAM_DATE.value - now.value
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, passed: true }
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    passed: false
  }
})
const dailyTip = computed(() => {
  if (weakChapters.value.length) return `今日推荐 ${daily.value.count} 道题，优先巩固你的薄弱知识点`
  return `今日推荐 ${daily.value.count} 道题，坚持每日一练，稳步提升`
})

function goPractice(subject) {
  router.push({ name: 'practice', query: { subject } })
}

function goTasks() {
  router.push({ name: 'tasks' })
}

function deltaClass(diff) {
  if (diff > 0) return 'up'
  if (diff < 0) return 'down'
  return 'flat'
}

// 志愿速查：按预估总分拉取冲稳保院校（每档取前 3 所示例）；无数分时不渲染区块以免打扰
async function loadQuickRec(totalScore) {
  if (!totalScore) { rec.value = { ready: false, loading: false, score: null, total: 0, tiers: [] }; return }
  rec.value = { ready: false, loading: true, score: totalScore, total: 0, tiers: [] }
  try {
    const d = await api.get(`/recommend?score=${encodeURIComponent(totalScore)}&limit=3`)
    const tiers = [
      { key: 'chong', title: '冲', color: 'chong', items: (d.tiers?.chong || []).slice(0, 3) },
      { key: 'wen', title: '稳', color: 'wen', items: (d.tiers?.wen || []).slice(0, 3) },
      { key: 'bao', title: '保', color: 'bao', items: (d.tiers?.bao || []).slice(0, 3) }
    ].filter(t => t.items.length)
    rec.value = { ready: true, loading: false, score: totalScore, total: d.total || 0, tiers }
  } catch (e) {
    // 速查为辅助信息，失败时静默隐藏区块，不打扰访客
    rec.value = { ready: false, loading: false, score: null, total: 0, tiers: [] }
  }
}

function rqDiffClass(diff) {
  if (diff < 0) return 'rq-diff-up'
  if (diff >= 15) return 'rq-diff-safe'
  return 'rq-diff-fit'
}
function deltaText(diff) {
  if (diff > 0) return `+${diff}`
  if (diff < 0) return `${diff}`
  return '持平'
}
function barPct(value, max) {
  if (!max) return '0%'
  return Math.min(100, Math.round((value / max) * 100)) + '%'
}

function animateCount(target) {
  const duration = 1200
  const start = performance.now()
  const from = 0
  function step(now) {
    const elapsed = now - start
    const progress = Math.min(elapsed / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    displayQuestions.value = Math.round(from + (target - from) * eased)
    if (progress < 1) requestAnimationFrame(step)
    else displayQuestions.value = target
  }
  requestAnimationFrame(step)
}

let timer = null
async function loadStats() {
  statsLoading.value = true
  statsFailed.value = false
  try {
    const [meta, schools] = await Promise.all([
      api.get('/questions/meta'),
      api.get('/schools?limit=1')
    ])
    if (meta.platform?.examDate) EXAM_DATE.value = new Date(meta.platform.examDate + 'T00:00:00')
    const totalQ = (meta.subjects || []).reduce((s, x) => s + x.count, 0)
    stats.value = {
      schools: schools.total || null,
      plans: schools.plans_total ? (schools.plans_total >= 10000 ? (schools.plans_total / 10000).toFixed(1) + '万' : String(schools.plans_total)) : null,
      questions: totalQ
    }
    animateCount(totalQ)
    const total = totalQ || 1
    subjectDist.value = (meta.subjects || [])
      .map(s => ({ ...s, pct: Math.round((s.count / total) * 100), color: SUBJECT_COLORS[s.subject] || DEFAULT_COLOR }))
      .sort((a, b) => b.count - a.count)
  } catch (e) {
    console.warn('[home] 统计数据获取失败:', e.message)
    statsFailed.value = true
  } finally {
    statsLoading.value = false
  }
}

onMounted(async () => {
  timer = setInterval(() => { now.value = Date.now() }, 1000)
  // 获取真实统计数据
  await loadStats()
  try {
    const [d, mk] = await Promise.all([
      api.get('/daily'),
      user.value ? api.get('/stats/mastery') : Promise.resolve({ list: [], weak: [] })
    ])
    daily.value = { date: d.date, count: d.count, done: false, answeredToday: 0 }
    weakChapters.value = (mk.weak || []).slice(0, 3)
    if (user.value) {
      try {
        const ds = await api.get('/practice/daily-status')
        daily.value.done = ds.done
        daily.value.answeredToday = ds.answeredToday
      } catch (e) { console.warn('[home] 每日状态获取失败:', e.message) }
    }
  } catch (e) { console.warn('[home] 每日一练获取失败:', e.message) }
  if (user.value) {
    overviewLoading.value = true
    try {
      const [me, ck, dash] = await Promise.all([
        api.get('/stats/me'),
        api.get('/checkin/me'),
        api.get('/stats/dashboard').catch(() => null)
      ])
      overview.value = {
        total: me.total,
        accuracy: me.accuracy,
        predict: me.predict.total,
        totalScore: me.totalScore,
        streak: ck.streak
      }
      if (me.totalScore) loadQuickRec(me.totalScore)
      if (dash && dash.weeklyCompare) weekly.value = dash.weeklyCompare
    } catch (e) { console.warn('[home] 学习概览获取失败:', e.message) }
    finally { overviewLoading.value = false }
  }
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<style scoped>
.hero {
    padding: 56px 0 40px; position: relative; overflow: hidden;
    background: linear-gradient(180deg, rgba(79, 95, 240, 0.045) 0%, rgba(255, 255, 255, 0) 100%);
    border-bottom: 1px solid var(--rule-soft);
    border-radius: 0 0 28px 28px;
  }
  .hero-bg {
    position: absolute; inset: 0; pointer-events: none;
    background-image:
      radial-gradient(620px 300px at 88% -30%, rgba(79, 95, 240, 0.07) 0%, transparent 70%),
      radial-gradient(560px 280px at -8% 10%, rgba(79, 95, 240, 0.05) 0%, transparent 70%);
    opacity: 0.85;
  }
  .hero-blob {
    position: absolute; border-radius: 50%; pointer-events: none;
    filter: blur(2px); opacity: 0.5;
  }
  .hero-blob-a {
    width: 220px; height: 220px; top: -70px; right: 6%;
    background: radial-gradient(circle, rgba(79, 95, 240, 0.12) 0%, transparent 65%);
    animation: blobFloat 9s var(--ease) infinite;
  }
  .hero-blob-b {
    width: 160px; height: 160px; bottom: -50px; left: 4%;
    background: radial-gradient(circle, rgba(107, 88, 232, 0.1) 0%, transparent 65%);
    animation: blobFloat 11s var(--ease) infinite reverse;
  }
  @keyframes blobFloat {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(14px, -18px) scale(1.06); }
  }
  @media (prefers-reduced-motion: reduce) {
    .hero-blob { animation: none; }
  }
.hero-inner { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 44px; align-items: center; position: relative; }
.hero-badge {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 0.75rem; font-weight: 600; color: var(--accent);
  background: var(--surface);
  border: 1px solid var(--rule);
  box-shadow: var(--shadow-xs);
  padding: 5px 14px; border-radius: var(--radius-full); margin-bottom: 20px;
  letter-spacing: 0.04em;
}
.hero-badge::before {
  content: ''; width: 6px; height: 6px; border-radius: 50%;
  background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft);
  animation: pulseDot 2.2s var(--ease) infinite;
}
@keyframes pulseDot {
  0%, 100% { box-shadow: 0 0 0 0 rgba(79, 95, 240, 0.35); }
  50% { box-shadow: 0 0 0 5px rgba(79, 95, 240, 0); }
}
.hero h1 {
  font-size: clamp(1.7rem, 3.8vw, 2.5rem); line-height: 1.34; margin-bottom: 16px;
  font-weight: 750; letter-spacing: -0.018em;
}
.hero-text p { color: var(--muted); font-size: 0.99rem; max-width: 540px; margin-bottom: 22px; line-height: 1.78; }
.hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }
.hero-actions svg { width: 17px; height: 17px; }
.hero-trust { display: flex; align-items: center; gap: 18px; margin-top: 20px; flex-wrap: wrap; }
.hero-trust span {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.8rem; color: var(--muted); font-weight: 500;
}
.hero-trust svg { width: 14px; height: 14px; color: var(--green); }

.hero-anim { animation: heroIn 0.7s var(--ease-out) both; }
.hero-text .hero-anim:nth-child(1) { animation-delay: 0.05s; }
.hero-text .hero-anim:nth-child(2) { animation-delay: 0.15s; }
.hero-text .hero-anim:nth-child(3) { animation-delay: 0.25s; }
.hero-text .hero-anim:nth-child(4) { animation-delay: 0.3s; }
.hero-text .hero-anim:nth-child(5) { animation-delay: 0.35s; }
.hero-card.hero-anim { animation-delay: 0.2s; }
@keyframes heroIn { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .hero-anim { animation: none; }
}

.hero-card {
    position: relative;
    background: var(--surface);
    border: 1px solid rgba(79, 95, 240, 0.14);
    border-radius: var(--radius-lg); padding: 26px;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }
  .hc-glow {
    position: absolute; top: -60px; right: -60px;
    width: 180px; height: 180px; border-radius: 50%;
    background: radial-gradient(circle, rgba(79, 95, 240, 0.1) 0%, transparent 65%);
    pointer-events: none;
  }
  .hc-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; font-weight: 600;
font-size: 0.95rem; color: var(--ink); }
  .hc-title { position: relative; padding-left: 12px; }
  .hc-title::before {
    content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
    width: 4px; height: 16px; border-radius: 2px;
    background: var(--grad-accent);
  }
  .hc-item { margin-bottom: 16px; }
  .hc-label { display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 7px; }
  .hc-label strong { color: var(--ink); font-weight: 650; }
  .hc-label span { color: var(--muted); font-size: 0.8rem; }
  .hc-bar { height: 8px; background: var(--rule-soft); border-radius: var(--radius-full); overflow: hidden; }
  .hc-fill { height: 100%; border-radius: var(--radius-full); transition: width 0.7s var(--ease); }
  .hc-fill-a { background: linear-gradient(90deg, #4f5ff0, #6b58e8); }
  .hc-fill-b { background: linear-gradient(90deg, #0da678, #34d399); }
  .hc-num { text-align: right; font-weight: 700; color: var(--accent); margin-top: 5px; font-variant-numeric: tabular-nums; }
  .hc-sub { display: flex; justify-content: space-between; color: var(--muted); font-size: 0.85rem; border-top: 1px dashed var(--rule); padding-top: 14px; }
  .hc-foot {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--rule-soft);
    font-size: 0.82rem; color: var(--muted-2);
  }
  .hc-link {
    display: inline-flex; align-items: center; gap: 4px;
    font-weight: 600; color: var(--accent);
  }
  .hc-link svg { width: 14px; height: 14px; transition: transform 0.25s var(--ease); }
  .hc-link:hover svg { transform: translateX(3px); }

.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0 52px; }
.stats-err { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; margin: 24px 0 52px; padding: 24px 0; color: var(--muted-2); font-size: 0.9rem; border: 1px dashed var(--rule); border-radius: 12px; }

.reveal { opacity: 0; transform: translateY(26px); transition: opacity 0.6s var(--ease-out), transform 0.6s var(--ease-out); }
.reveal-in { opacity: 1; transform: translateY(0); }

.sk-stat { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.sk-num { width: 70px; height: 28px; }
.sk-lbl { width: 90px; height: 14px; }

/* 学习概览骨架屏 */
.sk-ov-title { width: 220px; height: 22px; }
.sk-ov-chip { width: 140px; height: 20px; }
.sk-ov-num { width: 64px; height: 28px; margin: 0 auto; }
.sk-ov-lbl { width: 72px; height: 12px; margin: 6px auto 0; }
.sk-ov-btn { width: 120px; height: 36px; border-radius: var(--radius-sm); }

/* 题库科目分布骨架屏 */
.sk-bo-title { width: 180px; height: 22px; }
.sk-bo-sub { width: 320px; height: 13px; margin-top: 8px; }
.sk-bo-btn { width: 96px; height: 34px; border-radius: var(--radius-sm); }
.sk-bo-name { width: 120px; height: 15px; }
.sk-bo-count { width: 70px; height: 13px; }
.sk-bo-track { width: 100%; height: 8px; border-radius: var(--radius-full); margin-top: 10px; }

.countdown {
  display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;
  margin: 24px 0 0; padding: 22px 30px; border-radius: var(--radius);
  background: var(--grad-ink);
  color: #fff;
  box-shadow: 0 8px 28px rgba(30, 37, 71, 0.28);
  position: relative; overflow: hidden;
}
.countdown::before {
  content: ''; position: absolute; top: -70%; right: -8%; width: 300px; height: 300px;
  background: radial-gradient(circle, rgba(129, 140, 248, 0.26) 0%, transparent 65%);
  border-radius: 50%;
}
.countdown::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
}
.countdown.passed { background: linear-gradient(135deg, #047857, #0da678); box-shadow: 0 8px 28px rgba(13, 166, 120, 0.28); }
.cd-label { display: flex; flex-direction: column; position: relative; }
.cd-kicker {
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.14em;
  text-transform: uppercase; opacity: 0.75; margin-bottom: 3px;
}
.cd-label strong { font-size: 1.18rem; letter-spacing: 0.01em; }
.cd-sub { font-size: 0.78rem; opacity: 0.72; margin-top: 3px; }
.cd-nums { display: flex; align-items: center; gap: 10px; position: relative; }
.cd-num { text-align: center; }
.cd-v {
  min-width: 56px; padding: 9px 10px; border-radius: 12px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.08) 60%, rgba(255, 255, 255, 0.04) 100%);
  border: 1px solid rgba(255, 255, 255, 0.16);
  font-size: 1.6rem; font-weight: 800; font-variant-numeric: tabular-nums;
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 -1px 0 rgba(255, 255, 255, 0.06), 0 2px 6px rgba(0, 0, 0, 0.12);
}
.cd-u { font-size: 0.72rem; opacity: 0.8; margin-top: 2px; letter-spacing: 0.06em; }
.cd-sep { font-size: 1.4rem; font-weight: 700; opacity: 0.55; margin-bottom: 14px; }

.overview { margin: 20px 0 0; padding: 24px 28px; }
.ov-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.ov-head h3 { font-size: 1.15rem; }
.ov-streak { font-size: 0.88rem; color: var(--amber); font-weight: 600; }
.ov-user { color: var(--accent); font-weight: 700; }
.ov-streak.off { color: var(--muted); font-weight: 500; }
.ov-checkin {
  border: none; background: none; padding: 0; cursor: pointer;
  color: var(--accent); font-size: 0.88rem; font-weight: 600; font-family: inherit;
  transition: color 0.2s var(--ease), text-decoration-color 0.2s var(--ease);
}
.ov-checkin:hover { color: var(--accent-deep); text-decoration: underline; text-underline-offset: 3px; }
.ov-checkin:active { transform: scale(0.98); }
.ov-checkin:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
.ov-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
.ov-item { text-align: center; padding: 14px 10px; border-radius: 12px; background: var(--accent-soft); transition: transform 0.25s var(--ease); }
.ov-item:hover { transform: translateY(-2px); }
.ov-num { font-size: 1.5rem; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
.ov-lbl { font-size: 0.8rem; color: var(--muted); margin-top: 2px; }
.ov-link {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 1.02rem; font-weight: 700; color: var(--accent);
  padding: 2px 0; min-height: 30px;
}
.ov-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.ov-actions { display: flex; gap: 10px; flex-wrap: wrap; }

/* 目标院校速查 */
.rec-quick { padding: 20px 22px; }
.rq-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.rq-head h3 { font-size: 1.08rem; font-weight: 650; margin: 0; }
.rq-score { font-size: 0.82rem; color: var(--muted); }
.rq-score strong { color: var(--accent); font-size: 1rem; margin: 0 2px; }
.rq-tier { margin-bottom: 14px; }
.rq-tier:last-child { margin-bottom: 0; }
.rq-tier-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.rq-tag {
  padding: 2px 10px; border-radius: 999px; font-size: 0.76rem; font-weight: 600; color: #fff;
}
.rq-tag.chong { background: var(--red); }
.rq-tag.wen { background: var(--green); }
.rq-tag.bao { background: var(--accent); }
.rq-count { font-size: 0.76rem; color: var(--muted); }
.rq-list { display: flex; flex-direction: column; border: 1px solid var(--rule); border-radius: 12px; overflow: hidden; }
.rq-item {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  border-bottom: 1px solid var(--rule); transition: background-color 0.2s var(--ease);
}
.rq-item:last-child { border-bottom: none; }
.rq-item:hover { background: var(--accent-soft); }
.rq-name { flex: 1 1 auto; font-size: 0.88rem; font-weight: 500; color: var(--text); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rq-region { font-size: 0.72rem; color: var(--muted); border: 1px solid var(--rule); background: var(--surface); padding: 1px 7px; border-radius: 999px; flex-shrink: 0; }
.rq-line { font-size: 0.76rem; color: var(--accent); background: var(--accent-soft); padding: 2px 8px; border-radius: 999px; flex-shrink: 0; }
.rq-diff { font-size: 0.74rem; font-weight: 600; padding: 2px 8px; border-radius: 999px; flex-shrink: 0; min-width: 34px; text-align: center; }
.rq-diff-up { color: #dc2626; background: rgba(220, 38, 38, 0.1); }
.rq-diff-safe { color: #16a34a; background: rgba(22, 163, 74, 0.12); }
.rq-diff-fit { color: #64748b; background: rgba(100, 116, 139, 0.12); }
.rq-empty { padding: 14px 2px; color: var(--muted); font-size: 0.88rem; }
.rq-empty a { color: var(--accent); font-weight: 600; }
.rq-more { margin-top: 14px; text-align: right; }
@media (max-width: 600px) {
  .rec-quick { padding: 16px; }
  .rq-head h3 { font-size: 1rem; }
  .rq-item { padding: 9px 12px; gap: 8px; }
  .rq-line { display: none; }
  .rq-region { display: none; }
  .rq-diff { min-width: 30px; font-size: 0.72rem; padding: 2px 6px; }
}

/* 本周学习对比 */
.ov-week {
  margin: 4px 0 18px; padding: 16px 18px;
  border: 1px solid var(--rule); border-radius: 14px;
  background: var(--surface-2);
}
.ow-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; }
.ow-title { font-size: 0.85rem; font-weight: 700; color: var(--ink); }
.ow-sub { font-size: 0.76rem; color: var(--muted); }
.ow-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.ow-item { min-width: 0; }
.ow-num { font-size: 1.18rem; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: 6px; }
.ow-delta { font-size: 0.72rem; font-weight: 600; }
.ow-delta.up { color: var(--green); }
.ow-delta.down { color: var(--red); }
.ow-delta.flat { color: var(--muted-2); }
.ow-lbl { font-size: 0.76rem; color: var(--muted); margin: 2px 0 6px; }
.ow-bar { height: 5px; border-radius: 999px; background: var(--rule); overflow: hidden; }
.ow-fill { height: 100%; border-radius: 999px; background: var(--grad-accent); transition: width 0.6s var(--ease-out); }

.daily {
  display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;
  margin: 20px 0 0; padding: 24px 28px;
  background: var(--grad-accent-soft);
  border-color: transparent;
}
.daily.done { background: linear-gradient(135deg, var(--green-soft), rgba(52, 211, 153, 0.06)); border-color: rgba(13, 166, 120, 0.3); }
.daily.done .daily-icon { background: var(--green); }
.daily-done-tip { margin-top: 6px; font-size: 0.88rem; color: #047857; font-weight: 600; }
.daily-main { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 240px; }
.daily-icon {
  width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0;
  background: var(--accent); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 800;
  box-shadow: 0 3px 12px rgba(79, 95, 240, 0.24);
}
.daily-info h3 { font-size: 1.1rem; }
.daily-info p { color: var(--muted); font-size: 0.88rem; margin-top: 2px; }
.daily-weak { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.daily-weak-lbl { font-size: 0.82rem; color: var(--muted); }
.weak-link {
  text-decoration: none; cursor: pointer;
  transition: transform 0.22s var(--ease), box-shadow 0.22s var(--ease), background-color 0.22s var(--ease);
}
.weak-link:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(225, 29, 72, 0.18); }
.weak-link-arrow { font-weight: 800; margin-left: 2px; }
.weak-link-hint { font-size: 0.76rem; color: var(--muted-2); }

.stat {
  background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius);
  padding: 22px 16px; text-align: center; box-shadow: var(--shadow);
  transition: transform 0.3s var(--ease), box-shadow 0.3s var(--ease), border-color 0.3s var(--ease);
  position: relative; overflow: hidden;
}
.stat::before {
  content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 44px; height: 3px; border-radius: 0 0 3px 3px;
  background: var(--grad-accent); opacity: 0; transition: opacity 0.3s var(--ease);
}
.stat:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: rgba(79, 95, 240, 0.2); }
.stat:hover::before { opacity: 1; }
.stat-ic {
  width: 38px; height: 38px; border-radius: 11px;
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 10px;
}
.stat-ic svg { width: 19px; height: 19px; }
.ic-indigo { background: var(--accent-soft); color: var(--accent); }
.ic-blue { background: rgba(37, 99, 235, 0.1); color: #2563eb; }
.ic-green { background: var(--green-soft); color: var(--green); }
.ic-amber { background: var(--amber-soft); color: var(--amber); }
.stat .num {
  font-size: 2rem; font-weight: 800;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.stat .lbl { color: var(--muted); font-size: 0.85rem; margin-top: 4px; }

.bank-overview { margin: 0 0 52px; padding: 24px 28px; }
.bo-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
.bo-head h3 { font-size: 1.15rem; }
.bo-sub { font-size: 0.82rem; color: var(--muted); }
.bo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 24px; }
.bo-item { cursor: pointer; padding: 10px 12px; border-radius: 10px; transition: background-color 0.25s var(--ease), transform 0.25s var(--ease); }
.bo-item:hover { background: var(--accent-soft); transform: translateX(4px); }
.bo-item:active { transform: translateX(4px) scale(0.99); background: var(--accent-soft); }
.bo-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.bo-name { font-size: 0.9rem; font-weight: 600; color: var(--ink); }
.bo-count { font-size: 0.78rem; color: var(--muted); }
.bo-track { height: 6px; background: var(--rule-soft); border-radius: var(--radius-full); overflow: hidden; }
.bo-fill { height: 100%; border-radius: var(--radius-full); transition: width 0.6s var(--ease); }

.sec-head { text-align: center; margin-bottom: 28px; }
.sec-head h2 { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.01em; }
.sec-head p { color: var(--muted); margin-top: 4px; }

.feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 52px; }
.feat {
  background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius);
  padding: 24px 20px; box-shadow: var(--shadow); transition: transform 0.3s var(--ease), box-shadow 0.3s var(--ease), border-color 0.3s var(--ease);
  position: relative; overflow: hidden;
}
.feat::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: var(--grad-accent); transform: scaleX(0); transform-origin: left;
  transition: transform 0.4s var(--ease);
}
.feat:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); border-color: rgba(79, 95, 240, 0.2); }
.feat:hover::before { transform: scaleX(1); }
.feat-icon {
    width: 46px; height: 46px; border-radius: 13px; display: flex; align-items: center;
    justify-content: center; margin-bottom: 14px;
    transition: transform 0.3s var(--ease), box-shadow 0.3s var(--ease);
  }
  .feat:hover .feat-icon { transform: scale(1.08) rotate(-3deg); box-shadow: 0 6px 16px rgba(79, 95, 240, 0.16); }
  .feat-icon svg { width: 22px; height: 22px; }
.feat h3 { font-size: 1.05rem; margin-bottom: 8px; }
.feat p { color: var(--muted); font-size: 0.88rem; line-height: 1.7; }

.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 52px; position: relative; }
.steps::before {
  content: ''; position: absolute; top: 21px; left: 16%; right: 16%;
  height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, transparent, rgba(79, 95, 240, 0.28) 12%, rgba(79, 95, 240, 0.28) 88%, transparent);
}
.step {
  background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius);
  padding: 28px 24px; box-shadow: var(--shadow); position: relative;
  transition: transform 0.3s var(--ease), box-shadow 0.3s var(--ease), border-color 0.3s var(--ease);
}
.step:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); border-color: rgba(79, 95, 240, 0.2); }
.step-no {
  width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: var(--grad-accent); color: #fff; font-weight: 700; font-size: 1.1rem; margin-bottom: 14px;
  box-shadow: 0 3px 10px rgba(79, 95, 240, 0.24);
  position: relative; z-index: 1;
}
.step h3 { margin-bottom: 8px; }
.step p { color: var(--muted); font-size: 0.9rem; }

.cta {
  background: var(--surface);
  border: 1px solid rgba(79, 95, 240, 0.18);
  border-radius: var(--radius-lg); padding: 44px;
  display: flex; justify-content: space-between; align-items: center; gap: 24px; flex-wrap: wrap;
  box-shadow: var(--shadow-lg);
  margin-bottom: 8px; position: relative; overflow: hidden;
}
.cta::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(120deg, rgba(79, 95, 240, 0.06) 0%, rgba(79, 95, 240, 0.03) 55%, transparent 80%);
}
.cta h2 { font-size: 1.5rem; font-weight: 800; }
.cta p { color: var(--muted); margin-top: 4px; }
.cta .btn-primary { background: var(--accent); color: #fff; box-shadow: 0 2px 4px rgba(15, 23, 42, 0.12), 0 6px 18px rgba(79, 95, 240, 0.22); }
.cta .btn-primary:hover { background: var(--accent-deep); }

@media (max-width: 900px) {
  .hero-inner { grid-template-columns: 1fr; }
  .feat-grid { grid-template-columns: repeat(2, 1fr); }
  .steps { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .hero { padding: 28px 0 18px; border-radius: 0 0 24px 24px; }
  .hero h1 { font-size: 1.4rem; line-height: 1.4; }
  .hero-text p { font-size: 0.88rem; }
  .hero-actions { gap: 8px; }
  .hero-actions .btn { flex: 1; padding: 10px 12px; font-size: 0.85rem; }
  .hero-card { padding: 18px; border-radius: 18px; }
  .stats { grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 16px 0 36px; }
  .stat { padding: 16px 10px; }
  .stat .num { font-size: 1.5rem; }
  .feat-grid { grid-template-columns: 1fr; gap: 12px; }
  .feat { padding: 18px 16px; }
  .ov-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .ow-grid { grid-template-columns: repeat(2, 1fr); gap: 12px 10px; }
  .ow-num { font-size: 1.05rem; }
  .bo-grid { grid-template-columns: 1fr; }
  .cd-nums { gap: 4px; }
  .cd-v { min-width: 40px; font-size: 1.15rem; padding: 6px 8px; }
  .cd-u { font-size: 0.7rem; }
  .cd-sep { font-size: 1.1rem; }
  .hero-actions .btn { flex: 1; }
  .cta { padding: 24px 18px; text-align: center; justify-content: center; }
  .cta h2 { font-size: 1.2rem; }
  .ov-actions .btn { flex: 1; }
  .daily { flex-direction: column; align-items: stretch; padding: 16px; gap: 14px; }
  .daily .btn { width: 100%; }
  .daily-icon { width: 44px; height: 44px; font-size: 1.1rem; }
  .countdown { padding: 14px 18px; }
  .cd-label strong { font-size: 1rem; }
  .sec-head h2 { font-size: 1.3rem; }
  .sec-head { margin-bottom: 20px; }
  .bank-overview { padding: 16px 14px; }
  .bo-head { margin-bottom: 14px; }
  .steps { gap: 12px; margin-bottom: 36px; }
  .step { padding: 20px 16px; }
  .overview { padding: 16px 14px; }
}
@media (max-width: 400px) {
  .countdown { flex-direction: column; text-align: center; padding: 16px; gap: 10px; }
  .cd-label { align-items: center; }
  .cd-v { min-width: 36px; font-size: 1rem; padding: 5px 6px; }
  .cd-sep { font-size: 0.95rem; }
  .stats { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .stat { padding: 12px 8px; }
  .stat .num { font-size: 1.3rem; }
  .stat .lbl { font-size: 0.75rem; }
  .hero h1 { font-size: 1.25rem; }
  .hero-actions { flex-direction: column; }
  .hero-actions .btn { width: 100%; }
}
</style>
