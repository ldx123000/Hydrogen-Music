<script setup>
  import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
  import { useRouter } from 'vue-router';
  import { logout } from '../api/user'
  import { noticeOpen } from "../utils/dialog";
  import { isLogin } from '../utils/authority'
  import { useUserStore } from '../store/userStore';

  const router  =useRouter()
  const userStore = useUserStore()
  const isActive = ref(false)
  const routerContainer = ref(null)
  const homeLink = ref(null)
  const cloudLink = ref(null)
  const fmLink = ref(null)
  const musicLink = ref(null)
  const trackerLeft = ref(0)
  const trackerVisible = ref(false)
  const toSettings = () => {
      router.push('/settings')
  }
  const userLogout = () => {
    if(isLogin()){
      logout().then(result => {
        if(result.code == 200) {
            window.localStorage.clear()
            userStore.user = null
            userStore.biliUser = null
            
            // 清除Electron中的登录状态，确保下次登录需要重新扫码
            if(window.electronAPI?.clearNeteaseSession) {
              window.electronAPI.clearNeteaseSession()
            }
            
            router.push('/')
            noticeOpen("已退出账号", 2)
        }
        else noticeOpen("退出登录失败", 2)
      })
    } else noticeOpen("您已退出账号", 2)
  }
  const onAfterEnter = () => isActive.value = true
  const onAfterLeave = () => isActive.value = false

  const toDom = (maybeComp) => {
    if (!maybeComp) return null
    return maybeComp.$el ? maybeComp.$el : maybeComp
  }

  const resolveActiveEl = () => {
    const name = router.currentRoute.value.name
    // Determine active link element by current route
    if (name === 'homepage' && userStore.homePage && homeLink.value) return toDom(homeLink.value)
    if (name === 'clouddisk' && userStore.cloudDiskPage && cloudLink.value) return toDom(cloudLink.value)
    if (name === 'personalfm' && userStore.personalFMPage && fmLink.value) return toDom(fmLink.value)
    // My music or login pages map to My Music tab
    const firstSeg = router.currentRoute.value.fullPath.split('/')[1]
    if ((name === 'mymusic' || firstSeg === 'mymusic' || firstSeg === 'login') && musicLink.value) return toDom(musicLink.value)
    // Fallback to first visible tab
    const firstRef = toDom(homeLink.value) || toDom(cloudLink.value) || toDom(fmLink.value) || toDom(musicLink.value)
    if (firstRef) return firstRef
    // As last resort, find first anchor inside header-router
    const anchors = routerContainer.value?.querySelectorAll('a')
    return anchors && anchors[0] ? anchors[0] : null
  }

  const computeTrackerLeft = () => {
    try {
      const el = resolveActiveEl()
      const container = routerContainer.value
      if (!el || !container) { trackerVisible.value = false; return }
      const trackWidth = 14
      // 优先使用 offset 以获得更稳定的定位（避免子像素与变换影响）
      let left
      if (el.offsetParent === container || el.offsetParent === container.offsetParent) {
        left = el.offsetLeft + (el.offsetWidth - trackWidth) / 2
      } else {
        // 回退：使用 rect 差值
        const elRect = el.getBoundingClientRect()
        const cRect = container.getBoundingClientRect()
        left = (elRect.left - cRect.left) + (elRect.width - trackWidth) / 2
      }
      trackerLeft.value = Math.max(0, Math.round(left))
      trackerVisible.value = true
    } catch (_) { trackerVisible.value = false }
  }

  const updateTracker = () => {
    nextTick(() => {
      computeTrackerLeft()
      // 在下一帧再次校准，避免字体加载/过渡导致的轻微偏移
      requestAnimationFrame(() => computeTrackerLeft())
    })
  }

  onMounted(() => {
    updateTracker()
    window.addEventListener('resize', updateTracker)
    // 字体加载完成后再次校准，避免字体替换引起的偏移
    try { document.fonts?.ready?.then(() => updateTracker()) } catch (_) {}
    // 轻微延迟再对齐一遍，覆盖过渡后的微小偏移
    setTimeout(() => updateTracker(), 120)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateTracker)
  })

  watch(() => router.currentRoute.value.fullPath, () => updateTracker())
  watch(() => [userStore.homePage, userStore.cloudDiskPage, userStore.personalFMPage], () => updateTracker(), { deep: true })
</script>

