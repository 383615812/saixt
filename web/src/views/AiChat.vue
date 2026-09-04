<template>
  <div class="container ai-page">
    <div class="page-head">
      <h2>AI 智能答疑</h2>
      <p>随时向 AI 老师提问，解答学科知识、考试政策与备考规划</p>
      <button class="btn btn-primary plan-btn" :disabled="planning" @click="generatePlan">
        {{ planning ? 'AI 正在制定计划…' : '生成我的学习计划' }}
      </button>
    </div>

    <QuotaBar kind="chat" label="AI 答疑" />

    <div v-if="planReady" class="card plan-banner">
      <div class="pb-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>
      </div>
      <div class="pb-text">
        <strong>学习计划已更新</strong>
        <span>可前往「学习计划」查看完整的分阶段备考安排</span>
      </div>
      <button class="btn btn-primary pb-btn" @click="goPlan">查看计划</button>
    </div>

    <div class="card chat-card">
      <!-- 消息区 -->
      <div ref="scrollBox" class="chat-body">
        <div v-if="!messages.length" class="chat-welcome">
          <div class="cw-icon">AI</div>
          <h3>你好，我是你的春招备考助手</h3>
          <p>可以问我学科知识点、考试政策、复习规划等问题，也可以点击下方常见问题快速开始</p>
          <div class="quick-list">
            <button v-for="q in quickQuestions" :key="q" class="quick-item" @click="ask(q)">{{ q }}</button>
          </div>
        </div>

        <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
          <div class="msg-avatar" :class="m.role">{{ m.role === 'assistant' ? 'AI' : '我' }}</div>
          <div class="msg-main">
            <div class="msg-bubble">{{ typingIndex === i ? typingText : m.content }}<span v-if="typingIndex === i && typing" class="tw-caret"></span></div>
            <button v-if="m.role === 'assistant' && m.content && !(typingIndex === i && typing)" class="copy-btn" @click="copy(m.content, i)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
              {{ copied === i ? '已复制' : '复制答案' }}
            </button>
          </div>
        </div>

        <div v-if="thinking" class="msg assistant">
          <div class="msg-avatar assistant">AI</div>
          <div class="msg-bubble typing"><span></span><span></span><span></span></div>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="chat-input">
        <textarea
          ref="inputRef"
          v-model="input"
          rows="1"
          placeholder="输入你的问题，如：二进制和十进制怎么转换？"
          aria-label="向 AI 提问"
          @keydown.enter.exact.prevent="send"
          @input="autoResize"
        ></textarea>
        <button class="btn btn-primary" :disabled="!input.trim() || thinking" @click="send">发送</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { useTypewriter } from '../useTypewriter'
import { toast } from '../toast'
import QuotaBar from '../components/QuotaBar.vue'

const router = useRouter()
const { text: typingText, typing, type: typeReply } = useTypewriter()
const typingIndex = ref(-1)
const messages = ref([])
const input = ref('')
const thinking = ref(false)
const planning = ref(false)
const planReady = ref(false)
const copied = ref(-1)
const quickQuestions = ref([])
const scrollBox = ref(null)
const inputRef = ref(null)

function autoResize() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

async function scrollToBottom() {
  await nextTick()
  if (scrollBox.value) scrollBox.value.scrollTop = scrollBox.value.scrollHeight
}

// 打字过程中若用户停留在底部附近，则跟随滚动
watch(typingText, async () => {
  const el = scrollBox.value
  if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
    await nextTick()
    el.scrollTop = el.scrollHeight
  }
})

async function generatePlan() {
  if (planning.value) return
  planning.value = true
  messages.value.push({ role: 'user', content: '请根据我的学习情况，生成一份个性化的备考学习计划' })
  scrollToBottom()
  try {
    const data = await api.post('/ai/plan', {})
    messages.value.push({ role: 'assistant', content: '' })
    typingIndex.value = messages.value.length - 1
    typeReply(data.reply)
    setTimeout(() => planReady.value = true, 120)
    window.dispatchEvent(new Event('ai-quota-refresh'))
  } catch (e) {
    messages.value.push({ role: 'assistant', content: e.message || '生成失败，请稍后重试' })
  } finally {
    planning.value = false
    scrollToBottom()
  }
}

function goPlan() {
  router.push('/plan')
}

async function ask(text) {
  input.value = text
  await send()
}

async function copy(text, i) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = i
    setTimeout(() => { if (copied.value === i) copied.value = -1 }, 1600)
  } catch (e) {
    toast('复制失败，请手动选择复制', 'error')
  }
}

