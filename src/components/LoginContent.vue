<script setup>
  import { onActivated, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import LoginByQRCode from './LoginByQRCode.vue';
  import LoginByAccount from './LoginByAccount.vue';
  import LoginByCookie from './LoginByCookie.vue';
  import LoginByEmbedded from './LoginByEmbedded.vue';

  const route = useRoute()
  const router = useRouter()
  //通过网易云还是本地
  const accountMode = ref(route.query.mode)

  ///通过二维码还是账号
  const loginMode = ref(route.query.mode)

  //当为账号登陆时当前选择的是邮箱还是手机 1:邮箱 2:手机
  const currentMode = ref(0)

  const loginByQR = ref(null)
  const loginByAC = ref(null)
  const loginByCK = ref(null)
  const loginByEM = ref(null)
  const jumpPage = ref(false)

  onActivated(() => {
    accountMode.value = parseInt(route.query.mode) || 0
    
    // 如果是一键登录模式(mode=4)，设置相应的状态
    if(parseInt(route.query.mode) == 4) {
      currentMode.value = 4
      loginMode.value = 1  // 切换到账号登录模式
    } else {
      currentMode.value = 0
      loginMode.value = parseInt(route.query.mode) || 0
    }
    
    if(accountMode.value == 0) {
        loginByQR.value.checkQR()
    }
  })

  // 初始化currentMode
  const initializeMode = () => {
    if(parseInt(route.query.mode) == 4) {
      currentMode.value = 4
      loginMode.value = 1
    } else {
      currentMode.value = 0
      if(accountMode.value == 0) loginMode.value = 0
      else loginMode.value = 1
    }
  }

  // 初始化
  initializeMode()

  const changeMode =(mode) => {
    if(mode != 2) {
        loginMode.value = 1
        currentMode.value = mode
        if(mode == 0 || mode == 1) {
          loginByAC.value.inputFocus()
        } else if(mode == 3) {
          loginByCK.value.inputFocus()
        } else if(mode == 4) {
          // 内嵌登录不需要特殊处理
          console.log('切换到内嵌登录模式')
        }
    } else {
        loginByQR.value.checkQR()
        loginMode.value = 0
    }
    if(accountMode.value == 0 && loginMode.value == 1) {
        loginByQR.value.clearTimer()
    }
  }
  const register = () => {
    if(accountMode.value == 0) windowApi.toRegister("https://music.163.com/")
    else console.log('注册本地帐号')
  }
  //登录成功跳转页面并销毁当前页面
  const jumpTo = () => {
      jumpPage.value = true
      const jumpDelay = setTimeout(() => {
        router.push('/mymusic')
        jumpPage.value = false
        clearTimeout(jumpDelay)
      }, 3000);
  }

</script>

<template>
  <div class="login-content" :class="{'jumpPage': jumpPage}">
    <div class="login-container">
        <div class="login-header">
            <div class="login-icon">
                <img src="../assets/img/netease-music.png" alt="">
            </div>
            <span class="login-title">登录网易云账号</span>
        </div>
        
        <LoginByQRCode class="qrcode-container" ref="loginByQR" @jumpTo="jumpTo" :firstLoadMode="loginMode" v-show="loginMode == 0 && accountMode == 0"></LoginByQRCode>
        <LoginByAccount class="account-container" ref="loginByAC" @jumpTo="jumpTo" :currentMode="currentMode"  v-show="loginMode == 1 && (currentMode == 0 || currentMode == 1)"></LoginByAccount>
        <LoginByCookie class="cookie-container" ref="loginByCK" @jumpTo="jumpTo" v-show="loginMode == 1 && currentMode == 3"></LoginByCookie>
        <LoginByEmbedded class="embedded-container" ref="loginByEM" @jumpTo="jumpTo" v-show="loginMode == 1 && currentMode == 4"></LoginByEmbedded>

        <div class="login-other">
            <span class="qrcode-tip" v-show="loginMode == 0 && accountMode == 0">打开网易云APP扫码登录</span>
            <div class="login-method" v-show="loginMode == 0 && accountMode == 0">
                <span class="login-mail" @click="changeMode(0)">邮箱登录</span>
                <span class="separation">|</span>
                <span class="login-phone" @click="changeMode(1)">手机登录</span>
                <span class="separation">|</span>
                <span class="login-cookie" @click="changeMode(3)">Cookie登录</span>
                <span class="separation">|</span>
                <span class="login-embedded" @click="changeMode(4)">一键登录</span>
            </div>
            <div class="login-method" v-show="loginMode == 1 && currentMode != 4">
                <template v-if="currentMode != 0">
                  <span class="login-mail" @click="changeMode(0)">邮箱登录</span>
                  <span class="separation">|</span>
                </template>
                <template v-if="currentMode != 1">
                  <span class="login-phone" @click="changeMode(1)">手机登录</span>
                  <span class="separation">|</span>
                </template>
                <template v-if="currentMode != 3">
                  <span class="login-cookie" @click="changeMode(3)">Cookie登录</span>
                  <span class="separation">|</span>
                </template>
                <template v-if="currentMode != 4">
                  <span class="login-embedded" @click="changeMode(4)">一键登录</span>
                </template>
                <template v-if="accountMode == 0">
                  <span class="separation">|</span>
                  <span class="login-qr" @click="changeMode(2)">二维码登录</span>
                </template>
            </div>
            <div class="to-register" v-show="loginMode == 1 && currentMode != 4">
                <span @click="register()">没有账号？去注册</span>
            </div>
        </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .login-content{
    height: 100%;
    .login-container{
        display: flex;
        flex-direction: column;
        justify-content: center;
        height: calc(100% - 120px);
        .login-header{
            display: flex;
            flex-direction: column;
            align-items: center;
            .login-icon{
                margin-bottom: 1.5vh;
                width: 6.5vh;
                height: 6.5vh;
                background-color: rgb(226, 0, 0);
                img{
                    width: 100%;
                    height: 100%;
                }
            }
            .login-title{
                font: 2.7vh SourceHanSansCN-Bold;
                color: black;
            }
        }
        
        .login-other{
            margin-top: 5.5vh;
            .qrcode-tip{
                font: 13px SourceHanSansCN-Bold;
                color: black;
            }
            .login-method{
                span{
                    font: 12px SourceHanSansCN-Bold;
                    color: rgb(111, 111, 111);
                    transition: 0.2s;
                    &:hover{
                        cursor: pointer;
                        color: black;
                    }
                }
                .separation{
                    margin: 0 4px;
                    pointer-events: none;
                }
            }
            .to-register{
                display: flex;
                justify-content: center;
                span{
                    font: 12px SourceHanSansCN-Bold;
                    color: rgb(111, 111, 111);
                    &:hover{
                        cursor: pointer;
                        color: black;
                    }
                }
            }
        }
    }
  }
  .jumpPage{
    opacity: 0;
    transform: scale(0.4);
    transition: 0.6s 2.2s cubic-bezier(.47,0,.98,.58);
  }
</style>