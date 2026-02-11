<script setup>
  import { onUnmounted, ref, watch } from 'vue'
  import { onBeforeRouteLeave } from 'vue-router'
  import QRCode from 'qrcode'
  import DataCheckAnimaton from './DataCheckAnimaton.vue'
  import { createQRcode, getQRcodeKey, checkQRcodeStatus } from '../api/login'
  import { loginHandle } from '../utils/handle'
  import { noticeOpen } from '../utils/dialog'

  const props = defineProps(['firstLoadMode'])
  const emits = defineEmits(['jumpTo'])

  const firstLoadMode = ref(Number(props.firstLoadMode) || 0)
  const loging = ref(-1)
  const qrKey = ref(null)
  const qrcodeImg = ref('')
  const qrStatus = ref(801)
  const statusTitle = ref('请使用网易云音乐扫码')
  const statusTitleEN = ref('QRCODE')
  const checkQRInterval = ref(null)
  const loadingQr = ref(false)

  const clearTimer = () => {
    if (checkQRInterval.value) {
      clearInterval(checkQRInterval.value)
      checkQRInterval.value = null
    }
  }

  const startPolling = () => {
    clearTimer()
    checkQRInterval.value = setInterval(() => {
      checkQRcode()
    }, 1000)
  }

  const generateFallbackQrImg = async (key) => {
    const loginUrl = `https://music.163.com/login?codekey=${key}`
    return QRCode.toDataURL(loginUrl, {
      errorCorrectionLevel: 'Q',
      type: 'image/png',
      width: 192,
      height: 192,
      color: {
        dark: '#000000',
        light: '#00000000',
      },
    })
  }

  const loadData = async () => {
    if (loadingQr.value) return

    loadingQr.value = true
    qrcodeImg.value = ''
    qrStatus.value = 801
    statusTitle.value = '请使用网易云音乐扫码'
    statusTitleEN.value = 'QRCODE'

    try {
      const keyResult = await getQRcodeKey()
      const key = keyResult?.data?.unikey
      if (!key) {
        throw new Error('获取二维码 key 失败')
      }

      qrKey.value = key

      const qrResult = await createQRcode(key)
      const qrimg = qrResult?.data?.qrimg
      qrcodeImg.value = qrimg || await generateFallbackQrImg(key)

      startPolling()
    } catch (error) {
      noticeOpen(error?.message || '二维码加载失败，请重试', 2)
      qrStatus.value = 800
      statusTitle.value = '二维码加载失败, 点击刷新'
      statusTitleEN.value = 'ERROR'
      loging.value = -1
    } finally {
      loadingQr.value = false
    }
  }

  const checkQR = () => {
    clearTimer()

    if (firstLoadMode.value === 1 || !qrKey.value || !qrcodeImg.value) {
      firstLoadMode.value = 0
      loadData()
      return
    }

    startPolling()
  }

  defineExpose({ checkQR, clearTimer })

  watch(() => qrStatus.value, (newVal) => {
    if (newVal === 800) {
      statusTitle.value = '二维码过期, 点击刷新'
      statusTitleEN.value = 'ERROR'
      loging.value = -1
    } else if (newVal === 801) {
      statusTitle.value = '请使用网易云音乐扫码'
      statusTitleEN.value = 'QRCODE'
      loging.value = -1
    } else if (newVal === 802) {
      statusTitle.value = '请在手机端确认登录'
      statusTitleEN.value = 'CONFIRM'
      loging.value = 1
    } else if (newVal === 803) {
      statusTitle.value = '登录成功，正在跳转'
      statusTitleEN.value = 'LOGGING...'
      loging.value = 2
    }
  })

  const checkQRcode = () => {
    if (!qrKey.value) return

    checkQRcodeStatus(qrKey.value).then(result => {
      if (result?.code === 800) {
        qrStatus.value = 800
      } else if (result?.code === 801) {
        qrStatus.value = 801
      } else if (result?.code === 802) {
        qrStatus.value = 802
      } else if (result?.code === 803) {
        qrStatus.value = 803
        clearTimer()
        loginHandle(result, 'qr')
        emits('jumpTo')
      }
    }).catch(() => {
      // 轮询失败保持静默，避免频繁打断
    })
  }

  const refreshQRCode = () => {
    if (qrStatus.value === 800 || qrStatus.value === 802) {
      loging.value = -2
      loadData()
    }
  }

  if (firstLoadMode.value === 0) {
    loadData()
  }

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
      <div class="qrcode" :class="{ 'qrcode-checking': loging == 2, 'qrcode-invalid': qrStatus == 800, 'qrcode-recover': loging == -2 }">
        <img :src="qrcodeImg" alt="二维码" v-show="qrcodeImg">
        <span class="qrcode-loading" v-show="!qrcodeImg">Loading...</span>
      </div>
      <div class="qrcode-status" :class="{ 'qrcode-checking': loging == 2, 'status-1': qrStatus == 800, 'status-2': qrStatus == 802, hide: loging == -2 }">{{ statusTitle }}</div>
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
