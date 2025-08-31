<script setup>
  import { ref, watch } from 'vue'
  import { createPlaylist, updatePlaylist, deletePlaylist } from '../api/playlist'
  import { addToNext, addToNextLocal } from '../utils/player'
  import { noticeOpen } from '../utils/dialog';
  import { useLibraryStore } from '../store/libraryStore';
  import { useLocalStore } from '../store/localStore';
  import { useOtherStore } from '../store/otherStore';
  import { useUserStore } from '../store/userStore';
  import { getLikelist } from '../api/user';
  import { getUserPlaylistCount, getUserPlaylist } from '../api/user'
  import { storeToRefs } from 'pinia';
  const libraryStore = useLibraryStore()
  const localStore = useLocalStore()
  const otherStore = useOtherStore()
  const userStore = useUserStore()
  const { librarySongs, listType1, listType2, needTimestamp } = storeToRefs(libraryStore)

  const isPrivacy = ref(false)
  const createActive = ref(false)
  const justNewPlaylist = ref(false)
  const newPlaylistTitle = ref(null)

  // 确保在打开“添加到歌单”弹窗时，已加载用户歌单列表
  const ensureUserPlaylistsLoaded = async () => {
    try {
      // 仅在已登录且还未加载过时拉取
      if (!userStore.user || !userStore.user.userId) return
      if (Array.isArray(libraryStore.playlistUserCreated) && libraryStore.playlistUserCreated.length > 0) return

      const count = await getUserPlaylistCount()
      libraryStore.updateUserPlaylistCount(count)

      const params = {
        uid: userStore.user.userId,
        limit: 500,
        offset: 0,
        timestamp: new Date().getTime(),
      }
      const list = await getUserPlaylist(params)
      if (list && Array.isArray(list.playlist)) {
        libraryStore.updateUserPlaylist(list.playlist)
      }
    } catch (e) {
      // 静默失败，弹窗仍可显示，后续可再次尝试
      console.error('加载用户歌单失败:', e)
    }
  }

  watch(
    () => otherStore.addPlaylistShow,
    async (show) => {
      if (show) await ensureUserPlaylistsLoaded()
    }
  )

  const addToPlaylist = () => {
    otherStore.addPlaylistShow = true
  }

  const deleteFromPlaylist = async () => {
    let params = {
      op: 'del',
      pid: otherStore.selectedPlaylist.id,
      tracks: otherStore.selectedItem.id
    }
    
    try {
      const result = await updatePlaylist(params)
      
      // 根据实际返回格式判断成功
      const isSuccess = result && (
        (result.status === 200 && result.body && result.body.code === 200) ||
        result.code === 200 ||
        result.status === 200
      )
      
      if(isSuccess) {
        // 从当前歌曲列表中移除该歌曲
        const songIndex = (librarySongs.value || []).findIndex((song) => song.id == otherStore.selectedItem.id)
        if(songIndex !== -1) {
          librarySongs.value.splice(songIndex, 1)
        }
        
        // 检查是否从"我喜欢的音乐"歌单删除，如果是则同步更新喜欢列表
        await updateLikelistIfFromFavorite()
        
        // 如果当前正在查看该歌单，实时更新歌单内容
        await updateCurrentPlaylistIfViewing()
        
        updatePlaylistCache()
        noticeOpen('删除成功', 2)
      } else {
        noticeOpen('删除失败', 2)
      }
    } catch (error) {
      console.error('删除歌曲失败:', error)
      noticeOpen('删除失败', 2)
    }
  }

  const updatePlaylistCache = () => {
    otherStore.addPlaylistShow = false
    createActive.value = false
    needTimestamp.value.push('/playlist/detail')
    needTimestamp.value.push('/playlist/track/all')
    let noCacheTimer = null
    if(noCacheTimer) clearTimeout(noCacheTimer)
      noCacheTimer = setTimeout(() => {
        needTimestamp.value.splice(needTimestamp.value.indexOf('/playlist/detail'), 1)
        needTimestamp.value.splice(needTimestamp.value.indexOf('/playlist/track/all'), 1)
        clearTimeout(noCacheTimer)
      }, 130000);
    try {
      if(listType1.value == 0 && listType2.value == 0) {
        const myPlaylistElement = document.getElementById('myPlaylist')
        if (myPlaylistElement) {
          myPlaylistElement.click()
        }
      }
    } catch (e) {
      console.error('点击myPlaylist失败，忽略:', e)
    }
  }

  // 检查并更新当前查看的歌单
  const updateCurrentPlaylistIfViewing = async () => {
    // 检查当前是否在查看被删除歌曲的歌单
    if (libraryStore.libraryInfo && otherStore.selectedPlaylist && 
        libraryStore.libraryInfo.id == otherStore.selectedPlaylist.id) {
        
        console.log('当前正在查看被删除歌曲的歌单，正在更新歌单内容...')
        
        try {
            // 重新获取歌单详情
            await libraryStore.updatePlaylistDetail(otherStore.selectedPlaylist.id)
            console.log('歌单已更新')
        } catch (error) {
            console.error('更新歌单失败:', error)
        }
    }
  }

  // 检查是否从"我喜欢的音乐"删除歌曲，如果是则同步更新喜欢列表
  const updateLikelistIfFromFavorite = async () => {
    try {
      // 检查被删除的歌单是否是"我喜欢的音乐"歌单
      const isFromFavoritePlaylist = userStore.favoritePlaylistId && 
        otherStore.selectedPlaylist.id == userStore.favoritePlaylistId
      
      if (isFromFavoritePlaylist) {
        console.log('从我喜欢的音乐删除歌曲，同步更新喜欢列表...')
        
        // 从本地喜欢列表中移除该歌曲
        if (userStore.likelist && userStore.likelist.includes(otherStore.selectedItem.id)) {
          const likeIndex = userStore.likelist.indexOf(otherStore.selectedItem.id)
          userStore.likelist.splice(likeIndex, 1)
        }
        
        // 异步获取最新的喜欢列表以确保数据最终一致
        try {
          const res = await getLikelist(userStore.user.userId)
          userStore.updateLikelist(res.ids)
          console.log('喜欢列表已同步更新')
        } catch (error) {
          console.error('同步喜欢列表失败:', error)
        }
      }
    } catch (error) {
      console.error('检查并更新喜欢列表失败:', error)
    }
  }

  const newPlaylist = () => {
    otherStore.addPlaylistShow = true
    justNewPlaylist.value = true
  }

  const deleteMyPlaylist = () => {
    let params = {
      id: otherStore.selectedItem.id
    }
    deletePlaylist(params).then(result => {
      if(result.code == 200) {
        if(listType1.value == 0 && listType2.value == 0) {
          document.getElementById('myPlaylist').click()
          noticeOpen('删除成功', 2)
        }
      } else {
        noticeOpen("删除歌单失败", 2)
      }
      
    })
  }

  const menuOpt = (id) => {
    if(id == 1) { addToNext(otherStore.selectedItem, true); return; }
    if(id == 2) { addToNext(otherStore.selectedItem, false); return; }
    if(id == 3) { localStore.updateDownloadList(otherStore.selectedItem); return; }
    if(id == 4) { addToPlaylist(); return; }
    if(id == 5) { deleteFromPlaylist(); return; }
    if(id == 6) { newPlaylist(); return; }
    if(id == 7) { deleteMyPlaylist(); return; }
    if(id == 8) { addToNextLocal(otherStore.selectedItem, true); return; }
    if(id == 9) { addToNextLocal(otherStore.selectedItem, false); return; }
    if(id == 10) { windowApi.openLocalFolder(otherStore.selectedItem.dirPath);return; }
  }
  const createAndAdd = () => {
    if(newPlaylistTitle.value != '' || newPlaylistTitle.value != null || newPlaylistTitle.value != undefined) {
      let params = {
        name: newPlaylistTitle.value,
        privacy: (isPrivacy.value ? 10 : 0),
      }
      createPlaylist(params).then(result => {
        if(result.code == 200) {
          newPlaylistTitle.value = null
          isPrivacy.value = false
          if(justNewPlaylist.value) {
            document.getElementById('myPlaylist').click()
            otherStore.addPlaylistShow = false
            justNewPlaylist.value = false
            noticeOpen('添加成功', 2)
            return
          }
          addToMyPlaylist(result.id)
          updatePlaylistCache()
        } else {
          noticeOpen('创建歌单错误', 2)
        }
      })
    }
  }
  const createCancel = () => {
    if(justNewPlaylist.value) {
      otherStore.addPlaylistShow = false
      justNewPlaylist.value = false
      return
    }
    createActive.value = false
  }
  const addToMyPlaylist = (id) => {
      let params = {
        op: 'add',
        pid: id,
        tracks: otherStore.selectedItem.id
      }
      updatePlaylist(params).then(result => {
        if(result.status == 200) {
          updatePlaylistCache()
        }else {
          noticeOpen('添加至歌单错误', 2)
        }
      })
  }