async function send() {
  const text = input.value.trim()
  if (!text || thinking.value) return
  messages.value.push({ role: 'user', content: text })
  input.value = ''
  // 清空后重置高度
  if (inputRef.value) inputRef.value.style.height = 'auto'
  thinking.value = true
  scrollToBottom()
  try {
    const data = await api.post('/ai/chat', { messages: messages.value })
    messages.value.push({ role: 'assistant', content: '' })
    typingIndex.value = messages.value.length - 1
    typeReply(data.reply)
    window.dispatchEvent(new Event('ai-quota-refresh'))
  } catch (e) {
    messages.value.push({ role: 'assistant', content: e.message || 'AI 服务暂时不可用，请稍后重试' })
  } finally {
    thinking.value = false
    scrollToBottom()
  }
}

onMounted(async () => {
  try {
    quickQuestions.value = await api.get('/ai/quick')
  } catch (e) { /* 忽略 */ }
})
</script>

<style scoped>
.page-head { margin-bottom: 20px; }
.page-head h2 { font-size: 1.6rem; }
.page-head p { color: var(--muted); margin-top: 4px; }
.plan-btn { margin-top: 12px; }

.chat-card {
  display: flex; flex-direction: column; height: calc(100vh - 240px); height: calc(100dvh - 240px); min-height: 480px;
  padding: 0; overflow: hidden; position: relative;
}
.chat-card::before {
  content: ''; position: absolute; top: -120px; right: -80px; width: 300px; height: 260px;
  border-radius: 50%; background: radial-gradient(circle, rgba(79, 95, 240, 0.05) 0%, transparent 65%);
  pointer-events: none; z-index: 0;
}

.chat-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; position: relative; z-index: 1; overscroll-behavior: contain; }

.chat-welcome { text-align: center; padding: 34px 20px; }
.cw-icon {
  position: relative; width: 60px; height: 60px; margin: 0 auto 16px; border-radius: 18px;
  background: var(--grad-accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 1.25rem;
  box-shadow: 0 8px 24px rgba(79, 95, 240, 0.3);
}
.cw-icon::after {
  content: ''; position: absolute; inset: -5px; border-radius: 22px;
  border: 1px solid rgba(79, 95, 240, 0.18);
  animation: cwPulse 2.6s var(--ease) infinite;
}
@keyframes cwPulse { 0%, 100% { transform: scale(1); opacity: 0.7; } 50% { transform: scale(1.08); opacity: 0.2; } }
.chat-welcome h3 {
  font-size: 1.15rem; margin-bottom: 6px;
  display: inline-flex; align-items: center; gap: 9px;
}
.chat-welcome h3::before {
  content: ''; width: 4px; height: 17px; border-radius: 2px; background: var(--grad-accent);
}
.chat-welcome p { color: var(--muted); font-size: 0.9rem; max-width: 520px; margin: 0 auto 18px; }
.quick-list { display: flex; flex-direction: column; gap: 8px; max-width: 520px; margin: 0 auto; }
.quick-item {
  position: relative; padding: 11px 16px 11px 18px; border: 1px solid var(--rule); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--accent); font-size: 0.9rem;
  text-align: left; overflow: hidden;
  transition: border-color 0.2s var(--ease), background-color 0.2s var(--ease), box-shadow 0.2s var(--ease), transform 0.2s var(--ease);
}
.quick-item::before {
  content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 3px;
  background: var(--grad-accent); transform: scaleY(0); transform-origin: center;
  transition: transform 0.25s var(--ease);
}
.quick-item:hover { border-color: rgba(79, 95, 240, 0.35); background: var(--accent-soft); box-shadow: var(--shadow-sm); }
.quick-item:hover::before { transform: scaleY(1); }
.quick-item:active { transform: scale(0.97); }

.msg { display: flex; gap: 10px; max-width: 85%; animation: msgIn 0.32s var(--ease-out) both; }
@keyframes msgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.msg.user { align-self: flex-end; flex-direction: row-reverse; }
.msg.user .msg-main { align-items: flex-end; }
.msg-main { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
.copy-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border: none; background: transparent; cursor: pointer;
  color: var(--muted); font-size: 0.78rem; border-radius: 6px;
  transition: color 0.2s var(--ease), background-color 0.2s var(--ease);
}
.copy-btn svg { width: 13px; height: 13px; }
.copy-btn:hover { color: var(--accent); background: var(--accent-soft); }
.copy-btn:active { transform: scale(0.95); }

