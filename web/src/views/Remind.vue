<template>
  <div class="container remind-page">
    <div class="page-head">
      <h2>复习提醒设置</h2>
      <p>到期错题自动提醒，不错过每一次复习</p>
    </div>

    <!-- 加载骨架屏 -->
    <template v-if="loading">
      <div class="card due-banner">
        <div class="skeleton sk-db-icon"></div>
        <div class="db-text">
          <div class="skeleton sk-db-title"></div>
          <div class="skeleton sk-db-sub"></div>
        </div>
        <div class="skeleton sk-db-btn"></div>
      </div>
      <div class="card set-card">
        <div class="set-head">
          <div>
            <div class="skeleton sk-set-title"></div>
            <div class="skeleton sk-set-sub"></div>
          </div>
        </div>
        <div v-for="i in 4" :key="i" class="set-row">
          <div class="set-label">
            <div class="skeleton sk-set-lbl"></div>
            <div class="skeleton sk-set-desc"></div>
          </div>
          <div class="skeleton sk-set-ctl"></div>
        </div>
      </div>
    </template>
    <template v-else>
      <!-- 到期状态 -->
      <div class="card due-banner" :class="{ hot: due.dueToday > 0 }">
        <div class="db-icon">
          <svg v-if="due.dueToday > 0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>
        </div>
        <div class="db-text">
          <strong v-if="due.dueToday > 0">今天有 {{ due.dueToday }} 道错题到了复习时间</strong>
          <strong v-else>今天没有到期待复习的错题</strong>
          <span>开启提醒后，每天到点自动提醒你完成复习</span>
        </div>
        <router-link to="/review" class="btn btn-primary db-btn">去复习</router-link>
      </div>

      <!-- 提醒设置 -->
      <div class="card set-card">
        <div class="set-head">
          <div>
            <h3>提醒方式</h3>
            <p class="set-sub">选择你希望接收提醒的渠道与时间</p>
          </div>
        </div>

        <div class="set-row">
          <div class="set-label">
            <strong>接收邮箱</strong>
            <span>用于接收邮件提醒</span>
          </div>
          <input
            v-model="form.email"
            type="email"
            class="set-input"
            placeholder="如：student@example.com"
            @blur="form.email = form.email.trim()"
          />
        </div>

        <div class="set-row">
          <div class="set-label">
            <strong>邮件提醒</strong>
            <span>到期错题通过邮件通知你</span>
          </div>
          <button class="switch" :class="{ on: form.remind_email }" @click="form.remind_email = !form.remind_email" :aria-pressed="form.remind_email">
            <span class="knob"></span>
          </button>
        </div>

        <div class="set-row">
          <div class="set-label">
            <strong>短信提醒</strong>
            <span>到期错题通过短信通知你</span>
          </div>
          <button class="switch" :class="{ on: form.remind_sms }" @click="form.remind_sms = !form.remind_sms" :aria-pressed="form.remind_sms">
            <span class="knob"></span>
          </button>
        </div>

        <div class="set-row">
          <div class="set-label">
            <strong>浏览器通知</strong>
            <span>到期待复习时，浏览器直接弹窗提醒（无需邮件/短信）</span>
          </div>
          <button class="switch" :class="{ on: browserNotif }" @click="toggleBrowserNotif" :aria-pressed="browserNotif">
            <span class="knob"></span>
          </button>
        </div>

        <div class="set-row">
          <div class="set-label">
            <strong>提醒时间</strong>
            <span>每天固定时间检查并发送提醒</span>
          </div>
          <select v-model="form.remind_time" class="set-input set-select">
            <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>

        <div class="set-actions">
          <button class="btn btn-primary" :disabled="saving" @click="save">
            {{ saving ? '保存中…' : '保存设置' }}
          </button>
          <span v-if="saved" class="saved-tip">✓ 已保存</span>
        </div>

        <div class="set-note">
          当前环境未接入真实邮件/短信网关，开启后提醒内容会按设定时间自动生成并记录，接入网关即可自动发送。
        </div>
      </div>

      <!-- 测试发送 -->
      <div class="card test-card">
        <div class="set-head">
          <div>
            <h3>测试提醒</h3>
            <p class="set-sub">立即生成一条真实提醒内容，预览效果</p>
          </div>
        </div>
        <div class="test-actions">
          <button class="btn btn-ghost" :disabled="testing" @click="testSend('email')">
            {{ testing === 'email' ? '生成中…' : '测试邮件提醒' }}
          </button>
          <button class="btn btn-ghost" :disabled="testing" @click="testSend('sms')">
            {{ testing === 'sms' ? '生成中…' : '测试短信提醒' }}
          </button>
        </div>
        <div v-if="testResult" class="test-result">
          <div class="tr-head">
            <span class="tag" :class="testResult.channel === 'email' ? 'tag-blue' : 'tag-purple'">
              {{ testResult.channel === 'email' ? '邮件' : '短信' }}
            </span>
            <span class="tr-target">发送至：{{ testResult.target }}</span>
          </div>
          <p class="tr-content">{{ testResult.content }}</p>
          <p class="tr-note">{{ testResult.note }}</p>
        </div>
      </div>

      <!-- 提醒记录 -->
      <div class="card log-card">
        <div class="set-head">
          <div>
            <h3>提醒记录</h3>
            <p class="set-sub">最近生成的提醒内容</p>
          </div>
          <span class="log-count">{{ logs.length }} 条</span>
        </div>
        <div v-if="!logs.length" class="empty-mini">暂无提醒记录，开启提醒或点击「测试提醒」后这里会展示内容</div>
        <div v-else class="log-list">
          <div v-for="l in logs" :key="l.id" class="log-item">
            <span class="tag" :class="l.type === 'email' ? 'tag-blue' : 'tag-purple'">
              {{ l.type === 'email' ? '邮件' : '短信' }}
            </span>
            <p class="log-content">{{ l.content }}</p>
            <span class="log-time">{{ formatTime(l.created_at) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>

import { toast } from '../toast'
import { ref, reactive, onMounted } from 'vue'
import { api } from '../api'

const loading = ref(true)
const saving = ref(false)
const saved = ref(false)
const testing = ref('')
const due = ref({ dueToday: 0 })
const logs = ref([])
const testResult = ref(null)
const browserNotif = ref(localStorage.getItem('saixt_browser_notif') === '1')

async function toggleBrowserNotif() {
  if (!('Notification' in window)) {
    toast('当前浏览器不支持通知功能', 'error')
    return
  }
  if (browserNotif.value) {
    browserNotif.value = false
    localStorage.setItem('saixt_browser_notif', '0')
    return
  }
  const perm = await Notification.requestPermission()
  if (perm === 'granted') {
    browserNotif.value = true
    localStorage.setItem('saixt_browser_notif', '1')
    try {
      new Notification('通知已开启', { body: '到期待复习时，我们会第一时间提醒你', tag: 'notif-on' })
    } catch (e) { /* 忽略 */ }
    toast('浏览器通知已开启', 'success')
  } else {
    browserNotif.value = false
    localStorage.setItem('saixt_browser_notif', '0')
    toast('未获得通知权限，请在浏览器设置中允许', 'error')
  }
}

const timeOptions = ['08:00', '09:00', '12:00', '14:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00']

const form = reactive({
  email: '',
  remind_email: false,
  remind_sms: false,
  remind_time: '19:00'
})

async function load() {
  loading.value = true
  try {
    const [s, d, l] = await Promise.all([
      api.get('/remind/settings'),
      api.get('/remind/due').catch(() => ({ dueToday: 0 })),
      api.get('/remind/logs')
    ])
    form.email = s.email || ''
    form.remind_email = !!s.remind_email
    form.remind_sms = !!s.remind_sms
    form.remind_time = s.remind_time || '19:00'
    due.value = d
    logs.value = l
  } catch (e) {
    toast(e.message || '加载失败，请稍后重试', 'error')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  saved.value = false
  try {
    await api.put('/remind/settings', {
      email: form.email,
      remind_email: form.remind_email ? 1 : 0,
      remind_sms: form.remind_sms ? 1 : 0,
      remind_time: form.remind_time
    })
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
    await load()
  } catch (e) {
    toast(e.message || '保存失败，请稍后重试', 'error')
  } finally {
    saving.value = false
  }
}

async function testSend(channel) {
  testing.value = channel
  try {
    testResult.value = await api.post('/remind/test', { channel })
    await load()
  } catch (e) {
    toast(e.message || '生成失败，请稍后重试', 'error')
  } finally {
    testing.value = ''
  }
}

function formatTime(t) {
  return (t || '').replace('T', ' ').slice(0, 16)
}

onMounted(load)
</script>

<style scoped>
.remind-page { max-width: 720px; }
.page-head { text-align: center; margin-bottom: 24px; }
.page-head h2 { font-size: 1.6rem; }
.page-head p { color: var(--muted); margin-top: 4px; }

.due-banner {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 18px 22px; margin-bottom: 16px;
  border: 1px solid rgba(13, 166, 120, 0.3);
  background: var(--green-soft);
}
.due-banner.hot {
  border-color: rgba(217, 119, 6, 0.3);
  background: var(--amber-soft);
}
.db-icon { display: flex; align-items: center; justify-content: center; color: var(--accent); }
.db-icon svg { width: 28px; height: 28px; }
.due-banner.hot .db-icon { color: var(--amber); }
.db-text { flex: 1; min-width: 200px; }
.db-text strong { display: block; font-size: 1.05rem; }
.due-banner.hot .db-text strong { color: var(--amber); }
.due-banner:not(.hot) .db-text strong { color: var(--green); }
.db-text span { font-size: 0.85rem; color: var(--muted); }
.db-btn { white-space: nowrap; }

/* 骨架屏 */
.sk-db-icon { width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0; }
.sk-db-title { width: 220px; height: 18px; }
.sk-db-sub { width: 260px; height: 12px; margin-top: 8px; }
.sk-db-btn { width: 88px; height: 36px; border-radius: var(--radius-sm); }
.sk-set-title { width: 140px; height: 18px; }
.sk-set-sub { width: 200px; height: 12px; margin-top: 8px; }
.sk-set-lbl { width: 100px; height: 15px; }
.sk-set-desc { width: 160px; height: 11px; margin-top: 6px; }
.sk-set-ctl { width: 200px; height: 36px; border-radius: var(--radius-sm); flex-shrink: 0; }

.set-card, .test-card, .log-card { padding: 22px 26px; margin-bottom: 16px; }
.set-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.set-head h3 { font-size: 1.12rem; }
.set-sub { color: var(--muted); font-size: 0.85rem; margin-top: 2px; }

.set-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 14px 0; border-bottom: 1px dashed var(--rule); flex-wrap: wrap;
}
.set-label { display: flex; flex-direction: column; gap: 2px; }
.set-label strong { font-size: 0.95rem; }
.set-label span { font-size: 0.8rem; color: var(--muted); }
.set-input {
  padding: 9px 12px; border: 1px solid var(--rule); border-radius: var(--radius-sm);
  font-size: 0.92rem; outline: none; background: var(--surface);
  transition: border-color 0.25s var(--ease), box-shadow 0.25s var(--ease), background 0.25s var(--ease);
  min-width: 220px;
}
.set-input:hover { border-color: #d6dae6; }
.set-input:focus {
  border-color: var(--accent); background: var(--surface);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.set-select { min-width: 140px; background: var(--surface); cursor: pointer; }

.switch {
  width: 52px; height: 36px; border-radius: 999px; border: none;
  background: var(--rule); position: relative; transition: background 0.25s var(--ease); flex-shrink: 0;
  cursor: pointer;
}
.switch:hover { background: #d6dae6; }
.switch:active { transform: scale(0.97); }
.switch.on:hover { background: var(--accent-deep); }
.switch .knob {
  position: absolute; top: 3px; left: 3px; width: 30px; height: 30px;
  border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  transition: transform 0.25s var(--ease);
}
.switch.on { background: var(--accent); }
.switch.on .knob { transform: translateX(16px); }

.set-actions { display: flex; align-items: center; gap: 12px; margin-top: 18px; }
.saved-tip { color: var(--green); font-size: 0.88rem; font-weight: 600; }
.set-note {
  margin-top: 14px; font-size: 0.8rem; color: var(--muted);
  background: var(--amber-soft); border-radius: 10px; padding: 10px 14px; line-height: 1.7;
}

.test-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; }
.test-result {
  margin-top: 16px; padding: 14px 16px; border-radius: 12px;
  background: var(--accent-soft); border: 1px solid rgba(79, 95, 240, 0.2);
}
.tr-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tr-target { font-size: 0.82rem; color: var(--muted); }
.tr-content { font-size: 0.92rem; line-height: 1.8; margin: 10px 0 6px; color: var(--ink); }
.tr-note { font-size: 0.78rem; color: var(--muted); }

.log-count { font-size: 0.85rem; color: var(--accent); font-weight: 700; }
.empty-mini { color: var(--muted); font-size: 0.88rem; padding: 14px 0; }
.log-list { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
.log-item {
  display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap;
  padding: 12px 14px; border: 1px solid var(--rule); border-radius: 12px;
  transition: background-color 0.25s var(--ease), border-color 0.25s var(--ease);
}
.log-item:hover { border-color: var(--accent-2); background: var(--surface-2); }
.log-content { flex: 1; min-width: 140px; font-size: 0.88rem; line-height: 1.7; }
.log-time { font-size: 0.75rem; color: var(--muted); white-space: nowrap; }

@media (max-width: 600px) {
  .page-head h2 { font-size: 1.3rem; }
  .page-head p { font-size: 0.82rem; }
  .due-banner { padding: 14px 16px; gap: 10px; }
  .db-text { min-width: 140px; }
  .db-text strong { font-size: 0.96rem; }
  .db-btn { width: 100%; text-align: center; }
  .set-card, .test-card, .log-card { padding: 18px 16px; }
  .set-row { align-items: flex-start; }
  .set-input { width: 100%; min-width: 0; }
  .set-actions .btn { flex: 1; }
  .test-actions .btn { flex: 1; min-width: 120px; }
  .log-item { padding: 10px 12px; }
  .log-content { min-width: 0; font-size: 0.84rem; }
}
@media (max-width: 400px) {
  .due-banner { flex-direction: column; text-align: center; }
  .set-card, .test-card, .log-card { padding: 14px 12px; }
}
</style>
