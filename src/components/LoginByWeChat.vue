<script setup>
  import { onActivated, onDeactivated, onUnmounted, ref } from 'vue'
  import { onBeforeRouteLeave } from 'vue-router'
  import DataCheckAnimaton from './DataCheckAnimaton.vue'
  import { createWeChatQRcode, checkWeChatStatus, loginByOpenPlatform } from '../api/login'
  import { loginHandle } from '../utils/handle'
  import { noticeOpen } from '../utils/dialog'

  const props = defineProps(['firstLoadMode'])
  const emits = defineEmits(['jumpTo'])

  const firstLoadMode = ref(Number(props.firstLoadMode) || 0)
  const loging = ref(-1)
  const wxUuid = ref('')
  const qrcodeImg = ref('')
  const wxStatus = ref(408)
  const statusTitle = ref('请使用微信扫码授权')
  const statusTitleEN = ref('WECHAT')
  const checkWXInterval = ref(null)
  const loadingQr = ref(false)
  const pollingActive = ref(false)
  const pollingInFlight = ref(false)
  const loginCompleted = ref(false)
  let pollingSessionId = 0
  let qrLoadSessionId = 0

  const normalizeWxQrImage = (raw = '') => {
    if (!raw) return ''
    return raw.startsWith('data:image/') ? raw : `data:image/jpeg;base64,${raw}`
  }

  const clearTimer = () => {
    pollingSessionId += 1
    if (checkWXInterval.value) {
      clearTimeout(checkWXInterval.value)
      checkWXInterval.value = null
    }
    pollingActive.value = false
  }

  const resetWxState = () => {
    clearTimer()
    loginCompleted.value = false
    pollingInFlight.value = false
    wxUuid.value = ''
    qrcodeImg.value = ''
    wxStatus.value = 408
    statusTitle.value = '请使用微信扫码授权'
    statusTitleEN.value = 'WECHAT'
    loging.value = -1
  }

  const scheduleNextPoll = (sessionId, delay = 1000) => {
    if (sessionId !== pollingSessionId || !pollingActive.value || loginCompleted.value) return

    if (checkWXInterval.value) {
      clearTimeout(checkWXInterval.value)
    }

    checkWXInterval.value = setTimeout(async () => {
      if (sessionId !== pollingSessionId) return
      checkWXInterval.value = null
      await checkWXCode(sessionId)
      if (sessionId !== pollingSessionId || !pollingActive.value || loginCompleted.value) return
      if (wxStatus.value === 402 || wxStatus.value === 403 || wxStatus.value === 405) return
      scheduleNextPoll(sessionId)
    }, delay)
  }

  const startPolling = () => {
    if (loginCompleted.value) return
    clearTimer()
    pollingActive.value = true
    const sessionId = pollingSessionId
    scheduleNextPoll(sessionId)
  }

  const loadData = async () => {
    if (loadingQr.value) return

    const loadSessionId = ++qrLoadSessionId
    resetWxState()
    loadingQr.value = true

    try {
      const result = await createWeChatQRcode()
      if (loadSessionId !== qrLoadSessionId) return

      const uuid = result?.uuid || result?.data?.uuid
      const qr = result?.qrcode?.qrcodebase64 || result?.data?.qrcode?.qrcodebase64 || ''

      if (!uuid || !qr) {
        throw new Error('微信二维码加载失败')
      }

      wxUuid.value = uuid
      qrcodeImg.value = normalizeWxQrImage(qr)

      if (loadSessionId !== qrLoadSessionId) return
      startPolling()
    } catch (error) {
      if (loadSessionId !== qrLoadSessionId) return
      noticeOpen(error?.message || '微信二维码加载失败，请重试', 2)
      wxStatus.value = 402
      statusTitle.value = '二维码加载失败, 点击刷新'
      statusTitleEN.value = 'ERROR'
      loging.value = -1
    } finally {
      loadingQr.value = false
    }
  }

  const checkWX = () => {
    if (loginCompleted.value || wxStatus.value === 405) {
      firstLoadMode.value = 0
      loadData()
      return
    }

    clearTimer()

    if (firstLoadMode.value === 1 || !wxUuid.value || !qrcodeImg.value) {
      firstLoadMode.value = 0
      loadData()
      return
    }

    startPolling()
  }

  defineExpose({ checkWX, clearTimer, resetWxState })

  const applyStatus = (status) => {
    if (status === 402) {
      statusTitle.value = '二维码已过期, 点击刷新'
      statusTitleEN.value = 'EXPIRED'
      loging.value = -1
      return
    }

    if (status === 408) {
      statusTitle.value = '请使用微信扫码授权'
      statusTitleEN.value = 'WECHAT'
      loging.value = -1
      return
    }

    if (status === 404) {
      statusTitle.value = '已扫码，请在微信确认'
      statusTitleEN.value = 'CONFIRM'
      loging.value = 1
      return
    }

    if (status === 403) {
      statusTitle.value = '已取消授权, 点击刷新'
      statusTitleEN.value = 'DENIED'
      loging.value = -1
      return
    }

    if (status === 405) {
      statusTitle.value = '授权成功，正在登录'
      statusTitleEN.value = 'LOGGING...'
      loging.value = 2
    }
  }

  const checkWXCode = async (sessionId = pollingSessionId) => {
    if (sessionId !== pollingSessionId || !wxUuid.value || loginCompleted.value || pollingInFlight.value) return

    pollingInFlight.value = true

    try {
      const result = await checkWeChatStatus(wxUuid.value)
      if (sessionId !== pollingSessionId) return

      const status = Number(result?.wx_errcode ?? result?.code)
      wxStatus.value = status
      applyStatus(status)

      if (status === 402 || status === 403) {
        clearTimer()
        return
      }

      if (status === 405) {
        const wxCode = result?.wx_code
        if (!wxCode) {
          throw new Error('微信授权码获取失败')
        }

        const openResult = await loginByOpenPlatform(wxCode)
        if (sessionId !== pollingSessionId) return

        if (openResult?.status === 1) {
          loginCompleted.value = true
          clearTimer()
          await loginHandle(openResult, 'wechat')
          emits('jumpTo')
          return
        }

        throw new Error(openResult?.msg || openResult?.message || '微信登录失败')
      }
    } catch (error) {
      if (sessionId !== pollingSessionId) return
      noticeOpen(error?.message || '微信登录失败，请重试', 2)
      wxStatus.value = 403
      applyStatus(403)
      clearTimer()
    } finally {
      if (sessionId === pollingSessionId) {
        pollingInFlight.value = false
      }
    }
  }

  const refreshQRCode = () => {
    if (wxStatus.value === 402 || wxStatus.value === 403 || wxStatus.value === 404) {
      loging.value = -2
      loadData()
    }
  }

  if (firstLoadMode.value === 0) {
    loadData()
  }

  onActivated(() => {
    if (firstLoadMode.value !== 1) return

    if (loginCompleted.value || wxStatus.value === 405 || !wxUuid.value || !qrcodeImg.value) {
      loadData()
      return
    }

    if (wxStatus.value !== 402 && wxStatus.value !== 403) {
      startPolling()
    }
  })

  onDeactivated(() => {
    clearTimer()
  })

  onBeforeRouteLeave(() => {
    clearTimer()
  })

  onUnmounted(() => {
    clearTimer()
  })