.plan-banner { display: flex; align-items: center; gap: 14px; padding: 14px 18px; margin-bottom: 14px; }
.pb-icon {
  width: 42px; height: 42px; flex-shrink: 0; border-radius: 12px;
  background: var(--green-soft); color: #047857;
  display: flex; align-items: center; justify-content: center;
}
.pb-icon svg { width: 22px; height: 22px; }
.pb-text { flex: 1; min-width: 0; }
.pb-text strong { display: block; font-size: 0.95rem; }
.pb-text span { color: var(--muted); font-size: 0.82rem; }
.pb-btn { flex-shrink: 0; padding: 8px 16px; }
.msg-avatar {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.78rem; font-weight: 700;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}
.msg-avatar.assistant { background: var(--grad-accent); color: #fff; }
.msg-avatar.user { background: var(--green-soft); color: #047857; }
.msg-bubble {
  padding: 11px 15px; border-radius: 14px; font-size: 0.92rem; line-height: 1.8;
  min-width: 60px; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word;
  transition: box-shadow 0.25s var(--ease);
}
.msg.assistant .msg-bubble {
  background: var(--surface); border: 1px solid var(--rule); border-top-left-radius: 4px;
  box-shadow: 0 1px 1px rgba(15, 23, 42, 0.03);
}
.msg.assistant .msg-bubble:hover { box-shadow: var(--shadow-sm); }
.msg.user .msg-bubble {
  background: var(--grad-accent); color: #fff; border-top-right-radius: 4px;
  box-shadow: 0 3px 12px rgba(79, 95, 240, 0.2);
}

.typing { display: flex; gap: 4px; align-items: center; padding: 13px 15px; }
.typing span {
  width: 8px; height: 8px; border-radius: 50%; background: var(--accent);
  animation: typingDot 1.1s ease-in-out infinite;
}
.typing span:nth-child(2) { animation-delay: 0.18s; }
.typing span:nth-child(3) { animation-delay: 0.36s; }
@keyframes typingDot {
  0%, 60%, 100% { opacity: 0.35; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-2px); }
}

.chat-input { display: flex; gap: 10px; padding: 14px; border-top: 1px solid var(--rule); background: var(--surface); position: relative; z-index: 1; }
.chat-input textarea {
  flex: 1; min-width: 0; resize: none; padding: 10px 14px; border: 1px solid var(--rule);
  border-radius: var(--radius-sm); font-size: 0.92rem; outline: none; line-height: 1.6;
  max-height: 120px; transition: border-color 0.25s var(--ease), box-shadow 0.25s var(--ease);
}
.chat-input textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

@media (max-width: 768px) {
  .chat-card { height: calc(100vh - 180px); height: calc(100dvh - 180px); min-height: 0; }
}
@media (max-width: 600px) {
  .page-head h2 { font-size: 1.3rem; }
  .page-head p { font-size: 0.82rem; }
  .plan-btn { margin-top: 10px; width: 100%; }
  .chat-card { height: calc(100dvh - 130px); min-height: 0; }
  .msg { max-width: 92%; animation-duration: 0.24s; }
  .msg-avatar { width: 40px; height: 40px; font-size: 0.8rem; }
  .msg-bubble { font-size: 1rem; padding: 10px 13px; line-height: 1.75; }
  .chat-body { padding: 12px 10px; gap: 12px; }
  .chat-input { padding: 10px 12px; padding-bottom: calc(10px + env(safe-area-inset-bottom)); gap: 8px; }
  .chat-input textarea { font-size: 1rem; padding: 9px 12px; }
  .chat-input .btn { padding: 10px 14px; font-size: 0.85rem; flex-shrink: 0; }
  .quick-item { padding: 12px 14px; font-size: 0.86rem; min-height: 44px; }
  .cw-icon { width: 48px; height: 48px; font-size: 1.05rem; }
  .plan-banner { padding: 12px 14px; gap: 10px; }
  .pb-btn { padding: 8px 12px; font-size: 0.85rem; }
  .copy-btn { font-size: 0.78rem; min-height: 44px; padding: 0 10px; }
  .chat-welcome h3 { font-size: 1.05rem; }
  .chat-welcome p { font-size: 0.85rem; }
}
@media (max-width: 400px) {
  .msg { max-width: 96%; gap: 7px; }
  .msg.user { max-width: 90%; }
  .msg-main { gap: 6px; }
  .msg-avatar { width: 36px; height: 36px; font-size: 0.78rem; }
  .msg-bubble { font-size: 1rem; padding: 10px 12px; line-height: 1.8; border-radius: 12px; }
  .msg.assistant .msg-bubble { border-top-left-radius: 3px; }
  .msg.user .msg-bubble { border-top-right-radius: 3px; }
  .copy-btn { font-size: 0.8rem; padding: 0 6px; min-height: 44px; }
  .chat-body { padding: 12px 8px; gap: 10px; }
  .chat-input { padding: 8px 10px; }
  .quick-item { padding: 11px 12px; font-size: 0.86rem; }
  .quick-list { gap: 6px; }
}
</style>
