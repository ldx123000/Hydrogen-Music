<script setup>
  import { computed, onActivated, ref } from 'vue'
  import md5 from 'js-md5'
  import DataCheckAnimaton from './DataCheckAnimaton.vue'
  import { noticeOpen } from '../utils/dialog'
  import { loginByEmail, loginByPhone } from '../api/login'
  import { loginHandle } from '../utils/handle'

  const props = defineProps(['currentMode'])
  const emits = defineEmits(['jumpTo'])

  const accountInput = ref(null)
  const countrycode = ref('+86')
  const accountNumber = ref('')
  const typePassword = ref('')
  const focusTimer = ref(null)

  const loginAnimation = ref(false)
  const dataCheckAnimaton = ref(null)

  const isEmailMode = computed(() => Number(props.currentMode) === 0)

  onActivated(() => {
    accountInput.value?.focus()
  })

  const inputFocus = () => {
    accountNumber.value = ''
    typePassword.value = ''

    focusTimer.value = setTimeout(() => {
      accountInput.value?.focus()
      clearTimeout(focusTimer.value)
    }, 1)
  }

  defineExpose({ inputFocus })

  const validateEmail = () => {
    const emailReg = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/
    if (!accountNumber.value.trim() || !typePassword.value.trim()) {
      noticeOpen('请输入正确的邮箱或密码', 2)
      return false
    }
    if (!emailReg.test(accountNumber.value.trim())) {
      noticeOpen('请输入正确的邮箱', 2)
      return false
    }
    return true
  }

  const validatePhone = () => {
    const phone = accountNumber.value.replace(/\s/g, '')
    const code = countrycode.value.replace('+', '').trim()

    if (!code || !phone || !typePassword.value.trim()) {
      noticeOpen('请输入正确的手机号或密码', 2)
      return false
    }

    if (!/^\d{5,20}$/.test(phone)) {
      noticeOpen('手机号格式不正确', 2)
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

  async function login() {
    const mode = Number(props.currentMode)
    if (mode !== 0 && mode !== 1) return

    if (mode === 0 && !validateEmail()) return
    if (mode === 1 && !validatePhone()) return

    loginAnimation.value = true

    try {
      const basePayload = {
        password: 'none',
        md5_password: md5(typePassword.value),
      }

      const result = mode === 0
        ? await loginByEmail({
            ...basePayload,
            email: accountNumber.value.replace(/\s/g, ''),
          })
        : await loginByPhone({
            ...basePayload,
            phone: accountNumber.value.replace(/\s/g, ''),
            countrycode: countrycode.value.replace('+', '').replace(/\s/g, ''),
          })

      if (result?.code === 200) {
        loginHandle(result, 'account')
        emits('jumpTo')
        return
      }

      throw new Error(result?.message || result?.msg || '登录失败，请检查账号与密码')
    } catch (error) {
      noticeOpen(error?.message || '登录失败，请稍后重试', 2)
      loginError()
    }
  }
</script>

<template>
  <div class="account-container">
    <div class="account">
      <div class="account-adress">
        <label for="account">{{ isEmailMode ? '邮箱：' : '手机：' }}</label>
        <div class="input-container" :class="{ 'login-animation': loginAnimation }">
          <input
            class="phone-country"
            type="text"
            v-model="countrycode"
            v-show="!isEmailMode"
            spellcheck="false"
          >
          <input
            class="account-input"
            :class="{ 'account-input2': !isEmailMode }"
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
        <label for="password">密码：</label>
        <input
          class="password-input"
          :class="{ 'login-animation': loginAnimation }"
          type="password"
          name="password"
          v-model="typePassword"
          spellcheck="false"
          @keyup.enter="login"
        >
        <div class="forget-password">
          <div class="forget-title">您忘记了密码？</div>
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
            width: 33vh;
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
