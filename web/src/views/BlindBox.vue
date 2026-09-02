<template>
  <div class="blindbox-page">
    <!-- 顶部状态栏 -->
    <div class="bb-header">
      <div class="bbh-left">
        <div class="bbh-title">
          <span class="bbh-icon" v-html="ICONS.gift"></span>
          <h2>盲盒刷题</h2>
        </div>
        <p>抽盲盒、开惊喜、刷题涨分两不误</p>
      </div>
      <div class="bbh-stats">
        <div class="stat-item">
          <span class="stat-icon" v-html="ICONS.star"></span>
          <span class="stat-val">{{ totalScore }}</span>
          <span class="stat-lbl">总积分</span>
        </div>
        <div class="stat-item combo" :class="{ fire: combo >= 3 }">
          <span class="stat-icon" v-html="ICONS.flame"></span>
          <span class="stat-val">{{ combo }}</span>
          <span class="stat-lbl">连击</span>
        </div>
        <div class="stat-item">
          <span class="stat-icon" v-html="ICONS.box"></span>
          <span class="stat-val">{{ boxesOpened }}</span>
          <span class="stat-lbl">已开盒</span>
        </div>
      </div>
    </div>

    <!-- 选择科目阶段 -->
    <div v-if="phase === 'select'" class="select-phase">
      <div class="select-card">
        <div class="sc-icon" v-html="ICONS.gift"></div>
        <h3>选择科目，开启盲盒挑战</h3>
        <p>每个盲盒都有惊喜，稀有度越高分数越多</p>
        <div class="rarity-legend">
          <div class="rl-item" v-for="r in rarities" :key="r.level">
            <span class="rl-star" :style="{ color: r.color }">
              {{ '★'.repeat(r.level) }}
            </span>
            <span class="rl-name">{{ r.name }}</span>
            <span class="rl-score">+{{ r.score }}分</span>
          </div>
        </div>
        <div v-if="subjectLoading" class="subject-grid">
          <div v-for="i in 8" :key="i" class="subject-btn sk">
            <div class="skeleton sk-sb-name"></div>
            <div class="skeleton sk-sb-count"></div>
          </div>
        </div>
        <div v-else class="subject-grid">
          <button
            v-for="s in subjectList"
            :key="s.subject"
            class="subject-btn"
            @click="startGame(s.subject)"
          >
            <span class="sb-name">{{ s.subject }}</span>
            <span class="sb-count">{{ s.count }} 题</span>
          </button>
          <button class="subject-btn all-subject" @click="startGame('')">
            <span class="sb-spark" v-html="ICONS.sparkle"></span>
            <span class="sb-name">全部科目</span>
            <span class="sb-count">随机开盒</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 游戏阶段 -->
    <div v-else-if="phase === 'game'" class="game-phase">
      <!-- 当前科目显示 -->
      <div class="current-subject">
        <span>当前科目：<strong>{{ currentSubject || '全部科目' }}</strong></span>
        <button class="btn-ghost-sm" @click="backToSelect">换科目</button>
      </div>

      <!-- 盲盒待开状态 -->
      <div v-if="!currentQuestion" class="box-wrapper">
        <div 
          class="blind-box" 
          :class="{ shaking: isDrawing, opening: isOpening }"
          @click="drawBox"
        >
          <div class="box-body">
            <div class="box-face front">
              <span class="box-emoji" v-html="ICONS.box"></span>
              <span class="box-text">点击开盒</span>
            </div>
            <div class="box-face back">
              <span class="box-question">?</span>
            </div>
          </div>
          <div class="box-glow"></div>
          <div v-if="isDrawing" class="box-sparkles">
            <span v-for="n in 8" :key="n" class="sparkle" :style="{ '--i': n }" v-html="ICONS.sparkle"></span>
          </div>
        </div>
        <p class="box-hint">
          <template v-if="combo >= 3"><span class="hint-flame" v-html="ICONS.flame"></span>连击 {{ combo }}！当前加成 {{ comboBonus }}x</template>
          <template v-else>点击盲盒抽取题目</template>
        </p>
      </div>

      <!-- 题目显示 -->
      <div v-else class="question-card" :class="['rarity-' + currentRarity.level, { show: questionShown }]">
        <div class="qc-rarity">
          <span class="qr-stars" :style="{ color: currentRarity.color }">
            {{ '★'.repeat(currentRarity.level) }}
          </span>
          <span class="qr-name" :style="{ color: currentRarity.color }">
            {{ currentRarity.name }}
          </span>
          <span class="qr-score">+{{ currentRarity.score }}分</span>
        </div>
        <div class="qc-info">
          <span class="tag">{{ currentQuestion.subject }}</span>
          <span class="tag tag-purple">{{ currentQuestion.chapter }}</span>
        </div>
        <div class="qc-stem">{{ currentQuestion.stem }}</div>

        <!-- 选项 -->
        <div v-if="currentQuestion.type !== 'subjective'" class="qc-options">
          <button
            v-for="opt in currentQuestion.options"
            :key="opt[0]"
            class="qc-option"
            :class="{
              selected: selectedAnswer === opt[0],
              correct: answered && isCorrectOpt(opt[0]),
              wrong: answered && selectedAnswer === opt[0] && !isCorrect,
              disabled: answered
            }"
            :disabled="answered"
            @click="chooseAnswer(opt[0])"
          >
            <span class="qco-letter">{{ opt[0] }}</span>
            <span class="qco-text">{{ opt.slice(2) }}</span>
          </button>
        </div>

        <!-- 主观题 -->
        <div v-else class="qc-subjective">
          <p class="qs-hint">主观题请在心中作答，然后点击下方按钮查看答案</p>
          <button v-if="!answered" class="btn btn-primary" @click="submitSubjective()">查看答案</button>
        </div>

        <!-- 结果展示 -->
        <transition name="result">
          <div v-if="answered" class="qc-result" :class="isCorrect ? 'correct' : 'wrong'">
            <div class="qr-header">
              <span class="qr-icon" :class="isCorrect ? 'ok' : 'no'">
                <svg v-if="isCorrect" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/></svg>
              </span>
              <span class="qr-text">{{ isCorrect ? '答对了！' : '答错了' }}</span>
            </div>
            <div v-if="isCorrect" class="qr-score-gain">
              <span class="qsg-num">+{{ earnedScore }}</span>
              <span class="qsg-label">积分</span>
              <span v-if="comboBonus > 1" class="qsg-combo">连击 x{{ comboBonus }}</span>
            </div>
            <div class="qr-answer">
              <span>正确答案：</span>
              <strong>{{ currentQuestion.answer }}</strong>
            </div>
            <div v-if="currentQuestion.analysis" class="qr-analysis">
              <strong>解析：</strong>{{ currentQuestion.analysis }}
            </div>
            <button class="btn btn-primary qr-next" @click="nextBox">
              继续开盒 →
            </button>
          </div>
        </transition>

        <!-- 提交按钮 -->
        <div v-if="!answered && currentQuestion.type !== 'subjective'" class="qc-submit">
          <button 
            class="btn btn-primary submit-btn" 
            :disabled="!selectedAnswer"
            @click="submitAnswer"
          >
            确认答案
          </button>
        </div>
      </div>
    </div>

    <!-- 收集进度 -->
    <div class="collection-panel">
      <h4><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16v-5"/><path d="M12 16V8"/><path d="M17 16v-3"/></svg>本局收集</h4>
      <div class="collection-stats">
        <div v-for="r in rarities" :key="r.level" class="cs-item">
          <span class="cs-star" :style="{ color: r.color }">{{ '★'.repeat(r.level) }}</span>
          <span class="cs-count">{{ collection[r.level] || 0 }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>

import { toast } from '../toast'
import { ref, computed, onMounted } from 'vue'
import { api, getUser } from '../api.js'

const phase = ref('select') // select | game
const subjectList = ref([])
const subjectLoading = ref(true)
const currentSubject = ref('')
const currentQuestion = ref(null)
const currentRarity = ref({ level: 1, name: '普通', color: '#9ca3af', score: 10 })
const selectedAnswer = ref('')
const answered = ref(false)
const isCorrect = ref(false)
const earnedScore = ref(0)
const combo = ref(0)
const totalScore = ref(0)
const boxesOpened = ref(0)
const isDrawing = ref(false)
const isOpening = ref(false)
const questionShown = ref(false)
const collection = ref({})

const ICONS = {
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  gift: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8"/><path d="M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2c.6 3.4 1.6 4.8 4.8 5.4-3.2.6-4.2 2-4.8 5.4-.6-3.4-1.6-4.8-4.8-5.4 3.2-.6 4.2-2 4.8-5.4z"/></svg>`
}

const rarities = [
  { level: 1, name: '普通', color: '#9ca3af', weight: 60, score: 10 },
  { level: 2, name: '稀有', color: '#4f5ff0', weight: 25, score: 25 },
  { level: 3, name: '史诗', color: '#8b5cf6', weight: 12, score: 50 },
  { level: 4, name: '传说', color: '#f59e0b', weight: 3, score: 100 }
]

const comboBonus = computed(() => {
  return Math.min(2, 1 + combo.value * 0.1).toFixed(1)
})

function isCorrectOpt(optLetter) {
  if (!currentQuestion.value) return false
  const ans = currentQuestion.value.answer || ''
  if (currentQuestion.value.type === 'multiple') {
    return ans.includes(optLetter)
  }
  return ans === optLetter
}

async function loadSubjects() {
  subjectLoading.value = true
  try {
    const meta = await api.get('/questions/meta')
    subjectList.value = meta.subjects || []
  } catch (e) {
    console.error('加载科目失败:', e)
  } finally {
    subjectLoading.value = false
  }
}

function startGame(subject) {
  currentSubject.value = subject
  currentQuestion.value = null
  selectedAnswer.value = ''
  answered.value = false
  phase.value = 'game'
  combo.value = 0
  totalScore.value = 0
  boxesOpened.value = 0
  collection.value = {}
}

function backToSelect() {
  phase.value = 'select'
  currentQuestion.value = null
}

async function drawBox() {
  if (isDrawing.value || isOpening.value) return
  isDrawing.value = true

  // 抖动动画
  await new Promise(r => setTimeout(r, 600))
  isDrawing.value = false
  isOpening.value = true

  try {
    const data = await api.get(`/practice/blind-box/draw?subject=${encodeURIComponent(currentSubject.value)}`)
    currentQuestion.value = data.question
    currentRarity.value = data.rarity
    selectedAnswer.value = ''
    answered.value = false
    isCorrect.value = false
    boxesOpened.value++

    // 记录收集
    const lvl = data.rarity.level
    collection.value[lvl] = (collection.value[lvl] || 0) + 1

    await new Promise(r => setTimeout(r, 400))
    isOpening.value = false
    questionShown.value = true
  } catch (e) {
    toast('抽题失败：' + e.message, 'error')
    isDrawing.value = false
    isOpening.value = false
  }
}

function chooseAnswer(letter) {
  if (answered.value) return
  if (currentQuestion.value?.type === 'multiple') {
    // 多选题
    const current = selectedAnswer.value.split('').sort()
    const idx = current.indexOf(letter)
    if (idx >= 0) {
      current.splice(idx, 1)
    } else {
      current.push(letter)
      current.sort()
    }
    selectedAnswer.value = current.join('')
  } else {
    selectedAnswer.value = letter
  }
}

async function submitAnswer() {
  if (!selectedAnswer.value || answered.value) return
  try {
    const data = await api.post('/practice/blind-box/submit', {
      question_id: currentQuestion.value.id,
      answer: selectedAnswer.value
    })
    isCorrect.value = data.is_correct
    earnedScore.value = data.earned_score
    combo.value = data.new_combo
    // 用服务端权威判分结果回填答案与解析（抽题阶段不再下发，防泄露）
    if (data.correct_answer) currentQuestion.value.answer = data.correct_answer
    if (data.analysis) currentQuestion.value.analysis = data.analysis
    if (data.is_correct) {
      totalScore.value += data.earned_score
    }
    answered.value = true
  } catch (e) {
    toast('提交失败：' + e.message, 'error')
  }
}

async function submitSubjective() {
  // 主观题需显式自判：点击查看答案视为自判答对，由服务端记录
  try {
    const data = await api.post('/practice/blind-box/submit', {
      question_id: currentQuestion.value.id,
      answer: 'subjective',
      selfCorrect: true
    })
    isCorrect.value = data.is_correct
    earnedScore.value = data.earned_score
    combo.value = data.new_combo
    if (data.is_correct) {
      totalScore.value += data.earned_score
    }
    answered.value = true
  } catch (e) {
    toast('提交失败：' + e.message, 'error')
  }
}

function nextBox() {
  currentQuestion.value = null
  questionShown.value = false
  answered.value = false
  selectedAnswer.value = ''
}

onMounted(() => {
  loadSubjects()
})
</script>

<style scoped>
.blindbox-page {
  min-height: 600px;
  padding-bottom: 40px;
}

/* 顶部栏 */
.bb-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}
.bbh-title { display: flex; align-items: center; gap: 10px; margin: 0 0 4px; }
.bbh-icon {
  width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft); color: var(--accent);
}
.bbh-icon svg { width: 22px; height: 22px; }
.bbh-left h2 {
  font-size: 24px;
  margin: 0;
  color: var(--accent);
}
.bbh-left p {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}
.bbh-stats {
  display: flex;
  gap: 12px;
}
.stat-item {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: 12px;
  padding: 10px 18px;
  text-align: center;
  min-width: 80px;
}
.stat-icon { font-size: 18px; display: flex; align-items: center; justify-content: center; color: var(--muted); }
.stat-icon svg { width: 20px; height: 20px; }
.stat-item:nth-child(1) .stat-icon { color: var(--amber); }
.stat-item:nth-child(2) .stat-icon { color: var(--amber); }
.stat-item:nth-child(3) .stat-icon { color: var(--accent); }
.stat-val {
  font-size: 20px;
  font-weight: 700;
  color: var(--ink);
  display: block;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.stat-lbl {
  font-size: 12px;
  color: var(--muted);
}
.stat-item.combo.fire .stat-val {
  color: var(--amber);
  animation: pulse 0.5s ease infinite alternate;
}
@keyframes pulse {
  from { transform: scale(1); }
  to { transform: scale(1.1); }
}

/* 选择阶段 */
.select-phase {
  display: flex;
  justify-content: center;
}
.select-card {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: 20px;
  padding: 40px;
  max-width: 600px;
  width: 100%;
  text-align: center;
}
.sc-icon {
  width: 84px; height: 84px; margin: 0 auto 16px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 24px;
  background: var(--accent-soft);
  color: var(--accent);
}
.sc-icon svg { width: 42px; height: 42px; }
.select-card h3 { font-size: 22px; margin: 0 0 8px; display: flex; align-items: center; justify-content: center; gap: 8px; }
.select-card h3::before { content: ''; width: 4px; height: 18px; border-radius: 2px; background: var(--grad-accent); }
.select-card > p { color: var(--muted); margin-bottom: 20px; }

.rarity-legend {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}
.rl-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.rl-star { font-weight: bold; }
.rl-name { color: var(--ink); }
.rl-score { color: var(--muted); font-size: 12px; }

.subject-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}
.subject-btn {
  padding: 14px 12px;
  border: 1px solid var(--rule);
  border-radius: 10px;
  background: var(--surface);
  cursor: pointer;
  transition: border-color 0.25s var(--ease), background-color 0.25s var(--ease), box-shadow 0.25s var(--ease), transform 0.25s var(--ease);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.subject-btn:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(79, 95, 240, 0.15);
}
.subject-btn:active { transform: translateY(0) scale(0.985); }
.sb-name { font-weight: 600; font-size: 14px; }
.sb-count { font-size: 12px; color: var(--muted); }
.subject-btn.sk { cursor: default; }
.subject-btn.sk:hover { border-color: var(--rule); transform: none; box-shadow: none; }
.sk-sb-name { width: 60%; height: 14px; margin: 0 auto; }
.sk-sb-count { width: 36%; height: 11px; margin: 0 auto; }
.subject-btn.all-subject {
  border-style: dashed; border-color: rgba(79, 95, 240, 0.35);
  background: var(--accent-soft);
}
.subject-btn.all-subject:hover {
  border-color: var(--accent); border-style: dashed;
  background: var(--surface);
  box-shadow: 0 4px 12px rgba(79, 95, 240, 0.18);
}
.subject-btn.all-subject .sb-name { color: var(--accent); }
.subject-btn.all-subject .sb-count { color: var(--accent); opacity: 0.75; }
.sb-spark { width: 20px; height: 20px; color: var(--accent); margin: 0 auto 2px; }
.sb-spark svg { width: 20px; height: 20px; display: block; }

