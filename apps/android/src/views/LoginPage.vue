<script setup>
  import { useRouter } from 'vue-router'

  const router = useRouter()

  // 0: 二维码；1: 手机验证码。
  const modeSelect = (mode) => {
    router.push({ path: '/login/account', query: { mode } })
  }
</script>

<template>
  <div class="login-page">
    <div class="login-mode">
      <div class="mode-type mode-netease" @click="modeSelect(1)">
        <div class="type-img">
          <img src="@shared-assets/img/netease-music.png" alt="">
        </div>
        <div class="type-info">
          <span class="type-title">云音乐</span>
          <span class="type-subtitle">以云账号登录</span>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped lang="scss">
  .login-page{
    height: calc(100% - 110Px);
    --login-card-bg: rgba(255, 255, 255, 0.35);
    --login-text: #000000;
    --login-border: #000000;
    .login-mode{
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      .mode-type{
        width: 250px;
        height: 100px;
        background-color: var(--login-card-bg);
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        transition: 0.3s;
        position: relative;
        &::before{
          content: '';
          width: 0;
          height: 100px;
          border: {
            top: 1px solid var(--login-border);
            left: 1px solid var(--login-border);
            bottom: 1px solid var(--login-border);
          };
          position: absolute;
          left: 0;
          opacity: 0;
          transition: 0.3s ease;
          pointer-events: none;
        }
        &::after{
          content: '';
          width: 0;
          height: 100px;
          border: {
            top: 1px solid var(--login-border);
            right: 1px solid var(--login-border);
            bottom: 1px solid var(--login-border);
          };
          position: absolute;
          right: 0;
          opacity: 0;
          transition: 0.3s ease;
          pointer-events: none;
        }
        &:hover{
          cursor: pointer;
          width: 280px;
          &::before{
            opacity: 1;
            width: 140px;
          }
          &::after{
            opacity: 1;
            width: 140px;
          }
        }
        .type-img{
          margin-right: 15px;
          width: 50px;
          height: 50px;
          background-color: rgba(226, 0, 0, 1);
          img{
            width: 100%;
            height: 100%;
          }
        }
        .type-info{
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          color: var(--login-text);
          .type-title{
            font: 20px SourceHanSansCN-Bold;
          }
          .type-subtitle{
            font: 10px SourceHanSansCN-Bold;
          }
        }
      }
      .mode-line{
        margin: 20px 0;
        width: 20px;
        height: 20px;
        opacity: 0.8;
      }
    }
  }

  :global(.dark) .login-page {
    --login-card-bg: rgba(255, 255, 255, 0.08);
    --login-text: #f2f5f7;
    --login-border: rgba(255, 255, 255, 0.55);
  }
</style>
