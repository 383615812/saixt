<template>
  <div class="login-page">
    <div class="login-card card" :class="{ shake: shaking }">
      <div class="lc-brand">
        <div class="lc-logo">
          <img src="../assets/logo.svg" alt="春招智能学习平台 Logo" class="lc-logo-img">
        </div>
        <div class="lc-brand-text">
          <strong>春招智能学习平台</strong>
          <span>云南省春季招生 · 备考助手</span>
        </div>
      </div>

      <div class="lc-head">
        <h2>{{ isRegister ? '免费注册' : '欢迎回来' }}</h2>
        <p>{{ isRegister ? '建立你的春招备考档案' : '登录后开始刷题与预测' }}</p>
      </div>

      <div class="mode-switch">
        <button :class="{ on: !isRegister }" @click="switchMode(false)">登录</button>
        <button :class="{ on: isRegister }" @click="switchMode(true)">注册</button>
      </div>

      <form @submit.prevent="submit" novalidate>
        <div class="field" :class="{ invalid: errors.phone }">
          <span>手机号</span>
          <div class="input-wrap">
            <svg class="f-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="7" y="2" width="10" height="20" rx="2"/>
              <path d="M11 18h2"/>
            </svg>
            <input v-model="phone" type="tel" maxlength="11" placeholder="请输入11位手机号" @input="errors.phone = ''" />
          </div>
          <span v-if="errors.phone" class="field-err">{{ errors.phone }}</span>
        </div>

        <div class="field" :class="{ invalid: errors.password }">
          <span>密码</span>
          <div class="input-wrap">
            <svg class="f-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="10" width="16" height="10" rx="2"/>
              <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
            </svg>
            <input v-model="password" :type="showPwd ? 'text' : 'password'" placeholder="至少6位" @input="errors.password = ''" />
            <button type="button" class="pwd-toggle" @click="showPwd = !showPwd" :aria-label="showPwd ? '隐藏密码' : '显示密码'">
              <svg v-if="!showPwd" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                <path d="M1 1l22 22"/>
              </svg>
            </button>
          </div>
          <span v-if="errors.password" class="field-err">{{ errors.password }}</span>
        </div>

        <div v-if="isRegister" class="field" :class="{ invalid: errors.nickname }">
          <span>昵称（选填）</span>
          <div class="input-wrap">
            <svg class="f-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>
            </svg>
            <input v-model="nickname" type="text" maxlength="12" placeholder="请设置昵称（2-12 字）" @input="errors.nickname = ''" />
          </div>
          <span v-if="errors.nickname" class="field-err">{{ errors.nickname }}</span>
        </div>

        <div v-if="isRegister" class="field" :class="{ invalid: errors.inviteCode }">
          <span>邀请码（选填）</span>
          <div class="input-wrap">
            <svg class="f-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/>
              <circle cx="10" cy="7" r="4"/>
              <path d="M21 21v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <input v-model="inviteCode" type="text" maxlength="6" placeholder="填写好友邀请码，双方各得积分" @input="errors.inviteCode = ''" />
          </div>
          <span v-if="errors.inviteCode" class="field-err">{{ errors.inviteCode }}</span>
          <span v-else class="field-hint">填写邀请码注册，你和好友各得 20/50 积分</span>
        </div>

        <p v-if="error" class="error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
          </svg>
          {{ error }}
        </p>

        <button class="btn btn-primary submit" type="submit" :disabled="loading">
          <span v-if="loading" class="btn-spinner"></span>
          {{ loading ? '请稍候…' : (isRegister ? '注册并登录' : '登 录') }}
        </button>
      </form>

      <p class="tip">注册即代表同意《用户协议》与《隐私政策》，平台仅用于春招备考学习</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, setUser } from '../api'

