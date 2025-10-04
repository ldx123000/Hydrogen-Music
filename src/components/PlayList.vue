<script setup>
  import { RecycleScroller } from 'vue-virtual-scroller'
  import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
  import { pauseMusic } from '../utils/player';
  import { addSong, setShuffledList } from '../utils/player'
  import { useRouter } from 'vue-router';
  import { usePlayerStore } from '../store/playerStore'
  import { storeToRefs } from 'pinia'
  const router = useRouter()
  const playerStore = usePlayerStore()
  const { playing, progress, playMode, currentMusic, currentIndex, listInfo, songList, shuffledList, shuffleIndex, songId, widgetState, playlistWidgetShow, lyricShow } = storeToRefs(playerStore)

  const clearPlaylist = () => {
    playlistWidgetShow.value = false
    pauseMusic()
    const clearMusic = setTimeout(() => {
      songList.value = null
      listInfo.value = null
      songId.value = null
      shuffledList.value = null
      currentIndex.value = 0
      shuffleIndex.value = 0
      currentMusic.value.unload()
      currentMusic.value = null
      progress.value = 0
      if(!widgetState.value) {
        widgetState.value = true;
        lyricShow.value = false
      }
      windowApi.setWindowTile('Hydrogen Music')
      clearTimeout(clearMusic)
    }, 300);
  }

  const checkArtist = (artistId) => {
    if(songList.value[currentIndex.value].type != 'local') {
      router.push('/mymusic/artist/' + artistId)
      playerStore.forbidLastRouter = true
      if(!widgetState.value) {widgetState.value = true;playlistWidgetShow.value = false;lyricShow.value = false}
    }
  }

  const play = (id, index) => {
    addSong(id, index, true)
  }

  const delCurrentSong = async (index, id) => {
    //·删除的是当前播放歌曲之前的
    if(index < currentIndex.value) {
      songList.value.splice(index, 1)
      currentIndex.value--
      if(playMode.value == 3) setShuffledList()
      return
    }
    //·删除的是当前播放歌曲之后的
    if(index > currentIndex.value) {
      songList.value.splice(index, 1)
      if(playMode.value == 3) setShuffledList()
      return
    }
    //·删除的是当前播放歌曲
    if(index == currentIndex.value) {
      let id = null
      let curIndex = null
      //·如果是最后一首
      if(index == songList.value.length - 1) {
        //且只有一首歌
        if(songList.value.length == 1) {clearPlaylist();return}
        //且不只有一首歌
        curIndex = index - 1
        id = songList.value[curIndex].id
        addSong(id, curIndex, playing.value)
        songList.value.splice(index, 1)
        if(playMode.value == 3) setShuffledList()
      } else {
      //·如果不是最后一首
        curIndex = currentIndex.value + 1
        id = songList.value[curIndex].id
        addSong(id, curIndex, playing.value)
        songList.value.splice(index, 1)
        currentIndex.value--
        if(playMode.value == 3) setShuffledList()
      }
    }
  }
  const getPositon = () => {
    document.getElementsByClassName('playlist-widget-item')[0].scrollTo({top: currentIndex.value * 37,behavior: 'smooth'})
    document.getElementsByClassName('playlist-widget-item')[1].scrollTo({top: currentIndex.value * 37,behavior: 'smooth'})
  }
</script>

