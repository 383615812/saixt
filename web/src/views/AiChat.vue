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
          <div class="msg-bubble">{{ typingIndex === i ? typingText : m.content }}<span v-if="typingIndex === i && typing" class="tw-caret"></span></div>
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
import { api } from '../api'
import { useTypewriter } from '../useTypewriter'
import QuotaBar from '../components/QuotaBar.vue'

const { text: typingText, typing, type: typeReply } = useTypewriter()
const typingIndex = ref(-1)
const messages = ref([])
const input = ref('')
const thinking = ref(false)
const planning = ref(false)
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
    window.dispatchEvent(new Event('ai-quota-refresh'))
  } catch (e) {
    messages.value.push({ role: 'assistant', content: e.message || '生成失败，请稍后重试' })
  } finally {
    planning.value = false
    scrollToBottom()
  }
}

async function ask(text) {
  input.value = text
  await send()
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
  display: flex; flex-direction: column; height: calc(100vh - 240px); min-height: 480px;
  padding: 0; overflow: hidden; position: relative;
}
.chat-card::before {
  content: ''; position: absolute; top: -120px; right: -80px; width: 300px; height: 260px;
  border-radius: 50%; background: radial-gradient(circle, rgba(79, 95, 240, 0.05) 0%, transparent 65%);
  pointer-events: none; z-index: 0;
}

.chat-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; position: relative; z-index: 1; }

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
.msg-avatar {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.72rem; font-weight: 700;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}
.msg-avatar.assistant { background: var(--grad-accent); color: #fff; }
.msg-avatar.user { background: var(--green-soft); color: #047857; }
.msg-bubble {
  padding: 11px 15px; border-radius: 14px; font-size: 0.92rem; line-height: 1.8;
  white-space: pre-wrap; word-break: break-word;
  transition: box-shadow 0.25s var(--ease);
}
.msg.assistant .msg-bubble {
  background: var(--surface); border: 1px solid var(--rule); border-top-left-radius: 4px;
}
.msg.assistant .msg-bubble:hover { box-shadow: var(--shadow-sm); }
.msg.user .msg-bubble {
  background: var(--grad-accent); color: #fff; border-top-right-radius: 4px;
  box-shadow: 0 3px 12px rgba(79, 95, 240, 0.22);
}

.typing { display: flex; gap: 4px; align-items: center; padding: 13px 15px; }
.typing span {
  width: 7px; height: 7px; border-radius: 50%; background: var(--accent);
  animation: blink 1.2s infinite;
}
.typing span:nth-child(2) { animation-delay: 0.2s; }
.typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }

.chat-input { display: flex; gap: 10px; padding: 14px; border-top: 1px solid var(--rule); background: var(--surface); position: relative; z-index: 1; }
.chat-input textarea {
  flex: 1; min-width: 0; resize: none; padding: 10px 14px; border: 1px solid var(--rule);
  border-radius: var(--radius-sm); font-size: 0.92rem; outline: none; line-height: 1.6;
  max-height: 120px; transition: border-color 0.25s var(--ease), box-shadow 0.25s var(--ease);
}
.chat-input textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

@media (max-width: 768px) {
  .chat-card { height: calc(100vh - 180px); min-height: 420px; }
}
@media (max-width: 600px) {
  .page-head h2 { font-size: 1.3rem; }
  .page-head p { font-size: 0.82rem; }
  .plan-btn { margin-top: 10px; width: 100%; }
  .chat-card { height: calc(100vh - 160px); min-height: 380px; }
  .msg { max-width: 92%; }
  .msg-avatar { width: 36px; height: 36px; font-size: 0.78rem; }
  .msg-bubble { font-size: 0.96rem; padding: 10px 13px; line-height: 1.75; }
  .chat-body { padding: 12px 10px; gap: 12px; }
  .chat-input { padding: 10px 12px; padding-bottom: calc(10px + env(safe-area-inset-bottom)); gap: 8px; }
  .chat-input textarea { font-size: 0.9rem; padding: 9px 12px; }
  .chat-input .btn { padding: 10px 14px; font-size: 0.85rem; flex-shrink: 0; }
  .quick-item { padding: 12px 14px; font-size: 0.86rem; min-height: 44px; }
  .cw-icon { width: 48px; height: 48px; font-size: 1.05rem; }
  .chat-welcome h3 { font-size: 1.05rem; }
  .chat-welcome p { font-size: 0.85rem; }
}
</style>
