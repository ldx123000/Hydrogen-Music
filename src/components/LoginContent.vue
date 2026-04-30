<script setup>
  import { computed, onActivated, onDeactivated, onUnmounted, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import LoginByQRCode from './LoginByQRCode.vue'
  import LoginByWeChat from './LoginByWeChat.vue'
  import LoginByAccount from './LoginByAccount.vue'

  const route = useRoute()
  const router = useRouter()

  const loginByQR = ref(null)
  const loginByWX = ref(null)
  const loginByAC = ref(null)
  const jumpPage = ref(false)
  const jumpTimer = ref(null)

  // 0: 酷狗二维码 1: 微信登录 2: 手机验证码
  const loginMode = ref(0)
  const isKugouQrMode = computed(() => loginMode.value === 0)
  const isWechatMode = computed(() => loginMode.value === 1)
  const isPhoneMode = computed(() => loginMode.value === 2)

  const syncModeFromRoute = () => {
    const queryMode = Number(route.query.mode)

    // 支持三种登录方式，非法值回退到默认二维码
    if (queryMode === 1) {
      loginMode.value = 1
      return
    }

    if (queryMode === 2) {
      loginMode.value = 2
      return
    }

    loginMode.value = 0
  }

  const enterKugouQrMode = () => {
    loginMode.value = 0
    loginByQR.value?.checkQR()
    loginByWX.value?.clearTimer()
  }

  const enterWechatMode = () => {
    loginMode.value = 1
    loginByWX.value?.checkWX()
    loginByQR.value?.clearTimer()
  }

  const enterPhoneMode = () => {
    loginMode.value = 2
    loginByAC.value?.inputFocus()
    loginByQR.value?.clearTimer()
    loginByWX.value?.clearTimer()
  }

  const changeMode = (mode) => {
    if (mode === 0) {
      enterKugouQrMode()
      return
    }

    if (mode === 1) {
      enterWechatMode()
      return
    }

    enterPhoneMode()
  }

  // 登录成功后动画并跳转
  const jumpTo = () => {
    loginByQR.value?.clearTimer()
    loginByWX.value?.clearTimer()
    if (jumpTimer.value) {
      clearTimeout(jumpTimer.value)
      jumpTimer.value = null
    }
    // 先预热目标页面，减少跳转时的空白帧和“闪一下”的感觉
    void import('../views/MyMusic.vue')
    jumpPage.value = true
    // 与 .jumpPage 的动画时长对齐，避免动画结束后先露出一帧空白再切路由
    jumpTimer.value = setTimeout(() => {
      void router.push('/mymusic').catch(() => {
        // 跳转失败时恢复登录页，避免卡在缩小态
        jumpPage.value = false
      })
      jumpTimer.value = null
    }, 2800)
  }

  watch(() => route.query.mode, () => {
    syncModeFromRoute()

    if (isKugouQrMode.value) {
      loginByQR.value?.checkQR()
      loginByWX.value?.clearTimer()
      return
    }

    if (isWechatMode.value) {
      loginByWX.value?.checkWX()
      loginByQR.value?.clearTimer()
      return
    }

    loginByQR.value?.clearTimer()
    loginByWX.value?.clearTimer()
    loginByAC.value?.inputFocus()
  }, { immediate: true })

  onActivated(() => {
    syncModeFromRoute()

    if (isKugouQrMode.value) {
      loginByQR.value?.checkQR()
      return
    }

    if (isWechatMode.value) {
      loginByWX.value?.checkWX()
      return
    }

    loginByAC.value?.inputFocus()
  })

  onDeactivated(() => {
    loginByQR.value?.clearTimer()
    loginByWX.value?.clearTimer()
  })

  onUnmounted(() => {
    loginByQR.value?.clearTimer()
    loginByWX.value?.clearTimer()
    if (jumpTimer.value) {
      clearTimeout(jumpTimer.value)
      jumpTimer.value = null
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
        <span class="login-title">登录酷狗账号</span>
      </div>

      <LoginByQRCode
        ref="loginByQR"
        class="qrcode-container"
        :firstLoadMode="loginMode"
        v-show="isKugouQrMode"
        @jumpTo="jumpTo"
      />

      <LoginByWeChat
        ref="loginByWX"
        class="qrcode-container"
        :firstLoadMode="loginMode"
        v-show="isWechatMode"
        @jumpTo="jumpTo"
      />

      <LoginByAccount
        ref="loginByAC"
        class="account-container"
        v-show="isPhoneMode"
        @jumpTo="jumpTo"
      />

      <div class="login-other">
        <span class="qrcode-tip" v-show="isKugouQrMode">推荐：打开酷狗 APP 扫码登录</span>
        <span class="qrcode-tip" v-show="isWechatMode">使用微信扫码授权登录酷狗</span>
        <span class="qrcode-tip" v-show="isPhoneMode">使用手机号验证码登录</span>

        <div class="login-method" v-show="isKugouQrMode">
          <span class="active">酷狗二维码登录</span>
          <span class="separation">|</span>
          <span @click="changeMode(1)">微信登录</span>
          <span class="separation">|</span>
          <span @click="changeMode(2)">手机验证码登录</span>
        </div>

        <div class="login-method" v-show="!isKugouQrMode">
          <span @click="changeMode(0)">酷狗二维码登录</span>
          <span class="separation">|</span>
          <span :class="{ active: isWechatMode }" @click="changeMode(1)">微信登录</span>
          <span class="separation">|</span>
          <span :class="{ active: isPhoneMode }" @click="changeMode(2)">手机验证码登录</span>
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

            &.active {
              color: var(--login-text);
              cursor: default;
            }

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
