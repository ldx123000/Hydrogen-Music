<script setup>
  import { ref, onActivated } from 'vue'
  import DataCheckAnimaton from './DataCheckAnimaton.vue';
  import md5 from 'js-md5';
  import { noticeOpen } from '../utils/dialog';
  import { loginByEmail, loginByPhone} from '../api/login'
  import { loginHandle } from '../utils/handle'

  const props = defineProps(['currentMode'])
  const accountInput = ref()
  const countrycode = ref('+86')
  const accountNumber = ref('')
  const typePassword = ref('')
  const focusTimer = ref(null)
  const emits = defineEmits(['jumpTo'])

  const loginAnimation = ref(false)
  const dataCheckAnimaton = ref(null)

  onActivated(() => {
    accountInput.value.focus()
  })

  const inputFocus = () => {
    accountNumber.value = ''
    typePassword.value = ''
    focusTimer.value = setTimeout(() => {
      accountInput.value.focus()
      clearTimeout(focusTimer.value)
    }, 1);
  }
  defineExpose({inputFocus})

  const checkMail = () => {
    const emailReg = /^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(.[a-zA-Z0-9_-]+)+$/
    if(countrycode.value === '' || accountNumber.value === '' || typePassword.value === '') {
      noticeOpen("请输入正确的邮箱或密码！", 2)
      return false
    } else if (emailReg.test(accountNumber.value)) {
      return true
    } else {
      noticeOpen("请输入正确的邮箱", 2)
      return false
    }
  }
  const checkPhone = () => {
    if(countrycode.value === '' || accountNumber.value === '' || typePassword.value === '') {
      noticeOpen("请输入正确的手机号或密码！", 2)
      return false
    } else return true
  }
   
  async function login() {
    if(props.currentMode == 0 || props.currentMode == 1) {
      noticeOpen('邮箱与手机登录暂时禁用，请扫码登录', 2)
      return
    }
    if(props.currentMode == 0) {
      //邮箱登录
      if(checkMail()) {
        let params = {
          email: accountNumber.value.replace(/\s/g, ''),
          password: 'none',
          md5_password: md5(typePassword.value)
        }
        loginAnimation.value = true
        await loginByEmail(params).then(result => {
          if(result.code == 200) {
            loginSuccess(result)
          } else {
            loginError()
          }
        })
      }
    } else if(props.currentMode == 1) {
      //手机登录
      if(checkPhone()) {
        let params = {
          phone: accountNumber.value.replace(/\s/g, ''),
          password: 'none',
          countrycode: countrycode.value.replace('+', '').replace(/\s/g, ''),
          md5_password: md5(typePassword.value)
        }
        loginAnimation.value = true
        await loginByPhone(params).then(result => {
          if(result.code == 200) {
            loginSuccess(result)
          } else {
            loginError()
          }
        })
      }
    }
  }

  async function loginSuccess(result) {
    loginHandle(result, 'account')
    emits('jumpTo')
  }

  const loginError = () => {
    dataCheckAnimaton.value.errorAnimation()
    const errorTimer = setTimeout(() => {
      loginAnimation.value = false
      clearTimeout(errorTimer)
    }, 1500);
  }

  // 将密码从圆点变成星号-有BUG
  // watch(typePassword, async (newVal, oldVal) => {
  //     typePassword.value = typePassword.value.replace(/./g, "*")
  //     if(newVal.length < oldVal.length) {
  //       truePassword.value = truePassword.value.substring(0, newVal.length)
  //     } else {
  //       truePassword.value += newVal.substring(oldVal.length, newVal.length);
  //     }
  //     console.log(truePassword.value)
  // })
</script>

