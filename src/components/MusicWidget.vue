<script setup>
  import { computed, ref, watch} from 'vue'
  import { useRouter } from 'vue-router'
  import { songTime2 } from '../utils/player';
  import VueSlider from 'vue-slider-component'
  import '../assets/css/slider.css'
  import PlayList from './PlayList.vue'

  import { startMusic, pauseMusic, playLast, playNext, changeProgress, changePlayMode, likeSong } from '../utils/player'
  import { getDjDetail, subDj } from '../api/dj'
  import { useUserStore } from '../store/userStore'
  import { usePlayerStore } from '../store/playerStore'
  import { useOtherStore } from '../store/otherStore'
  import { storeToRefs } from 'pinia'
  const router = useRouter()
  const userStore = useUserStore()
  const playerStore = usePlayerStore()
  const otherStore = useOtherStore()
  const { currentMusic, playing, progress, playMode, songList, songId, currentIndex, volume, time, playlistWidgetShow, lyricShow, localBase64Img, listInfo } =storeToRefs(playerStore)
  
  // 检查是否在FM模式
  const isInFMMode = computed(() => {
    return listInfo.value && listInfo.value.type === 'personalfm'
  })

  // 是否为电台(DJ)模式
  const isDjMode = computed(() => listInfo.value && listInfo.value.type === 'dj')

  // 电台订阅状态
  const djSubed = ref(false)
  const djRid = computed(() => (isDjMode.value && listInfo.value?.id) ? listInfo.value.id : null)

  const loadDjSubStatus = async () => {
    try {
      if (!djRid.value) return
      const res = await getDjDetail(djRid.value)
      const detail = (res && (res.data || res.djRadio)) || res || {}
      djSubed.value = !!detail.subed
    } catch (_) {
      djSubed.value = false
    }
  }

  watch(djRid, () => { djSubed.value = false; if (djRid.value) loadDjSubStatus() })
  const showMusicTime = ref(false)

  watch(() => volume.value, () => {
    currentMusic.value.volume(volume.value)
  })

  const checkIsLike = computed(() => (id) => {
    return userStore.likelist.includes(id)
  })

  const checkArtist = (artistId) => {
    if (isDjMode.value) return
    if(songList.value[currentIndex.value].type != 'local') {
        router.push('/mymusic/artist/' + artistId)
        playlistWidgetShow.value = false
        playerStore.forbidLastRouter = true
    }
  }

  const showPlayer = () => {
    playerStore.widgetState = false
    lyricShow.value = true
  }

  const toAlbum = () => {
    const cur = songList.value[currentIndex.value]
    if (!cur) return
    if (isDjMode.value) {
      const rid = (listInfo.value && listInfo.value.id) || null
      if (!rid) return
      router.push('/mymusic/dj/' + rid)
      playlistWidgetShow.value = false
      playerStore.forbidLastRouter = true
      return
    }
    if(cur.type != 'local') {
        router.push('/mymusic/album/' + cur.al.id)
        playlistWidgetShow.value = false
        playerStore.forbidLastRouter = true
    }
  }

  const addToPlaylist = () => {
    const currentSong = songList.value?.[currentIndex.value];
    if (currentSong && currentSong.type !== 'local') {
        otherStore.selectedItem = currentSong;
        otherStore.addPlaylistShow = true;
    }
  }

  // 订阅/取消订阅 电台
  const toggleDjSub = async (isSubscribe) => {
    if (!djRid.value) return
    try {
      await subDj(djRid.value, isSubscribe)
      djSubed.value = !!isSubscribe
    } catch (_) {}
  }

