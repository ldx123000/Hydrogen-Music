<script setup>
  import { ref, onActivated } from 'vue'
  import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router';
  import { useOtherStore } from '../store/otherStore';
  import { storeToRefs } from 'pinia';
  import LibrarySongList from '../components/LibrarySongList.vue';
  import LibraryAlbumList from '../components/LibraryAlbumList.vue';
  import SearchResultList from '../components/SearchResultList.vue';
  
  const otherStore = useOtherStore()
  const { getSearchInfo } = otherStore
  const { searchResult } = storeToRefs(otherStore)
  const router = useRouter()
  const scrollTop = ref(null)
  const searchScroll = ref()

  const routerChange = (operation) => {
    if(operation) router.forward()
    else router.back()
  }
  onActivated(() => {
    searchScroll.value.scrollTop = scrollTop.value
  })
  onBeforeRouteUpdate((to, from, next) => {
      getSearchInfo(to.query.keywords)
      next()
  })
  onBeforeRouteLeave((to, from, next) => {
    scrollTop.value = searchScroll.value.scrollTop
    next()
  })
</script>

<template>
  <div class="search-page">
    <div class="view-control">
      <svg t="1669039513804" @click="routerChange(0)" class="router-last" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1053" width="200" height="200"><path d="M716.608 1010.112L218.88 512.384 717.376 13.888l45.248 45.248-453.248 453.248 452.48 452.48z" p-id="1054"></path></svg>
      <svg t="1669039531646" @click="routerChange(1)" class="router-next" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1207" width="200" height="200"><path d="M264.896 1010.112l497.728-497.728L264.128 13.888 218.88 59.136l453.248 453.248-452.48 452.48z" p-id="1208"></path></svg>
      <span class="search-title">搜索内容：{{router.currentRoute.value.query.keywords}}</span>
    </div>
    <div class="search-container" ref="searchScroll">
      <div class="search-classify">
        <div class="classify-item">
          <div class="classify-title">歌曲</div>
          <div class="classify-content">
            <LibrarySongList :songlist="searchResult.searchSongs" type="search"></LibrarySongList>
          </div>
        </div>
        <div class="classify-item">
          <div class="classify-title">专辑</div>
          <div class="classify-content">
            <LibraryAlbumList :albumlist="searchResult.searchAlbums" type="search"></LibraryAlbumList>
          </div>
        </div>
      </div>
      <div class="search-classify-other">
        <div class="classify-item-other">
          <div class="classify-title">歌手</div>
          <div class="content">
            <SearchResultList :listdata="searchResult.searchArtists" type="artist"></SearchResultList>
          </div>
        </div>
        <div class="classify-item-other">
          <div class="classify-title">歌单</div>
          <div class="content">
            <SearchResultList :listdata="searchResult.searchPlaylists" type="playlist"></SearchResultList>
          </div>
        </div>
        <div class="classify-item-other">
          <div class="classify-title">视频</div>
          <div class="content">
            <SearchResultList :listdata="searchResult.searchMvs" type="mv"></SearchResultList>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .search-page{
    width: 100%;
    height: 100%;
    .view-control{
      margin-bottom: 15Px;
      margin-left: -8Px;
      height: 32Px;
      display: flex;
      flex-direction: row;
      align-items: center;
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
      .search-title{
        font: 17Px SourceHanSansCN-Bold;
        color: black;
      }
      .router-last, .router-next{
        margin-right: 10Px;
      }
    }
    .search-container{
      width: 100%;
      height: calc(100% - 47Px);
      overflow: auto;
      &::-webkit-scrollbar{
        display: none;
      }
      .search-classify, .search-classify-other{
        width: 100%;
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        .classify-item{
          height: 460Px;
          &:first-child{
            width: calc(70% - 20Px);

          }
          &:last-child{
            width: 30%;
          }
          .classify-title{
            font: 20Px SourceHanSansCN-Bold;
            color: black;
            text-align: left;
          }
          .classify-content{
            height: calc(100% - 30Px);
            overflow: auto;
            &::-webkit-scrollbar{
              display: none;
            }
          }
        }
      }
      .search-classify-other{
        display: flex;
        flex-direction: column;
        &:last-child{
          margin-bottom: 150Px;
        }
        .classify-item-other{
          margin-top: 15Px;
          .classify-title{
            font: 20Px SourceHanSansCN-Bold;
            color: black;
            text-align: left;
          }
          .classify-content{
            height: calc(100% - 30Px);
            overflow: auto;
            &::-webkit-scrollbar{
              display: none;
            }
          }
        }
      }
    }
  }
</style>