const route = useRoute()
const router = useRouter()
const isRegister = ref(route.query.mode === 'register')
const phone = ref('')
const password = ref('')
const nickname = ref('')
const inviteCode = ref('')
const showPwd = ref(false)
const error = ref('')
const loading = ref(false)
const shaking = ref(false)
const errors = reactive({ phone: '', password: '', nickname: '', inviteCode: '' })

function switchMode(reg) {
  if (loading.value) return
  isRegister.value = reg
  error.value = ''
  errors.phone = ''
  errors.password = ''
  errors.nickname = ''
  errors.inviteCode = ''
}

function shake() {
  shaking.value = true
  setTimeout(() => { shaking.value = false }, 450)
}

function validate() {
  let ok = true
  errors.phone = ''
  errors.password = ''
  errors.nickname = ''
  errors.inviteCode = ''
  if (!/^1\d{10}$/.test(phone.value)) {
    errors.phone = '请输入正确的11位手机号'
    ok = false
  }
  if (password.value.length < 6) {
    errors.password = '密码至少6位'
    ok = false
  }
  if (isRegister.value && nickname.value && nickname.value.length > 12) {
    errors.nickname = '昵称最多12个字符'
    ok = false
  }
  if (isRegister.value && inviteCode.value && !/^[A-Za-z2-9]{6}$/.test(inviteCode.value)) {
    errors.inviteCode = '邀请码为 6 位字母数字（不含 0/1/I/O）'
    ok = false
  }
  return ok
}

async function submit() {
  error.value = ''
  if (!validate()) { shake(); return }
  loading.value = true
  try {
    const path = isRegister.value ? '/auth/register' : '/auth/login'
    const data = await api.post(path, {
      phone: phone.value,
      password: password.value,
      nickname: nickname.value,
      invite_code: inviteCode.value.trim().toUpperCase() || undefined
    })
    localStorage.setItem('saixt_token', data.token)
    setUser(data.user)
    router.push(route.query.redirect || '/dashboard')
  } catch (e) {
    error.value = e.message
    shake()
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  display: flex; justify-content: center; align-items: flex-start; padding: 40px 16px 56px;
  background-image: radial-gradient(700px 300px at 50% -80px, rgba(79, 95, 240, 0.05) 0%, transparent 70%);
}
.login-card {
  width: 100%; max-width: 440px; padding: 32px 32px 28px;
  background: var(--glass);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  animation: cardIn 0.5s var(--ease-out) both;
}
@keyframes cardIn { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

.shake { animation: shake 0.45s var(--ease); }
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-5px); }
  80% { transform: translateX(5px); }
}

.lc-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
.lc-logo {
  width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0;
  background: #ffffff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 14px rgba(79, 95, 240, 0.2), 0 2px 6px rgba(15, 23, 42, 0.06);
  border: 1px solid rgba(79, 95, 240, 0.15);
}
.lc-logo-img { width: 36px; height: 36px; display: block; }
.lc-brand-text { display: flex; flex-direction: column; line-height: 1.4; }
.lc-brand-text strong { font-size: 1.05rem; font-weight: 800; letter-spacing: -0.01em; }
.lc-brand-text span { font-size: 0.78rem; color: var(--muted); }

.lc-head { text-align: center; margin-bottom: 20px; }
.lc-head h2 { font-size: 1.45rem; font-weight: 750; letter-spacing: -0.015em; }
.lc-head p { color: var(--muted); margin-top: 6px; font-size: 0.88rem; }

.mode-switch {
  display: flex; background: var(--bg-soft); border-radius: 12px; padding: 4px; margin-bottom: 22px;
  position: relative;
}
.mode-switch button {
  flex: 1; border: none; background: transparent; padding: 10px; border-radius: 10px;
  font-size: 0.92rem; font-weight: 600; color: var(--muted); transition: color 0.25s var(--ease), background-color 0.25s var(--ease), box-shadow 0.25s var(--ease), transform 0.15s var(--ease);
}
.mode-switch button:active { transform: scale(0.98); }
.mode-switch button:not(.on):hover { color: var(--accent); background: rgba(79, 95, 240, 0.05); }
.mode-switch button.on {
  background: var(--surface); color: var(--accent);
  box-shadow: 0 2px 10px rgba(79, 95, 240, 0.12);
}

