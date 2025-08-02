<script setup>
  import { ref, onMounted } from 'vue'
  import Plyr from 'plyr'
  import '../assets/css/plyr.css'
  import { useOtherStore } from '../store/otherStore';
  import { storeToRefs } from 'pinia';

  const otherStore = useOtherStore()
  const { videoPlayerShow, player, videoIsBlur, currentVideoId, videoIsFull } = storeToRefs(otherStore)
  onMounted(() => {
    let config = {
      settings: ['captions', 'quality', 'speed', 'loop'],
      autoplay: false,
      quality: {
        default: 1080,
        options: [1080, 720, 480, 240],
      },
    };
    player.value = new Plyr('#player', config)
  })
  const videoFull = () => {
    videoIsFull.value = !videoIsFull.value
  }
  const close = () => {
    videoPlayerShow.value = false
    player.value = null
    currentVideoId.value = null
  }
</script>

<template>
  <div id="videoPlayer" class="video-player" :class="{'video-player-blur': videoIsBlur, 'video-player-full': videoIsFull}">
    <div class="player-container">
      <video id="player" class="plyr" playsinline controls></video>
    </div>
    <div class="video-player-blur-mask" v-show="videoIsBlur"></div>
    <div class="video-window-full" @click="videoFull()">
      <svg t="1671975242092" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2979" width="200" height="200"><path d="M804.813881 176.379768 373.230316 176.379768 373.230316 220.254706 804.813881 220.254706 804.813881 654.226878 848.68882 654.226878 848.68882 220.254706 848.68882 176.379768ZM175.31118 289.398592l0 558.22164 558.22164 0L733.53282 289.398592 175.31118 289.398592zM684.58733 798.632837 224.298576 798.632837 224.298576 338.344083 684.58733 338.344083 684.58733 798.632837z" fill="#ffffff" p-id="2980"></path></svg>
    </div>
    <div class="video-close" @click="close()">
      <svg t="1671966797621" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1965" width="200" height="200"><path d="M576 512l277.333333 277.333333-64 64-277.333333-277.333333L234.666667 853.333333 170.666667 789.333333l277.333333-277.333333L170.666667 234.666667 234.666667 170.666667l277.333333 277.333333L789.333333 170.666667 853.333333 234.666667 576 512z" fill="#ffffff" p-id="1966"></path></svg>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .video-player{
    width: 797Px;
    background-color: rgba(0, 0, 0, 1);
    vertical-align:middle;
    position: absolute;
    top: 50%;
    right: 50%;
    transform: translate(50%, -50%);
    box-shadow: 0 0 16Px 5Px rgba(0, 0, 0, 0.1);
    z-index: 999;
    transition: 0.3s;
    pointer-events: auto;
    &:hover{
      .video-window-full{
        opacity: 1;
      }
      .video-close{
        opacity: 1;
      }
    }
    .video-player-blur-mask{
      width: 100%;
      height: 82%;
      position: absolute;
      top: 0;
      left: 0;
      background: linear-gradient(rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0) 100%);
      opacity: 0;
      transition: 0.2s;
      &:hover{
        cursor: pointer;
        opacity: 1;
      }
    }
    .player-container{
      width: 100%;
      height: 100%;
      .plyr{
        width: 100%;
        height: 100%;
        vertical-align:middle;
        object-fit: contain;
        &:focus{
          outline: none;
        }
      }
    }
    .video-window-full{
      width: 28Px;
      height: 28Px;
      position: absolute;
      top: 50%;
      right: 15Px;
      transform: translateY(-50%);
      transition: 0.3s;
      opacity: 0;
      &:hover{
        cursor: pointer;
        opacity: 0.8;
      }
      svg{
        width: 100%;
        height: 100%;
      }
    }
    .video-close{
      width: 25Px;
      height: 25Px;
      position: absolute;
      top: 15Px;
      right: 15Px;
      transition: 0.3s;
      opacity: 0;
      &:hover{
        cursor: pointer;
        opacity: 0.8;
      }
      svg{
        width: 100%;
        height: 100%;
      }
    }
  }
  .video-player-blur{
    width: 390Px;
    top: 80Px;
    right: 50Px;
    transform: translate(0, 0);
    box-shadow: 0 0 16Px 5Px rgba(0, 0, 0, 0.1);
  }
  .video-player-full{
    width: 100%;
    height: 100%;
    animation: full-in 0.3s forwards;
    @keyframes full-in {
      0%{background-color: rgba(0, 0, 0, 0);}
      100%{background-color: rgba(0, 0, 0, 1);}
    }
  }
</style>