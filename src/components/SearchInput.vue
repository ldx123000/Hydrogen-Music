<script setup>
  import { ref } from 'vue'
  import { useRouter } from 'vue-router';
  import { noticeOpen } from '../utils/dialog';
  import { usePlayerStore } from '../store/playerStore';
  const playerStore = usePlayerStore()
  const router = useRouter()

  const searchInput = ref(null)
  const searchShow = ref(false)
  function searchFoucs(event, state) {
    if (state === 'focus') {
        event.target.placeholder = ''
        searchShow.value = true
        windowApi.unregisterShortcuts()
    } else {
        windowApi.registerShortcuts()
        event.target.placeholder = 'SEARCH'
        searchShow.value = false
    }
  }
  function JTrim(s) {
	return s.replace(/(^\s*)|(\s*$)/g, "");
  }
  const searchInfo = () => {
    if(JTrim(searchInput.value.value) != "") {
        router.push({name: 'search', query: {keywords: searchInput.value.value}})
        if(!playerStore.widgetState) {
          playerStore.widgetState = true
          playerStore.lyricShow = false
          if(playerStore.videoIsPlaying) playerStore.videoIsPlaying = false
        }
    } else {
        noticeOpen("输入不能为空", 2)
    }
    
  }
</script>

<template>
  <Transition name=fade>
    <div :class="{'search-container': true, 'search-container-foucs': searchShow}" v-show="playerStore.playerShow">
        <input class="search-input" type="text" ref="searchInput" @keyup.enter="searchInfo()" @focus="searchFoucs($event, 'focus')" @blur="searchFoucs($event, 'blur')" placeholder="SEARCH" spellcheck="false">
        <div class="search-border search-border1"></div>
        <div class="search-border search-border2"></div>
        <div class="search-border search-border3"></div>
        <div class="search-border search-border4"></div>
        <div class="search-border-2 search-border5"></div>
        <div class="search-border-2 search-border6"></div>
        <div class="search-border-2 search-border7"></div>
        <div class="search-border-2 search-border8"></div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
    $boderpx: 2 + Px;
    $boderPosition: -1Px;
  .search-container{
    width: 130Px;
    height: 20Px;
    position: relative;
    bottom: -3px;
    display: flex;
    transition: 0.3s cubic-bezier(.24,.97,.59,1);
    .search-input{
        width: 100%;
        padding: 0 10Px;
        color: black;
        border: none;
        border-style: none;
        background: none;
        outline: none;
        text-align: center;
        font: 12Px SourceHanSansCN-Bold;
        &::-webkit-input-placeholder{
            font: 12Px Geometos;
            color: black;
        }
    }
    .search-border{
        width: 7Px;
        height: 7Px;
        position: absolute;
    }
    .search-border1{
        top: 0;
        left: 0;
        border: {
            top: $boderpx solid black;
            left: $boderpx solid black;
        };
    }
    .search-border2{
        top: 0;
        right: 0;
        border: {
            top: $boderpx solid black;
            right: $boderpx solid black;
        };
    }
    .search-border3{
        bottom: 0;
        right: 0;
        border: {
            bottom: $boderpx solid black;
            right: $boderpx solid black;
        };
    }
    .search-border4{
        bottom: 0;
        left: 0;
        border: {
            bottom: $boderpx solid black;
            left: $boderpx solid black;
        };
    }
    .search-border-2{
        width: 4Px;
        height: 4Px;
        background-color: black;
        position: absolute;
    }
    .search-border5{
        top: $boderPosition;
        left: $boderPosition;
    }
    .search-border6{
        top: $boderPosition;
        right: $boderPosition;

    }
    .search-border7{
        bottom: $boderPosition;
        right: $boderPosition;
    }
    .search-border8{
        bottom: $boderPosition;
        left: $boderPosition;
    }
  }
  .search-container-foucs{
    width: 160Px;
  }
  .fade-enter-active,
  .fade-leave-active {
    transition: 0.2s;
  }

  .fade-enter-from,
  .fade-leave-to {
    transform: scale(0.9);
    opacity: 0;
  }
</style>