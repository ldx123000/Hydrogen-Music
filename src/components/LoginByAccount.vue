<script setup>
  import { onActivated, onUnmounted, ref } from 'vue'
  import DataCheckAnimaton from './DataCheckAnimaton.vue'
  import { noticeOpen } from '../utils/dialog'
  import { loginByPhone, sendCaptcha } from '../api/login'
  import { loginHandle } from '../utils/handle'

  const emits = defineEmits(['jumpTo'])

  const accountInput = ref(null)
  const codeInput = ref(null)
  const accountNumber = ref('')
  const captchaCode = ref('')
  const focusTimer = ref(null)
  const countdownTimer = ref(null)
  const countdown = ref(0)
  const sendingCaptcha = ref(false)

  const loginAnimation = ref(false)
  const dataCheckAnimaton = ref(null)

  onActivated(() => {
    accountInput.value?.focus()
  })

  const inputFocus = () => {
    accountNumber.value = ''
    captchaCode.value = ''

    focusTimer.value = setTimeout(() => {
      accountInput.value?.focus()
      clearTimeout(focusTimer.value)
    }, 1)
  }

  defineExpose({ inputFocus })

  const validateMobile = () => {
    const mobile = accountNumber.value.replace(/\s/g, '')
    if (!/^\d{11}$/.test(mobile)) {
      noticeOpen('请输入正确的手机号', 2)
      return ''
    }
    return mobile
  }

  const validateLogin = () => {
    const mobile = validateMobile()
    const code = captchaCode.value.replace(/\s/g, '')
    if (!mobile || !/^\d{4,8}$/.test(code)) {
      noticeOpen('请输入正确的验证码', 2)
      return null
    }
    return { mobile, code }
  }

  const loginError = () => {
    dataCheckAnimaton.value?.errorAnimation()
    const errorTimer = setTimeout(() => {
      loginAnimation.value = false
      clearTimeout(errorTimer)
    }, 1500)
  }

  const startCountdown = () => {
    countdown.value = 60
    if (countdownTimer.value) {
      clearInterval(countdownTimer.value)
      countdownTimer.value = null
    }
    countdownTimer.value = setInterval(() => {
      if (countdown.value <= 1) {
        countdown.value = 0
        clearInterval(countdownTimer.value)
        countdownTimer.value = null
        return
      }
      countdown.value -= 1
    }, 1000)
  }

  const sendCode = async () => {
    if (sendingCaptcha.value || countdown.value > 0) return

    const mobile = validateMobile()
    if (!mobile) return

    sendingCaptcha.value = true
    try {
      const result = await sendCaptcha(mobile)
      if (result?.status === 1 || result?.error_code === 0) {
        noticeOpen('验证码已发送，请注意查收', 2)
        startCountdown()
        codeInput.value?.focus()
        return
      }
      throw new Error(result?.msg || result?.message || '验证码发送失败')
    } catch (error) {
      noticeOpen(error?.message || '验证码发送失败，请稍后重试', 2)
    } finally {
      sendingCaptcha.value = false
    }
  }

  async function login() {
    const payload = validateLogin()
    if (!payload) return

    loginAnimation.value = true

    try {
      const result = await loginByPhone(payload)

      if (result?.status === 1) {
        await loginHandle(result, 'account')
        emits('jumpTo')
        return
      }

      throw new Error(result?.data || result?.msg || result?.message || '登录失败，请检查验证码')
    } catch (error) {
      noticeOpen(error?.message || '登录失败，请稍后重试', 2)
      loginError()
    }
  }

  onUnmounted(() => {
    if (countdownTimer.value) {
      clearInterval(countdownTimer.value)
      countdownTimer.value = null
    }
  })
</script>