<template>
  <div>
    <main>
      <div class="home-header">
        <div class="header-router" :class="{'router-closed': !userStore.homePage && !userStore.cloudDiskPage}" ref="routerContainer">
          <!-- <div class="logout" @click="userLogout()">退出登录</div> -->
          <router-link ref="homeLink" class="button-home" :style="{color: router.currentRoute.value.name == 'homepage' ? 'black' : '#353535'}" to="/" v-if="userStore.homePage">首页</router-link>
          <router-link ref="cloudLink" class="button-cloud" :style="{color: router.currentRoute.value.name == 'clouddisk' ? 'black' : '#353535'}" to="/cloud" v-if="userStore.cloudDiskPage">云盘</router-link>
          <router-link ref="fmLink" class="button-fm" :style="{color: router.currentRoute.value.name == 'personalfm' ? 'black' : '#353535'}" to="/personalfm" v-if="userStore.personalFMPage">私人漫游</router-link>
          <router-link ref="musicLink" class="button-music" :style="{color: (router.currentRoute.value.name === 'mymusic' || router.currentRoute.value.fullPath.startsWith('/mymusic')) ? 'black' : '#353535'}" to="/mymusic">我的音乐</router-link>
          <div class="user">
            <div class="user-container">
              <div class="user-head" @click="userStore.appOptionShow = true">
                <img v-if="isLogin() && userStore.user" :src="userStore.user.avatarUrl + '?param=100y100'" alt="">
                <svg v-else t="1672136404205" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5403" width="200" height="200"><path d="M511.997 551.041c-218.044 0-399.92 168.61-441.722 392.645l883.45-0.439C911.607 719.432 729.83 551.041 511.997 551.041zM266.597 305.64c0 135.532 109.868 245.401 245.403 245.401 135.53 0 245.403-109.87 245.403-245.4C757.403 170.105 647.53 60.235 512 60.235c-135.535 0-245.403 109.87-245.403 245.406z" fill="#2c2c2c" p-id="5404" data-spm-anchor-id="a313x.7781069.0.i5" class="selected"></path></svg>
                <div class="img-mask"></div>
              </div>
              <transition name="app-option" @after-enter="onAfterEnter" @after-leave="onAfterLeave">
                <div class="app-option" :class="{ 'app-option-active': isActive }" v-show="userStore.appOptionShow">
                  <div class="option" @click="toSettings()">设置</div>
                  <div class="option" @click="userLogout()">退出登录</div>
  
                  <div class="option-style option-style1"></div>
                  <div class="option-style option-style2"></div>
                  <div class="option-style option-style3"></div>
                  <div class="option-style option-style4"></div>
                </div>
              </transition>
            </div>
          </div>
          <div v-if="userStore.homePage || userStore.cloudDiskPage || userStore.personalFMPage || isLogin()"
               v-show="router.currentRoute.value.name != 'search' && router.currentRoute.value.name != 'settings' && trackerVisible"
               class="router-tracker"
               :style="{ left: trackerLeft + 'px' }">
          </div>
        </div>
      </div>
      
      <div class="home-content">
        <router-view  v-slot="{ Component }">
          <keep-alive>
            <component :is="Component"></component>
          </keep-alive>
        </router-view>
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
  main{
    height: 100%;
  }
  
  .home-header{
    margin: 30px 0 20px 0;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    .header-router{
      position: relative;
      /* Use margin to shift right without creating a stacking context */
      margin-left: 52px;
      a{
        font: 18px SourceHanSansCN-Bold;
        color: black;
        outline: none;
      }
      .button-home{
        margin-right: 40px;
      }
      .button-cloud{
        margin-right: 40px;
      }
      .button-fm{
        margin-right: 40px;
      }
      .router-tracker{
        width: 14px;
        height: 2px;
        background-color: black;
        position: absolute;
        bottom: 0;
        z-index: 2;
        transition: left 0.3s ease;
      }
      /* removed fixed transforms; left is computed dynamically */
        .user{
          position: absolute;
          top: 50%;
          right: -35px;
          transform: translateY(-50%);
          z-index: 999;
          .user-container{
            width: 25px;
            height: 25px;
            position: relative;
            -webkit-app-region: no-drag; /* Avatar and menu should be clickable */
            .user-head{
              width: 100%;
              height: 100%;
              border: 1px solid rgb(0, 0, 0, 0.6);
              border-radius: 50%;
            overflow: hidden;
            position: relative;
            &:hover{
              cursor: pointer;
            }
            img, svg{
              width: 100%;
              height: 100%;
            }
            svg{
              margin-top: 2px;
            }
            .img-mask{
              width: 100%;
              height: 100%;
              background-color: rgba(0, 0, 0, 0.3);
              opacity: 0;
              position: absolute;
              top: 0;
              left: 0;
              transition: 0.15s;
              &:hover{
                opacity: 1;
              }
            }
          }
          .app-option{
            padding: 0;
            width: 100px;
            height: 0;
            background-image: url('../assets/img/halftone.png');
            background-size: 120%;
            background-repeat: repeat;
            background-color: rgb(20, 20, 20);
            overflow: hidden;
            position: absolute;
            top: 35px;
            left: -32.5px;
            z-index: 2001; /* Above dragBar/globalWidget (999) */
            -webkit-app-region: no-drag; /* Ensure clicks not captured by drag regions */
            &-active {
              height: 96px;padding: 12Px 0;
            }
            .option{
              padding: 8px 14px;
              font: 14Px SourceHanSansCN-Bold;
              color: white;
              text-align: left;
              transition: 0.2s;
              &:hover{
                cursor: pointer;
                background-color: rgba(53, 53, 53, 0.7);
              }
              &:active{
                transform: scale(0.95);
              }
            }
            .option-style{
              width: 4px;
              height: 4px;
              background-color: white;
              position: absolute;
            }
            $stylePosition: 4px;
            .option-style1{
              top: $stylePosition;
              left: $stylePosition;
            }
            .option-style2{
              top: $stylePosition;
              right: $stylePosition;
            }
            .option-style3{
              bottom: $stylePosition;
              right: $stylePosition;
            }
            .option-style4{
              bottom: $stylePosition;
              left: $stylePosition;
            }
          }
        }
      }
    }
    .router-closed{
      height: 27px;
      /* When router is closed (no nav links), cancel the offset */
      margin-left: 0;
      /* Keep .user default right-anchored behavior so it always stays
         to the right of the nav group without jumping left. */
    }
  }
  .home-content{
    padding: 0 45px;
    height: calc(100% + 1px);
    overflow: auto;
    &::-webkit-scrollbar{
      display: none;
    }
  }
</style>

<style lang="scss">
.app-option-enter-active {
  animation: app-option-in 0.2s forwards;

}
.app-option-leave-active {
  animation: app-option-in 0.2s reverse;
}
@keyframes app-option-in {
  0%{height: 0;padding: 0;}
  100%{height: 96px;padding: 12Px 0;}
}
</style>