<template>
    <div class="playlist-widget">
      <div class="playlist-widget-header">
        <div class="playlist-widget-info">
          <span class="info-title">当前播放</span>
          <span class="info-num">({{songList.length}})</span>
        </div>
        <div>
          <svg t="1676113510483" @click="getPositon()" class="playlist-widget-position" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2631" width="200" height="200"><path d="M927.282215 479.83544l-83.4629 0c-15.068184-158.75777-141.389194-285.078781-300.146964-300.146964L543.67235 95.835695c0-17.622356-14.285355-31.907711-31.907711-31.907711-17.622356 0-31.907711 14.285355-31.907711 31.907711l0 83.85278c-158.75777 15.068184-285.078781 141.389194-300.146964 300.146964l-83.826174 0c-17.622356 0-31.907711 14.285355-31.907711 31.907711 0 17.622356 14.285355 31.907711 31.907711 31.907711l83.826174 0c15.068184 158.75777 141.389194 285.078781 300.146964 300.146964l0 83.946924c0 17.622356 14.285355 31.907711 31.907711 31.907711 17.622356 0 31.907711-14.285355 31.907711-31.907711l0-83.946924c158.75777-15.068184 285.078781-141.389194 300.146964-300.146964l83.4629 0c17.622356 0 31.907711-14.285355 31.907711-31.907711C959.189925 494.120794 944.904571 479.83544 927.282215 479.83544zM511.76464 793.112446c-155.396209 0-281.369296-125.973086-281.369296-281.369296s125.973086-281.369296 281.369296-281.369296 281.369296 125.973086 281.369296 281.369296S667.159826 793.112446 511.76464 793.112446z" fill="#000000" p-id="2632"></path><path d="M511.76464 511.74315m-69.616544 0a68.031 68.031 0 1 0 139.233088 0 68.031 68.031 0 1 0-139.233088 0Z" fill="#000000" p-id="2633"></path></svg>
          <svg t="1670563159799" @click="clearPlaylist()" class="playlist-widget-delete" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4514" width="200" height="200"><path d="M224.561403 320 224.561403 896 778.105263 896 778.105263 320 712.982456 320 712.982456 832 289.68421 832 289.68421 320 224.561403 320 224.561403 320ZM387.368421 320.664062 452.491228 320.664062 452.491228 768.664062 387.368421 768.664062 387.368421 320.664062 387.368421 320.664062ZM550.175438 320.664062 615.298246 320.664062 615.298246 768.664062 550.175438 768.664062 550.175438 320.664062 550.175438 320.664062ZM387.368421 192 192 192 192 256 810.666664 256 810.666664 192 647.859649 192 647.859649 128 387.368421 128 387.368421 192 387.368421 192Z" p-id="4515"></path></svg>
        </div>
      </div>
      <div class="line"></div>
      <RecycleScroller
        class="playlist-widget-item"
        :items="songList.slice(0, songList.length + 1)"
        :item-size="36"
        key-field="id"
        v-slot="{ item, index }"
      >
        <div class="list-item" :class="{'list-item-playing': songId == item.id, 'list-item-disabled': item.playable !== undefined && !item.playable }" @dblclick="play(item.id, index)">
          <div class="item-info">
            <div class="playing-eq" v-show="(songId == item.id)" :class="{ 'is-paused': !playing }" aria-hidden="true">
              <span class="bar"></span>
              <span class="bar"></span>
              <span class="bar"></span>
              <span class="bar"></span>
            </div>
            <span class="item-name">{{item.name  || item.localName}}</span>
            <span class="item-separator"> - </span>
            <span class="item-author" @dblclick.stop @click="checkArtist(singer.id)" v-for="(singer, index) in item.ar">{{singer.name}}{{index == item.ar.length -1 ? '' : '/'}}</span>
          </div>
          <svg t="1670569532229" @dblclick.stop @click="delCurrentSong(index, item.id)" class="item-delete" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2597" width="200" height="200"><path d="M558.933333 529.066667l285.866667 285.866666-29.866667 29.866667-285.866666-285.866667-285.866667 285.866667-29.866667-29.866667 285.866667-285.866666L213.333333 243.2l29.866667-29.866667 285.866667 285.866667L814.933333 213.333333l29.866667 29.866667-285.866667 285.866667z" fill="#444444" p-id="2598"></path></svg>
        </div>
      </RecycleScroller>
    </div>
</template>

<style scoped lang="scss">
  .playlist-widget{
    width: 310Px;
    height: 0;
    background-color: rgba(225, 240, 240, 1);
    transition: 0.3s cubic-bezier(.19,.8,.49,.99);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    .playlist-widget-header{
      margin-top: 4px;
      padding: 8Px 12Px 0 12Px;
      width: 100%;
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      .playlist-widget-info{
        .info-title{
          font: 16Px SourceHanSansCN-Bold;
          color: black;
        }
        .info-num{
          font: 12Px SourceHanSansCN-Bold;
          color: rgb(118, 118, 118);
        }
      }
      .playlist-widget-position, .playlist-widget-delete{
        margin-left: 14px;
        width: 20Px;
        height: 20Px;
        transition: 0.2s;
        &:hover{
          cursor: pointer;
          opacity: 0.8;
        }
        &:active{
          transform: scale(0.9);
        }
      }
    }
    .line{
      margin: 8Px 0;
      width: 92%;
      height: 0.5Px;
      background-color: black;
    }
    .playlist-widget-item{
      width: 100%;
      height: 100%;
      overflow: auto;
      display: flex;
      flex-direction: column;
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
        width: 100%;
        padding: 8Px 12Px;
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        transition: 0.2s;
        &:hover{
            background-color: rgba(0, 0, 0, 0.045);
        }
        .item-info{
          width: 240Px;
          text-align: left;
          display: flex;
          align-items: center;
          white-space: nowrap;
          overflow: hidden;
          gap: 6Px;
          svg{
            margin-right: 6Px;
            width: 14Px;
            height: 14Px;
            flex-shrink: 0;
          }
          .playing-eq{
            margin-right: 6Px;
            width: 14Px;
            height: 14Px;
            flex-shrink: 0;
          }
          .item-name{
            font: 14Px SourceHanSansCN-Bold;
            color: black;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .item-separator{
            font: 12Px SourceHanSansCN-Bold;
            color: rgb(169, 169, 169);
            flex-shrink: 0;
          }
          .item-author{
            font: 12Px SourceHanSansCN-Bold;
            color: rgb(169, 169, 169);
            transition: 0.2s;
            overflow: hidden;
            text-overflow: ellipsis;
            &:hover{
              cursor: pointer;
              color: black;
            }
          }
        }
        .item-delete{
          width: 20Px;
          height: 20px;
          &:hover{
            cursor: pointer;
          }
        }
      }
      .list-item-playing{
        background-color: rgba(0, 0, 0, 0.045);
      }
      .list-item-disabled{
          opacity: 0.8;
          .item-info {
            .item-name, .item-author{
              color: rgba(156, 156, 156, 0.7);
            }
          }
      }
    }
  }
</style>