</script>
<template>
  <div class="music-widget">
    <div class="music-progress-container">
        <vue-slider id="widget-progress" class="music-progress" @click="changeProgress(progress)"  v-model="progress" :min="0" :max="time" :interval="1" :duration="0.5" tooltip="none"></vue-slider>
        <div class="music-time">{{songTime2(progress)}} / {{songTime2(time)}}</div>
    </div>
    <div class="music-info">
        <div class="music-img" @click="showPlayer()">
            <img v-if="songList[currentIndex].type != 'local'" :src="(songList[currentIndex].coverUrl || songList[currentIndex].al.picUrl) + '?param=128y128'" alt="">
            <img v-else v-show="localBase64Img" :src="localBase64Img" alt="">
            <img v-if="songList[currentIndex].type == 'local' && !localBase64Img" src="http://p3.music.126.net/UeTuwE7pvjBpypWLudqukA==/3132508627578625.jpg?param=128y128" alt="">
            <div class="open-player">
                <svg t="1670207990373" class="open-player-icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5640" width="200" height="200"><path d="M960.1 699.7l-72.8 72.8L512 397.1 136.7 772.5l-72.8-72.8L512 251.5z" fill="#ffffff" p-id="5641"></path></svg>
            </div>
        </div>
        <div class="music-info-other">
            <span class="music-name" :class="{'music-time-in': showMusicTime}">{{songList[currentIndex].name || songList[currentIndex].localName}}</span>
            <div class="music-author">
                <span @click="checkArtist(singer.id)" :class="['author', { disabled: isDjMode }]" v-for="(singer, index) in songList[currentIndex].ar">{{singer.name || ''}}{{index == songList[currentIndex].ar.length -1 ? '' : ' / '}}</span>
            </div>
        </div>
    </div>
    <div class="music-right">
        <div class="music-control">
            <svg @click="playLast()" class="control-icon" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200" viewBox="0 0 200 200" fill="none"><defs><rect id="path_0" x="0" y="0" width="200" height="200"/></defs><g opacity="1" transform="translate(0 0)  rotate(0 100 100)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="arrow" style="fill:#CCCCCC" transform="translate(35.21963688171376 44.356081611360985)  rotate(-90 66.78036311828623 52.999999999999986)" opacity="0" d=""/><path id="arrow" style="stroke: currentColor; stroke-width:8; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(35.21963688171376 44.356081611360985)  rotate(-90 66.78036311828623 52.999999999999986)" d="M133.56,105.98L66.78,0L0,106 "/></g></g></svg>
            <svg v-show="playing" @click="pauseMusic()" class="control-icon" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200" viewBox="0 0 200 200" fill="none"><defs><rect id="path_0" x="0" y="0" width="200" height="200"/></defs><g opacity="1" transform="translate(0 0)  rotate(0 100 100)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="line2" style="fill:#000000" transform="translate(152 24)  rotate(0 0.0005 76)" opacity="1" d=""/><path id="line2" style="stroke: currentColor; stroke-width:8; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(152 24)  rotate(0 0.0005 76)" d="M0,0L0,152 "/><path id="line1" style="fill:#000000" transform="translate(48 24)  rotate(0 0.0005 76)" opacity="1" d=""/><path id="line1" style="stroke: currentColor; stroke-width:8; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(48 24)  rotate(0 0.0005 76)" d="M0,0L0,152 "/></g></g></svg>
            <svg v-show="!playing" @click="startMusic()" class="control-icon" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200" viewBox="0 0 200 200" fill="none"><defs><rect id="path_0" x="0" y="0" width="200" height="200"/></defs><g opacity="1" transform="translate(0 0)  rotate(0 100 100)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="三角形 1" fill-rule="evenodd" style="fill:#CCCCCC" transform="translate(0 12)  rotate(90 88 88)" opacity="0" d="M11.79,132L164.21,132L88,0L11.79,132Z "/><path id="三角形 1" style="stroke: currentColor; stroke-width:8; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(0 12)  rotate(90 88 88)" d="M11.79,132L164.21,132L88,0L11.79,132Z "/></g></g></svg>
            <svg @click="playNext()" xmlns="http://www.w3.org/2000/svg" class="control-icon" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200" viewBox="0 0 200 200" fill="none"><defs><rect id="path_0" x="0" y="0" width="200" height="200"/></defs><g opacity="1" transform="translate(0 0)  rotate(0 100 100)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="arrow" style="fill:#CCCCCC" transform="translate(35.21963688171376 44.356081611360985)  rotate(90 66.78036311828623 52.999999999999986)" opacity="0" d=""/><path id="arrow" style="stroke: currentColor; stroke-width:8; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(35.21963688171376 44.356081611360985)  rotate(90 66.78036311828623 52.999999999999986)" d="M133.56,105.98L66.78,0L0,106 "/></g></g></svg>
        </div>
        <div class="music-volume">
            <div class="volume-container">
                <vue-slider class="volume-slider" v-model="volume" :min="0" :max="1" :interval="0.01" :duration="0.3" tooltip="none"></vue-slider>
                <div class="volume-info">
                    <div class="volume-lable">VOLUME</div>
                    <div class="volume-num">{{Math.round(volume * 100)}}</div>
                </div>
            </div>
        </div>
        <div class="music-other">
            <!-- 喜欢/收藏：歌曲与电台分别处理 -->
            <template v-if="!isDjMode">
            <svg t="1668786418014" v-if="userStore.likelist && songList[currentIndex].type != 'local' && !isDjMode" @click="likeSong(true)" v-show="!checkIsLike(songId)" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1417" width="200" height="200"><path d="M736.603 35.674c-87.909 0-169.647 44.1-223.447 116.819C459.387 79.756 377.665 35.674 289.708 35.674c-158.47 0-287.397 140.958-287.397 314.233 0 103.371 46.177 175.887 83.296 234.151 107.88 169.236 379.126 379.846 390.616 388.725 11.068 8.557 24.007 12.837 36.917 12.837 12.939 0 25.861-4.28 36.917-12.837 11.503-8.879 282.765-219.488 390.614-388.725C977.808 525.793 1024 453.277 1024 349.907 1023.999 176.632 895.071 35.674 736.603 35.674zM888.196 544.065C785.507 705.207 513.139 915.679 513.139 915.679S240.802 705.206 138.081 544.065c-37.884-59.491-71.805-116.034-71.805-194.158 0-134.904 100.025-244.309 223.433-244.309 91.199 0 169.491 59.833 204.225 145.493l0-0.427 0.094 0c2.588 8.933 10.132 15.445 19.113 15.445 9.013 0 16.558-6.512 19.128-15.445l0.265 0c34.813-85.404 112.996-145.066 204.07-145.066 123.378 0 223.433 109.405 223.433 244.309C960.035 428.031 926.111 484.574 888.196 544.065z" p-id="1418"></path></svg>
            <svg t="1668786896650" v-if="userStore.likelist && songList[currentIndex].type != 'local' && !isDjMode" @click="likeSong(false)" v-show="checkIsLike(songId)" class="icon" viewBox="0 0 1025 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9975" width="200" height="200"><path d="M1024.549 360.609c0-170.492-133.815-309.265-298.055-309.265-81.129 0-157.91 34.998-213.344 94.701-55.509-59.702-132.367-94.701-213.344-94.701C135.49 51.344 1.751 190.041 1.751 360.609c0 5.719 0.534 10.827 0.991 15.021-0.076 1.373-0.152 2.745-0.152 4.194 0 30.193 7.319 63.361 21.73 98.59 0.458 1.295 0.915 2.516 1.449 3.657 90.812 217.844 440.412 468.474 455.279 479.985 9.227 7.092 20.205 10.6 31.263 10.6 11.209 0 22.266-3.659 31.566-10.903 12.733-9.911 310.941-224.551 429.279-427.603 4.498-6.861 7.854-13.494 10.828-19.215 0.914-1.829 1.753-3.658 2.744-5.413l0.382-0.839c0.382-0.686 0.839-1.449 1.296-2.059 7.091-13.802 12.732-26.611 17.232-39.116 12.274-32.177 18.3-60.847 18.3-87.61 0-2.058-0.077-3.888-0.229-5.414C1024.093 370.979 1024.549 366.251 1024.549 360.609z" p-id="9976" fill="#E5404F"></path></svg>
            </template>
            <template v-else>
              <!-- 电台收藏/取消收藏 -->
              <svg t="1668786418014" v-if="userStore.likelist" @click="toggleDjSub(true)" v-show="!djSubed" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1417" width="200" height="200"><path d="M736.603 35.674c-87.909 0-169.647 44.1-223.447 116.819C459.387 79.756 377.665 35.674 289.708 35.674c-158.47 0-287.397 140.958-287.397 314.233 0 103.371 46.177 175.887 83.296 234.151 107.88 169.236 379.126 379.846 390.616 388.725 11.068 8.557 24.007 12.837 36.917 12.837 12.939 0 25.861-4.28 36.917-12.837 11.503-8.879 282.765-219.488 390.614-388.725C977.808 525.793 1024 453.277 1024 349.907 1023.999 176.632 895.071 35.674 736.603 35.674zM888.196 544.065C785.507 705.207 513.139 915.679 513.139 915.679S240.802 705.206 138.081 544.065c-37.884-59.491-71.805-116.034-71.805-194.158 0-134.904 100.025-244.309 223.433-244.309 91.199 0 169.491 59.833 204.225 145.493l0-0.427 0.094 0c2.588 8.933 10.132 15.445 19.113 15.445 9.013 0 16.558-6.512 19.128-15.445l0.265 0c34.813-85.404 112.996-145.066 204.07-145.066 123.378 0 223.433 109.405 223.433 244.309C960.035 428.031 926.111 484.574 888.196 544.065z" p-id="1418"></path></svg>
              <svg t="1668786896650" v-if="userStore.likelist" @click="toggleDjSub(false)" v-show="djSubed" class="icon" viewBox="0 0 1025 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9975" width="200" height="200"><path d="M1024.549 360.609c0-170.492-133.815-309.265-298.055-309.265-81.129 0-157.91 34.998-213.344 94.701-55.509-59.702-132.367-94.701-213.344-94.701C135.49 51.344 1.751 190.041 1.751 360.609c0 5.719 0.534 10.827 0.991 15.021-0.076 1.373-0.152 2.745-0.152 4.194 0 30.193 7.319 63.361 21.73 98.59 0.458 1.295 0.915 2.516 1.449 3.657 90.812 217.844 440.412 468.474 455.279 479.985 9.227 7.092 20.205 10.6 31.263 10.6 11.209 0 22.266-3.659 31.566-10.903 12.733-9.911 310.941-224.551 429.279-427.603 4.498-6.861 7.854-13.494 10.828-19.215 0.914-1.829 1.753-3.658 2.744-5.413l0.382-0.839c0.382-0.686 0.839-1.449 1.296-2.059 7.091-13.802 12.732-26.611 17.232-39.116 12.274-32.177 18.3-60.847 18.3-87.61 0-2.058-0.077-3.888-0.229-5.414C1024.093 370.979 1024.549 366.251 1024.549 360.609z" p-id="9975" fill="#E5404F"></path></svg>
            </template>
            <svg v-show="!isDjMode && songList[currentIndex].type != 'local'" @click="addToPlaylist()" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="200" height="200">
                <path d="M512 85.333333c235.648 0 426.666667 191.018667 426.666667 426.666667s-191.018667 426.666667-426.666667 426.666667S85.333333 747.648 85.333333 512 276.352 85.333333 512 85.333333z m0 85.333334a341.333333 341.333333 0 1 0 0 682.666666 341.333333 341.333333 0 0 0 0-682.666666z m0 128a42.666667 42.666667 0 0 1 42.666667 42.666666v128H682.666667a42.666667 42.666667 0 0 1 0 85.333334H554.666667v128a42.666667 42.666667 0 0 1-85.333334 0V554.666667H341.333333a42.666667 42.666667 0 0 1 0-85.333334h128V341.333333a42.666667 42.666667 0 0 1 42.666667-42.666666z" fill="#000000"></path>
            </svg>
            <svg v-if="songList[currentIndex].type != 'local'" t="1668785761323" @click="toAlbum()" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1173" width="200" height="200"><path d="M459.838061 502.318545c0-30.657939 24.948364-55.606303 55.606303-55.606303s55.544242 24.948364 55.544242 55.606303-24.886303 55.606303-55.544242 55.606303a55.668364 55.668364 0 0 1-55.606303-55.606303m173.242181 0c0-64.884364-52.751515-117.666909-117.635878-117.666909a117.79103 117.79103 0 0 0-117.666909 117.666909 117.79103 117.79103 0 0 0 117.666909 117.66691 117.76 117.76 0 0 0 117.604848-117.66691" p-id="1174" fill="#000000"></path><path d="M515.413333 935.439515c-238.809212 0-433.089939-194.311758-433.089939-433.089939 0-238.840242 194.249697-433.18303 433.12097-433.183031 238.809212 0 433.12097 194.342788 433.120969 433.183031 0 238.778182-194.311758 433.089939-433.120969 433.089939m0-928.302545C242.346667 7.13697 20.262788 229.251879 20.262788 502.349576c0 273.035636 222.145939 495.181576 495.181576 495.181576s495.181576-222.17697 495.181575-495.181576c0-273.066667-222.17697-495.243636-495.181575-495.243637" p-id="1175" fill="#000000"></path><path d="M806.353455 471.288242a31.030303 31.030303 0 0 0-31.030303 31.030303v0.031031c0 143.297939-116.580848 259.847758-259.878788 259.847757a31.030303 31.030303 0 0 0 0 62.060606c177.493333 0 321.939394-144.41503 321.939394-321.939394a31.030303 31.030303 0 0 0-31.030303-31.030303M515.413333 242.439758a31.030303 31.030303 0 0 0 0-62.060606c-177.493333 0-321.877333 144.41503-321.908363 321.908363v0.03103a31.030303 31.030303 0 0 0 62.060606 0c0-143.297939 116.580848-259.878788 259.878788-259.878787z" p-id="1176" fill="#000000"></path></svg>
            <svg t="1670376314067" @click="changePlayMode()" v-show="(playMode == 0)" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="3089" width="200" height="200"><path d="M342.69 297.61c-22.96 0-41.3-18.63-41.3-41.32 0-22.67 18.34-41.03 41.3-41.03h457.64c61.35 0 117.2 25.32 157.94 65.49 40.76 40.71 65.73 96.88 65.73 158.23v146.07c0 61.65-24.97 117.52-65.73 158.23-40.73 40.17-96.58 65.46-157.94 65.46H342.69c-61.68 0-117.52-25.29-158.23-65.46-36.09-36.62-60.52-85.52-64.6-139.06h-95.4C11.09 604.22 0 592.88 0 579.52c0-6.71 2.93-13.1 7.57-17.16l67.21-67.82 67.8-67.48c9.29-9.59 24.73-9.59 34.32 0h0.56l67.5 67.48 67.21 67.82c9.58 9.29 9.58 25 0 34.91-5.24 4.65-12.22 7.57-19.23 6.95h-91.02c4.05 31.15 18.9 59.66 40.11 80.9h0.3c25.88 25.59 61.41 41.56 100.37 41.56h457.64c38.66 0 74.16-15.98 99.75-41.56C925.97 659.53 942 624.01 942 585.05V438.98c0-38.96-16.03-74.46-41.91-100.05-25.59-25.91-61.09-41.32-99.75-41.32H342.69zM187.63 555.35h47.74l-25.32-25.88v-0.27l-50.32-50.05-50.34 50.05v0.27L83.8 555.35h103.83z" fill="#231815" p-id="3090"></path></svg>
            <!-- 非FM模式：显示普通的列表循环图标 -->
            <svg t="1668787163705" @click="changePlayMode()" v-show="playMode == 1" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2180" width="200" height="200"><path d="M694.4 854.4H195.2l48 44.8c9.6 6.4 16 16 16 28.8-3.2 19.2-19.2 32-38.4 32-9.6 0-22.4-6.4-28.8-12.8l-108.8-96c-12.8-12.8-16-35.2 0-48L192 704c6.4-6.4 19.2-9.6 28.8-9.6 19.2 0 35.2 16 35.2 35.2 0 9.6-6.4 19.2-12.8 25.6l-41.6 38.4h496c112 0 198.4-89.6 198.4-198.4v-86.4c0-19.2 12.8-32 32-32s32 12.8 32 32v86.4c0 140.8-118.4 259.2-265.6 259.2zM329.6 169.6h496l-48-44.8c-9.6-6.4-16-16-16-28.8 3.2-19.2 19.2-32 38.4-32 9.6 0 22.4 6.4 28.8 12.8l108.8 96c12.8 12.8 16 35.2 0 48L832 320c-6.4 6.4-19.2 9.6-28.8 9.6-19.2 0-35.2-16-35.2-35.2 0-9.6 6.4-19.2 12.8-25.6l41.6-38.4H326.4C217.6 233.6 128 323.2 128 435.2v89.6c0 19.2-12.8 32-32 32s-32-12.8-32-32v-86.4C64 288 182.4 169.6 329.6 169.6z" p-id="2181"></path></svg>
            <!-- FM模式：显示单曲循环图标 -->
            <svg t="1668787191526" @click="changePlayMode()" v-show="playMode == 2" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2500" width="200" height="200"><path d="M928 476.8c-19.2 0-32 12.8-32 32v86.4c0 108.8-86.4 198.4-198.4 198.4H201.6l41.6-38.4c6.4-6.4 12.8-16 12.8-25.6 0-19.2-16-35.2-35.2-35.2-9.6 0-22.4 3.2-28.8 9.6l-108.8 99.2c-16 12.8-12.8 35.2 0 48l108.8 96c6.4 6.4 19.2 12.8 28.8 12.8 19.2 0 35.2-12.8 38.4-32 0-12.8-6.4-22.4-16-28.8l-48-44.8h499.2c147.2 0 265.6-118.4 265.6-259.2v-86.4c0-19.2-12.8-32-32-32zM96 556.8c19.2 0 32-12.8 32-32v-89.6c0-112 89.6-201.6 198.4-204.8h496l-41.6 38.4c-6.4 6.4-12.8 16-12.8 25.6 0 19.2 16 35.2 35.2 35.2 9.6 0 22.4-3.2 28.8-9.6l105.6-99.2c16-12.8 12.8-35.2 0-48l-108.8-96c-6.4-6.4-19.2-12.8-28.8-12.8-19.2 0-35.2 12.8-38.4 32 0 12.8 6.4 22.4 16 28.8l48 44.8H329.6C182.4 169.6 64 288 64 438.4v86.4c0 19.2 12.8 32 32 32z" p-id="2501"></path><path d="M544 672V352h-48L416 409.6l16 41.6 60.8-41.6V672z" p-id="2502"></path></svg>
            <!-- FM模式：显示随机播放图标 -->
            <svg t="1668787213634" @click="changePlayMode()" v-show="playMode == 3" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2661" width="200" height="200"><path d="M844.8 665.6c-6.4-6.4-16-12.8-25.6-9.6-19.2 0-35.2 16-35.2 35.2 0 9.6 6.4 19.2 12.8 25.6l41.6 41.6c-44.8-6.4-86.4-22.4-121.6-51.2-3.2 0-3.2-3.2-6.4-6.4L332.8 304C268.8 233.6 192 195.2 99.2 195.2c-19.2 0-35.2 16-35.2 35.2s16 32 35.2 32c73.6 0 134.4 32 182.4 86.4l384 400 6.4 6.4c48 38.4 108.8 64 172.8 70.4l-48 44.8c-9.6 6.4-16 19.2-16 28.8 0 19.2 19.2 35.2 38.4 32 9.6 0 19.2-6.4 25.6-12.8l99.2-92.8c16-16 16-41.6 0-57.6l-99.2-102.4z m-3.2-556.8c-12.8-16-32-19.2-48-6.4-9.6 6.4-12.8 16-12.8 25.6 0 12.8 3.2 22.4 16 28.8l41.6 41.6c-73.6 9.6-140.8 38.4-192 89.6l-115.2 118.4c-12.8 12.8-12.8 32 0 44.8 6.4 6.4 16 9.6 25.6 9.6s19.2-3.2 25.6-9.6l112-118.4c41.6-38.4 92.8-64 147.2-70.4l-44.8 44.8c-6.4 6.4-12.8 16-12.8 25.6 0 19.2 16 35.2 32 35.2 9.6 0 19.2-3.2 28.8-9.6L950.4 256c12.8-12.8 12.8-35.2 0-48l-108.8-99.2m-438.4 448c-9.6 0-19.2 3.2-25.6 9.6l-118.4 121.6c-48 44.8-96 67.2-160 67.2H96c-19.2 0-35.2 16-35.2 35.2s16 32 35.2 32h3.2c83.2 0 147.2-32 211.2-86.4l121.6-124.8c6.4-6.4 9.6-12.8 9.6-22.4 0-9.6-3.2-16-9.6-22.4-9.6-6.4-19.2-9.6-28.8-9.6z" p-id="2662"></path></svg>
            <!-- 播放列表按钮：只在非FM模式下显示 -->
            <svg t="1668787624519" @click="playlistWidgetShow = !playlistWidgetShow" v-show="!isInFMMode" class="playlist-icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="15157" width="200" height="200"><path d="M85.333333 768h426.666667v85.333333H85.333333v-85.333333z m0-298.666667h597.333334v85.333334H85.333333v-85.333334z m0-298.666666h853.333334v85.333333H85.333333V170.666667z m725.333334 476.586666V384h213.333333v85.333333h-128v298.666667a128 128 0 1 1-85.333333-120.746667zM768 810.666667a42.666667 42.666667 0 1 0 0-85.333334 42.666667 42.666667 0 0 0 0 85.333334z" p-id="15158"></path></svg>
        </div>
    </div>
    <PlayList class="playlist-widget" :class="{'playlist-widget-open': playlistWidgetShow}"></PlayList>
    <div class="widget-back"></div>
  </div>