<template>
  <div class="account-container">
    <div class="account">
      <div class="account-adress">
        <label for="account">手机：</label>
        <div class="input-container" :class="{ 'login-animation': loginAnimation }">
          <span class="phone-country">+86</span>
          <input
            class="account-input"
            v-model="accountNumber"
            type="text"
            name="account"
            ref="accountInput"
            spellcheck="false"
            maxlength="11"
            placeholder="请输入手机号"
            @keyup.enter="sendCode"
          >
        </div>
      </div>

      <div class="mail-password">
        <label for="password">验证码：</label>
        <div class="code-row">
          <input
            class="password-input"
            :class="{ 'login-animation': loginAnimation }"
            type="text"
            name="password"
            ref="codeInput"
            v-model="captchaCode"
            spellcheck="false"
            maxlength="8"
            placeholder="请输入验证码"
            @keyup.enter="login"
          >
          <div class="send-button" :class="{ disabled: sendingCaptcha || countdown > 0 }" @click="sendCode">
            {{ countdown > 0 ? `${countdown}s` : (sendingCaptcha ? '发送中...' : '发送验证码') }}
          </div>
        </div>
        <div class="password-line" :class="{ 'login-animation': loginAnimation }"></div>
      </div>

      <div class="animation">
        <DataCheckAnimaton class="check-animation" ref="dataCheckAnimaton" v-if="loginAnimation"></DataCheckAnimaton>
      </div>
    </div>

    <div class="account-operation">
      <div class="login-button" :class="{ loading: loginAnimation }" @click="login">
        {{ loginAnimation ? '登录中...' : '登录' }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .account-container {
    margin-top: 7vh;
    --login-text: #000000;
    --login-muted: rgb(118, 118, 118);
    --login-border: #000000;
    --login-line: #000000;
    --login-button-hover-bg: #000000;
    --login-button-hover-text: #ffffff;

    .account {
      position: relative;

      .account-adress {
        margin-bottom: 7vh;
        display: flex;
        justify-content: center;
        align-items: center;

        label {
          font: 2.2vh SourceHanSansCN-Bold;
          color: var(--login-text);
        }

        .input-container {
          display: flex;
          align-items: center;
          transition: 0.2s ease-out;

          .phone-country {
            margin-right: 1vh;
            width: 6vh;
            text-align: center;
            line-height: 3.7vh;
            font-size: 2.7vh;
            color: var(--login-text);
            font-style: italic;
            border-right: 0.5px solid var(--login-border);
          }

          .account-input {
            width: 23.2vh;
            font-size: 2.7vh;
            color: var(--login-text);
            font-style: italic;
            border: none;
            background: none;
            outline: none;
            transition: 0.2s;
          }
        }
      }

      .mail-password {
        position: relative;

        label {
          font: 2.2vh SourceHanSansCN-Bold;
          color: var(--login-text);
        }

        .code-row {
          display: flex;
          justify-content: center;
          align-items: center;

          .send-button {
            margin-left: 1vh;
            width: 11vh;
            height: 3.8vh;
            line-height: 3.8vh;
            text-align: center;
            border: 1px solid var(--login-border);
            color: var(--login-text);
            font: 12px SourceHanSansCN-Bold;
            transition: 0.2s;

            &:hover {
              cursor: pointer;
              background-color: var(--login-button-hover-bg);
              color: var(--login-button-hover-text);
            }

            &.disabled {
              opacity: 0.6;
              pointer-events: none;
            }
          }
        }

        .password-input {
          transition: 0.2s ease-out;
          width: 19vh;
          font-size: 2.7vh;
          font-style: italic;
          color: var(--login-text);
          border: none;
          background: none;
          outline: none;
        }

        .password-line {
          transition: 0.2s ease-out;
          background-color: var(--login-line);
          width: 33vh;
          height: 0.5px;
          position: absolute;
          bottom: -1.5vh;
          left: 50%;
          transform: translateX(-50%);
        }
      }

      .animation {
        display: flex;
        flex-direction: column;
        align-items: center;

        .check-animation {
          width: 19vh;
          height: 19vh;
          position: absolute;
          top: -2vh;
          transform: translateX(-10%);
        }
      }

      .login-animation {
        opacity: 0;
        transform: scale(0.8);
      }
    }

    .account-operation {
      margin-top: 9vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;

      .login-button {
        padding: 0.8vh 0;
        width: 30vh;
        text-align: center;
        border: 1px solid var(--login-border);
        font: 14px SourceHanSansCN-Bold;
        color: var(--login-text);
        position: relative;
        transition: background-color 0.2s, color 0.2s;

        &:hover {
          cursor: pointer;
          background-color: var(--login-button-hover-bg);
          color: var(--login-button-hover-text);

          &::before,
          &::after {
            opacity: 1;
          }

          &::before {
            left: -40px;
          }

          &::after {
            right: -40px;
          }
        }

        &.loading {
          pointer-events: none;
          opacity: 0.8;
        }

        &::before,
        &::after {
          content: '';
          width: 30px;
          height: 1px;
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          opacity: 0;
          transition: 0.1s;
        }

        &::before {
          background: linear-gradient(to left, var(--login-border) 20%, rgba(0, 0, 0, 0.05));
          left: -50px;
        }

        &::after {
          background: linear-gradient(to right, var(--login-border) 20%, rgba(0, 0, 0, 0.05));
          right: -50px;
        }
      }
    }
  }

  :global(.dark) .account-container {
    --login-text: #f2f5f7;
    --login-muted: #adb4bf;
    --login-border: rgba(255, 255, 255, 0.7);
    --login-line: rgba(255, 255, 255, 0.65);
    --login-button-hover-bg: rgba(255, 255, 255, 0.16);
    --login-button-hover-text: #f2f5f7;
  }
</style>
