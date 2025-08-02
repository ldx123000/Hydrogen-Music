<script setup>
  import { useRouter } from 'vue-router'

  const router = useRouter()

  //0为以网易云账号登录，1为以本地账户
  const modeSelect = (mode) => {
    if(mode === 0) {
      // 跳转到一键登录页面
      router.push({path:'/login/account', query: {mode: 4}})
    } else {
      router.push({path:'/login/account', query: {mode: mode}})
    }
  }
</script>

<template>
  <div class="login-page">
    <div class="login-mode">
      <div class="mode-type mode-netease" @click="modeSelect(0)">
        <div class="type-img">
          <img src="../assets/img/netease-music.png" alt="">
        </div>
        <div class="type-info">
          <span class="type-title">云音乐</span>
          <span class="type-subtitle">以云账号登录</span>
        </div>
      </div>

      <!-- <svg t="1669178768166" v-if="false" class="mode-line" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1997" width="200" height="200"><path d="M617.92 516.096l272 272-101.824 101.824-272-272-272 272-101.856-101.824 272-272-275.008-275.04L241.056 139.2l275.04 275.04 275.04-275.04 101.824 101.824-275.04 275.04z" p-id="1998"></path></svg>

      <div class="mode-type mode-local" @click="modeSelect(1)" v-if="false">
        <div class="type-img">
          <img src="../assets/img/cover4.jpg" alt="">
        </div>
        <div class="type-info">
          <span class="type-title">云音乐</span>
          <span class="type-subtitle">以云音乐账号登录</span>
        </div>
      </div> -->
    </div>
  </div>
</template>

<style scoped lang="scss">
  .login-page{
    height: calc(100% - 110Px);
    .login-mode{
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      .mode-type{
        width: 250px;
        height: 100px;
        background-color: rgba(255, 255, 255, 0.35);
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
            top: 1px solid black;
            left: 1px solid black;
            bottom: 1px solid black;
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
            top: 1px solid black;
            right: 1px solid black;
            bottom: 1px solid black;
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
          color: black;
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
</style>