</template>

<style scoped lang="scss">
  .music-widget{
    width: 100%;
    height: 100%;
    background-color: rgba(225, 240, 240, 1);
    position: relative;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    .music-progress-container{
        width: 100%;
        height: 8Px;
        position: absolute;
        top: -2.5Px;
        &:hover{
            .music-progress{
                height: 13Px !important;
            }
            .music-time{
                opacity: 1;
                pointer-events: none;
            }
        }
        .music-progress{
            width: 100% !important;
            height: 2.5Px !important;
            background-color: rgb(223, 223, 223);
            transition: 0.2s;
        }
        .music-time{
            padding: 0 2Px;
            font: 9Px Bender-Bold;
            color: white;
            position: absolute;
            top: 0;
            left: 0;
            z-index: 999;
            opacity: 0;
            transition: 0.2s;
        }
    }
    .music-info{
        margin-left: 17Px;
        display: flex;
        flex-direction: row;
        .music-img{
            width: 45Px;
            height: 45Px;
            position: relative;
            border: 0.5Px solid rgba(0, 0, 0, 0.1);
            img{
                width: 100%;
                height: 100%;
            }
            .open-player{
                width: 100%;
                height: 100%;
                overflow: hidden;
                position: absolute;
                top: 0;
                left: 0;
                transition: 0.2s;
                .open-player-icon{
                    width: 40%;
                    height: 40%;
                    position: absolute;
                    top: 120%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    transition: 0.2s cubic-bezier(0,1.06,.77,.99);
                }
                &:hover{
                    cursor: pointer;
                    background-color: rgba(0, 0, 0, 0.5);
                    .open-player-icon{
                        top: 50%;
                    }
                }
            }
        }
        .music-info-other{
            margin-left: 8Px;
            width: 175Px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: flex-start;
            user-select: text;
            .music-name,.music-author{
                text-align: left;
                overflow: hidden;
                display: -webkit-box;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 1;
                word-break: break-all;
            }
            .music-name{
                font: 14Px SourceHanSansCN-Bold;
                font-weight: bold;
                color: var(--text);
            }
            .music-author{
                font: 10Px SourceHanSansCN-Bold;
                color: var(--muted-text);
                .author{
                    transition: 0.2s;
                    &:hover{
                        cursor: pointer;
                        color: var(--text);
                    }
                    &.disabled{
                        pointer-events: none;
                    }
                }
            }
        }
    }
    .music-right{
        display: flex;
        flex-direction: row;
        align-items: center;
        .music-control{
            padding: 0 18Px;
            display: flex;
            flex-direction: row;
            align-items: center;
            svg{
                width: 20Px;
                height: 20Px;
                transition: 0.2s;
                &:hover{
                    cursor: pointer;
                }
                &:active{
                    transform: scale(0.90);
                }
                &:nth-child(2),&:nth-child(3){
                    margin: 0 15Px;
                }
            }
        }
        .music-volume{
            width: 120Px;
            .volume-container{
                width: 100%;
                height: 7Px;
                position: relative;
                .volume-slider{
                    height: 7Px !important;
                    box-shadow: 0 0 0 0.5Px var(--text) !important;
                }
                .volume-process-outline{
                    width: 100%;
                    height: 100%;
                    border: 1Px solid var(--text);
                    position: absolute;
                    top: 0;
                    left: 0;
                }
                .volume-process{
                    width: 64%;
                    height: 100%;
                    background: var(--text);
                    position: absolute;
                    top: 0;
                    left: -1Px;
                }
                .volume-info{
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    position: absolute;
                    top: -10Px;
                    left: 0;
                    .volume-lable,.volume-num{
                        font: 8Px Geometos;
                    }
                    .volume-lable{
                        margin-right: 6Px;
                        color: rgb(106, 106, 106);
                    }
                }
            }
        }
        .music-other{
            margin-left: 30Px;
            margin-right: 30Px;
            display: flex;
            flex-direction: row;
            align-items: center;
            svg{
                margin-right: 22Px;
                width: 20Px;
                height: 20Px;
                flex-shrink: 0;
                transition: 0.2s;
                &:hover{
                    cursor: pointer;
                }
                &:active{
                    transform: scale(0.90);
                }
            }
        }
    }
    .playlist-widget{
        position: absolute;
        bottom: 75Px;
        right: 0;
    }
    .playlist-widget-open{
        height: 450Px;
    }
    .widget-back{
        width: 5Px;
        height: 5Px;
        border-radius: 50%;
        background-color: rgba(160, 160, 160, 0.7);
        position: absolute;
        top: 6Px;
        right: 6Px;
    }
  }
</style>
