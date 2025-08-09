<script setup>
  import { ref } from 'vue'
  import VueSlider from 'vue-slider-component'
  import { noticeOpen } from '../utils/dialog'
  import { checkMusic, getMusicUrl } from '../api/song'
  import { usePlayerStore } from '../store/playerStore'
  import { useLocalStore } from '../store/localStore'
  import { initDownloadManager } from '../utils/downloadManager'
  import { storeToRefs } from 'pinia'
  
  const localStore = useLocalStore()
  const { isFirstDownload, isDownloading, downloadList } = storeToRefs(localStore)
  const playerStore = usePlayerStore()
  const { quality } =storeToRefs(playerStore)
  const progress = ref(0)
  
  // 确保下载管理器已初始化
  initDownloadManager()
  
  // 只注册进度回调（UI相关）
  windowApi.downloadProgress((event, value) => {
    progress.value = value
  })

  const changeState = (flag) => {
      if(flag && !isDownloading.value) {
        isDownloading.value = true
        windowApi.downloadResume()
        if(isFirstDownload.value && downloadList.value.length != 0) {
          windowApi.startDownload()
          isFirstDownload.value = false
        }
      }
      if(!flag && isDownloading.value) {
        isDownloading.value = false
        windowApi.downloadPause()
      }
  }
  const deleteItem = (index) => {
    if(index != 0) downloadList.value.splice(index, 1)
    else {
      if(!isDownloading.value) {
        downloadList.value.splice(0, 1)
      }
      windowApi.downloadCancel()
    }
  }
  const downloadClear = () => {
    changeState(false)
    downloadList.value = []
    isFirstDownload.value = true
    windowApi.downloadCancel()
  }
</script>

<template>
  <div class="download-list">
    <Transition name="download-transition">
      <div class="download-control" v-show="downloadList.length != 0">
        <div class="download-start" @click="changeState(true)" :class="{'selected': isDownloading}">开始</div>
        <div class="download-pause" @click="changeState(false)" :class="{'selected': !isDownloading}">暂停</div>
        <svg t="1670563159799" @click="downloadClear()" class="download-clear" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4514" width="200" height="200" data-v-d79774b1=""><path d="M224.561403 320 224.561403 896 778.105263 896 778.105263 320 712.982456 320 712.982456 832 289.68421 832 289.68421 320 224.561403 320 224.561403 320ZM387.368421 320.664062 452.491228 320.664062 452.491228 768.664062 387.368421 768.664062 387.368421 320.664062 387.368421 320.664062ZM550.175438 320.664062 615.298246 320.664062 615.298246 768.664062 550.175438 768.664062 550.175438 320.664062 550.175438 320.664062ZM387.368421 192 192 192 192 256 810.666664 256 810.666664 192 647.859649 192 647.859649 128 387.368421 128 387.368421 192 387.368421 192Z" p-id="4515" data-v-d79774b1=""></path></svg>
        <div class="tracker" :class="{'selected-start': isDownloading, 'selected-pause': !isDownloading}"></div>
      </div>
    </Transition>
    <div class="list-item">
      <div class="item" @contextmenu.prevent="deleteItem(index)" v-for="(item, index) in downloadList">
        <span class="download-index">{{index + 1}}</span>
        <div class="download">
          <div class="item-name">{{item.name}}</div>
          <div class="download-progress">
            <VueSlider class="progress" v-if="index == 0" v-model="progress" :min="0" :max="100" :interval="1" :duration="0.5" :clickable="false" tooltip="none"></VueSlider>
            <div class="progress" v-show="index != 0"></div>
            <span class="progress-num" >{{(index == 0) ? Math.trunc(progress) : 0}}%</span>
          </div>
        </div>
      </div>
    </div>
    <Transition name="download-transition">
      <div v-show="downloadList.length == 0" class="list-none">NONE</div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
  .download-list{
    width: 100%;
    height: 100%;
    position: relative;
    .download-control{
      margin-bottom: 10Px;
      display: flex;
      flex-direction: row;
      align-items: center;
      font: 14Px SourceHanSansCN-Bold;
      color: black;
      position: relative;
      .download-start, .download-pause{
        padding: 1Px 6Px;
        transition: 0.2s;
        &:hover{
          cursor: pointer;
        }
      }
      .selected{
        // background-color: black;
        color: white;
      }
      .tracker{
        width: 40Px;
        height: 100%;
        background-color: black;
        position: absolute;
        top: 0;
        left: 0;
        z-index: -1;
        transition: 0.2s;
      }
      .selected-start{
        left: 0;
      }
      .selected-pause{
        left: 40Px;
      }
      .download-clear{
        width: 20Px;
        height: 20Px;
        position: absolute;
        right: 0;
        &:hover{
          cursor: pointer;
        }
      }
    }
    .list-item{
      width: 100%;
      .item{
        padding: 8Px 0;
        width: 100%;
        display: flex;
        flex-direction: row;
        align-items: center;
        transition: 0.2s;
        &:hover{
          background-color: rgba(0, 0, 0, 0.045);
        }
        .download-index{
          width: 30Px;
          font: 14Px Bender-Bold;
          color: black;
        }
        .download{
          width: 100%;
          .item-name{
            width: calc(100% - 50Px);
            font: 14Px SourceHanSansCN-Bold;
            color: black;
            text-align: left;
            overflow: hidden;
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 1;
            word-break: break-all;
          }
          .download-progress{
            display: flex;
            flex-direction: row;
            align-items: center;
            .progress{
              width: 100% !important;
              height: 8Px !important;
              background-color: rgba(0, 0, 0, 0.1);
            }
            .progress-num{
              width: 50Px;
              font: 12Px Bender-Bold;
              color: black;
            }
          }
        }
      }
    }
    .list-none{
      width: 100%;
      font: 16Px Bender-Bold;;
      color: black;
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
    }


    .download-transition-enter-active,
    .download-transition-leave-active {
      transition: 0.2s cubic-bezier(.14,.91,.58,1);
    }

    .download-transition-enter-from,
    .download-transition-leave-to {
      opacity: 0;
      transform: scale(0.95);
    }
  }
</style>