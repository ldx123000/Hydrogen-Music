<script setup>
  import { useLibraryStore } from '../store/libraryStore';
  import { playAll } from '../utils/player'
  import LibrarySongList from './LibrarySongList.vue'
  
  const libraryStore = useLibraryStore()

</script>

<template>
  <div class="rec-container">
    <div class="rec-header">
      <h1>每日推荐歌曲</h1>
      <span class="rec-subtitle">根据你的音乐口味生成，每天6:00更新</span>
      <div class="rec-option">
        <span class="play-all" @click="playAll('rec', libraryStore.librarySongs)">播放全部</span>
        <!-- <span class="collect">收藏</span> -->
      </div>
    </div>
    <LibrarySongList :songlist="libraryStore.librarySongs"></LibrarySongList>
  </div>
</template>

<style scoped lang="scss">
  .rec-container{
    padding-top: 40Px;
    height: 100%;
    overflow: auto;
    &::-webkit-scrollbar{
      display: none;
    }
    h1{
      margin: 0;
      color: black;
    }
    .rec-subtitle{
      margin: 4Px 0;
      font: 14Px SourceHanSansCN-Bold;
      color: black;
      display: block;
    }
    .rec-option{
      margin-top: 16Px;
      margin-bottom: 30Px;
      font: 16Px SourceHanSansCN-Bold;
      color: black;
      .play-all{
        margin-right: 20Px;
      }
      span{
        padding: 8Px 10Px;
        position: relative;
        transition: 0.1s;
        &::after{
          content: '';
          width: 0;
          height: 100%;
          background-color: black;
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          transition: 0.2s;
          z-index: -1;
          opacity: 0;
        }
        &:hover{
          cursor: pointer;
          color: white;
          &::after{
            width: 100%;
            opacity: 1;
          }
        }
      }
    }
  }
</style>