.field { display: block; margin-bottom: 16px; }
.field > span { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 6px; font-weight: 500; }
.input-wrap {
  position: relative; display: flex; align-items: center;
}
.f-icon {
  position: absolute; left: 14px; width: 18px; height: 18px;
  color: var(--muted-2); pointer-events: none; transition: color 0.25s var(--ease);
}
.field input {
  width: 100%; padding: 12px 16px 12px 42px; border: 1px solid var(--rule); border-radius: var(--radius-sm);
  font-size: 1rem; outline: none; transition: border-color 0.25s var(--ease), background-color 0.25s var(--ease), box-shadow 0.25s var(--ease);
  background: var(--surface-2);
}
.field input:hover { border-color: #d6dae6; }
.field input:focus {
  border-color: var(--accent); background: var(--surface);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.field input:focus ~ .f-icon,
.input-wrap:focus-within .f-icon { color: var(--accent); }
.field.invalid input { border-color: var(--red); background: var(--red-soft); }
.field.invalid input:focus { box-shadow: 0 0 0 3px var(--red-soft); }
.field.invalid .f-icon { color: var(--red); }
.field-err {
  display: block; font-size: 0.78rem; color: var(--red); margin-top: 5px;
  animation: errIn 0.25s var(--ease-out) both;
}
.field-hint {
  display: block; font-size: 0.78rem; color: var(--muted-2); margin-top: 5px;
}
@keyframes errIn { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }

.pwd-toggle {
  position: absolute; right: 8px; width: 36px; height: 36px; border: none; background: transparent;
  color: var(--muted-2); display: flex; align-items: center; justify-content: center;
  border-radius: 10px; transition: color 0.2s var(--ease), background-color 0.2s var(--ease), transform 0.15s var(--ease);
}
.pwd-toggle:hover { color: var(--accent); background: var(--accent-soft); }
.pwd-toggle:active { transform: scale(0.98); }
.pwd-toggle svg { width: 19px; height: 19px; }

.error {
  display: flex; align-items: center; gap: 8px;
  color: var(--red); font-size: 0.85rem; margin-bottom: 12px;
  padding: 9px 12px; background: var(--red-soft); border-radius: 8px;
  animation: errIn 0.25s var(--ease-out) both;
}
.error svg { width: 16px; height: 16px; flex-shrink: 0; }

.submit { width: 100%; padding: 13px; font-size: 1rem; margin-top: 4px; position: relative; }
.btn-spinner {
  width: 16px; height: 16px; border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff; border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.tip { color: var(--muted-2); font-size: 0.78rem; text-align: center; margin-top: 16px; line-height: 1.6; }

@media (max-width: 1024px) and (min-width: 821px) {
  .pwd-toggle { width: 40px; height: 40px; }
}
@media (max-width: 820px) {
  .mode-switch button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
  .pwd-toggle { width: 44px; height: 44px; right: 2px; }
  .field input { padding-right: 48px; }
}
@media (max-width: 480px) {
  .login-page { padding: 24px 12px 40px; }
  .login-card { padding: 24px 20px 22px; }
  .lc-brand { margin-bottom: 18px; }
  .lc-logo { width: 40px; height: 40px; border-radius: 12px; }
  .lc-logo-img { width: 28px; height: 28px; }
  .lc-brand-text strong { font-size: 0.98rem; }
}
@media (max-width: 400px) {
  .login-page { padding: 16px 10px 32px; }
  .login-card { padding: 20px 16px 18px; }
  .lc-head h2 { font-size: 1.3rem; }
  .mode-switch button { padding: 9px; font-size: 0.88rem; }
  .field input { padding: 11px 14px 11px 40px; }
}
</style>
