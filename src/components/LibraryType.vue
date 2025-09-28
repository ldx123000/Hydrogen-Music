<script setup>
  import { ref } from 'vue'
  import router from '../router/router'
  import { getUserPlaylistCount, getUserPlaylist } from '../api/user'
  import { getUserSubAlbum } from '../api/album'
  import { getUserSubArtists } from '../api/artist'
  import { getUserSubMV } from '../api/mv'
  import { useUserStore } from '../store/userStore'
  import { getDjSubList } from '../api/dj'
  import { useLibraryStore } from '../store/libraryStore'
  import { useLocalStore } from '../store/localStore'
  import { storeToRefs } from 'pinia'
  import { scanMusic } from '../utils/locaMusic.js'

  const userStore = useUserStore()
  const { user } = storeToRefs(userStore)
  const libraryStore = useLibraryStore()
  const { changeLibraryList, updateUserPlaylistCount, updateUserPlaylist } = libraryStore
  const { libraryList, libraryListAlbum, libraryListAritist, listType1, listType2 } = storeToRefs(libraryStore)
  const localStore = useLocalStore()

  const typeTracker = ref(0)
  const option = ref(0)
  const typeOne = ref(0)
  const typeTwo = ref(0)
  const typeThree = ref(0)
  const typeFour = ref(0)

//   const typeList = [['我创建的','我收藏的'],['专辑','歌手','MV'],['正在下载','下载完成'],['全部','专辑','歌手']]
//   const currentList = ref(typeList[0])
  changeTracker(0)
  async function loadUserPlaylist() {
    let params = {
        uid: user.value.userId,
        limit: 500,
        offset: 0,
        timestamp: new Date().getTime()
    }
    await getUserPlaylistCount().then(listCount => {
        updateUserPlaylistCount(listCount)
        getUserPlaylist(params).then(list => {
            updateUserPlaylist(list.playlist)
            changeList()
        })
    })
  }

  async function changeList() {
    if(option.value == 0 && typeOne.value == 0){//我创建的
        listType2.value = 0
        changeLibraryList(0)
    } else if (option.value == 0 && typeOne.value == 1) {//我收藏的
        listType2.value = 1
        changeLibraryList(1)
    } else if (option.value == 1 && typeTwo.value == 0) {
        let params = {
            limit: 50,
            offset: 0,
            // timestamp: new Date().getTime()
        }
        getUserSubAlbum(params).then(result => {
            libraryList.value = result.data
            listType2.value = 0
            libraryListAlbum.value = libraryList.value
        })
    } else if (option.value == 1 && typeTwo.value == 1) {//歌手
        getUserSubArtists().then(result => {
            libraryList.value = result.data
            listType2.value = 1
            libraryListAritist.value = libraryList.value
        })
    } else if (option.value == 1 && typeTwo.value == 2) {//MV
        getUserSubMV().then(result => {
            result.data.forEach(item => {
                item.id = item.vid
            });
            libraryList.value = result.data
            listType2.value = 2
        })
    } else if (option.value == 1 && typeTwo.value == 3) { // 电台
        const params = { limit: 50, offset: 0 }
        getDjSubList(params).then(result => {
            const list = result?.djRadios || result?.data || result?.radios || []
            libraryList.value = list
            listType2.value = 3
        })
    } else if (option.value == 2 && typeThree.value == 0) {//正在下载
        listType2.value = 0
    } else if (option.value == 2 && typeThree.value == 1) {//下载完成
        listType2.value = 1
    } else if (option.value == 3 && typeFour.value == 0) {//全部
        listType2.value = 0
    } else if (option.value == 3 && typeFour.value == 1) {//专辑
        listType2.value = 1
    } else if (option.value == 3 && typeFour.value == 2) {//歌手
        listType2.value = 2
    }
    if(document.getElementById('libraryListScroll'))
        document.getElementById('libraryListScroll').scrollTop = 0
  }
  
  function changeTracker(num) {
    listType1.value = num
    if(num == 0) {
        option.value = num
        typeTracker.value = num
        loadUserPlaylist()
        return
    }
    option.value = num
    typeTracker.value = num
    changeList()
  }

  function changeType(num) {
    if (option.value == 0) {
        typeOne.value = num
    } else if (option.value == 1) {
        typeTwo.value = num
    } else if (option.value == 2) {
        typeThree.value = num
    } else if (option.value == 3) {
        typeFour.value = num
    }
    changeList()
  }

  const refreshLocal = () => {
    localStore.isRefreshLocalFile = true
    if(listType1.value == 2 && listType2.value == 1) {scanMusic({type:'downloaded',refresh:true});}
    if(listType1.value == 3) {scanMusic({type:'local',refresh:true});}
    router.push('/mymusic')
  }
