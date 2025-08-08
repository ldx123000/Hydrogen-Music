<script setup>
  import { watch, ref, onUnmounted } from 'vue'
  import DataCheckAnimaton from './DataCheckAnimaton.vue'
  import QRCode from 'qrcode'
  import { getQRcode, checkQRcodeStatus } from '../api/login'
  import { onBeforeRouteLeave } from 'vue-router';
  import { loginHandle } from '../utils/handle'

  const props = defineProps(['firstLoadMode'])
  const firstLoadMode = ref(props.firstLoadMode)
  const loging = ref(-1)
  const qrKey = ref(null)
  const qrcodeImg = ref(null)
  const qrStatus = ref(null)
  const statusTitle = ref(null)
  const statusTitleEN = ref('QRCODE')
  const checkQRInterval = ref(null)
  const emits = defineEmits(['jumpTo'])

  // 清理定时器的统一方法
  const clearTimer = () => {
    if (checkQRInterval.value) {
      clearInterval(checkQRInterval.value)
      checkQRInterval.value = null
    }
  }

  // 路由离开前清理
  onBeforeRouteLeave(() => {
    clearTimer()
  })

  // 组件卸载时清理
  onUnmounted(() => {
    clearTimer()
  })

  //初次加载页面获取QRcode
  if(firstLoadMode.value == 0) {
    loadData()
  }
  
  const checkQR = () => {
    clearTimer()
    if(firstLoadMode.value == 1) {
        firstLoadMode.value = 0
        loadData()
    }
    checkQRInterval.value = setInterval(() => {
        checkQRcode()
    }, 1000);
  }
  
  defineExpose({checkQR, clearTimer})

  watch(() => qrStatus.value, (newVal,oldVal) => {
    if(newVal == 800) {
        statusTitle.value = '二维码过期,点击刷新'
        statusTitleEN.value = 'ERROR'
        loging.value = -1
    }
    else if(newVal == 802) {
        statusTitle.value = '请确认登录'
        statusTitleEN.value = 'CONFIRM'
        loging.value = 1
    } else if(newVal == 803) {
        statusTitleEN.value = 'LOGING...'
        loging.value = 2
    }
  })

  async function loadData() {
      await getQRcode().then(result => {
        qrKey.value = result.data.unikey
        const loginUrl = `https://music.163.com/login?codekey=${qrKey.value}`
        let opts = {
            errorCorrectionLevel: 'Q',
            type: "image/png",
            width: 192,
            height: 192,
            color: {
                dark: "#000000",
                light: "#00000000"
            }
        };
        QRCode.toDataURL(loginUrl, opts, (err, url) => {
            if(err) throw err
            qrcodeImg.value = url
        })
        checkQR()
      })
  }

  const checkQRcode = () => {
    if(qrKey.value == null) return
    checkQRcodeStatus(qrKey.value).then(result => {
        if(result.code === 800) {
            qrStatus.value = 800
            console.log("二维码过期")
        } else if(result.code === 801) {
            qrStatus.value = 801
            console.log("等待扫码")
        } else if(result.code === 802) {
            qrStatus.value = 802
            console.log("待确认")
        } else if(result.code === 803) {
            qrStatus.value = 803
            clearTimer()
            loginHandle(result, 'qr')
            emits('jumpTo')
            console.log("授权登录成功")
        }
    })
  }

  const checkStatus = () => {
    if(qrStatus.value == 802) {
        loging.value = -2
        loadData()
    }
    if(qrStatus.value == 800) {
        loging.value = -2
        loadData()
    }
  }
</script>

<template>
  <div class="qrcode-container" @click="checkStatus()">
        <div class="qrcode-border" :class="{'qrcode-loging-1': loging == 1, 'qrcode-loging-1 qrcode-loging-2': loging == 2}">
            <div class="qrcode" :class="{'qrcode-checking': loging == 2, 'qrcode-invalid': qrStatus == 800, 'qrcode-recover': loging == -2}">
                <img :src="qrcodeImg" alt="" v-show="qrcodeImg">
                <span class="qrcode-loading" v-show="!qrcodeImg">Loading...</span>
            </div>
            <div class="qrcode-status" :class="{'qrcode-checking': loging == 2, 'status-1': qrStatus == 800, 'status-2': qrStatus == 802, 'hide': loging == -2}">{{statusTitle}}</div>
            <div class="border border1"></div>
            <div class="border border2"></div>
            <div class="border border3"></div>
            <div class="border border4"></div>
            <div class="line line1"></div>
            <div class="line line2"></div>
            <div class="line line3"></div>
            <div class="line line4"></div>
            <div class="qrcode-text">{{statusTitleEN}}</div>
            <DataCheckAnimaton class="check-animation" v-show="loging == 2"></DataCheckAnimaton>
        </div>
    </div>
