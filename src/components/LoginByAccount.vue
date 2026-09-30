<script setup>
  import { computed, onActivated, onUnmounted, ref } from 'vue'
  import DataCheckAnimaton from './DataCheckAnimaton.vue'
  import { noticeOpen } from '../utils/dialog'
  import { loginByPhone, sendPhoneCaptcha } from '../api/login'
  import { loginHandle } from '../utils/handle'

  const emits = defineEmits(['jumpTo'])

  const accountInput = ref(null)
  const countrycode = ref('+86')
  const accountNumber = ref('')
  const phoneCaptcha = ref('')
  const focusTimer = ref(null)
  const captchaCountdown = ref(0)
  const captchaSending = ref(false)
  const captchaTimer = ref(null)

  const loginAnimation = ref(false)
  const dataCheckAnimaton = ref(null)

  const captchaButtonText = computed(() => {
    if (captchaSending.value) return '发送中'
    if (captchaCountdown.value > 0) return `${captchaCountdown.value}s`
    return '获取验证码'
  })

  onActivated(() => {
    accountInput.value?.focus()
  })

  onUnmounted(() => {
    clearCaptchaTimer()
    if (focusTimer.value) clearTimeout(focusTimer.value)
  })

  const inputFocus = () => {
    accountNumber.value = ''
    phoneCaptcha.value = ''

    focusTimer.value = setTimeout(() => {
      accountInput.value?.focus()
      clearTimeout(focusTimer.value)
    }, 1)
  }

  defineExpose({ inputFocus })

  const clearCaptchaTimer = () => {
    if (!captchaTimer.value) return
    clearInterval(captchaTimer.value)
    captchaTimer.value = null
  }

  const startCaptchaCountdown = () => {
    clearCaptchaTimer()
    captchaCountdown.value = 60
    captchaTimer.value = setInterval(() => {
      captchaCountdown.value -= 1
      if (captchaCountdown.value <= 0) {
        captchaCountdown.value = 0
        clearCaptchaTimer()
      }
    }, 1000)
  }

  const getPhoneLoginPayloadBase = () => ({
    phone: accountNumber.value.replace(/\s/g, ''),
    countrycode: countrycode.value.replace('+', '').replace(/\s/g, ''),
  })

  const validatePhoneBase = () => {
    const phone = accountNumber.value.replace(/\s/g, '')
    const code = countrycode.value.replace('+', '').trim()

    if (!code || !phone) {
      noticeOpen('请输入正确的手机号', 2)
      return false
    }

    if (!/^\d{5,20}$/.test(phone)) {
      noticeOpen('手机号格式不正确', 2)
      return false
    }

    return true
  }

  const validatePhone = () => {
    if (!validatePhoneBase()) return false

    if (!phoneCaptcha.value.trim()) {
      noticeOpen('请输入验证码', 2)
      return false
    }

    return true
  }

  const loginError = () => {
    dataCheckAnimaton.value?.errorAnimation()
    const errorTimer = setTimeout(() => {
      loginAnimation.value = false
      clearTimeout(errorTimer)
    }, 1500)
  }

  const sendCaptcha = async () => {
    if (captchaSending.value || captchaCountdown.value > 0) return
    if (!validatePhoneBase()) return

    captchaSending.value = true
    try {
      const result = await sendPhoneCaptcha({
        ...getPhoneLoginPayloadBase(),
        ctcode: countrycode.value.replace('+', '').replace(/\s/g, ''),
      })
      if (result?.code === 200 || result?.data === true) {
        noticeOpen('验证码已发送', 1)
        startCaptchaCountdown()
        return
      }
      throw new Error(result?.message || result?.msg || '验证码发送失败')
    } catch (error) {
      noticeOpen(error?.response?.data?.message || error?.message || '验证码发送失败，请稍后重试', 2)
    } finally {
      captchaSending.value = false
    }
  }

  const getLoginErrorMessage = error => {
    const data = error?.response?.data
    if (data?.code === 8821 || data?.hitType === 60001) return '当前登录需要行为验证，请稍后再试'
    return data?.message || data?.msg || error?.message || '登录失败，请稍后重试'
  }

  async function login() {
    if (!validatePhone()) return

    loginAnimation.value = true

    try {
      const result = await loginByPhone({
        ...getPhoneLoginPayloadBase(),
        captcha: phoneCaptcha.value.trim(),
      })

      if (result?.code === 200) {
        loginHandle(result, 'account')
        emits('jumpTo')
        return
      }

      throw new Error(result?.message || result?.msg || '登录失败，请检查账号与密码')
    } catch (error) {
      noticeOpen(getLoginErrorMessage(error), 2)
      loginError()
    }
  }
