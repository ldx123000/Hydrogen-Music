<script setup>
  import { ref, computed } from 'vue'
  import { useRouter, onBeforeRouteUpdate} from 'vue-router';
  import { nanoid } from 'nanoid'
  import { songTime2 } from '../utils/player';
  import { addLocalMusicTOList, setShuffledList } from '../utils/player'
  import { useLocalStore } from '../store/localStore';
  import { usePlayerStore } from '../store/playerStore';
  import { useOtherStore } from '../store/otherStore';
  import { storeToRefs } from 'pinia';
  const router = useRouter()
  const localStore = useLocalStore()
  const { updateLocalMusicDetail } = localStore
  const { currentType, currentSelectedInfo, currentSelectedSongs, currentSelectedFilePicUrl } = storeToRefs(localStore)
  const playerStore = usePlayerStore()
  const { songId, playMode, playing } =storeToRefs(playerStore)
  const otherStore = useOtherStore()

  onBeforeRouteUpdate((to, from, next) => {
    updateLocalMusicDetail(to.name, to.query, to.params.id)
    currentType.value = to.name
    next()
    if(document.getElementById('local-list'))
      document.getElementById('local-list').scrollTop = 0
  })
  const routerChange = (operation) => {
      if(operation) router.forward()
      else router.back()
  }
  const getData = computed(() => {
    currentSelectedSongs.value.map((item) => {
      if(!item.nid)
        Object.assign(item, {nid: nanoid()})
    })
    return currentSelectedSongs.value
  })
  const play = (id, index) => {
    addLocalMusicTOList(router.currentRoute.value.name, currentSelectedSongs.value, id, index)
    if(playMode.value == 3) setShuffledList()
  }
  const openMenu = (e, item) => {
    otherStore.contextMenuShow = true
    otherStore.selectedItem = item
    otherStore.menuTree = otherStore.tree4
    
    const { clientX, clientY } = e
    const menuList = document.getElementById('menu')
    const screenWidth = document.body.clientWidth
    const screenHeight = document.body.clientHeight
    if(screenWidth - clientX < 120) {
      menuList.style.left = screenWidth - 140 + 'Px'
      menuList.style.right = null
    } else {
      menuList.style.right = null
      menuList.style.left = clientX + 'Px'
    }
    if(screenHeight - clientY < 240) {
      menuList.style.top = screenHeight - 240 + 'Px'
      menuList.style.bottom = null
    } else {
      menuList.style.bottom = null
      menuList.style.top = clientY + 'Px'
    }
  }
