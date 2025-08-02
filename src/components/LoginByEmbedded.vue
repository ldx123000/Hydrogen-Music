<script setup>
  import { ref, onMounted, onActivated } from 'vue'
  import DataCheckAnimaton from './DataCheckAnimaton.vue';
  import { noticeOpen } from '../utils/dialog';
  import { loginHandle } from '../utils/handle'

  const emits = defineEmits(['jumpTo'])
  const loginAnimation = ref(false)
  const dataCheckAnimaton = ref(null)
  const loginStatus = ref('等待登录')

  // 重置组件状态
  const resetState = () => {
    loginAnimation.value = false
    loginStatus.value = '等待登录'
  }

  // 组件挂载时重置状态
  onMounted(() => {
    resetState()
  })

  // 组件激活时重置状态（用于keep-alive场景）
  onActivated(() => {
    resetState()
  })

  async function startEmbeddedLogin() {
    if (loginAnimation.value) return
    
    loginAnimation.value = true
    loginStatus.value = '正在清除之前的登录状态...'
    
    try {
      // 先清除之前的登录状态
      if(window.electronAPI?.clearNeteaseSession) {
        await window.electronAPI.clearNeteaseSession()
      }
      
      // 调用Electron API打开网易云登录窗口，并确保清除之前的登录状态
      loginStatus.value = '登录窗口已打开，正在加载登录页面...'
      const result = await window.electronAPI?.openNeteaseLogin?.({ clearSession: true })
      
      console.log('登录结果:', result)
      
      if (result?.success) {
        loginStatus.value = '登录成功，正在处理用户信息...'
        
        // 验证cookie是否包含必要信息
        if (!result.cookies || !result.cookies.includes('MUSIC_U=')) {
          throw new Error('获取的登录信息不完整，请重试')
        }
        
        console.log('获取到的cookies长度:', result.cookies.length)
        console.log('MUSIC_U存在:', result.cookies.includes('MUSIC_U='))
        
        // 模拟登录API响应格式
        const loginResult = {
          code: 200,
          cookie: result.cookies,
          message: result.message
        }
        
        // 使用现有的登录处理逻辑
        loginHandle(loginResult, 'cookie')
        
        loginStatus.value = '登录完成，正在跳转...'
        
        // 延迟跳转，让用户看到成功信息
        setTimeout(() => {
          // 重置状态，确保下次进入时组件状态正确
          resetState()
          emits('jumpTo')
        }, 1000)
        
      } else {
        loginStatus.value = '登录失败或已取消'
        if (result?.message === '用户取消登录') {
          noticeOpen('用户取消登录', 2)
        } else {
          noticeOpen(result?.message || '登录失败，请重试', 2)
        }
        loginError()
      }
    } catch (error) {
      console.error('内嵌登录失败:', error)
      loginStatus.value = '登录失败'
      noticeOpen(error?.message || '登录窗口打开失败，请检查网络连接', 2)
      loginError()
    }
  }

  const loginError = () => {
    dataCheckAnimaton.value?.errorAnimation()
    const errorTimer = setTimeout(() => {
      loginAnimation.value = false
      loginStatus.value = '等待登录'
      clearTimeout(errorTimer)
    }, 1500);
  }
</script>

<template>
  <div class="embedded-login-container">
    <div class="embedded-login">
      <div class="login-description">
        <div class="description-content">
          <div class="main-text">一键扫码登录</div>
          <div class="sub-text">点击下方按钮，在弹出的窗口中扫码登录网易云音乐</div>
        </div>
      </div>
      
      <div class="login-status" v-if="loginAnimation">
        <div class="status-text">{{ loginStatus }}</div>
      </div>

      <div class="animation">
        <DataCheckAnimaton class="check-animation" ref="dataCheckAnimaton" v-if="loginAnimation"></DataCheckAnimaton>
      </div>
    </div>
    
    <div class="embedded-operation">
      <div class="login-button" @click="startEmbeddedLogin()" :class="{'loading': loginAnimation}">
        <span v-if="!loginAnimation">打开登录窗口</span>
        <span v-else>登录中...</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .embedded-login-container{
    margin-top: 4vh;
    .embedded-login{
      position: relative;
      .login-description{
        margin-bottom: 3vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        .description-content{
          text-align: center;
          .main-text{
            font: 2.4vh SourceHanSansCN-Bold;
            color: black;
            margin-bottom: 1vh;
          }
          .sub-text{
            font: 1.6vh SourceHanSansCN-Regular;
            color: #666;
            margin-bottom: 2vh;
            line-height: 1.5;
          }
        }
      }
      
      .login-status{
        display: flex;
        justify-content: center;
        margin-bottom: 2vh;
        .status-text{
          font: 1.6vh SourceHanSansCN-Regular;
          color: #007AFF;
          padding: 1vh 2vh;
          background: rgba(0, 122, 255, 0.1);
          border-radius: 4px;
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
    }
    
    .embedded-operation{
      margin-top: 4vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      .login-button{
        padding: 1.2vh 0;
        width: 32vh;
        text-align: center;
        border: 1px solid black;
        font: 16px SourceHanSansCN-Bold;
        color: black;
        position: relative;
        transition: all 0.2s ease;
        
        &:not(.loading):hover{
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
        
        &.loading{
          background-color: #f5f5f5;
          color: #999;
          cursor: not-allowed;
          border-color: #ddd;
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