</script>

<template>
  <div class="account-container">
    <div class="account">
      <div class="account-adress">
        <label for="account">手机：</label>
        <div class="input-container" :class="{ 'login-animation': loginAnimation }">
          <input
            class="phone-country"
            type="text"
            v-model="countrycode"
            spellcheck="false"
          >
          <input
            class="account-input account-input2"
            v-model="accountNumber"
            type="text"
            name="account"
            ref="accountInput"
            spellcheck="false"
            @keyup.enter="login"
          >
        </div>
      </div>

      <div class="mail-password">
        <label for="password">验证码：</label>
        <div class="password-field">
          <input
            class="password-input captcha-input"
            :class="{ 'login-animation': loginAnimation }"
            type="text"
            name="captcha"
            v-model="phoneCaptcha"
            spellcheck="false"
            @keyup.enter="login"
          >
          <button
            class="captcha-button"
            type="button"
            :disabled="captchaSending || captchaCountdown > 0"
            @click="sendCaptcha"
          >
            {{ captchaButtonText }}
          </button>
        </div>
        <div class="forget-password">
          <div class="forget-title">请在手机查看</div>
          <div class="password-line" :class="{ 'login-animation': loginAnimation }"></div>
        </div>
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
          transition: 0.2s ease-out;

          .phone-country {
            margin-right: 1vh;
            width: 6vh;
            font-size: 2.7vh;
            color: var(--login-text);
            font-style: italic;
            border: none;
            border-right: 0.5px solid var(--login-border);
            background: none;
            outline: none;
          }

          .account-input {
            width: 30.2vh;
            font-size: 2.7vh;
            color: var(--login-text);
            font-style: italic;
            border: none;
            background: none;
            outline: none;
            transition: 0.2s;
          }

          .account-input2 {
            width: 23.2vh;
          }
        }
      }

      .mail-password {
        position: relative;

        label {
          font: 2.2vh SourceHanSansCN-Bold;
          color: var(--login-text);
        }

        .password-field {
          display: inline-flex;
          align-items: center;
          width: 30.2vh;
        }

        .password-input {
          transition: 0.2s ease-out;
          width: 30.2vh;
          font-family: Password;
          font-size: 2.7vh;
          font-style: italic;
          color: var(--login-text);
          border: none;
          background: none;
          outline: none;
        }

        .captcha-input {
          width: 18.8vh;
          font-family: SourceHanSansCN-Bold;
        }

        .captcha-button {
          flex: 0 0 auto;
          width: 10.8vh;
          padding: 0.35vh 0;
          font: 1.25vh SourceHanSansCN-Bold;
          color: var(--login-text);
          border: 1px solid var(--login-border);
          border-radius: 0;
          background: none;
          outline: none;
          appearance: none;
          -webkit-appearance: none;
          transition: background-color 0.2s, color 0.2s, opacity 0.2s;

          &:hover:not(:disabled) {
            cursor: pointer;
            background-color: var(--login-button-hover-bg);
            color: var(--login-button-hover-text);
          }

          &:disabled {
            cursor: default;
            opacity: 0.55;
          }
        }

        .forget-password {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          position: absolute;
          bottom: -1.5vh;

          .forget-title {
            margin-right: 2px;
            font: 1.3vh Source Han Sans;
            color: var(--login-muted);
            white-space: nowrap;
          }

          .password-line {
            transition: 0.2s ease-out;
            background-color: var(--login-line);
            width: 29.8vh;
            height: 0.5px;
          }
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