</script>
<template>
  <div class="local-music-detail">
    <div class="local-music-container">
      <div class="view-control">
        <svg t="1669039513804" @click="routerChange(0)" class="router-last" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1053" width="200" height="200"><path d="M716.608 1010.112L218.88 512.384 717.376 13.888l45.248 45.248-453.248 453.248 452.48 452.48z" p-id="1054"></path></svg>
        <svg t="1669039531646" @click="routerChange(1)" class="router-next" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1207" width="200" height="200"><path d="M264.896 1010.112l497.728-497.728L264.128 13.888 218.88 59.136l453.248 453.248-452.48 452.48z" p-id="1208"></path></svg>
      </div>
      <div class="local-music-hearder">
        <div class="local-music-cover" :class="{'cover-shadow': currentSelectedFilePicUrl != null && currentType != 'localFiles'}">
          <img :src="currentSelectedFilePicUrl" v-show="currentSelectedFilePicUrl != null && currentType != 'localFiles'">
          <svg t="1671777626561" v-show="currentType == 'localFiles'" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2336" width="200" height="200"><path d="M418.133333 298.666667l-42.666666-42.666667H213.333333v512h640V298.666667H418.133333zM896 298.666667v512H170.666667V213.333333h226.133333l42.666667 42.666667H896v42.666667z m-298.666667 341.333333h170.666667v42.666667h-170.666667v-42.666667z" fill="#000000" p-id="2337"></path></svg>
          <svg t="1671808192037" v-show="currentType == 'localAlbum' && !currentSelectedFilePicUrl" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2941" width="200" height="200"><path d="M885.333333 256H138.666667a53.393333 53.393333 0 0 0-53.333334 53.333333v576a53.393333 53.393333 0 0 0 53.333334 53.333334h746.666666a53.393333 53.393333 0 0 0 53.333334-53.333334V309.333333a53.393333 53.393333 0 0 0-53.333334-53.333333z m10.666667 629.333333a10.666667 10.666667 0 0 1-10.666667 10.666667H138.666667a10.666667 10.666667 0 0 1-10.666667-10.666667V309.333333a10.666667 10.666667 0 0 1 10.666667-10.666666h746.666666a10.666667 10.666667 0 0 1 10.666667 10.666666zM659.5 556.266667l-202.666667-122.62A48 48 0 0 0 384 474.72v245.226667a47.886667 47.886667 0 0 0 72.846667 41.073333l202.666666-122.62a48 48 0 0 0 0-82.133333z m-22.086667 45.626666l-202.666666 122.62a5.333333 5.333333 0 0 1-8.093334-4.566666V474.72a5.073333 5.073333 0 0 1 2.713334-4.666667A5.333333 5.333333 0 0 1 432 469.333333a5.24 5.24 0 0 1 2.746667 0.813334l202.666666 122.62a5.333333 5.333333 0 0 1 0 9.12zM170.666667 106.666667a21.333333 21.333333 0 0 1 21.333333-21.333334h640a21.333333 21.333333 0 0 1 0 42.666667H192a21.333333 21.333333 0 0 1-21.333333-21.333333z m-42.666667 85.333333a21.333333 21.333333 0 0 1 21.333333-21.333333h725.333334a21.333333 21.333333 0 0 1 0 42.666666H149.333333a21.333333 21.333333 0 0 1-21.333333-21.333333z" fill="#000000" p-id="2942"></path></svg>
          <svg t="1671808507579" v-show="currentType == 'localArtist' && !currentSelectedFilePicUrl" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5131" width="200" height="200"><path d="M512 1255.489906M888.810714 711.048571c-20.570058-48.713172-50.145912-92.514092-87.704177-130.072357s-81.359184-67.13412-130.072357-87.704177c-14.020388-5.935639-28.347791-11.052568-42.879872-15.35079 59.151709-38.274635 98.44973-104.897062 98.44973-180.525285 0-118.508095-96.402958-214.911053-214.911053-214.911053s-214.911053 96.402958-214.911053 214.911053c0 75.628223 39.298021 142.25065 98.44973 180.525285-14.532081 4.298221-28.859484 9.415151-42.879872 15.35079-48.713172 20.570058-92.514092 50.145912-130.072357 87.704177s-67.13412 81.359184-87.704177 130.072357c-21.388767 50.452928-32.134319 104.078353-32.134319 159.341195 0 14.122726 11.461923 25.584649 25.584649 25.584649s25.584649-11.461923 25.584649-25.584649c0-95.686588 37.251249-185.642215 104.897062-253.288027 67.645813-67.645813 157.601439-104.897062 253.288027-104.897062 95.686588 0 185.642215 37.251249 253.288027 104.897062s104.897062 157.601439 104.897062 253.288027c0 14.122726 11.461923 25.584649 25.584649 25.584649s25.584649-11.461923 25.584649-25.584649C920.945033 815.126924 910.097142 761.501499 888.810714 711.048571zM347.848891 297.293624c0-90.262642 73.479113-163.741755 163.741755-163.741755s163.741755 73.479113 163.741755 163.741755-73.479113 163.741755-163.741755 163.741755S347.848891 387.556266 347.848891 297.293624z" fill="#000000" p-id="5132"></path></svg>
        </div>
        <span class="local-music-title">{{ currentSelectedInfo.name }}</span>
      </div>
      <div id="local-list" class="local-music-list">
      <!-- <RecycleScroller
        id="local-list"
        class="local-music-list"
        :items="getData"
        :item-size="61"
        key-field="nid"
        v-slot="{ item, index }"
      > -->
        <div class="list-item" :class="{'list-item-playing': songId == item.id}" @dblclick="play(item.id, index)" @contextmenu="openMenu($event,item)" v-for="(item, index) in currentSelectedSongs">
          <div class="item-title">
            <div class="item-state">
                <div class="playing-eq" v-show="(songId == item.id)" :class="{ 'is-paused': !playing }" aria-hidden="true">
                  <span class="bar"></span>
                  <span class="bar"></span>
                  <span class="bar"></span>
                  <span class="bar"></span>
                </div>
                <div class="item-num" v-show="!(songId == item.id)">{{index + 1}}</div>
            </div>
            <div class="item-info">
              <span class="item-name">{{item.common.title || item.common.localTitle}}</span>
              <div class="item-format">
                <div class="file-type">{{item.format.container}}</div>
                <span class="format">{{item.format.sampleRate / 1000}}KHz/{{item.format.bitsPerSample}}Bits/{{Math.round(item.format.bitrate / 1000)}}Kpbs</span>
              </div>
            </div>
          </div>
          <div class="item-other">
            <div class="item-author">
              <span class="item-singer" v-if="item.common.artists && item.common.artists[0] != '其他'" v-for="(singer, index) in item.common.artists">{{singer}}{{index == item.common.artists.length -1 ? '' : '/'}}</span>
            </div>
            <span class="item-time">{{songTime2(item.format.duration)}}</span>
          </div>
        </div>
      <!-- </RecycleScroller> -->
    </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .local-music-detail{
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    .local-music-container{
      width: 100%;
      height: 100%;
      .view-control{
        margin-left: -8Px;
        height: 32Px;
        svg{
          padding: 8Px;
          width: 32Px;
          height: 32Px;
          float: left;
          transition: 0.2s;
          &:hover{
            cursor: pointer;
            opacity: 0.7;
          }
          &:active{
            transform: scale(0.9);
          }
        }
        .router-last{
          margin-right: 20Px;
        }
      }
      .local-music-hearder{
        width: 100%;
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        user-select: text;
        .local-music-cover{
          width: 150Px;
          height: 150Px;
          img{
            width: 100%;
            height: 100%;
          }
          svg{
            width: 100%;
            height: 100%;
          }
        }
        .cover-shadow{
          border: 0.5Px solid rgb(218, 218, 218);
          box-shadow: 0 0 6Px 1Px rgba(0, 0, 0, 0.03);
        }
        .local-music-title{
          margin: 4Px 0;
          font: 20Px SourceHanSansCN-Bold;
          color: black;
          overflow: hidden;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 1;
          word-break: break-all;
          user-select: text;
        }
      }
      .local-music-list{
        width: 100%;
        height: calc(100% - 221Px);
        overflow: auto;
        user-select: text;
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
        .list-item{
          padding: 12Px 8Px;
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          transition: 0.2s;
          &:hover{
            cursor: default;
            background-color: rgba(0, 0, 0, 0.045);
          }
          .item-title{
            width: 50%;
            display: flex;
            flex-direction: row;
            align-items: center;
            svg{
              width: 14Px;
              height: 14Px;
            }
            .playing-eq {
              width: 14Px;
              height: 14Px;
            }
            .item-state{
              width: 26Px;
              .item-num{
                font: 14Px Geometos;
                color: rgb(127, 127, 127);
              }
            }
            .item-info{
              margin-left: 14Px;
              width: calc(100% - 26Px - 14Px);
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: flex-start;
              .item-name{
                font: 15Px SourceHanSansCN-Bold;
                color: black;
                overflow: hidden;
                text-align: left;
                overflow: hidden;
                display: -webkit-box;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 1;
                word-break: break-all;
              }
              .item-format{
                display: flex;
                flex-direction: row;
                align-items: center;
                .file-type{
                  margin-right: 6Px;
                  padding: 0 2Px;
                  border: 0.5Px solid rgba(249, 190, 46, 1);
                  font: 8Px Bender-Bold;
                  color: rgba(249, 190, 46, 1);
                }
                .format{
                  font: 10Px Bender-Bold;
                  color: black;
                }
              }
            }
          }
          .item-other{
            margin-left: 14Px;
            width: 45%;
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            span{
                font: 14Px SourceHanSansCN-Bold;
                color: black;
            }
            .item-author{
              width: 70%;
              text-align: left;
              overflow: hidden;
              display: -webkit-box;
              -webkit-box-orient: vertical;
              -webkit-line-clamp: 1;
              word-break: break-all;
              .item-singer{
                transition: 0.1s;
                &:hover{
                  cursor: pointer;
                  opacity: 0.6;
                }
              }
            }
            .item-time{
              width: 30%;
            }
          }
        }
        .list-item:last-child{
            margin-bottom: 10Px;
        }
        .list-item-playing{
            background-color: rgba(0, 0, 0, 0.045);
        }
      }
    }
  }
</style>