</template>

<style scoped lang="scss">
  .qrcode-container{
    margin-top: 7vh;
    display: flex;
    justify-content: center;
    align-items: center;
    //////
    &:hover{
        cursor: pointer;
    }
    .qrcode-border{
        width: 27.6vh;
        height: 27.6vh;
        position: relative;
        transition: 0.3s;
        .qrcode{
            width: 26vh;
            height: 26vh;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            img{
                width: 100%;
                height: 100%;
            }
            .qrcode-loading{
                font: 18px Gilroy-ExtraBold;
                line-height: 26vh;
            }
        }
        .qrcode-checking{
            opacity: 0 !important;
            transition: 0.2s 1s !important;
        }
        .qrcode-invalid{
            opacity: 0.5;
            transition: 0.3s;
        }
        .qrcode-recover{
            opacity: 1 !important;
        }
        .qrcode-status{
            width: 0;
            background-color: black;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%,-50%);
            font: 14px SourceHanSansCN-Bold;
            color: rgba(255, 255, 255, 0);
            white-space: nowrap;
            opacity: 0;
            transition: 0.3s;
        }
        .hide{
            opacity: 0 !important;
        }
        .status-1{
            background-color: red;
            animation: status 0.3s cubic-bezier(.13,.86,.51,.98) forwards;
        }
        .status-2{
            background-color: black;
            animation: status 0.3s cubic-bezier(.13,.86,.51,.98) forwards;
        }
        @keyframes status {
            0%{opacity: 1;}
            100%{width: 100%;opacity: 1;color: rgba(255, 255, 255, 1);}
        }

        .border{
            width: 40px;
            height: 40px;
            position: absolute
        }
        $borderWidth: 2 + px;
        .border1{
            border: {
                top: $borderWidth solid black;
                left: $borderWidth solid black;
            }
            top: 0;
            left: 0;
        }
        .border2{
            border: {
                top: $borderWidth solid black;
                right: $borderWidth solid black;
            }
            top: 0;
            right: 0;
        }
        .border3{
            border: {
                bottom: $borderWidth solid black;
                right: $borderWidth solid black;
            }
            bottom: 0;
            right: 0;
        }
        .border4{
            border: {
                bottom: $borderWidth solid black;
                left: $borderWidth solid black;
            }
            bottom: 0;
            left: 0;
        }
        .line{
            width: 40px;
            height: 1px;
            background: linear-gradient(to right, rgb(0, 0, 0) 30%, rgba(0, 0, 0, 0.1));
            position: absolute;
        }
        .line1{
            top: -13px;
            left: -32px;
            transform: rotate(-135deg);
        }
        .line2{
            top: -13px;
            right: -32px;
            transform: rotate(-45deg);
        }
        .line3{
            bottom: -13px;
            right: -32px;
            transform: rotate(45deg);
        }
        .line4{
            bottom: -13px;
            left: -32px;
            transform: rotate(135deg);
        }
        .qrcode-text{
            font: 1vh Geometos;
            color: black;
            position: absolute;
            top: -1.2vh;
            left: 0.2vh;
        }
        .check-animation{
            width: 100%;
            height: 100%;
            position: absolute;
        }
    }
    .qrcode-loging-1{
        width: 22vh;
        height: 22vh;
        transition: 0.2s ease;
    }
    .qrcode-loging-2{
        .border, .line{
            animation: qrcode-acticity 0.3s 0.2s forwards;
        }
        @keyframes qrcode-acticity {
            0%{opacity: 0;}
            20%{opacity: 1;}
            40%{opacity: 0;}
            60%{opacity: 1;}
            80%{opacity: 0;}
            90%{opacity: 1;}
            100%{opacity: 0;}
        }
    }
}
</style>