<template>
  <div class="account-container">
    <div class="account">
      <div class="account-adress">
        <label for="account" v-if="props.currentMode == 0">邮箱：</label>
        <label for="account" v-else>手机：</label>
        <div class="input-container" :class="{'login-animation': loginAnimation}">
          <input class="phone-country" type="text" v-model="countrycode" v-show="props.currentMode == 1" spellcheck="false">
          <input class="account-input" :class="{'account-input2': props.currentMode == 1}" v-model="accountNumber" type="text" name="account" ref="accountInput" spellcheck="false">
        </div>
      </div>
      <div class="mail-password">
        <label for="password">密码：</label>
        <input class="password-input" :class="{'login-animation': loginAnimation}" type="password" name="password" v-model="typePassword" spellcheck="false">
        <div class="forget-password">
          <div class="forget-title">您忘记了密码？</div>
          <div class="password-line" :class="{'login-animation': loginAnimation}"></div>
        </div>
      </div>
      <div class="animation">
        <DataCheckAnimaton class="check-animation" ref="dataCheckAnimaton" v-if="loginAnimation"></DataCheckAnimaton>
      </div> 
    </div>
    <div class="account-operation">
      <div class="login-button" @click="login()">登录</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .account-container{
    margin-top: 7vh;
    .account{
      position: relative;
      .account-adress{
        margin-bottom: 7vh;
        display: flex;
        justify-content: center;
        align-items: center;
        label{
          font: 2.2vh SourceHanSansCN-Bold;
          color: black;
        }
        .input-container{
          transition: 0.2s ease-out;
          .phone-country{
            margin-right: 1vh;
            width: 6vh;
            font-size: 2.7vh;
            color: black;
            font-style: italic;
            border: none;
            border-right: 0.5px solid black;
            background: none;
            outline: none;
          }
          .account-input{
            width: 30.2vh;
            font-size: 2.7vh;
            color: black;
            font-style: italic;
            border: none;
            background: none;
            outline: none;
            transition: 0.2s;
          }
          .account-input2{
            width: 23.2vh;
          }
        }
      }
      .mail-password{
        position: relative;
        label{
          font: 2.2vh SourceHanSansCN-Bold;
          color: black;
        }
        .password-input{
          transition: 0.2s ease-out;
          width: 30.2vh;
          font-family: Password;
          font-size: 2.7vh;
          font-style: italic;
          // letter-spacing: 2px;
          color: black;
          border: none;
          background: none;
          outline: none;
          // transform: translateY(5px);
        }
        .forget-password{
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          position: absolute;
          bottom: -1.5vh;
          .forget-title{
            margin-right: 2px;
            font: 1.3vh Source Han Sans;
            color: rgb(118, 118, 118);
            white-space: nowrap;
          }
          .password-line{
            transition: 0.2s ease-out;
            background-color: black;
            width: 33vh;
            height: 0.5px;
          }
        }
      }
      .animation{
        display: flex;
        flex-direction: column;
        align-items: center;
        .check-animation{
          width: 19vh;
          height: 19vh;
          position: absolute;
          top: -2vh;
          transform: translateX(-10%);
        }
      }
      
      .login-animation{
        opacity: 0;transform: scale(0.8);
        // animation: login-animation 0.2s ease-out forwards;
        // @keyframes login-animation {
        //   100%{opacity: 0;transform: scale(0.8);display: none;}
        // }
      }
    }
    .account-operation{
      margin-top: 9vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      .login-button{
        padding: 0.8vh 0;
        width: 30vh;
        border: 1px solid black;
        font: 14px SourceHanSansCN-Bold;
        color: black;
        position: relative;
        &:hover{
          cursor: pointer;
          background-color: black;
          color: white;
          &::before, &::after{
            opacity: 1;
          }
          &::before{
            left: -40px;
          }
          &::after{
            right: -40px;
        }
        }
        &::before, &::after{
          content: '';
          width: 30px;
          height: 1px;
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          opacity: 0;
          transition: 0.1s;
        }
        &::before{
          background: linear-gradient(to left, black 20%, rgba(0, 0, 0, 0.05));
          left: -50px;
        }
        &::after{
          background: linear-gradient(to right, black 20%, rgba(0, 0, 0, 0.05));
          right: -50px;
        }
      }
    }
  }
</style>