</script>

<template>
  <div class="qrcode-container" @click="refreshQRCode">
    <div class="qrcode-border" :class="{ 'qrcode-loging-1': loging == 1, 'qrcode-loging-1 qrcode-loging-2': loging == 2 }">
      <div class="qrcode" :class="{ 'qrcode-checking': loging == 2, 'qrcode-invalid': wxStatus == 402 || wxStatus == 403, 'qrcode-recover': loging == -2 }">
        <img :src="qrcodeImg" alt="微信二维码" v-show="qrcodeImg">
        <span class="qrcode-loading" v-show="!qrcodeImg">Loading...</span>
      </div>
      <div class="qrcode-status" :class="{ 'qrcode-checking': loging == 2, 'status-1': wxStatus == 402 || wxStatus == 403, 'status-2': wxStatus == 404, hide: loging == -2 }">{{ statusTitle }}</div>
      <div class="border border1"></div>
      <div class="border border2"></div>
      <div class="border border3"></div>
      <div class="border border4"></div>
      <div class="qr-line qr-line1"></div>
      <div class="qr-line qr-line2"></div>
      <div class="qr-line qr-line3"></div>
      <div class="qr-line qr-line4"></div>
      <div class="qrcode-text">{{ statusTitleEN }}</div>
      <DataCheckAnimaton class="check-animation" v-show="loging == 2"></DataCheckAnimaton>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .qrcode-container {
    margin-top: 7vh;
    display: flex;
    justify-content: center;
    align-items: center;
    --qrcode-text: var(--text);
    --qrcode-border: var(--text);
    --qrcode-line: var(--text);
    --qrcode-line-fade: var(--border);
    --qrcode-status-bg: #000000;
    --qrcode-status-text: #ffffff;
    --qrcode-status-danger: #d10000;

    &:hover {
      cursor: pointer;
    }

    .qrcode-border {
      width: 27.6vh;
      height: 27.6vh;
      position: relative;
      transition: 0.3s;

      .qrcode {
        width: 26vh;
        height: 26vh;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);

        img {
          width: 100%;
          height: 100%;
        }

        .qrcode-loading {
          font: 18px Gilroy-ExtraBold;
          line-height: 26vh;
          color: var(--qrcode-text);
        }
      }

      .qrcode-checking {
        opacity: 0 !important;
        transition: 0.2s 1s !important;
      }

      .qrcode-invalid {
        opacity: 0.5;
        transition: 0.3s;
      }

      .qrcode-recover {
        opacity: 1 !important;
      }

      .qrcode-status {
        width: 0;
        background-color: var(--qrcode-status-bg);
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font: 14px SourceHanSansCN-Bold;
        color: rgba(255, 255, 255, 0);
        white-space: nowrap;
        opacity: 0;
        transition: 0.3s;
      }

      .hide {
        opacity: 0 !important;
      }

      .status-1 {
        background-color: var(--qrcode-status-danger);
        animation: status 0.3s cubic-bezier(.13, .86, .51, .98) forwards;
      }

      .status-2 {
        background-color: var(--qrcode-status-bg);
        animation: status 0.3s cubic-bezier(.13, .86, .51, .98) forwards;
      }

      @keyframes status {
        0% {
          opacity: 1;
        }

        100% {
          width: 100%;
          opacity: 1;
          color: var(--qrcode-status-text);
        }
      }

      .border {
        width: 40px;
        height: 40px;
        position: absolute;
      }

      $borderWidth: 2 + px;

      .border1 {
        border: {
          top: $borderWidth solid var(--qrcode-border);
          left: $borderWidth solid var(--qrcode-border);
        };

        top: 0;
        left: 0;
      }

      .border2 {
        border: {
          top: $borderWidth solid var(--qrcode-border);
          right: $borderWidth solid var(--qrcode-border);
        };

        top: 0;
        right: 0;
      }

      .border3 {
        border: {
          bottom: $borderWidth solid var(--qrcode-border);
          right: $borderWidth solid var(--qrcode-border);
        };

        bottom: 0;
        right: 0;
      }

      .border4 {
        border: {
          bottom: $borderWidth solid var(--qrcode-border);
          left: $borderWidth solid var(--qrcode-border);
        };

        bottom: 0;
        left: 0;
      }

      .qr-line {
        width: 40px;
        height: 1px;
        background: linear-gradient(to right, var(--qrcode-line) 30%, var(--qrcode-line-fade));
        position: absolute;
      }

      .qr-line1 {
        top: -13px;
        left: -32px;
        transform: rotate(-135deg);
      }

      .qr-line2 {
        top: -13px;
        right: -32px;
        transform: rotate(-45deg);
      }

      .qr-line3 {
        bottom: -13px;
        right: -32px;
        transform: rotate(45deg);
      }

      .qr-line4 {
        bottom: -13px;
        left: -32px;
        transform: rotate(135deg);
      }

      .qrcode-text {
        font: 1vh Geometos;
        color: var(--qrcode-text);
        position: absolute;
        top: -1.2vh;
        left: 0.2vh;
      }

      .check-animation {
        width: 100%;
        height: 100%;
        position: absolute;
      }
    }

    .qrcode-loging-1 {
      width: 22vh;
      height: 22vh;
      transition: 0.2s ease;
    }

    .qrcode-loging-2 {
      .border,
      .qr-line {
        animation: qrcode-acticity 0.3s 0.2s forwards;
      }

      @keyframes qrcode-acticity {
        0% {
          opacity: 0;
        }

        20% {
          opacity: 1;
        }

        40% {
          opacity: 0;
        }

        60% {
          opacity: 1;
        }

        80% {
          opacity: 0;
        }

        90% {
          opacity: 1;
        }

        100% {
          opacity: 0;
        }
      }
    }
  }

  :global(.dark) .qrcode-container {
    --qrcode-text: var(--text);
    --qrcode-border: var(--text);
    --qrcode-line: var(--text);
    --qrcode-line-fade: var(--border);
    --qrcode-status-bg: rgba(17, 24, 33, 0.92);
    --qrcode-status-text: #f2f5f7;
    --qrcode-status-danger: #ef5350;
  }
</style>
