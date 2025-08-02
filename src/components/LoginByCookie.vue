<script setup>
  import { ref, onActivated } from 'vue'
  import DataCheckAnimaton from './DataCheckAnimaton.vue';
  import { noticeOpen } from '../utils/dialog';
  import { loginByCookie } from '../api/login'
  import { loginHandle } from '../utils/handle'

  const cookieInput = ref()
  const cookieValue = ref('')
  const focusTimer = ref(null)
  const emits = defineEmits(['jumpTo'])

  const loginAnimation = ref(false)
  const dataCheckAnimaton = ref(null)

  onActivated(() => {
    cookieInput.value.focus()
  })

  const inputFocus = () => {
    cookieValue.value = ''
    focusTimer.value = setTimeout(() => {
      cookieInput.value.focus()
      clearTimeout(focusTimer.value)
    }, 1);
  }
  defineExpose({inputFocus})

  const checkCookie = () => {
    if(cookieValue.value === '') {
      noticeOpen("请输入Cookie！", 2)
      return false
    } else if (cookieValue.value.includes('MUSIC_U=')) {
      return true
    } else {
      noticeOpen("Cookie中缺少MUSIC_U字段，请检查是否复制完整", 2)
      return false
    }
  }
   
  async function login() {
    if(checkCookie()) {
      loginAnimation.value = true
      try {
        const result = await loginByCookie(cookieValue.value)
        if(result.code == 200) {
          loginSuccess(result)
        } else {
          loginError()
        }
      } catch (error) {
        console.error('Cookie登录失败:', error)
        noticeOpen(error.message || 'Cookie登录失败', 2)
        loginError()
      }
    }
  }

  async function loginSuccess(result) {
    loginHandle(result, 'cookie')
    emits('jumpTo')
  }

  const loginError = () => {
    dataCheckAnimaton.value.errorAnimation()
    const errorTimer = setTimeout(() => {
      loginAnimation.value = false
      clearTimeout(errorTimer)
    }, 1500);
  }
</script>

<template>
  <div class="cookie-container">
    <div class="cookie">
      <div class="cookie-input-area">
        <label for="cookie">Cookie：</label>
        <div class="input-container" :class="{'login-animation': loginAnimation}">
          <textarea 
            class="cookie-input" 
            v-model="cookieValue" 
            name="cookie" 
            ref="cookieInput" 
            placeholder="请粘贴从网页版网易云音乐复制的Cookie"
            spellcheck="false"
            rows="4">
          </textarea>
        </div>
      </div>
      <div class="cookie-tips">
        <div class="tips-content">
          <div class="tip-item">1. 访问 https://music.163.com/</div>
          <div class="tip-item">2. 点击右上角登录</div>
          <div class="tip-item">3. 打开开发者工具(F12)，刷新页面</div>
          <div class="tip-item">4. 在Network标签中找到任意请求，复制Cookie值</div>
          <div class="tip-item">5. 将复制的Cookie粘贴到上方输入框中</div>
        </div>
      </div>
      <div class="animation">
        <DataCheckAnimaton class="check-animation" ref="dataCheckAnimaton" v-if="loginAnimation"></DataCheckAnimaton>
      </div> 
    </div>
    <div class="cookie-operation">
      <div class="login-button" @click="login()">登录</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .cookie-container{
    margin-top: 4vh;
    .cookie{
      position: relative;
      .cookie-input-area{
        margin-bottom: 3vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        label{
          font: 2.2vh SourceHanSansCN-Bold;
          color: black;
          margin-bottom: 1vh;
          align-self: flex-start;
          margin-left: 2vh;
        }
        .input-container{
          transition: 0.2s ease-out;
          width: 100%;
          .cookie-input{
            width: 100%;
            min-height: 8vh;
            font-size: 1.6vh;
            color: black;
            border: 1px solid #ccc;
            border-radius: 4px;
            padding: 1vh;
            resize: vertical;
            background: rgba(245, 245, 245, 0.8);
            outline: none;
            transition: 0.2s;
            &:focus{
              border-color: #666;
              background: rgba(255, 255, 255, 0.9);
            }
            &::placeholder{
              color: #999;
              font-size: 1.4vh;
            }
          }
        }
      }
      .cookie-tips{
        margin-bottom: 3vh;
        .tips-content{
          background: rgba(245, 245, 245, 0.8);
          border-radius: 6px;
          padding: 2vh;
          .tip-item{
            font: 1.4vh SourceHanSansCN-Regular;
            color: #666;
            margin-bottom: 0.5vh;
            line-height: 1.4;
            &:last-child{
              margin-bottom: 0;
            }
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
        opacity: 0;
        transform: scale(0.8);
      }
    }
    .cookie-operation{
      margin-top: 4vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      .login-button{
        padding: 0.8vh 0;
        width: 30vh;
        text-align: center;
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