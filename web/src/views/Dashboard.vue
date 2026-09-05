<template>
  <div class="container dash-page">
    <div v-if="loading" class="dash-skeleton">
      <!-- 欢迎区骨架 -->
      <div class="card sk-welcome">
        <div class="skeleton sk-avatar"></div>
        <div class="sk-w-info">
          <div class="skeleton sk-w-title"></div>
          <div class="skeleton sk-w-sub"></div>
        </div>
        <div class="sk-w-actions">
          <div v-for="i in 4" :key="i" class="skeleton sk-w-btn"></div>
        </div>
      </div>

      <!-- 统计卡片骨架 -->
      <div class="stat-grid">
        <div v-for="i in 6" :key="i" class="card stat-card">
          <div class="skeleton sk-stat-ic"></div>
          <div class="skeleton sk-stat-num"></div>
          <div class="skeleton sk-stat-lbl"></div>
        </div>
      </div>

      <!-- 打卡骨架 -->
      <div class="card sk-checkin">
        <div class="sk-ck-left">
          <div class="skeleton sk-ck-title"></div>
          <div class="skeleton sk-ck-btn"></div>
        </div>
        <div class="sk-ck-stats">
          <div v-for="i in 3" :key="i" class="sk-ck-stat">
            <div class="skeleton sk-ck-num"></div>
            <div class="skeleton sk-ck-lbl"></div>
          </div>
        </div>
      </div>

      <!-- 成就骨架 -->
      <div class="card sk-ach">
        <div class="skeleton sk-ach-title"></div>
        <div class="sk-ach-badges">
          <div v-for="i in 6" :key="i" class="skeleton sk-ach-badge"></div>
        </div>
      </div>

      <!-- 图表骨架 -->
      <div class="dash-grid">
        <div v-for="i in 2" :key="i" class="card sk-chart"></div>
      </div>
    </div>
    <div v-if="loadError" class="card load-error" role="alert">
      <span class="le-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg></span>
      <div class="le-text">
        <strong>学习数据加载失败</strong>
        <span>网络异常或服务暂时不可用，请稍后重试</span>
      </div>
      <button class="btn btn-primary le-btn" @click="loadAll">重新加载</button>
    </div>
    <template v-else>
      <!-- 复习到期提醒横幅 -->
      <div v-if="reviewDue > 0" class="card review-banner">
        <span class="rb-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></span>
        <div class="rb-text">
          <strong>你有 {{ reviewDue }} 道错题到了复习时间</strong>
          <span>基于遗忘曲线智能安排，及时复习记得更牢</span>
        </div>
        <router-link to="/review" class="btn btn-primary rb-btn">去复习</router-link>
      </div>

      <!-- 欢迎区 -->
      <div class="card welcome">
        <div class="w-avatar">{{ (user.nickname || '考')[0] }}</div>
        <div class="w-info">
          <h2>{{ user.nickname }}，继续加油！</h2>
          <p>坚持刷题，稳步提升，向目标院校冲刺</p>
        </div>
        <div class="w-membership">
          <router-link to="/vip" class="wm-item" :class="{ vip: membership.vip }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7L12 3z"/></svg>
            <span>{{ membership.vip ? 'VIP 会员' : '开通 VIP' }}</span>
          </router-link>
          <router-link to="/points" class="wm-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h5M9.5 14.5h5"/></svg>
            <span>{{ points }} 积分</span>
          </router-link>
        </div>
        <div class="w-actions">
          <router-link to="/review" class="btn btn-ghost">复习计划</router-link>
          <router-link to="/weekly-report" class="btn btn-ghost">学习周报</router-link>
          <button class="btn btn-ghost" @click="exportReport">导出学习报告</button>
          <router-link to="/practice" class="btn btn-primary">去刷题</router-link>
        </div>
      </div>

      <!-- 今日学习建议 -->
      <div v-if="todayTips.length" class="card today-tips">
        <div class="tt-head">
          <h3>今日学习建议</h3>
          <span class="tt-sub">基于你的实时学习情况生成</span>
        </div>
        <div class="tt-list">
          <a
            v-for="(t, i) in todayTips"
            :key="i"
            :class="['tt-item', { clickable: t.to || t.onClick }]"
            @click="runTip(t)"
          >
            <span class="tt-icon">{{ t.icon }}</span>
            <span class="tt-text">
              <strong>{{ t.text }}</strong>
              <em>{{ t.sub }}</em>
            </span>
            <span v-if="t.to || t.onClick" class="tt-go">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </span>
          </a>
        </div>
      </div>

      <!-- 统计卡片 -->
      <div class="stat-grid">
        <div class="card stat-card">
          <div class="stat-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/></svg></div>
          <div class="stat-num" :class="{ muted: !stats.total }">{{ stats.total }}</div>
          <div class="stat-lbl">累计答题</div>
        </div>
        <div class="card stat-card">
          <div class="stat-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg></div>
          <div class="stat-num green" :class="{ muted: !stats.correct }">{{ stats.correct }}</div>
          <div class="stat-lbl">答对</div>
        </div>
        <div class="card stat-card">
          <div class="stat-ic red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg></div>
          <div class="stat-num red" :class="{ muted: !stats.wrong }">{{ stats.wrong }}</div>
          <div class="stat-lbl">答错</div>
        </div>
        <div class="card stat-card">
          <div class="stat-ic purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
          <div class="stat-num purple" :class="{ muted: !stats.accuracy }">{{ stats.accuracy }}%</div>
          <div class="stat-lbl">正确率</div>
        </div>
        <div class="card stat-card">
          <div class="stat-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h5"/></svg></div>
          <div class="stat-num" :class="{ muted: !stats.sessions }">{{ stats.sessions }}</div>
          <div class="stat-lbl">练习次数</div>
        </div>
        <div class="card stat-card">
          <div class="stat-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.8 1-5.8L3.5 9.2l5.9-.9L12 3z"/></svg></div>
          <div class="stat-num amber" :class="{ muted: !favCount }">{{ favCount }}</div>
          <div class="stat-lbl">收藏题目</div>
        </div>
      </div>

      <!-- 学习打卡 -->
      <div class="card checkin-card">
        <div class="ck-left">
          <div class="ck-title">
            <h3>学习打卡</h3>
            <span class="ck-sub">每天坚持，见证成长</span>
          </div>
          <button class="btn btn-primary ck-btn" :disabled="checkin.checkedToday || checking" @click="doCheckin">
            {{ checkin.checkedToday ? '今日已打卡 ✓' : (checking ? '打卡中…' : '立即打卡') }}
          </button>
        </div>
        <div class="ck-stats">
          <div class="ck-stat"><div class="ck-num">{{ checkin.streak }}</div><div class="ck-lbl">连续天数</div></div>
          <div class="ck-stat"><div class="ck-num">{{ checkin.total }}</div><div class="ck-lbl">累计打卡</div></div>
          <div class="ck-stat"><div class="ck-num">{{ checkin.monthCount }}</div><div class="ck-lbl">本月打卡</div></div>
        </div>
        <div class="ck-heat">
          <div v-for="(week, wi) in checkin.heatmap" :key="wi" class="ck-week">
            <div
              v-for="day in week"
              :key="day.date"
              class="ck-cell"
              :class="{ on: day.checked, today: day.isToday }"
              :title="day.date + (day.checked ? ' 已打卡' : '')"
            ></div>
          </div>
        </div>
      </div>

      <!-- 成就徽章 -->
      <div class="card ach-strip">
        <div class="ach-head">
          <div>
            <h3>成就徽章</h3>
            <span class="ach-sub">已点亮 {{ achievements.earnedCount }} / {{ achievements.total }} 枚</span>
          </div>
          <router-link to="/achievements" class="btn btn-ghost btn-sm">查看全部 →</router-link>
        </div>
        <div class="ach-badges">
          <div
            v-for="a in achievements.list"
            :key="a.key"
            class="ach-badge"
            :class="[a.tier, { locked: !a.earned }]"
            :title="a.name + '：' + a.desc"
          >
            <span class="ab-icon">{{ a.icon }}</span>
            <span class="ab-name">{{ a.name }}</span>
          </div>
        </div>
      </div>

      <div class="dash-grid">
        <!-- 总分测算 -->
        <div class="card panel">
          <h3>总分测算</h3>
          <p class="panel-sub">文化素质折算 + 职业技能预测（满分 600 分）</p>
          <div class="total-score">
            <div class="ts-main">
              <div class="ts-score">{{ stats.totalScore ?? '—' }}</div>
              <div class="ts-unit">/ 600 分</div>
            </div>
            <div class="ts-parts">
              <div class="ts-part">
                <span class="ts-lbl">文化素质</span>
                <strong>{{ stats.cultural ?? '—' }} / 300</strong>
                <span class="ts-hint">会考等级折算</span>
              </div>
              <div class="ts-part">
                <span class="ts-lbl">职业技能</span>
                <strong>{{ stats.predict.total }} / 300</strong>
                <span class="ts-hint">刷题正确率预测</span>
              </div>
            </div>
          </div>
          <div v-if="stats.cultural == null" class="ts-tip">录入会考成绩后即可测算文化素质分</div>
        </div>

        <!-- 目标达成进度 -->
        <div class="card panel">
          <h3>目标达成进度</h3>
          <p class="panel-sub">当前总分测算 vs 目标分数</p>
          <div v-if="profile.target_score" class="goal-progress">
            <div class="gp-head">
              <span>当前 <b class="gp-cur">{{ stats.totalScore ?? '—' }}</b> 分</span>
              <span class="gp-target">目标 {{ profile.target_score }} 分<b class="gp-pct" :class="goalPctTier">{{ goalPctNum }}%</b></span>
            </div>
            <div class="gp-track">
              <div class="gp-fill" :class="goalPctTier" :style="{ width: goalPct }"></div>
            </div>
            <div class="gp-note">
              <span v-if="goalPctNum >= 100" class="gp-done">已达成目标，太棒了，继续冲刺更高分！</span>
              <span v-else>还差 <b class="gp-gap">{{ goalGap }}</b> 分达成目标，继续加油！</span>
            </div>
          </div>
          <div v-else class="ts-tip">在下方「我的目标」中设置目标分数后，即可查看达成进度</div>
        </div>

        <!-- 预测得分 -->
        <div class="card panel">
          <h3>职业技能预测得分</h3>
          <p class="panel-sub">按当前正确率估算（满分 300 分）</p>
          <div class="predict">
            <div class="predict-main">
              <div class="predict-score">{{ stats.predict.total }}</div>
              <div class="predict-unit">/ 300 分</div>
            </div>
            <div class="predict-bars">
              <div class="pbar">
                <div class="pbar-head"><span>信息技术</span><strong>{{ stats.predict.info_tech }} / 150</strong></div>
                <div class="pbar-track"><div class="pbar-fill blue" :style="{ width: pct(stats.predict.info_tech, 150) }"></div></div>
              </div>
              <div class="pbar">
                <div class="pbar-head"><span>通用技术</span><strong>{{ stats.predict.general_tech }} / 150</strong></div>
                <div class="pbar-track"><div class="pbar-fill purple" :style="{ width: pct(stats.predict.general_tech, 150) }"></div></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 目标设置 -->
        <div class="card panel">
          <h3>我的目标</h3>
          <p class="panel-sub">设定目标院校与分数，让备考更有方向</p>
          <div class="form">
            <label>
              <span>目标院校</span>
              <input v-model="profile.target_school" placeholder="如：昆明冶金高等专科学校" />
            </label>
            <label>
              <span>目标分数（总分 600 分制）</span>
              <input v-model.number="profile.target_score" type="number" placeholder="如：480" />
            </label>
            <label>
              <span>会考成绩（可多选，用于志愿推荐参考）</span>
              <div class="hui-kao">
                <button
                  v-for="hk in huiKaoOptions"
                  :key="hk"
                  class="chip"
                  :class="{ on: huiKao.includes(hk) }"
                  @click="toggleHuiKao(hk)"
                >{{ hk }}</button>
              </div>
            </label>
            <label>
              <span>会考等级（用于文化素质分测算）</span>
              <div class="grade-grid">
                <div v-for="s in huiKaoOptions" :key="s" class="grade-row">
                  <span class="grade-name">{{ s }}</span>
                  <div class="grade-opts">
                    <button
                      v-for="g in grades"
                      :key="g"
                      class="grade-chip"
                      :class="{ on: huiKaoScores[s] === g }"
                      @click="huiKaoScores[s] = huiKaoScores[s] === g ? '' : g"
                    >{{ g }}</button>
                  </div>
                </div>
              </div>
            </label>
            <label>
              <span>就读学校</span>
              <input v-model="profile.org" placeholder="如：昆明市第一职业中学" />
            </label>
            <button class="btn btn-primary save-btn" :disabled="saving" @click="saveProfile">
              {{ saving ? '保存中…' : '保存目标' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 科目表现 -->
      <div class="card panel">
        <h3>分科表现</h3>
        <div v-if="!stats.bySubject.length" class="empty">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 15l4-6 3 4 3-6"/></svg></div>
          <p>还没有答题记录</p>
          <span class="empty-sub">去刷几道题，就能看到各科目表现</span>
        </div>
        <div v-else class="subject-rows">
          <div v-for="s in sortedSubjects" :key="s.subject" class="srow" :title="`${s.subject}：答对 ${s.correct}/${s.total} 题`">
            <span class="srow-name">{{ s.subject }}</span>
            <div class="srow-track">
              <div
                class="srow-fill"
                :style="{ width: accuracyOf(s) + '%', background: subjectColor(s.subject) }"
              ></div>
            </div>
            <span class="srow-num">{{ accuracyOf(s) }}%</span>
          </div>
        </div>
      </div>

      <!-- 知识点掌握度 -->
      <div class="card panel">
        <div class="panel-head">
          <h3>知识点掌握度</h3>
          <span v-if="mastery.weak.length" class="weak-tip">有 {{ mastery.weak.length }} 个薄弱章节</span>
        </div>
        <div v-if="!mastery.list.length" class="empty">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
          <p>还没有章节练习数据</p>
          <span class="empty-sub">去刷题后即可查看知识点掌握度</span>
        </div>
        <div v-else>
          <div v-if="radarData.length >= 3" class="radar-box">
            <RadarChart :data="radarData" title="知识点掌握度雷达图" @select="onRadarSelect" />
            <p class="radar-tip">点击雷达图上的章节可直达该章节练习，越靠近外圈代表掌握越好</p>
          </div>
          <div v-if="mastery.weak.length" class="weak-box">
            <strong>薄弱章节（正确率 &lt; 60%）：</strong>
            <router-link
              v-for="w in mastery.weak"
              :key="w.chapter"
              :to="{ path: '/ai-practice', query: { subject: w.subject, chapter: w.chapter } }"
              class="weak-tag"
              title="点击进入该章节 AI 智能出题补强"
            >{{ w.subject }}·{{ w.chapter }}<span class="weak-go">补强 →</span></router-link>
          </div>
          <div class="mastery-list">
            <div v-for="m in mastery.list" :key="m.chapter" class="mrow">
              <span class="mrow-name">{{ m.subject }} · {{ m.chapter }}</span>
              <div class="mrow-track">
                <div
                  class="mrow-fill"
                  :class="m.accuracy > 50 ? 'good' : (m.accuracy >= 30 ? 'mid' : 'bad')"
                  :style="{ width: m.accuracy + '%' }"
                ></div>
              </div>
              <span class="mrow-num" :class="m.accuracy < 30 ? 'bad-text' : ''">{{ m.accuracy }}%</span>
              <router-link :to="`/practice?subject=${encodeURIComponent(m.subject)}&chapter=${encodeURIComponent(m.chapter)}`" class="mrow-btn" title="练习该章节">练</router-link>
            </div>
          </div>
        </div>
      </div>

      <!-- 学习趋势 -->
      <div class="card panel">
        <div class="panel-head">
          <h3>学习趋势</h3>
          <span class="panel-count">近十四天</span>
        </div>
        <div v-if="!trend.some(t => t.total > 0)" class="empty">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/></svg></div>
          <p>还没有答题记录</p>
          <span class="empty-sub">去刷题后即可查看近十四天趋势</span>
        </div>
        <div v-else class="trend-chart">
          <div v-for="t in trend" :key="t.date" class="trend-col" :class="{ today: isToday(t.date) }" :title="`${t.date}：${t.total} 题 · 正确率 ${t.accuracy}%`">
            <span class="trend-num">{{ t.total }}</span>
            <div class="trend-bar-wrap">
              <div class="trend-bar" :class="t.total ? (t.accuracy >= 80 ? 'good' : t.accuracy >= 60 ? 'mid' : 'bad') : 'empty'" :style="{ height: barHeight(t) }"></div>
            </div>
            <span class="trend-day">{{ dayLabel(t.date) }}{{ isToday(t.date) ? '·今' : '' }}</span>
          </div>
        </div>
      </div>

      <!-- 模拟考试历史 -->
      <div class="card panel">
        <div class="panel-head">
          <h3>模拟考试历史</h3>
          <span class="panel-count">{{ examHistory.length }} 次</span>
        </div>
        <div v-if="!examHistory.length" class="empty">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h.01M11 9h.01M7 13h.01M11 13h.01M15 9h2M15 13h2"/></svg></div>
          <p>还没有模拟考试记录</p>
          <span class="empty-sub">在「在线刷题」选择模拟考试模式试试</span>
        </div>
        <div v-else>
          <div v-if="examHistory.length > 1" class="score-chart">
            <div class="sc-head">
              <span>成绩走势</span>
              <span class="sc-sub">最高 <b class="sc-best">{{ bestScore }}</b> 分 · 悬停查看详情</span>
            </div>
            <div class="sc-wrap">
              <svg class="sc-svg" viewBox="0 0 320 100" preserveAspectRatio="none">
                <line v-if="hoverIndex >= 0" :x1="scoreTrend[hoverIndex].x" :x2="scoreTrend[hoverIndex].x" y1="0" y2="100" :stroke="scoreStroke" stroke-opacity="0.25" stroke-width="1" stroke-dasharray="3 3" />
                <polyline :points="scorePoints" fill="none" :stroke="scoreStroke" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                <circle v-for="(p, i) in scoreTrend" :key="i" :cx="p.x" :cy="p.y" r="4" :fill="scoreStroke" @mouseenter="hoverIndex = i" @mouseleave="hoverIndex = -1" />
              </svg>
              <div v-if="hoverIndex >= 0" class="sc-tooltip" :style="{ left: scoreTrend[hoverIndex].left + '%' }">
                <strong>{{ scoreTrend[hoverIndex].score }} 分</strong>
                <span>{{ formatTime(examHistory[examHistory.length - 1 - hoverIndex].created_at) }}</span>
              </div>
            </div>
            <div class="sc-labels">
              <span v-for="(p, i) in scoreTrend" :key="i" class="sc-label" :style="{ left: p.left + '%' }">{{ p.score }}</span>
            </div>
          </div>
          <div class="exam-list">
          <div v-for="e in examHistory" :key="e.id" class="exam-item">
            <div class="exam-score" :class="scoreClass(e.score)">{{ e.score }}</div>
            <div class="exam-info">
              <strong>{{ e.subject }} · 模拟考试</strong>
              <span>{{ formatTime(e.created_at) }} · 答对 {{ e.correct }}/{{ e.total }} 题</span>
            </div>
            <button class="btn btn-ghost btn-sm review-btn" @click="openReview(e)">回顾</button>
          </div>
          </div>

          <!-- 考试回顾 -->
          <div v-if="review" class="card review-panel">
            <div class="review-head">
              <div>
                <h4>{{ review.subject }} · 模拟考试回顾</h4>
                <span class="review-sub">{{ formatTime(review.created_at) }} · 得分 {{ review.score }} · 答对 {{ review.correct }}/{{ review.total }}</span>
              </div>
              <button class="btn btn-ghost btn-sm" @click="review = null">关闭</button>
            </div>
            <div v-if="reviewLoading" class="spinner"></div>
            <div v-else class="review-list">
              <div v-for="(r, i) in review.records" :key="i" class="review-item" :class="r.is_correct ? 'ok' : 'no'">
                <div class="rv-top">
                  <span class="rv-no">{{ i + 1 }}</span>
                  <span class="tag tag-blue">{{ r.subject }}</span>
                  <span class="tag tag-purple">{{ r.chapter }}</span>
                  <span class="rv-result" :class="r.is_correct ? 'ok' : 'no'">{{ r.is_correct ? '✓ 答对' : '✗ 答错' }}</span>
                </div>
                <p class="rv-stem">{{ r.stem }}</p>
                <div v-if="r.images && r.images.length" class="q-image">
                  <img v-for="(img, idx) in r.images" :key="idx" :src="'/' + img" alt="题目配图" loading="lazy" @error="onImgError">
                </div>
                <div class="rv-opts">
                  <div v-for="opt in r.options" :key="opt[0]" class="rv-opt"
                    :class="{
                      right: opt[0] === r.right_answer,
                      wrong: opt[0] === r.user_answer && opt[0] !== r.right_answer
                    }">
                    <span class="rv-letter">{{ opt[0] }}</span>
                    <span class="rv-text">{{ opt.slice(2) }}</span>
                    <span v-if="opt[0] === r.right_answer" class="rv-mark right">正确答案</span>
                    <span v-else-if="opt[0] === r.user_answer" class="rv-mark wrong">你的答案</span>
                  </div>
                </div>
                <div class="rv-analysis">
                  <strong>解析：</strong>{{ r.analysis }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 错题本 -->
      <div class="card panel">
        <div class="panel-head">
          <h3>我的错题本</h3>
          <div class="panel-head-right">
            <span class="panel-count">{{ wrongList.length }} 题</span>
            <button v-if="wrongList.length" class="btn btn-ghost btn-sm redo-btn" @click="exportWrong">导出打印</button>
            <router-link v-if="wrongList.length" to="/practice?mode=redo" class="btn btn-primary btn-sm redo-btn">错题重练</router-link>
            <router-link to="/review" class="btn btn-ghost btn-sm redo-btn">遗忘曲线复习</router-link>
            <router-link to="/wrong-book" class="btn btn-ghost btn-sm redo-btn">查看全部 →</router-link>
          </div>
        </div>
        <QuotaBar kind="explain" label="错题讲解" />
        <div v-if="!wrongList.length" class="empty">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg></div>
          <p>太棒了，目前没有错题</p>
          <span class="empty-sub">继续保持，把每道题都真正掌握</span>
        </div>
        <div v-else class="wrong-list">
          <div v-for="q in wrongList" :key="q.id" class="wrong-item">
            <div class="w-top">
              <span class="tag tag-blue">{{ q.subject }}</span>
              <span class="tag tag-purple">{{ q.chapter }}</span>
              <span class="w-ans">正确答案：{{ q.answer }}</span>
            </div>
            <p class="w-stem">{{ q.stem }}</p>
            <div v-if="q.images && q.images.length" class="q-image">
              <img v-for="(img, idx) in q.images" :key="idx" :src="'/' + img" alt="题目配图" loading="lazy" @error="onImgError">
            </div>
            <div class="w-analysis">
              <strong>解析：</strong>{{ q.analysis }}
            </div>
            <div class="w-actions">
              <button class="btn btn-ghost btn-sm" :disabled="aiLoadingId === q.id" @click="explainWrong(q)">
                {{ aiLoadingId === q.id ? 'AI 讲解中…' : (aiExplain[q.id] ? '收起 AI 讲解' : 'AI 讲解') }}
              </button>
              <router-link :to="{ path: '/ai-practice', query: { subject: q.subject, chapter: q.chapter } }" class="btn btn-ghost btn-sm">练同类题</router-link>
            </div>
            <div v-if="aiExplain[q.id]" class="ai-explain">
              <div class="ai-explain-head">
                <span class="ai-badge">AI</span>
                <strong>智能错题讲解</strong>
              </div>
              <div class="ai-explain-body">{{ aiTypingId === q.id ? explainText : aiExplain[q.id] }}<span v-if="aiTypingId === q.id && explainTyping" class="tw-caret"></span></div>
            </div>
          </div>
        </div>
      </div>
      <!-- 我的收藏 -->
      <div class="card panel">
        <div class="panel-head">
          <h3>我的收藏</h3>
          <div class="panel-head-right">
            <span class="panel-count">{{ favList.length }} 题</span>
            <router-link to="/favorites" class="btn btn-ghost btn-sm redo-btn">查看全部 →</router-link>
          </div>
        </div>
        <div v-if="!favList.length" class="empty">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.8 1-5.8L3.5 9.2l5.9-.9L12 3z"/></svg></div>
          <p>还没有收藏题目</p>
          <span class="empty-sub">刷题或浏览题库时点击 ☆ 即可收藏</span>
        </div>
        <div v-else class="fav-list">
          <div v-for="q in favList" :key="q.id" class="fav-item">
            <div class="f-top">
              <span class="fav-star" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.8 1-5.8L3.5 9.2l5.9-.9L12 3z"/></svg></span>
              <span class="tag tag-blue">{{ q.subject }}</span>
              <span class="tag tag-purple">{{ q.chapter }}</span>
              <span class="f-ans">正确答案：{{ q.answer }}</span>
            </div>
            <p class="f-stem">{{ q.stem }}</p>
            <div v-if="q.images && q.images.length" class="q-image">
              <img v-for="(img, idx) in q.images" :key="idx" :src="'/' + img" alt="题目配图" loading="lazy" @error="onImgError">
            </div>
            <div class="f-analysis">
              <strong>解析：</strong>{{ q.analysis }}
            </div>
            <div class="f-actions">
              <button class="btn btn-ghost btn-sm" @click="unfav(q)">取消收藏</button>
              <router-link :to="{ path: '/ai-practice', query: { subject: q.subject, chapter: q.chapter } }" class="btn btn-ghost btn-sm">练同类题</router-link>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>

import { toast } from '../toast'
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api, getUser } from '../api'
import { useImgError } from '../useImgError'
import RadarChart from '../components/RadarChart.vue'
import QuotaBar from '../components/QuotaBar.vue'
import { useTypewriter } from '../useTypewriter'
import { goalProgress } from '../utils/goal'

const { text: explainText, typing: explainTyping, type: typeExplain } = useTypewriter()

const router = useRouter()
const user = ref(getUser() || {})
const loading = ref(true)
const loadError = ref(false)
const saving = ref(false)
const stats = ref({ total: 0, correct: 0, wrong: 0, accuracy: 0, sessions: 0, bySubject: [], predict: { info_tech: 0, general_tech: 0, total: 0 } })
const favCount = ref(0)
const wrongList = ref([])
const huiKaoOptions = ['语文', '数学', '英语', '政治', '历史', '地理', '物理', '化学', '生物', '信息技术', '通用技术']
const SUBJECT_COLORS = {
  '语文': '#fb7185', '数学': '#f472b6', '英语': '#fbbf24', '政治': '#a78bfa',
  '历史': '#f59e0b', '地理': '#34d399', '物理': '#60a5fa', '化学': '#22d3ee',
  '生物': '#10b981', '信息技术': '#4f5ff0', '通用技术': '#6d28d9'
}
function subjectColor(s) { return SUBJECT_COLORS[s] || '#4f5ff0' }
const grades = ['A', 'B', 'C', 'D']
const profile = reactive({ target_school: '', target_score: null, hui_kao: [], org: '' })
const huiKao = ref([])
const huiKaoScores = reactive({})
const aiExplain = ref({})
const aiLoadingId = ref(null)
const aiTypingId = ref(null)
const checkin = ref({ checkedToday: false, streak: 0, total: 0, monthCount: 0, heatmap: [] })
const checking = ref(false)
const mastery = ref({ list: [], weak: [] })
const favList = ref([])
const trend = ref([])
const examHistory = ref([])
const review = ref(null)
const reviewLoading = ref(false)
const achievements = ref({ list: [], earnedCount: 0, total: 0 })
const reviewDue = ref(0)
const membership = ref({ vip: false })
const points = ref(0)

const { onImgError } = useImgError()

function downloadHtml(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportReport() {
  const m = stats.value
  const subjRows = (m.bySubject || []).map(x =>
    `<div class="row"><span class="lbl">${escHtml(x.subject)}</span><div class="track"><div class="fill" style="width:${pct(x.correct, x.total)}"></div></div><span class="val">${x.correct}/${x.total} 题</span></div>`
  ).join('')
  const masteryRows = (mastery.value.list || []).map(x =>
    `<div class="row"><span class="lbl">${escHtml(x.subject)}·${escHtml(x.chapter)}</span><div class="track"><div class="fill" style="width:${x.accuracy}%"></div></div><span class="val">${x.accuracy}%</span></div>`
  ).join('')
  const examRows = (examHistory.value || []).slice(0, 10).map(e =>
    `<div class="exam-row"><span class="d">${escHtml(formatTime(e.created_at))}</span><span class="s">${e.score} 分</span><span class="c">答对 ${e.correct}/${e.total}</span></div>`
  ).join('')
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>学习报告 - ${escHtml(user.nickname || '考生')}</title>
<style>
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; max-width: 820px; margin: 0 auto; padding: 32px 24px; color: #1f2937; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  .sub { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  .sec { border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; page-break-inside: avoid; }
  .sec h2 { font-size: 16px; margin: 0 0 14px; padding-bottom: 8px; border-bottom: 2px solid #4f5ff0; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .cell { text-align: center; background: #f9fafb; border-radius: 10px; padding: 14px 8px; }
  .cell .num { font-size: 22px; font-weight: 800; color: #4f5ff0; }
  .cell .lbl { font-size: 13px; color: #6b7280; margin-top: 4px; }
  .row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; font-size: 13px; }
  .row .lbl { width: 170px; flex-shrink: 0; }
  .row .track { flex: 1; height: 10px; background: #f0f2f8; border-radius: 999px; overflow: hidden; }
  .row .fill { height: 100%; background: #4f5ff0; border-radius: 999px; }
  .row .val { width: 70px; text-align: right; color: #374151; }
  .exam-row { display: flex; gap: 16px; padding: 8px 0; border-bottom: 1px dashed #e5e7eb; font-size: 13px; }
  .exam-row .d { color: #6b7280; }
  .exam-row .s { font-weight: 700; color: #4f5ff0; }
  .exam-row .c { margin-left: auto; color: #6b7280; }
  .note { font-size: 13px; color: #9ca3af; margin-top: 16px; line-height: 1.8; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>我的学习报告</h1>
  <div class="sub">云南春招智能学习平台 · ${escHtml(user.nickname || '考生')} · 生成时间 ${new Date().toLocaleString('zh-CN', { hour12: false })}</div>

  <div class="sec">
    <h2>学习概览</h2>
    <div class="grid">
      <div class="cell"><div class="num">${m.total || 0}</div><div class="lbl">累计答题</div></div>
      <div class="cell"><div class="num">${m.accuracy || 0}%</div><div class="lbl">正确率</div></div>
      <div class="cell"><div class="num">${m.sessions || 0}</div><div class="lbl">练习次数</div></div>
      <div class="cell"><div class="num">${m.totalScore ?? '—'}</div><div class="lbl">总分测算</div></div>
    </div>
  </div>

  <div class="sec">
    <h2>分数预测</h2>
    <div class="grid">
      <div class="cell"><div class="num">${m.predict?.info_tech ?? 0}</div><div class="lbl">信息技术 /150</div></div>
      <div class="cell"><div class="num">${m.predict?.general_tech ?? 0}</div><div class="lbl">通用技术 /150</div></div>
      <div class="cell"><div class="num">${m.predict?.total ?? 0}</div><div class="lbl">职业技能 /300</div></div>
      <div class="cell"><div class="num">${m.cultural ?? '—'}</div><div class="lbl">文化素质 /300</div></div>
    </div>
  </div>

  <div class="sec">
    <h2>分科表现</h2>
    ${subjRows || '<p style="color:#9ca3af">暂无答题数据</p>'}
  </div>

  <div class="sec">
    <h2>知识点掌握度</h2>
    ${masteryRows || '<p style="color:#9ca3af">暂无章节练习数据</p>'}
  </div>

  <div class="sec">
    <h2>模拟考试记录</h2>
    ${examRows || '<p style="color:#9ca3af">暂无模拟考试记录</p>'}
  </div>

  <div class="note">注：分数预测与文化素质折算为平台基于刷题数据的估算，仅供参考，实际成绩以云南省招生考试院官方公布为准。</div>
  <script>window.onload = () => setTimeout(() => window.print(), 300)<\/script>
</body>
</html>`
  downloadHtml(html, `学习报告_${user.nickname || '考生'}.html`)
}

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function exportWrong() {
  if (!wrongList.value.length) return
  const items = wrongList.value.map((q, i) => {
    const opts = (q.options || []).map(o => `<div class="opt">${escHtml(o)}</div>`).join('')
    return `
      <div class="q-item">
        <div class="q-head"><span class="q-no">${i + 1}</span><span class="tag">${escHtml(q.subject)}</span><span class="tag">${escHtml(q.chapter)}</span></div>
        <p class="q-stem">${escHtml(q.stem)}</p>
        <div class="q-opts">${opts}</div>
        <div class="q-ans">正确答案：${escHtml(q.answer)}</div>
        <div class="q-ana"><strong>解析：</strong>${escHtml(q.analysis)}</div>
      </div>`
  }).join('')
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>我的错题本 - 云南春招智能学习平台</title>
<style>
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; max-width: 800px; margin: 0 auto; padding: 32px 24px; color: #1f2937; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  .q-item { border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 18px; margin-bottom: 16px; page-break-inside: avoid; }
  .q-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .q-no { width: 24px; height: 24px; border-radius: 50%; background: #4f5ff0; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
  .tag { font-size: 13px; padding: 2px 10px; border-radius: 999px; background: #eff6ff; color: #4f5ff0; }
  .q-stem { font-weight: 600; line-height: 1.8; margin: 0 0 12px; }
  .q-opts { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
  .opt { font-size: 14px; color: #374151; }
  .q-ans { font-size: 14px; font-weight: 700; color: #047857; margin-bottom: 8px; }
  .q-ana { font-size: 13px; color: #6b7280; line-height: 1.8; background: #f9fafb; padding: 10px 12px; border-radius: 8px; }
  @media print { body { padding: 0; } .q-item { border-color: #ccc; } }
</style>
</head>
<body>
  <h1>我的错题本</h1>
  <div class="sub">云南春招智能学习平台 · 共 ${wrongList.value.length} 题 · 导出时间 ${new Date().toLocaleString('zh-CN', { hour12: false })}</div>
  ${items}
  <script>window.onload = () => setTimeout(() => window.print(), 300)<\/script>
</body>
</html>`
  downloadHtml(html, `错题本_${new Date().toISOString().slice(0, 10)}.html`)
}

async function openReview(e) {
  review.value = null
  reviewLoading.value = true
  try {
    review.value = await api.get(`/practice/sessions/${e.id}`)
  } catch (err) {
    toast(err.message || '加载失败，请稍后重试', 'error')
  } finally {
    reviewLoading.value = false
  }
}

async function loadFavs() {
  try {
    favList.value = await api.get('/favorites')
  } catch (e) { /* 忽略 */ }
}

async function unfav(q) {
  try {
    await api.post('/favorites/toggle', { question_id: q.id })
    const fav = JSON.parse(localStorage.getItem('saixt_favs') || '{}')
    delete fav[q.id]
    localStorage.setItem('saixt_favs', JSON.stringify(fav))
    await loadFavs()
  } catch (e) {
    toast(e.message || '操作失败，请稍后重试', 'error')
  }
}

function pct(a, b) {
  if (!b) return '0%'
  return Math.min(100, Math.round((a / b) * 100)) + '%'
}

function barHeight(t) {
  if (!t.total) return '3px'
  const max = Math.max(...trend.value.map(x => x.total), 1)
  return Math.max(8, Math.round((t.total / max) * 100)) + '%'
}
function dayLabel(date) {
  const d = new Date(date + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}
const todayStr = new Date().toISOString().slice(0, 10)
function isToday(date) { return date === todayStr }
function accuracyOf(s) { return s.total ? Math.round((s.correct / s.total) * 100) : 0 }
// 分科表现按练习题量降序，练习最多的科目排在最前
const sortedSubjects = computed(() =>
  [...stats.value.bySubject].sort((a, b) => b.total - a.total)
)
function formatTime(t) {
  return (t || '').replace('T', ' ').slice(0, 16)
}
function scoreClass(score) {
  if (score >= 85) return 'good'
  if (score >= 70) return 'mid'
  return 'bad'
}

const scoreTrend = computed(() => {
  const list = [...examHistory.value].reverse()
  if (list.length < 2) return []
  return list.map((e, i) => {
    const x = (i / (list.length - 1)) * 320
    const y = 88 - Math.max(0, Math.min(100, e.score)) * 0.8
    return { x, y, score: e.score, left: (i / (list.length - 1)) * 100 }
  })
})
const scorePoints = computed(() => scoreTrend.value.map(p => `${p.x},${p.y}`).join(' '))
const bestScore = computed(() => examHistory.value.length ? Math.max(...examHistory.value.map(e => e.score)) : 0)
const scoreStroke = 'var(--accent)'
const hoverIndex = ref(-1)
const goalState = computed(() => goalProgress(stats.value.totalScore, profile.target_score))
const goalPctNum = computed(() => goalState.value.pct)
const goalPct = computed(() => goalState.value.pct + '%')
const goalPctTier = computed(() => goalState.value.tier)
const goalGap = computed(() => {
  const cur = Number(stats.value.totalScore)
  const target = Number(profile.target_score)
  if (!cur || !target) return 0
  return Math.max(0, target - cur)
})

// 雷达图数据：取练习量最大的前 6 个章节，按掌握度绘制
const radarData = computed(() => {
  const list = [...mastery.value.list]
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
  return list.map(m => ({
    label: m.chapter,
    value: m.accuracy,
    color: subjectColor(m.subject),
    subject: m.subject,
    chapter: m.chapter
  }))
})

// 点击雷达图章节直达对应练习
function onRadarSelect(d) {
  router.push({
    path: '/practice',
    query: { subject: d.subject, chapter: d.chapter }
  })
}

function toggleHuiKao(hk) {
  const i = huiKao.value.indexOf(hk)
  if (i >= 0) huiKao.value.splice(i, 1)
  else huiKao.value.push(hk)
}

async function explainWrong(q) {
  if (aiExplain.value[q.id]) {
    delete aiExplain.value[q.id]
    if (aiTypingId.value === q.id) aiTypingId.value = null
    return
  }
  aiLoadingId.value = q.id
  try {
    const data = await api.post('/ai/explain', { question_id: q.id })
    aiExplain.value[q.id] = data.reply
    aiTypingId.value = q.id
    typeExplain(data.reply)
    window.dispatchEvent(new Event('ai-quota-refresh'))
  } catch (e) {
    toast(e.message || 'AI 讲解失败，请稍后重试', 'error')
  } finally {
    aiLoadingId.value = null
  }
}

async function doCheckin() {
  if (checking.value || checkin.value.checkedToday) return
  checking.value = true
  try {
    await api.post('/checkin')
    const ck = await api.get('/checkin/me')
    checkin.value = ck
    // 打卡可能伴随积分奖励，即时刷新让奖励"看得见"
    try {
      const p = await api.get('/points/me')
      points.value = p.balance ?? 0
    } catch (e) { /* 忽略积分刷新失败 */ }
    toast(`打卡成功！已连续 ${ck.streak} 天`, 'success')
  } catch (e) {
    toast(e.message || '打卡失败，请稍后重试', 'error')
  } finally {
    checking.value = false
  }
}

// 今日已完成刷题量（趋势最后一项为今天）
const todayDone = computed(() => {
  const t = trend.value
  if (!t.length) return 0
  const last = t[t.length - 1]
  return isToday(last.date) ? last.total : 0
})

// 聚合实时数据生成今日学习建议：打卡/复习/薄弱点/刷题，形成优先级行动清单
const todayTips = computed(() => {
  const tips = []
  if (!checkin.value.checkedToday) {
    tips.push({ icon: '📅', text: '今天还没打卡', sub: '连续打卡有额外积分奖励，养成习惯', to: null, onClick: doCheckin })
  }
  if (reviewDue.value > 0) {
    tips.push({ icon: '🔔', text: `还有 ${reviewDue.value} 道错题到了复习时间`, sub: '遗忘曲线智能提醒，及时复习记得更牢', to: '/review' })
  }
  const weak = mastery.value.weak[0]
  if (weak) {
    tips.push({
      icon: '🎯',
      text: `优先补强薄弱章节「${weak.subject}·${weak.chapter}」`,
      sub: `当前正确率 ${weak.accuracy}%，低于 60%`,
      to: { path: '/ai-practice', query: { subject: weak.subject, chapter: weak.chapter } }
    })
  }
  if (todayDone.value === 0) {
    tips.push({ icon: '✏️', text: '今天还没开始刷题', sub: '去刷几题，让掌握度测算更准', to: '/practice' })
  } else if (todayDone.value < 20) {
    tips.push({ icon: '🚀', text: `今天已刷 ${todayDone.value} 题`, sub: '保持节奏，目标可以后再冲刺', to: '/practice' })
  }
  return tips
})
function runTip(t) {
  if (t.linkTo) return
  if (t.onClick) { t.onClick(); return }
  if (t.to) router.push(t.to)
}

async function saveProfile() {
  saving.value = true
  try {
    await api.put('/auth/profile', {
      target_school: profile.target_school,
      target_score: profile.target_score || null,
      hui_kao: huiKao.value,
      hui_kao_scores: huiKaoScores,
      org: profile.org
    })
    toast('目标已保存', 'success')
    const me = await api.get('/stats/me')
    stats.value = me
  } catch (e) {
    toast(e.message || '保存失败，请稍后重试', 'error')
  } finally {
    saving.value = false
  }
}

async function loadAll() {
  loading.value = true
  loadError.value = false
  try {
    const [me, wrong, ck, mk, tr, ex] = await Promise.all([
      api.get('/stats/me'),
      api.get('/practice/wrong'),
      api.get('/checkin/me'),
      api.get('/stats/mastery'),
      api.get('/stats/trend'),
      api.get('/practice/sessions')
    ])
    stats.value = me
    wrongList.value = wrong
    checkin.value = ck
    mastery.value = mk
    trend.value = tr.list
    examHistory.value = ex
    await loadFavs()
    favCount.value = favList.value.length
    try {
      achievements.value = await api.get('/achievements')
    } catch (e) { /* 忽略成就加载失败 */ }
    try {
      const rs = await api.get('/practice/review/summary')
      reviewDue.value = rs.dueToday
    } catch (e) { /* 忽略复习提醒加载失败 */ }
    try {
      const m = await api.get('/membership/me')
      membership.value = m
    } catch (e) { /* 忽略会员加载失败 */ }
    try {
      const p = await api.get('/points/me')
      points.value = p.balance ?? 0
    } catch (e) { /* 忽略积分加载失败 */ }
    try {
      const p = await api.get('/auth/me')
      if (p.profile) {
        profile.target_school = p.profile.target_school || ''
        profile.target_score = p.profile.target_score || null
        profile.org = p.profile.org || ''
        huiKao.value = p.profile.hui_kao ? JSON.parse(p.profile.hui_kao) : []
        if (p.profile.hui_kao_scores) {
          Object.assign(huiKaoScores, JSON.parse(p.profile.hui_kao_scores))
        }
      }
    } catch (e) { /* 忽略资料加载失败 */ }
  } catch (e) {
    loadError.value = true
    toast(e.message || '数据加载失败，请刷新重试', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)
</script>

<style scoped>
.welcome {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  padding: 22px 24px; margin-bottom: 20px;
  background: linear-gradient(100deg, var(--surface) 0%, var(--accent-soft) 140%);
}
.review-banner {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 16px 22px; margin-bottom: 20px;
  border: 1px solid rgba(79, 95, 240, 0.22);
  background: linear-gradient(100deg, var(--accent-soft), rgba(79, 95, 240, 0.03));
}
.load-error {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 16px 22px; margin-bottom: 20px;
  border: 1px solid var(--red-soft);
  background: var(--red-soft);
}
.le-icon { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 12px; background: var(--red-soft); color: var(--red); flex-shrink: 0; }
.le-icon svg { width: 22px; height: 22px; }
.le-text { flex: 1; min-width: 200px; }
.le-text strong { display: block; font-size: 1rem; color: var(--ink); }
.le-text span { font-size: 0.85rem; color: var(--muted); }
.le-btn { white-space: nowrap; }
.rb-icon { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); flex-shrink: 0; }
.rb-icon svg { width: 22px; height: 22px; }
.rb-text { flex: 1; min-width: 200px; }
.rb-text strong { display: block; font-size: 1.05rem; color: var(--accent); }
.rb-text span { font-size: 0.85rem; color: var(--muted); }
.rb-btn { white-space: nowrap; }

/* 今日学习建议 */
.today-tips { padding: 18px 22px; margin-bottom: 20px; }
.tt-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
.tt-head h3 { font-size: 1.12rem; }
.tt-sub { font-size: 0.8rem; color: var(--muted); }
.tt-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.tt-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 12px;
  background: var(--surface-2); border: 1px solid var(--rule);
  transition: transform 0.2s var(--ease), box-shadow 0.2s var(--ease), border-color 0.2s var(--ease), background-color 0.2s var(--ease);
}
.tt-item.clickable { cursor: pointer; }
.tt-item.clickable:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); border-color: var(--accent); background: var(--surface); }
.tt-icon { flex: 0 0 auto; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--rule); font-size: 1.15rem; }
.tt-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tt-text strong { font-size: 0.92rem; color: var(--ink); font-weight: 700; }
.tt-text em { font-style: normal; font-size: 0.78rem; color: var(--muted); }
.tt-go { flex: 0 0 auto; color: var(--muted); }
.tt-go svg { width: 15px; height: 15px; }
.tt-item:hover .tt-go { color: var(--accent); }
@media (max-width: 600px) { .tt-list { grid-template-columns: 1fr; } }
.w-avatar {
  width: 54px; height: 54px; border-radius: 16px;
  background: var(--grad-accent);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 1.3rem;
  box-shadow: 0 3px 10px rgba(79, 95, 240, 0.26);
}
.w-info { flex: 1; min-width: 180px; }
.w-info h2 { font-size: 1.3rem; }
.w-info p { color: var(--muted); font-size: 0.9rem; margin-top: 2px; }
.w-membership { display: flex; gap: 8px; flex-wrap: wrap; }
.wm-item {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 13px; border-radius: 999px;
  background: var(--surface-2); border: 1px solid var(--rule-strong);
  color: var(--ink-soft); font-size: 0.82rem; font-weight: 600; white-space: nowrap;
  transition: border-color 0.2s var(--ease), color 0.2s var(--ease), background-color 0.2s var(--ease), transform 0.15s var(--ease), box-shadow 0.2s var(--ease);
}
.wm-item svg { width: 15px; height: 15px; }
.wm-item:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); transform: translateY(-1px); box-shadow: 0 3px 8px rgba(79, 95, 240, 0.12); }
.wm-item:active { transform: scale(0.96); }
.wm-item.vip { background: linear-gradient(135deg, #fdf6ee, #fff); border-color: #e6c15a; color: #92400e; }
.wm-item.vip:hover { border-color: #d9a066; background: #fdf6ee; box-shadow: 0 3px 8px rgba(217, 160, 102, 0.18); }
@media (max-width: 600px) {
  .wm-item { min-height: 44px; padding: 8px 14px; }
}

.stat-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; margin-bottom: 20px; }
.stat-card { text-align: center; padding: 18px 10px; transition: transform 0.25s var(--ease), box-shadow 0.25s var(--ease); }
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
.stat-ic {
  width: 36px; height: 36px; margin: 0 auto 10px; border-radius: 11px;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft); color: var(--accent);
  transition: transform 0.25s var(--ease);
}
.stat-card:hover .stat-ic { transform: scale(1.08); }
.stat-ic.green { background: var(--green-soft); color: var(--green); }
.stat-ic.red { background: var(--red-soft); color: var(--red); }
.stat-ic.purple { background: var(--accent-soft); color: var(--accent); }
.stat-ic.amber { background: var(--amber-soft); color: var(--amber); }
.stat-ic svg { width: 18px; height: 18px; }
.stat-num { font-size: 1.6rem; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.stat-num.green { color: var(--green); }
.stat-num.red { color: var(--red); }
.stat-num.purple { color: var(--accent); }
.stat-num.amber { color: var(--amber); }
.stat-num.muted { color: var(--muted-2); }
.stat-lbl { font-size: 0.8rem; color: var(--muted); margin-top: 2px; }

.checkin-card { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; margin-bottom: 20px; padding: 20px 24px; }
.ck-left { display: flex; align-items: center; gap: 16px; }
.ck-title h3 { font-size: 1.15rem; }
.ck-sub { font-size: 0.82rem; color: var(--muted); }
.ck-btn { white-space: nowrap; }
.ck-stats { display: flex; gap: 24px; }
.ck-stat { text-align: center; }
.ck-num { font-size: 1.6rem; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
.ck-stat:nth-child(2) .ck-num { color: var(--green); }
.ck-stat:nth-child(3) .ck-num { color: var(--accent-deep); }
.ck-lbl { font-size: 0.78rem; color: var(--muted); }
.ck-heat { display: flex; gap: 4px; margin-left: auto; }
.ck-week { display: flex; flex-direction: column; gap: 4px; }
.ck-cell { width: 11px; height: 11px; border-radius: 3px; background: var(--rule); transition: transform 0.15s var(--ease), background-color 0.15s var(--ease); }
.ck-cell.on { background: var(--accent); }
.ck-cell.today { outline: 2px solid var(--amber); outline-offset: 1px; }
.ck-cell.today:not(.on) { background: var(--amber-light); }
.ck-cell:hover { transform: scale(1.35); }

.weak-tip { font-size: 0.82rem; color: var(--red); font-weight: 600; }

.ach-strip { padding: 18px 22px; margin-bottom: 20px; }
.ach-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.ach-head h3 { font-size: 1.12rem; }
.ach-sub { font-size: 0.82rem; color: var(--muted); }
.ach-badges { display: flex; gap: 10px; flex-wrap: wrap; }
.ach-badge {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-radius: 999px; font-size: 0.82rem; font-weight: 600;
  border: 1px solid var(--rule); background: var(--surface); color: var(--muted);
}
.ach-badge.bronze { border-color: #d9a066; color: #92400e; background: #fdf6ee; }
.ach-badge.silver { border-color: #b9c2cc; color: #475569; background: #f2f5f8; }
.ach-badge.gold { border-color: #e6c15a; color: #92400e; background: #fdf8e8; }
.ach-badge.locked { opacity: 0.5; filter: grayscale(1); }
.ab-icon { font-size: 1rem; }
.radar-box { margin-bottom: 18px; padding: 8px 0 4px; }
.radar-tip { text-align: center; font-size: 0.78rem; color: var(--muted); margin-top: 10px; }
.weak-box { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; padding: 10px 14px; background: var(--red-soft); border-radius: 10px; font-size: 0.85rem; }
.weak-tag { padding: 3px 10px; border-radius: 999px; background: var(--red); color: #fff; font-size: 0.78rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; transition: background-color 0.2s var(--ease), transform 0.15s var(--ease), box-shadow 0.2s var(--ease); }
.weak-tag:hover { background: #e11d48; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(225, 29, 72, 0.3); }
.weak-go { font-size: 0.78rem; opacity: 0.85; }
.mastery-list { display: flex; flex-direction: column; gap: 12px; }
.mrow { display: flex; align-items: center; gap: 12px; }
.mrow-name { font-size: 0.88rem; color: var(--ink); width: 180px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mrow-track { flex: 1; height: 10px; border-radius: 999px; background: var(--rule); overflow: hidden; }
.mrow-fill { height: 100%; border-radius: 999px; transition: width 0.4s var(--ease); }
.mrow-fill.good { background: var(--green); }
.mrow-fill.mid { background: var(--amber); }
.mrow-fill.bad { background: var(--red); }
.mrow-num { font-size: 0.85rem; font-weight: 700; color: var(--ink); width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
.mrow-num.bad-text { color: var(--red); }
.mrow-btn {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft); color: var(--accent); font-size: 0.85rem; font-weight: 700;
  transition: background-color 0.2s var(--ease), color 0.2s var(--ease), box-shadow 0.2s var(--ease), transform 0.15s var(--ease);
}
.mrow-btn:hover { background: var(--accent); color: #fff; }
.mrow-btn:active { transform: scale(0.92); }

.dash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.panel { margin-bottom: 20px; }
.panel h3 { font-size: 1.12rem; margin-bottom: 4px; }
.panel-sub { color: var(--muted); font-size: 0.85rem; margin-bottom: 16px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.panel-head-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.panel-count { font-size: 0.85rem; color: var(--muted); }
.redo-btn { padding: 6px 14px; font-size: 0.85rem; }

.predict { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }
.predict-main { text-align: center; }
.predict-score {
  font-size: 3rem; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums;
  background: var(--grad-accent); -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.predict-unit { color: var(--muted); font-size: 0.85rem; }
.predict-bars { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 14px; }
.pbar-head { display: flex; justify-content: space-between; font-size: 0.88rem; margin-bottom: 6px; }
.pbar-head strong { color: var(--ink); }
.pbar-track { height: 10px; border-radius: 999px; background: var(--rule); overflow: hidden; }
.pbar-fill { height: 100%; border-radius: 999px; }
.pbar-fill.blue { background: var(--accent); }
.pbar-fill.purple { background: #6d28d9; }

.total-score { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.ts-main { text-align: center; }
.ts-score { font-size: 2.8rem; font-weight: 800; color: #0b926b; line-height: 1.1; font-variant-numeric: tabular-nums; }
.ts-unit { color: var(--muted); font-size: 0.85rem; }
.ts-parts { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 10px; }
.ts-part { display: flex; align-items: baseline; gap: 8px; padding: 8px 12px; border-radius: 10px; background: var(--accent-soft); }
.ts-lbl { font-size: 0.85rem; color: var(--muted); width: 56px; }
.ts-part strong { font-size: 1.05rem; color: var(--ink); font-variant-numeric: tabular-nums; }
.ts-hint { margin-left: auto; font-size: 0.78rem; color: var(--muted); }
.ts-tip { margin-top: 12px; font-size: 0.82rem; color: #92400e; background: var(--amber-soft); padding: 8px 12px; border-radius: 8px; }

.grade-grid { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto; padding-right: 6px; overscroll-behavior: contain; }
.grade-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 0; border-bottom: 1px dashed var(--rule); }
.grade-name { font-size: 0.85rem; color: var(--ink); width: 70px; flex-shrink: 0; }
.grade-opts { display: flex; gap: 6px; }
.grade-chip {
  width: 36px; height: 36px; border-radius: 9px; border: 1px solid var(--rule);
  background: var(--surface); color: var(--muted); font-size: 0.8rem; font-weight: 600;
  transition: border-color 0.2s var(--ease), color 0.2s var(--ease), background-color 0.2s var(--ease), transform 0.15s var(--ease);
}
.grade-chip:hover { border-color: var(--accent); color: var(--accent); }
.grade-chip:active { transform: scale(0.94); }
.grade-chip.on { background: var(--accent); color: #fff; border-color: transparent; }

.form { display: flex; flex-direction: column; gap: 12px; }
.form label { display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; color: var(--muted); }
.form input { padding: 9px 12px; border: 1px solid var(--rule); border-radius: 10px; font-size: 0.92rem; outline: none; transition: border-color 0.25s var(--ease), box-shadow 0.25s var(--ease); }
.form input:hover { border-color: #d6dae6; }
.form input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.hui-kao { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  padding: 5px 11px; border-radius: 999px; border: 1px solid var(--rule);
  background: var(--surface); color: var(--muted); font-size: 0.8rem; transition: border-color 0.2s var(--ease), color 0.2s var(--ease), background-color 0.2s var(--ease), box-shadow 0.2s var(--ease);
}
.chip:hover:not(.on) { border-color: var(--accent); color: var(--accent); }
.chip.on { background: var(--accent); color: #fff; border-color: transparent; }
.save-btn { align-self: flex-start; margin-top: 4px; }

.subject-rows { display: flex; flex-direction: column; gap: 12px; }
.srow { display: flex; align-items: center; gap: 12px; }
.srow-name { width: 90px; font-size: 0.9rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.srow-track { flex: 1; height: 12px; border-radius: 999px; background: var(--rule); overflow: hidden; }
.srow-fill { height: 100%; border-radius: 999px; }
.srow-fill.blue { background: var(--accent); }
.srow-fill.purple { background: var(--accent-2); }
.srow-num { font-size: 0.88rem; color: var(--muted); min-width: 60px; text-align: right; font-variant-numeric: tabular-nums; }

.wrong-list { display: flex; flex-direction: column; gap: 12px; }
.wrong-item { padding: 14px 16px; border: 1px solid var(--rule); border-radius: 12px; }
.w-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.w-ans { margin-left: auto; font-size: 0.85rem; color: var(--green); font-weight: 600; }
.w-stem { font-weight: 600; margin: 10px 0 8px; line-height: 1.7; }

.fav-list { display: flex; flex-direction: column; gap: 12px; }
.fav-item {
  padding: 14px 16px; border: 1px solid var(--rule); border-radius: 12px;
  background: linear-gradient(180deg, #fffdf6, #fff); border-left: 3px solid #f59e0b;
}
.f-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fav-star {
  width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0;
  background: #fef3c7; color: #f59e0b;
  display: inline-flex; align-items: center; justify-content: center;
}
.fav-star svg { width: 13px; height: 13px; }
.f-ans { margin-left: auto; font-size: 0.85rem; color: var(--green); font-weight: 600; }
.f-stem { font-weight: 600; margin: 10px 0 8px; line-height: 1.7; }
.f-analysis { font-size: 0.88rem; color: var(--muted); line-height: 1.8; padding: 10px 12px; background: #fffbeb; border-radius: 10px; }
.f-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }

.q-image {
  margin: 0 0 10px; padding: 12px; border-radius: 10px;
  background: var(--surface-2, #f8fafc); border: 1px dashed var(--rule);
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; align-items: center;
}
.q-image img { max-width: 100%; max-height: 260px; object-fit: contain; border-radius: 6px; }

.w-analysis { font-size: 0.88rem; color: var(--muted); line-height: 1.8; padding: 10px 12px; background: var(--accent-soft); border-radius: 10px; }
.w-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.btn-sm { padding: 6px 14px; font-size: 0.85rem; }
.ai-explain { margin-top: 12px; padding: 14px 16px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--rule); border-left: 3px solid var(--accent); }
.ai-explain-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.ai-badge {
  width: 24px; height: 24px; border-radius: 7px; font-size: 0.78rem; font-weight: 800;
  background: var(--accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.ai-explain-head strong { font-size: 0.9rem; }
.ai-explain-body { font-size: 0.9rem; line-height: 1.9; white-space: pre-wrap; word-break: break-word; }

.trend-chart { display: flex; align-items: flex-end; gap: 6px; height: 170px; padding-top: 12px; }
.trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; min-width: 0; }
.trend-bar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
.trend-bar { width: 62%; min-height: 3px; border-radius: 4px 4px 0 0; background: var(--accent); transition: height 0.3s var(--ease); }
.trend-bar.good { background: var(--green); }
.trend-bar.mid { background: var(--amber); }
.trend-bar.bad { background: var(--red); }
.trend-bar.empty { background: var(--rule); }
.trend-num { font-size: 0.78rem; color: var(--muted-2); font-variant-numeric: tabular-nums; line-height: 1; }
.trend-col.today .trend-num { color: var(--accent); font-weight: 700; }
.trend-col.today .trend-day {
  color: #fff; font-weight: 700; background: var(--accent);
  padding: 1px 7px; border-radius: 999px;
}
.trend-day { font-size: 0.78rem; color: var(--muted); white-space: nowrap; }

.score-chart { margin-bottom: 16px; padding: 14px 16px; border: 1px solid var(--rule); border-radius: 12px; background: var(--surface); }
.sc-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
.sc-head > span:first-child { font-size: 0.95rem; font-weight: 700; }
.sc-sub { font-size: 0.78rem; color: var(--muted); }
.sc-best { color: var(--green); font-size: 0.9rem; font-variant-numeric: tabular-nums; }
.sc-svg { width: 100%; height: 90px; display: block; }
.sc-labels { position: relative; height: 18px; margin-top: 4px; }
.sc-label { position: absolute; transform: translateX(-50%); font-size: 0.78rem; color: var(--muted); }
.sc-wrap { position: relative; }
.sc-tooltip {
  position: absolute; top: 2px; transform: translateX(-50%);
  background: var(--ink); color: #fff; border-radius: 8px; padding: 5px 10px;
  font-size: 0.78rem; text-align: center; white-space: nowrap; pointer-events: none;
  box-shadow: 0 4px 12px rgba(0,0,0,0.25); z-index: 5;
}
.sc-tooltip strong { display: block; }
.sc-tooltip span { display: block; opacity: 0.85; font-size: 0.78rem; margin-top: 1px; }

.goal-progress { padding: 6px 0 2px; }
.gp-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 0.88rem; margin-bottom: 10px; flex-wrap: wrap; }
.gp-cur { color: var(--ink); }
.gp-target { color: var(--muted); display: inline-flex; align-items: center; gap: 8px; }
.gp-pct {
  font-size: 0.78rem; font-weight: 700; padding: 2px 9px; border-radius: 999px;
  background: var(--rule-soft); color: var(--muted); font-variant-numeric: tabular-nums;
}
.gp-track { height: 14px; border-radius: 999px; background: var(--rule); overflow: hidden; }
.gp-fill {
  height: 100%; border-radius: 999px; transition: width 0.5s var(--ease), background-color 0.5s var(--ease);
  background: var(--amber);
}
.gp-fill.on { background: var(--green); }
.gp-fill.low { background: var(--amber); }
.gp-fill.done { background: var(--grad-green); }
.gp-pct.on { background: var(--green-soft); color: var(--green); }
.gp-pct.low { background: var(--amber-soft); color: var(--amber); }
.gp-pct.done { background: var(--green-soft); color: var(--green); }
.gp-note { margin-top: 10px; font-size: 0.85rem; color: var(--muted); }
.gp-gap { color: var(--amber); font-weight: 700; font-variant-numeric: tabular-nums; }
.gp-done { color: var(--green); font-weight: 600; }

.exam-list { display: flex; flex-direction: column; gap: 10px; }
.exam-item { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border: 1px solid var(--rule); border-radius: 12px; }
.exam-score { width: 52px; height: 52px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 800; flex-shrink: 0; }
.exam-score.good { background: var(--green-soft); color: #047857; }
.exam-score.mid { background: var(--amber-soft); color: #b45309; }
.exam-score.bad { background: var(--red-soft); color: #be123c; }
.exam-info { display: flex; flex-direction: column; min-width: 0; }
.review-btn { margin-left: auto; }

.review-panel { margin-top: 16px; padding: 20px 22px; border: 1px solid var(--accent); }
.review-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.review-head h4 { font-size: 1.05rem; }
.review-sub { font-size: 0.82rem; color: var(--muted); }
.review-list { display: flex; flex-direction: column; gap: 14px; }
.review-item { padding: 16px 18px; border: 1px solid var(--rule); border-radius: 12px; }
.review-item.ok { border-left: 4px solid var(--green); }
.review-item.no { border-left: 4px solid var(--red); }
.rv-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.rv-no { width: 24px; height: 24px; border-radius: 50%; background: var(--rule); color: var(--muted); font-size: 0.78rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.rv-result { margin-left: auto; font-size: 0.85rem; font-weight: 700; }
.rv-result.ok { color: var(--green); }
.rv-result.no { color: var(--red); }
.rv-stem { font-weight: 600; line-height: 1.7; margin-bottom: 12px; }
.rv-opts { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.rv-opt { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--rule); border-radius: 10px; font-size: 0.9rem; }
.rv-opt.right { border-color: var(--green); background: var(--green-soft); }
.rv-opt.wrong { border-color: var(--red); background: var(--red-soft); }
.rv-letter { font-weight: 700; color: var(--accent); flex: 0 0 auto; }
.rv-text { flex: 1; }
.rv-mark { font-size: 0.78rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; flex: 0 0 auto; }
.rv-mark.right { background: var(--green); color: #fff; }
.rv-mark.wrong { background: var(--red); color: #fff; }
.rv-analysis { font-size: 0.88rem; color: var(--ink-soft); line-height: 1.8; padding: 12px 14px; background: var(--surface-2); border: 1px solid var(--rule); border-left: 3px solid var(--accent); border-radius: 12px; overflow-wrap: break-word; word-break: break-word; }
.exam-info strong { font-size: 0.95rem; }
.exam-info span { font-size: 0.8rem; color: var(--muted); }

@media (max-width: 900px) {
  .stat-grid { grid-template-columns: repeat(3, 1fr); }
  .dash-grid { grid-template-columns: 1fr; }
  .checkin-card { flex-direction: column; align-items: stretch; }
  .ck-left { justify-content: space-between; }
  .ck-heat { margin-left: 0; }
}
@media (max-width: 768px) {
  .stat-grid { grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .stat-card { padding: 14px 8px; }
  .stat-num { font-size: 1.4rem; }
  .stat-lbl { font-size: 0.78rem; }
  .checkin-card { gap: 18px; padding: 18px 18px; }
  .ck-stats { gap: 16px; }
  .predict { gap: 18px; }
  .total-score { gap: 16px; }
  .mrow-name { width: 130px; font-size: 0.84rem; }
  .srow-name { width: 76px; font-size: 0.84rem; }
}
@media (max-width: 1024px) and (min-width: 821px) {
  .grade-chip { min-width: 40px; min-height: 40px; width: auto; height: auto; padding: 0 10px; }
}
@media (max-width: 820px) {
  .grade-chip { min-width: 44px; min-height: 44px; width: auto; height: auto; padding: 0 12px; }
  .hui-kao .chip { min-height: 44px; display: inline-flex; align-items: center; padding: 5px 14px; }
}
@media (max-width: 600px) {
  .stat-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .stat-card { padding: 14px 8px; }
  .stat-num { font-size: 1.3rem; }
  .stat-lbl { font-size: 0.8rem; }
  .w-ans { margin-left: 0; width: 100%; }
  .welcome { padding: 16px 14px; }
  .w-info h2 { font-size: 1.15rem; }
  .w-info p { font-size: 0.84rem; }
  .w-actions { width: 100%; flex-wrap: wrap; }
  .w-actions .btn { flex: 1; min-width: 120px; }
  .ck-left { flex-direction: column; align-items: stretch; gap: 12px; }
  .ck-btn { width: 100%; }
  .ck-stats { justify-content: space-around; gap: 12px; }
  .ck-heat { overflow-x: auto; padding-bottom: 6px; }
  .ck-cell { width: 14px; height: 14px; }
  .ck-lbl { font-size: 0.82rem; }
  .mrow-name { width: 100px; font-size: 0.78rem; }
  .mrow-btn { width: 44px; height: 44px; }
  .srow-name { width: 64px; font-size: 0.78rem; }
  .predict { gap: 14px; }
  .predict-score { font-size: 2.2rem; }
  .predict-bars { min-width: 0; }
  .total-score { gap: 14px; }
  .ts-score { font-size: 2rem; }
  .ts-parts { min-width: 0; }
  .trend-chart { height: 140px; }
  .trend-day { font-size: 0.78rem; }
  .sc-svg { height: 80px; }
  .sc-label { font-size: 0.78rem; }
  .rv-no { width: 28px; height: 28px; font-size: 0.78rem; }
  .rv-mark { font-size: 0.78rem; }
  .review-item { padding: 14px 12px; }
  .review-panel { padding: 16px 14px; }
  .exam-item { padding: 10px 12px; gap: 10px; }
  .exam-score { width: 44px; height: 44px; font-size: 1rem; }
  .wrong-item { padding: 12px; }
  .w-stem { font-size: 0.9rem; }
  .w-analysis { font-size: 0.84rem; }
  .fav-item { padding: 12px; }
  .f-stem { font-size: 0.9rem; }
  .f-analysis { font-size: 0.84rem; }
  .f-ans { margin-left: 0; width: 100%; }
  .btn-sm { padding: 8px 14px; min-height: 44px; }
  .ach-strip { padding: 14px 16px; }
  .ach-badges { gap: 8px; }
  .ach-badge { padding: 8px 12px; font-size: 0.82rem; min-height: 40px; display: inline-flex; align-items: center; }
  .weak-tag { font-size: 0.82rem; padding: 5px 12px; min-height: 34px; }
  .panel h3 { font-size: 1.05rem; }
  .panel-sub { font-size: 0.8rem; }
  .panel-head { flex-wrap: wrap; gap: 10px; }
  .panel-head-right { width: 100%; justify-content: flex-start; flex-wrap: wrap; gap: 8px; }
  .form input { font-size: 1rem; }
}
@media (max-width: 400px) {
  .stat-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
  .stat-card { padding: 10px 6px; }
  .stat-num { font-size: 1.15rem; }
  .predict-score { font-size: 1.8rem; }
  .ts-score { font-size: 1.7rem; }
  .mrow-name { width: 80px; font-size: 0.78rem; }
  .srow-name { width: 56px; font-size: 0.78rem; }
}

/* ===== 骨架屏（与真实布局结构对齐） ===== */
.dash-skeleton .sk-welcome { display: flex; align-items: center; gap: 16px; padding: 18px 20px; margin-bottom: 20px; flex-wrap: wrap; }
.sk-avatar { width: 48px; height: 48px; border-radius: 50%; flex-shrink: 0; }
.sk-w-info { flex: 1; min-width: 140px; display: flex; flex-direction: column; gap: 8px; }
.sk-w-title { height: 18px; width: 60%; }
.sk-w-sub { height: 12px; width: 38%; }
.sk-w-actions { display: flex; gap: 10px; }
.sk-w-btn { height: 34px; width: 84px; border-radius: 10px; }

.stat-card .sk-stat-ic { width: 34px; height: 34px; border-radius: 10px; margin-bottom: 12px; }
.stat-card .sk-stat-num { height: 22px; width: 56%; margin-bottom: 8px; }
.stat-card .sk-stat-lbl { height: 12px; width: 42%; }

.sk-checkin { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; padding: 20px 24px; margin-bottom: 20px; }
.sk-ck-left { display: flex; flex-direction: column; gap: 12px; }
.sk-ck-title { height: 16px; width: 110px; }
.sk-ck-btn { height: 34px; width: 90px; border-radius: 10px; }
.sk-ck-stats { display: flex; gap: 40px; margin-left: auto; }
.sk-ck-stat { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.sk-ck-num { height: 20px; width: 44px; }
.sk-ck-lbl { height: 11px; width: 40px; }

.sk-ach { padding: 18px 22px; margin-bottom: 20px; }
.sk-ach-title { height: 16px; width: 120px; margin-bottom: 16px; }
.sk-ach-badges { display: flex; gap: 10px; flex-wrap: wrap; }
.sk-ach-badge { height: 34px; width: 84px; border-radius: 10px; }

.dash-grid .sk-chart { height: 260px; }

@media (max-width: 768px) {
  .sk-ck-stats { margin-left: 0; }
  .dash-grid .sk-chart { height: 220px; }
}
@media (max-width: 600px) {
  .sk-w-actions { width: 100%; }
  .sk-w-btn { flex: 1; }
  .sk-checkin { gap: 18px; padding: 18px; }
}
</style>
