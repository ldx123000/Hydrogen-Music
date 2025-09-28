<script setup>
  import { useRouter } from 'vue-router'
  import LibraryType from '../components/LibraryType.vue'
  import LibraryList from '../components/LibraryList.vue'
  import DownloadList from '../components/DownloadList.vue'
  import LocalMusicList from '../components/LocalMusicList.vue'
  import { useUserStore } from '../store/userStore'
  import { usePlayerStore } from '../store/playerStore'
  import { useLibraryStore } from '../store/libraryStore'
  import { useLocalStore } from '../store/localStore';
  import { storeToRefs } from 'pinia'
  const router = useRouter()
  const libraryStore = useLibraryStore()
  const { listType1, listType2, libraryChangeAnimation } = storeToRefs(libraryStore)
  const userStore = useUserStore()
  const { user } = storeToRefs(userStore)
  const playerStore = usePlayerStore()
  const localStore = useLocalStore()
  const { downloadedMusicFolder, localMusicFolder, localMusicClassify, downloadedFolderSettings, localFolderSettings } = storeToRefs(localStore)

</script>

<template>
  <div class="my-music" :class="{'my-music-full': !playerStore.songList}">
    <div class="music-library" v-if="user">
      <LibraryType class="library-type"></LibraryType>
      <LibraryList v-show="listType1 != 2 && listType1 != 3" class="library-list"></LibraryList>
      <DownloadList v-show="listType1 == 2 && listType2 == 0" class="download-list"></DownloadList>
      <LocalMusicList :folderlist="downloadedMusicFolder" type="downloaded" v-if="downloadedMusicFolder" v-show="listType1 == 2 && listType2 == 1" class="local-list"></LocalMusicList>
      <LocalMusicList :folderlist="localMusicFolder" :classifylist="localMusicClassify" type="local" v-if="localMusicFolder" v-show="listType1 == 3" class="local-list"></LocalMusicList>
      <div class="no-folder" @click="router.push('/settings')" v-if="!downloadedFolderSettings && listType1 == 2 && listType2 == 1">去设置下载地址</div>
      <div class="no-folder" @click="router.push('/settings')" v-if="localFolderSettings.length == 0 && listType1 == 3">去设置扫描地址</div>
    </div>
      <div class="library-view" :class="{'library-view-nologin': !user}">
        <router-view v-slot="{ Component }">
          <keep-alive :include="['LibraryDetail','LibrarySongList','LibraryAlbumList','LibraryMVList']">
            <Transition name="fade">
              <component :is="Component" v-show="!libraryChangeAnimation"></component>
            </Transition>
          </keep-alive>
        </router-view>
        <Transition name="fade">
          <div class="library-container" v-show="(router.currentRoute.value.fullPath == '/mymusic')">
            <div class="library-nodata">
                <div class="line1"></div>
                <span class="tip">NONE</span>
                <div class="line2"></div>
            </div>
            <div class="border border1"></div>
            <div class="border border2"></div>
            <div class="border border3"></div>
            <div class="border border4"></div>
          </div>
        </Transition>
      </div>
  </div>
</template>

<style scoped lang="scss">
  .my-music{
    width: 100%;
    height: calc(100% - 110Px);
    display: flex;
    flex-direction: row;
    transition: 0.5s cubic-bezier(.19,.8,.49,.99);
    .music-library{
      padding-top: 10Px;
      width: 262Px;
      max-width: 450Px;
      height: 100%;
      .library-type{
        height: 50Px;
      }
      .library-list{
        height: calc(100% - 50Px);
        overflow: auto;
        &::-webkit-scrollbar {
          width: 5px;
          height: 10px;
          background-color: rgba(0, 0, 0, 0);
        }
        &::-webkit-scrollbar-thumb {
          background-color: rgba(0, 0, 0, 0.0);
        }
        &::-webkit-scrollbar-track {
          display: none;
        }
        &:hover::-webkit-scrollbar-thumb{
          background-color: rgba(0, 0, 0, 0.04);
        }
      }
      .download-list{
        height: calc(100% - 50Px);
        overflow: auto;
        &::-webkit-scrollbar{
          display: none;
        }
      }
      .local-list{
        height: calc(100% - 50Px);
        overflow: auto;
        &::-webkit-scrollbar{
          display: none;
        }
      }
      .no-folder{
        font: 14px SourceHanSansCN-Bold;
        color: black;
        background-color: rgba(255, 255, 255, 0.35);
        padding: 10px;
        transition: 0.2s;
        &:hover{
          cursor: pointer;
        }
        &:active{
          opacity: 0.7;
        }
      }
    }
    .library-view{
      margin-left: 50Px;
      width: 100%;
      height: 100%;
      position: relative;
      .library-container{
        width: 100%;
        height: 100%;
        position: absolute;
        top: 0;
        left: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        .library-nodata{
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: row;
            justify-content: center;
            align-items: center;
            position: relative;
            .line1, .line2{
                width: 0;
                height: 0;
                position: absolute;
                background: 
                linear-gradient(
                  to bottom right,
                  rgba(0, 0, 0, 0) 0%,
                  rgba(0, 0, 0, 0) calc(50% - 0.5px),
                  rgba(0, 0, 0, 0.8) 50%,
                  rgba(0, 0, 0, 0) calc(50% + 0.5px),
                  rgba(0, 0, 0, 0) 100%
              );
              animation: nodata-open1 0.6s cubic-bezier(.32,.81,.56,.98) forwards;
              @keyframes nodata-open1 {
                0%{width: 0;height: 0;}
                100%{width: 38%;height: 38%;}
              }
            }
            .tip{
              font: 16Px Bender-Bold;
              color: black;
              white-space: nowrap;
              opacity: 0;
              animation: nodata-open2 0.1s 0.4s forwards;
              @keyframes nodata-open2 {
                10%{opacity: 0;}
                20%{opacity: 1;}
                30%{opacity: 1;}
                40%{opacity: 0;}
                50%{opacity: 0;}
                60%{opacity: 1;}
                70%{opacity: 1;}
                80%{opacity: 0;}
                90%{opacity: 0;}
                100%{opacity: 1;}
              }
            }
            .line1{
              left: 4%;
              bottom: 4%;
            }
            .line2{
              top: 6%;
              right: 4%;
            }

        }
        .border{
          width: 1.5vh;
          height: 1.5vh;
          border: 1Px solid black;
          position: absolute;
        }
        .border1{
          top: 15Px;
          left: 0;
        }
        .border2{
          top: 15Px;
          right: 0;

        }
        .border3{
          bottom: 4Px;
          right: 0;
        }
        .border4{
          bottom: 4Px;
          left: 0;
        }
      }
    }
    .library-view-nologin{
      margin: 0;
    }
  }
  .my-music-full{
    height: 100%;
  }
  .fade-enter-active,
  .fade-leave-active {
    transition: 0.3s cubic-bezier(.3,.79,.55,.99);
  }

  .fade-enter-from,
  .fade-leave-to {
    transform: scale(0.95);
    opacity: 0;
  }
</style>