/* 游戏阶段 */
.game-phase {
  max-width: 640px;
  margin: 0 auto;
}
.current-subject {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  color: var(--muted);
  font-size: 14px;
}
.btn-ghost-sm {
  padding: 4px 12px;
  font-size: 13px;
  border: 1px solid var(--rule);
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.btn-ghost-sm:hover { color: var(--ink); border-color: var(--ink); }
.btn-ghost-sm:active { transform: scale(0.97); }

/* 盲盒 */
.box-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 0;
}
.blind-box {
  position: relative;
  width: 180px;
  height: 180px;
  cursor: pointer;
  perspective: 1000px;
}
.box-body {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s var(--ease);
  transform-style: preserve-3d;
}
.blind-box.opening .box-body {
  transform: rotateY(180deg);
}
.box-face {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.box-face.front {
  background: var(--accent);
  box-shadow: 0 10px 40px rgba(79, 95, 240, 0.35);
}
.box-face.back {
  background: linear-gradient(135deg, #f59e0b, #f97316);
  transform: rotateY(180deg);
}
.box-emoji { display: flex; color: #fff; }
.box-emoji svg { width: 64px; height: 64px; }
.box-text { color: #fff; font-weight: 600; font-size: 16px; }
.box-question { font-size: 80px; color: #fff; font-weight: bold; }

.box-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 240px;
  height: 240px;
  background: radial-gradient(circle, rgba(79, 95, 240, 0.3), transparent 70%);
  pointer-events: none;
  z-index: -1;
}
.blind-box.shaking .box-body {
  animation: shake 0.15s ease-in-out 4;
}
@keyframes shake {
  0%, 100% { transform: translateX(0) rotate(0); }
  25% { transform: translateX(-8px) rotate(-3deg); }
  75% { transform: translateX(8px) rotate(3deg); }
}

.box-sparkles {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 200px;
  height: 200px;
  pointer-events: none;
}
.sparkle {
  position: absolute;
  color: #fbbf24;
  width: 16px; height: 16px;
  animation: sparkle-fly 0.6s ease-out forwards;
  animation-delay: calc(var(--i) * 0.05s);
  opacity: 0;
}
.sparkle svg { width: 100%; height: 100%; display: block; }
.sparkle:nth-child(1) { top: 0; left: 50%; }
.sparkle:nth-child(2) { top: 15%; left: 85%; }
.sparkle:nth-child(3) { top: 50%; left: 100%; }
.sparkle:nth-child(4) { top: 85%; left: 85%; }
.sparkle:nth-child(5) { top: 100%; left: 50%; }
.sparkle:nth-child(6) { top: 85%; left: 15%; }
.sparkle:nth-child(7) { top: 50%; left: 0; }
.sparkle:nth-child(8) { top: 15%; left: 15%; }
@keyframes sparkle-fly {
  0% { opacity: 0; transform: scale(0); }
  50% { opacity: 1; transform: scale(1.5); }
  100% { opacity: 0; transform: scale(0.8) translateY(-20px); }
}

.box-hint {
  margin-top: 24px;
  color: var(--muted);
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.hint-flame { display: inline-flex; color: var(--amber); }
.hint-flame svg { width: 18px; height: 18px; }

/* 题目卡片 */
.question-card {
  background: var(--surface);
  border: 2px solid var(--rule);
  border-radius: 16px;
  padding: 24px;
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.4s var(--ease-out), transform 0.4s var(--ease-out);
  position: relative;
  overflow: hidden;
}
.question-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: var(--grad-accent); transform: scaleX(0); transform-origin: left;
  transition: transform 0.4s var(--ease);
}
.question-card.show::before { transform: scaleX(1); }
.question-card.show {
  opacity: 1;
  transform: translateY(0);
}
.question-card.rarity-1 { border-color: rgba(156, 163, 175, 0.5); }
.question-card.rarity-2 { border-color: rgba(79, 95, 240, 0.5); box-shadow: 0 0 20px rgba(79, 95, 240, 0.1); }
.question-card.rarity-3 { border-color: rgba(139, 92, 246, 0.5); box-shadow: 0 0 24px rgba(139, 92, 246, 0.15); }
.question-card.rarity-4 { 
  border-color: rgba(245, 158, 11, 0.6); 
  box-shadow: 0 0 32px rgba(245, 158, 11, 0.2);
  animation: legendary-glow 2s ease-in-out infinite alternate;
}
@keyframes legendary-glow {
  from { box-shadow: 0 0 24px rgba(245, 158, 11, 0.15); }
  to { box-shadow: 0 0 40px rgba(245, 158, 11, 0.3); }
}

.qc-rarity {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--rule);
}
.qr-stars { font-size: 18px; letter-spacing: 2px; }
.qr-name { font-weight: 600; font-size: 15px; }
.qr-score {
  margin-left: auto;
  font-size: 13px;
  color: var(--muted);
  background: var(--surface);
  padding: 2px 10px;
  border-radius: 999px;
}

.qc-info { display: flex; gap: 8px; margin-bottom: 12px; }
.tag {
  display: inline-block;
  padding: 3px 10px;
  font-size: 12px;
  border-radius: 6px;
  background: var(--surface);
  color: var(--accent);
  border: 1px solid var(--rule);
}
.tag-purple { color: var(--accent-2); }

.qc-stem {
  font-size: 16px;
  line-height: 1.7;
  margin-bottom: 16px;
  color: var(--ink);
  overflow-wrap: break-word;
  word-break: break-word;
}

.qc-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}
.qc-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border: 2px solid var(--rule);
  border-radius: 10px;
  background: var(--surface);
  cursor: pointer;
  transition: border-color 0.2s var(--ease), background-color 0.2s var(--ease), box-shadow 0.2s var(--ease), transform 0.2s var(--ease);
  text-align: left;
  font-size: 14px;
}
.qc-option:hover:not(.disabled) {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: var(--shadow-xs);
}
.qc-option:active:not(.disabled):not(.correct):not(.wrong) { transform: scale(0.99); }
.qc-option.selected {
  border-color: var(--accent);
  background: rgba(79, 95, 240, 0.08);
}
.qc-option.correct {
  border-color: var(--green);
  background: var(--green-soft);
}
.qc-option.wrong {
  border-color: var(--red);
  background: var(--red-soft);
}
.qc-option.disabled { cursor: default; }
.qco-letter {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
  transition: background-color 0.2s var(--ease), color 0.2s var(--ease), transform 0.15s var(--ease);
}
.qc-option:hover:not(.disabled) .qco-letter { transform: scale(1.06); }
.qc-option.selected .qco-letter { background: var(--accent); color: #fff; }
.qc-option.correct .qco-letter { background: var(--green); color: #fff; }
.qc-option.wrong .qco-letter { background: var(--red); color: #fff; }
.qco-text { line-height: 1.5; overflow-wrap: break-word; word-break: break-word; }

.qc-subjective { text-align: center; padding: 20px 0; }
.qs-hint { color: var(--muted); margin-bottom: 16px; }

.qc-submit { text-align: center; }
.submit-btn { min-width: 130px; }

/* 结果 */
.qc-result {
  margin-top: 16px;
  padding: 20px;
  border-radius: 12px;
  background: var(--surface);
}
.qc-result.correct { border: 1px solid rgba(13, 166, 120, 0.3); }
.qc-result.wrong { border: 1px solid rgba(225, 29, 72, 0.3); }

.qr-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.qr-icon { display: flex; }
.qr-icon svg { width: 30px; height: 30px; }
.qr-icon.ok { color: var(--green); }
.qr-icon.no { color: var(--red); }
.qr-text { font-size: 18px; font-weight: 700; }
.correct .qr-text { color: var(--green); }
.wrong .qr-text { color: var(--red); }

.qr-score-gain {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
}
.qsg-num {
  font-size: 28px;
  font-weight: 700;
  color: var(--amber);
  font-variant-numeric: tabular-nums;
}
.qsg-label { color: var(--muted); font-size: 14px; }
.qsg-combo {
  background: var(--amber);
  color: #fff;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.qr-answer { margin-bottom: 10px; font-size: 14px; }
.qr-answer strong { color: var(--green); font-size: 16px; }
.qr-analysis { font-size: 14px; color: var(--muted); line-height: 1.6; margin-bottom: 16px; overflow-wrap: break-word; word-break: break-word; }
.qr-analysis strong { color: var(--ink); }
.qr-next { width: 100%; justify-content: center; }

.result-enter-active, .result-leave-active {
  transition: opacity 0.3s var(--ease), transform 0.3s var(--ease);
}
.result-enter-from, .result-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 收集面板 */
.collection-panel {
  max-width: 640px;
  margin: 24px auto 0;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: 12px;
  padding: 16px 20px;
}
.collection-panel h4 {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 600;
}
.collection-panel h4::before { content: ''; width: 4px; height: 14px; border-radius: 2px; background: var(--grad-accent); }
.collection-panel h4 svg { width: 17px; height: 17px; color: var(--accent); }
.collection-stats {
  display: flex;
  justify-content: space-around;
}
.cs-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.cs-star { font-size: 16px; }
.cs-count {
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 600px) {
  .bb-header { flex-direction: column; }
  .bbh-stats { width: 100%; justify-content: space-between; }
  .stat-item { flex: 1; padding: 8px 10px; min-width: auto; }
  .select-card { padding: 24px; }
  .question-card { padding: 16px; }
  .box-wrapper { padding: 44px 0; }
  .blind-box { width: 150px; height: 150px; }
  .box-emoji svg { width: 52px; height: 52px; }
  .box-question { font-size: 64px; }
  .rarity-legend { gap: 10px; }
  .qc-stem { font-size: 15px; }
}
@media (max-width: 400px) {
  .stat-val { font-size: 17px; }
  .stat-lbl { font-size: 11px; }
  .select-card { padding: 18px 14px; }
  .select-card h3 { font-size: 19px; }
  .subject-grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); }
  .qc-rarity { flex-wrap: wrap; }
  .qr-score { margin-left: 0; }
}
</style>
