<script setup>
  import { computed, onActivated, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import LoginByQRCode from './LoginByQRCode.vue'
  import LoginByAccount from './LoginByAccount.vue'

  const route = useRoute()
  const router = useRouter()

  const loginByQR = ref(null)
  const loginByAC = ref(null)
  const jumpPage = ref(false)

  // 0: 二维码 1: 账号登录（邮箱/手机）
  const loginMode = ref(0)
  // 0: 邮箱 1: 手机
  const currentMode = ref(0)

  const isQrMode = computed(() => loginMode.value === 0)

  const syncModeFromRoute = () => {
    const queryMode = Number(route.query.mode)

    // 仅保留参考仓库一致的两种入口：0=二维码，1=账号
    if (queryMode === 1) {
      loginMode.value = 1
      currentMode.value = 0
      return
    }

    // mode=0 或任何非法值（含旧的 3/4）统一回退到二维码
    loginMode.value = 0
    currentMode.value = 0
  }

  const enterQrMode = () => {
    loginMode.value = 0
    loginByQR.value?.checkQR()
  }

  const changeMode = (mode) => {
    if (mode === 2) {
      enterQrMode()
      return
    }

    loginMode.value = 1
    currentMode.value = mode === 1 ? 1 : 0
    loginByAC.value?.inputFocus()
    loginByQR.value?.clearTimer()
  }

  const register = () => {
    windowApi.toRegister('https://music.163.com/')
  }

  // 登录成功后动画并跳转
  const jumpTo = () => {
    jumpPage.value = true
    const jumpDelay = setTimeout(() => {
      router.push('/mymusic')
      jumpPage.value = false
      clearTimeout(jumpDelay)
    }, 3000)
  }

  watch(() => route.query.mode, () => {
    syncModeFromRoute()
    if (isQrMode.value) {
      loginByQR.value?.checkQR()
    } else {
      loginByQR.value?.clearTimer()
    }
  }, { immediate: true })

  onActivated(() => {
    syncModeFromRoute()
    if (isQrMode.value) {
      loginByQR.value?.checkQR()
    }
  })
</script>

<template>
  <div class="login-content" :class="{ jumpPage: jumpPage }">
    <div class="login-container">
      <div class="login-header">
        <div class="login-icon">
          <img src="../assets/img/netease-music.png" alt="">
        </div>
        <span class="login-title">登录网易云账号</span>
      </div>

      <LoginByQRCode
        ref="loginByQR"
        class="qrcode-container"
        :firstLoadMode="loginMode"
        v-show="isQrMode"
        @jumpTo="jumpTo"
      />

      <LoginByAccount
        ref="loginByAC"
        class="account-container"
        :currentMode="currentMode"
        v-show="!isQrMode"
        @jumpTo="jumpTo"
      />

      <div class="login-other">
        <span class="qrcode-tip" v-show="isQrMode">打开网易云 APP 扫码登录</span>

        <div class="login-method" v-show="isQrMode">
          <span @click="changeMode(0)">邮箱登录</span>
          <span class="separation">|</span>
          <span @click="changeMode(1)">手机登录</span>
        </div>

        <div class="login-method" v-show="!isQrMode">
          <span v-show="currentMode !== 0" @click="changeMode(0)">邮箱登录</span>
          <span v-show="currentMode !== 0" class="separation">|</span>
          <span v-show="currentMode !== 1" @click="changeMode(1)">手机登录</span>
          <span class="separation">|</span>
          <span @click="changeMode(2)">二维码登录</span>
        </div>

        <div class="to-register" v-show="!isQrMode">
          <span @click="register">没有账号？去注册</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .login-content {
    height: 100%;
    --login-title: #000000;
    --login-text: #000000;
    --login-muted: rgb(111, 111, 111);

    .login-container {
      display: flex;
      flex-direction: column;
      justify-content: center;
      height: calc(100% - 120px);

      .login-header {
        display: flex;
        flex-direction: column;
        align-items: center;

        .login-icon {
          margin-bottom: 1.5vh;
          width: 6.5vh;
          height: 6.5vh;
          background-color: rgb(226, 0, 0);

          img {
            width: 100%;
            height: 100%;
          }
        }

        .login-title {
          font: 2.7vh SourceHanSansCN-Bold;
          color: var(--login-title);
        }
      }

      .login-other {
        margin-top: 5.5vh;

        .qrcode-tip {
          font: 13px SourceHanSansCN-Bold;
          color: var(--login-text);
        }

        .login-method {
          span {
            font: 12px SourceHanSansCN-Bold;
            color: var(--login-muted);
            transition: 0.2s;

            &:hover {
              cursor: pointer;
              color: var(--login-text);
            }
          }

          .separation {
            margin: 0 4px;
            pointer-events: none;
          }
        }

        .to-register {
          display: flex;
          justify-content: center;

          span {
            font: 12px SourceHanSansCN-Bold;
            color: var(--login-muted);

            &:hover {
              cursor: pointer;
              color: var(--login-text);
            }
          }
        }
      }
    }
  }

  .jumpPage {
    opacity: 0;
    transform: scale(0.4);
    transition: 0.6s 2.2s cubic-bezier(.47, 0, .98, .58);
  }

  :global(.dark) .login-content {
    --login-title: #f2f5f7;
    --login-text: #f2f5f7;
    --login-muted: #adb4bf;
  }
</style>