</script>

<template>
  <div>
    <div class="library-type">
        <div class="type-one">
            <div class="type-option">
            <span class="option" :class="{'option-selected': option == 0}" @click="changeTracker(0)" id="myPlaylist">歌单</span>
            <span class="option" :class="{'option-selected': option == 1}" @click="changeTracker(1)">收藏</span>
            <span class="option" :class="{'option-selected': option == 2}" @click="changeTracker(2)">下载管理</span>
            <span class="option" :class="{'option-selected': option == 3}" @click="changeTracker(3)">本地管理</span>
            </div>
            <div class="option-tracker">
            <div class="tracker-line"></div>
            <div :class="{'tracker': true, 'tracker0': typeTracker == 0, 'tracker1': typeTracker == 1, 'tracker2': typeTracker == 2, 'tracker3': typeTracker == 3}"></div>
            </div>
        </div>
        <div class="type-two">
            <div class="type-option">
                <span v-show="option == 0" class="option" :class="{'option-selected': typeOne == 0}" @click="changeType(0)">我创建的</span>
                <span v-show="option == 0" class="option" :class="{'option-selected': typeOne == 1}" @click="changeType(1)">我收藏的</span>
                <span v-show="option == 1" class="option" :class="{'option-selected': typeTwo == 0}" @click="changeType(0)">专辑</span>
                <span v-show="option == 1" class="option" :class="{'option-selected': typeTwo == 1}" @click="changeType(1)">歌手</span>
                <span v-show="option == 1" class="option" :class="{'option-selected': typeTwo == 2}" @click="changeType(2)">MV</span>
                <span v-show="option == 1" class="option" :class="{'option-selected': typeTwo == 3}" @click="changeType(3)">电台</span>
                <span v-show="option == 2" class="option" :class="{'option-selected': typeThree == 0}" @click="changeType(0)">正在下载</span>
                <span v-show="option == 2" class="option" :class="{'option-selected': typeThree == 1}" @click="changeType(1)">下载完成</span>
                <span v-show="option == 3" class="option" :class="{'option-selected': typeFour == 0}" @click="changeType(0)">全部</span>
                <span v-show="option == 3" class="option" :class="{'option-selected': typeFour == 1}" @click="changeType(1)">专辑</span>
                <span v-show="option == 3" class="option" :class="{'option-selected': typeFour == 2}" @click="changeType(2)">歌手</span>
            </div>
            <span class="refresh" @click="refreshLocal()" v-show="(listType1 == 2 && listType2 == 1 && localStore.downloadedFolderSettings) || (listType1 == 3 && localStore.localFolderSettings.length != 0)">刷新</span>
        </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .library-type{
    height: 50Px;
    .type-one{
        .type-option{
            padding-left: 5Px;
            display: flex;
            span{
                margin-right: 20Px;
                font: 16Px SourceHanSansCN-Bold;
                color: rgb(78, 78, 78);
                white-space: nowrap;
                transition: 0.2s;
                &:hover{
                    cursor: pointer;
                    // color: black;
                }
            }
            .option-selected{
                color: black;
            }
        }
        .option-tracker{
            width: 100%;
            height: 3Px;
            position: relative;
            .tracker-line{
                width: 100%;
                height: 0.1Px;
                background-color: rgb(111, 111, 111);
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
            }
            .tracker{
                height: 3Px;
                background-color: black;
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                transition: 0.3s;
            }
            .tracker0{
                width: 32Px;
                left: 4Px;
            }
            .tracker1{
                width: 32Px;
                left: 57Px;
            }
            .tracker2{
                width: 64Px;
                left: 110Px;
            }
            .tracker3{
                width: 64Px;
                left: 193Px;
            }
        }
    }
    .type-two{
        margin-top: 4Px;
        padding-left: 5Px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        .type-option{
            display: flex;
            flex-direction: row;
        }
        span{
            margin-right: 10Px;
            font: 12Px SourceHanSansCN-Bold;
            font-weight: bold;
            color: rgb(78, 78, 78);
            white-space: nowrap;
            // transition: 0.2s;
            &:hover{
            cursor: pointer;
            // color: black;
            }
        }
        .option-selected{
            color: black;
        }
        .library-edit{
            margin-right: 6Px;
            position: relative;
            right: 0;
            }
        }
        .refresh{
            &:hover{
                color: black;
            }
        }
    }
</style>