</script>

<template>
  <div id="menu" class="context-menu">
    <div class="menu-container" v-show="otherStore.contextMenuShow">
      <div class="menu-item">
        <div class="item" @click="menuOpt(item.id)" v-for="(item, index) in otherStore.menuTree">{{item.name}}</div>
      </div>
      <div class="menu-style menu-style1">+</div>
      <div class="menu-style menu-style2">+</div>
      <div class="menu-style menu-style3">+</div>
      <div class="menu-style menu-style4">+</div>
      <div class="menu-style5">MENU</div>
    </div>
    <Transition name="add-fade">
      <div class="add-to-playlist" v-if="otherStore.addPlaylistShow" @click="otherStore.addPlaylistShow = false;createActive = false;newPlaylistTitle = '';">
        <div class="playlist-container" :class="{'playlist-container-newPlaylist': justNewPlaylist}" @click.stop>
          <span class="add-title">{{justNewPlaylist ? '添加歌单' : '添加到我的歌单'}}</span>
          <div class="my-playlist">
            <div class="create-playlist" v-show="!justNewPlaylist" :style="{background: createActive ? 'rgba(53, 53, 53, 0.7)' : 'none'}" @click="createActive = !createActive">
              <div class="list-img">
                <svg t="1671329712143" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2116" width="200" height="200"><path d="M939.939489 459.072557 562.339502 459.072557 562.339502 83.519182 462.055494 83.519182 462.055494 459.072557 84.455507 459.072557 84.455507 559.356564 462.055494 559.356564 462.055494 939.003164 562.339502 939.003164 562.339502 559.356564 939.939489 559.356564Z" fill="#ffffff" p-id="2117"></path></svg>
              </div>
              <span class="list-name">创建新歌单并添加</span>
            </div>
            <div class="create-playlist create-playlist-active" :class="{'create-playlist-active2': createActive || justNewPlaylist}">
              <input type="text" v-model="newPlaylistTitle" placeholder="请输入新歌单标题">
              <div class="checkbox" @click="isPrivacy = !isPrivacy">
                <div class="box" :class="{'box-selected': isPrivacy}">
                  <svg t="1671347600812" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4196" width="200" height="200"><path d="M155.644361 439.225533 376.468722 660.086733l486.86146-490.229161 95.379301 95.352695-585.574692 588.933183L65.289494 546.298154 155.644361 439.225533 155.644361 439.225533zM155.644361 439.225533" fill="#272636" p-id="4197"></path></svg>
                </div>
                <span class="box-label">设置为隐私歌单</span>
              </div>
              <div class="create-confirm" @click="createAndAdd()">完成</div>
              <div class="create-cancel" @click="createCancel()">取消</div>
            </div>
            <div class="list" @click="addToMyPlaylist(item.id)" v-show="!justNewPlaylist" v-for="(item, index) in libraryStore.playlistUserCreated">
              <div class="list-img">
                <img :src="(item.coverImgUrl || item.img1v1Url || item.picUrl || item.coverUrl) + '?param=150y150'" alt="">
              </div>
              <span class="list-name">{{(item.name ?? item.title)}}</span>
            </div>
          </div>
          <span class="add-style add-style1"></span>
          <span class="add-style add-style2"></span>
          <span class="add-style add-style3"></span>
          <span class="add-style add-style4"></span>
          <span class="add-style5">ADD</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
  .context-menu{
    position: absolute;
    overflow: hidden;
    .menu-container{
      padding: 18Px 0;
      position: relative;
      background-color: rgb(32, 32, 32);
      transform: translateY(-100%);
      animation: menu-container-in 0.2s cubic-bezier(.3,.79,.55,.99) forwards;
      @keyframes menu-container-in {
        0%{transform: translateY(-100%)}
        100%{transform: translateY(0)}
      }
      .menu-item{
        display: flex;
        flex-direction: column;
        .item{
          padding: 10Px 18Px;
          width: 100%;
          font: 13Px SourceHanSansCN-Bold;
          color: white;
          text-align: left;
          transition: 0.2s;
          z-index: 2;
          &:hover{
            cursor: pointer;
            background-color: rgba(53, 53, 53, 0.7);
          }
          &:active{
            transform: scale(0.95);
          }
          &:first-child{
            padding-top: 8Px;
          }
          &:last-child{
            padding-bottom: 8Px;
          }
        }
      }
      .menu-style{
        position: absolute;
        color: white;
      }
      .menu-style1{
        top: 0;
        left: 3Px;
      }
      .menu-style2{
        top: 0;
        right: 3Px;
      }
      .menu-style3{
        bottom: 0;
        right: 3Px;
      }
      .menu-style4{
        bottom: 0;
        left: 3Px;
      }
      .menu-style5{
        font: 35Px Gilroy-ExtraBold;
        color: rgb(57, 57, 57);
        position: absolute;
        top: 10Px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1;
      }
    }
    .add-to-playlist{
      width: 100%;
      height: 100%;
      position: fixed;
      top: 0;
      left: 0;
      background-color: rgba(0, 0, 0, 0.05);
      overflow: hidden;
      z-index: 9999;
      .playlist-container{
        width: 0;
        height: 0;
        background-color: rgb(15, 15, 15);
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        animation: playlist-container-in 0.6s 0.3s forwards;
        @keyframes playlist-container-in {
          0%{width: 0;height: 0;}
          50%{width: 300Px;height: 0;}
          100%{width: 300Px;height: 500Px;}
        }
        .add-title{
          display: inline-block;
          padding: 10Px 0;
          font: 16Px SourceHanSansCN-Bold;
          color: white;
          opacity: 0;
          animation: add-title-in 0.3s 0.5s forwards;
          @keyframes add-title-in {
            0%{opacity: 0;}
            100%{opacity: 1;}
          }
        }
        .my-playlist{
          width: 100%;
          height: calc(100% - 44Px);
          overflow: auto;
          &::-webkit-scrollbar{
            display: none;
          }
          .create-playlist, .list{
            padding: 10Px 22Px;
            width: 100%;
            display: flex;
            flex-direction: row;
            align-items: center;
            transition: 0.2s;
            &:hover{
              cursor: pointer;
              background-color: rgba(53, 53, 53, 0.7);
            }
            input{
              padding: 4Px 8Px;
              width: 100%;
              background-color: white;
              outline: none;
              border: 0.5Px solid white;
              background-color: transparent;
              color: white;
              font: 16Px SourceHanSansCN-Bold;
              &::-webkit-input-placeholder{
                font: 12Px Source Han Sans;
                font-weight: bold;
                color: rgb(180, 180, 180);
              }
            }
            .checkbox{
              margin-top: 4Px;
              display: flex;
              flex-direction: row;
              align-items: center;
              .box{
                margin-right: 5Px;
                width: 10Px;
                height: 10Px;
                border: 0.5Px solid white;
                position: relative;
                transition: 0.1s;
                svg{
                  width: 100%;
                  height: 100%;
                  position: absolute;
                  top: 0;
                  left: 0;
                }
              }
              .box-selected{
                background-color: white;
              }
              .box-label{
                font: 12Px SourceHanSansCN-Bold;
                color: white;
              }
            }
            .create-confirm, .create-cancel{
              padding: 4Px 0;
              margin-top: 20Px;
              width: 100%;
              font: 11Px SourceHanSansCN-Bold;
              color: white;
              text-align: center;
              border: 1Px solid white;
              &:hover{
                color: black;
                background-color: white;
              }
            }
            .create-cancel{
              margin-top: 10Px;
            }
            .list-img{
              margin-right: 15Px;
              width: 45Px;
              height: 45Px;
              border: 0.5Px solid rgb(69, 69, 69);
              svg{
                padding: 10Px;
                width: 100%;
                height: 100%;
              }
              img{
                width: 100%;
                height: 100%;
              }
            }
            .list-name{
              font: 14Px SourceHanSansCN-Bold;
              color: white;
            }
          }
          .create-playlist-active{
            padding: 0;
            height: 0;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            overflow: hidden;
            transition: 0.2s;
          }
          .create-playlist-active2{
            padding: 10Px 22Px;
            height: 160Px;
          }
        }
        .add-style{
          width: 9Px;
          height: 9Px;
          background-color: rgb(247, 247, 247);
          position: absolute;
          opacity: 0;
          animation: add-style-in 0.4s forwards;
          @keyframes add-style-in {
            0%{opacity: 0;}
            10%{opacity: 1;}
            20%{opacity: 0;}
            30%{opacity: 1;}
            40%{opacity: 0;}
            50%{opacity: 1;}
            60%{opacity: 0;}
            70%{opacity: 1;}
            80%{opacity: 0;}
            90%{opacity: 0;}
            100%{opacity: 1;}
          }
        }
        $position: -4Px;
        .add-style1{
          top: $position;
          left: $position;
        }
        .add-style2{
          top: $position;
          right: $position;
        }
        .add-style3{
          bottom: $position;
          right: $position;
        }
        .add-style4{
          bottom: $position;
          left: $position;
        }
        .add-style5{
          font: 55Px Gilroy-ExtraBold;
          color: rgb(37, 37, 37);
          position: absolute;
          top: 10Px;
          left: 20Px;
          z-index: -1;
          opacity: 0;
          animation: add-style5-in 0.3s 0.6s forwards;
          @keyframes add-style5-in {
            0%{opacity: 0;}
            100%{opacity: 1;}
          }
        }
      }
      .playlist-container-newPlaylist{
        animation: playlist-container-in-extra 0.6s 0.3s forwards;
        @keyframes playlist-container-in-extra {
          0%{width: 0;height: 0;}
          50%{width: 300Px;height: 0;}
          100%{width: 300Px;height: 240Px;}
        }
      }
    }
    .add-fade-enter-active {
      transition: 0.2s;
    }
    .add-fade-leave-active {
      transition: 0.1s;
    }

    .add-fade-enter-from,
    .add-fade-leave-to {
      opacity: 0;
    }
  }
</style>
