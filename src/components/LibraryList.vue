<script setup>
  import { onActivated, ref } from 'vue'
  import { onBeforeRouteLeave, useRouter } from 'vue-router'
  import { useLibraryStore } from '../store/libraryStore'
  import { usePlayerStore } from '../store/playerStore';
  import { useLocalStore } from '../store/localStore';
  import { useOtherStore } from '../store/otherStore';
  import { storeToRefs } from 'pinia'
  const libraryStore = useLibraryStore()
  const { libraryList, libraryInfo, listType1, listType2 } = storeToRefs(libraryStore)
  const playerStore = usePlayerStore()
  const localStore = useLocalStore()
  const otherStore = useOtherStore()
  
  const scrollTop = ref()
  const currentSelected = ref(null)
  const lastRouter = ref(null)
  const router = useRouter()
  const showDetail = async (selectedId, item) => {
    if(listType1.value == 0) router.push('/mymusic/playlist/' + item.id)
    if(listType1.value == 1 && listType2.value == 0) router.push('/mymusic/album/' + item.id)
    if(listType1.value == 1 && listType2.value == 1) router.push('/mymusic/artist/' + item.id)
    if(listType1.value == 1 && listType2.value == 2) {
      otherStore.getMvData(item.vid)
    }
    if(listType1.value == 1 && listType2.value == 3) {
      // 收藏-电台：优先使用 rid（API 使用 rid 作为电台ID）
      const djId = item?.rid || item?.id
      if (djId) router.push('/mymusic/dj/' + djId)
    }
    currentSelected.value = selectedId
  }

  onActivated(() => {
    if(lastRouter.value && libraryInfo.value && !playerStore.forbidLastRouter) router.push(lastRouter.value)
    if(lastRouter.value && lastRouter.value.name == 'local' && localStore.currentSelectedSongs && !playerStore.forbidLastRouter) router.push(lastRouter.value.fullPath)
    document.getElementById('libraryListScroll').scrollTop = scrollTop.value
  })
  onBeforeRouteLeave((to, from, next) => {
    if(!from.params.id && from.name != 'rec') {
      lastRouter.value = null
      libraryInfo.value = null
    } else {
      lastRouter.value = from.fullPath
    }
    if(from.name == 'localFiles' || from.name == 'localAlbum' || from.name == 'localArtist')
      lastRouter.value = {
        name: 'local',
        fullPath: from.fullPath
      }

    if(document.getElementById('libraryListScroll'))
      scrollTop.value = document.getElementById('libraryListScroll').scrollTop
    playerStore.forbidLastRouter = false
    next()
  })
  const openMenu = (e, item) => {
    if(listType1.value != 0 || listType2.value != 0) return
    otherStore.contextMenuShow = true
    otherStore.selectedItem = item
    otherStore.menuTree = otherStore.tree3
    
    const { clientX, clientY } = e
    const menuList = document.getElementById('menu')
    const screenWidth = document.body.clientWidth
    const screenHeight = document.body.clientHeight
    if(screenWidth - clientX < 120) {
      menuList.style.left = screenWidth - 120 + 'Px'
      menuList.style.right = null
    } else {
      menuList.style.right = null
      menuList.style.left = clientX + 'Px'
    }
    if(screenHeight - clientY < 240) {
      menuList.style.top = screenHeight - 200 + 'Px'
      menuList.style.bottom = null
    } else {
      menuList.style.bottom = null
      menuList.style.top = clientY + 'Px'
    }
  }
</script>

<template>
  <div id="libraryListScroll" class="library-list">
    <div class="list-item" :class="{'list-item-selected': (item.id == router.currentRoute.value.fullPath.split('/')[3] && listType2 != 2) || (otherStore.currentVideoId == item.vid && listType2 == 2)}" v-for="(item, index) in libraryList" @click="showDetail(index, item)" @contextmenu="openMenu($event,item)">
        <div class="item-img">
            <img :src="(item.coverImgUrl || item.img1v1Url || item.picUrl || item.coverUrl) + '?param=128y128'" alt="">
        </div>
        <div class="item-other">
            <span class="item-name">{{(item.name ?? item.title)}}</span>
            <div class="item-info">
              <div class="item-artist" v-show="(listType1 == 1 && listType2 == 0)">
                <span class="artist"  v-for="(artists, index) in item.artists">{{artists.name}}{{index == item.artists.length -1 ? '' : '/'}}</span>
              </div>
              <div class="item-artist" v-if="listType1 == 1 && listType2 == 2">
                <span class="artist"  v-for="(creator, index) in item.creator">{{creator.userName}}{{index == item.creator.length -1 ? '' : '/'}}</span>
              </div>
              <div class="item-artist" v-if="listType1 == 1 && listType2 == 3">
                <span class="artist">{{ item.dj?.nickname }}</span>
              </div>
              <span class="item-size" v-if="listType1 == 1 && listType2 == 3">{{ item.programCount || 0 }}期</span>
              <span class="item-size" v-if="!(listType1 == 1 && listType2 == 1) && !(listType1 == 1 && listType2 == 2) && !(listType1 == 1 && listType2 == 3)">{{(item.trackCount ?? item.size)}}首</span>
            </div>
        </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .library-list{
    display: flex;
    flex-direction: column;
    .list-item{
        padding: 8Px;
        display: flex;
        flex-direction: row;
        align-items: center;
        position: relative;
        &::after{
          content: '';
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.05);
          position: absolute;
          top: 0;
          left: 0;
          transform: translateX(-100%);
          will-change: transform, opacity;
          transition: transform 1s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 1s ease;
          transition-delay: 0s;
          pointer-events: none;
        }
        &:hover{
          cursor: pointer;
          &::after{
            transition-delay: 0.2s;
            transform: translateX(0);
          }
        }
        .item-img{
          margin-right: 10Px;
          width: 50Px;
          height: 50Px;
          border: 0.5Px solid rgb(233, 233, 233);
          img{
              width: 100%;
              height: 100%;
          }
        }
        .item-other{
          width: calc(100% - 56Px);
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          .item-name{
            font: 15Px SourceHanSansCN-Bold;
            color: black;
            text-align: left;
            overflow: hidden;
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 1;
            word-break: break-all;
          }
          .item-info{
            font: 11Px SourceHanSansCN-Bold;
            color: rgb(107, 107, 107);
            display: flex;
            flex-direction: row;
            align-items: center;
            .item-artist{
              margin-right: 5Px;
              max-width: 100%;
              text-align: left;
              overflow: hidden;
              display: -webkit-box;
              -webkit-box-orient: vertical;
              -webkit-line-clamp: 1;
              word-break: break-all;
            }
            .item-size{
              white-space: nowrap;
            }
          }
        }
    }
    .list-item:last-child{
        margin-bottom: 15Px;
      }
    .list-item-selected{
      &::after{
        transform: translateX(0);
      }
    }
  }
</style>
