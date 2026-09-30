<script setup>
  import { useRouter } from 'vue-router'
  const router = useRouter()
  const props = defineProps(['classifyData'])

  const showFiles = (item) => {
    if(item.type == 'album') router.push('/mymusic/local/album/' + item.id)
    if(item.type == 'artist') router.push('/mymusic/local/artist/' + item.id)
  }
</script>

<template>
  <div class="classify-list">
    <div class="list-item" :class="{'list-item-selected': router.currentRoute.value.params.id == item.id}" @click="showFiles(item)" v-for="(item, index) in props.classifyData">
        <div class="item-img">
          <svg t="1671808192037" v-show="item.type == 'album'" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2941" width="200" height="200"><path d="M885.333333 256H138.666667a53.393333 53.393333 0 0 0-53.333334 53.333333v576a53.393333 53.393333 0 0 0 53.333334 53.333334h746.666666a53.393333 53.393333 0 0 0 53.333334-53.333334V309.333333a53.393333 53.393333 0 0 0-53.333334-53.333333z m10.666667 629.333333a10.666667 10.666667 0 0 1-10.666667 10.666667H138.666667a10.666667 10.666667 0 0 1-10.666667-10.666667V309.333333a10.666667 10.666667 0 0 1 10.666667-10.666666h746.666666a10.666667 10.666667 0 0 1 10.666667 10.666666zM659.5 556.266667l-202.666667-122.62A48 48 0 0 0 384 474.72v245.226667a47.886667 47.886667 0 0 0 72.846667 41.073333l202.666666-122.62a48 48 0 0 0 0-82.133333z m-22.086667 45.626666l-202.666666 122.62a5.333333 5.333333 0 0 1-8.093334-4.566666V474.72a5.073333 5.073333 0 0 1 2.713334-4.666667A5.333333 5.333333 0 0 1 432 469.333333a5.24 5.24 0 0 1 2.746667 0.813334l202.666666 122.62a5.333333 5.333333 0 0 1 0 9.12zM170.666667 106.666667a21.333333 21.333333 0 0 1 21.333333-21.333334h640a21.333333 21.333333 0 0 1 0 42.666667H192a21.333333 21.333333 0 0 1-21.333333-21.333333z m-42.666667 85.333333a21.333333 21.333333 0 0 1 21.333333-21.333333h725.333334a21.333333 21.333333 0 0 1 0 42.666666H149.333333a21.333333 21.333333 0 0 1-21.333333-21.333333z" fill="#000000" p-id="2942"></path></svg>
          <svg t="1671808507579" v-show="item.type == 'artist'" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5131" width="200" height="200"><path d="M512 1255.489906M888.810714 711.048571c-20.570058-48.713172-50.145912-92.514092-87.704177-130.072357s-81.359184-67.13412-130.072357-87.704177c-14.020388-5.935639-28.347791-11.052568-42.879872-15.35079 59.151709-38.274635 98.44973-104.897062 98.44973-180.525285 0-118.508095-96.402958-214.911053-214.911053-214.911053s-214.911053 96.402958-214.911053 214.911053c0 75.628223 39.298021 142.25065 98.44973 180.525285-14.532081 4.298221-28.859484 9.415151-42.879872 15.35079-48.713172 20.570058-92.514092 50.145912-130.072357 87.704177s-67.13412 81.359184-87.704177 130.072357c-21.388767 50.452928-32.134319 104.078353-32.134319 159.341195 0 14.122726 11.461923 25.584649 25.584649 25.584649s25.584649-11.461923 25.584649-25.584649c0-95.686588 37.251249-185.642215 104.897062-253.288027 67.645813-67.645813 157.601439-104.897062 253.288027-104.897062 95.686588 0 185.642215 37.251249 253.288027 104.897062s104.897062 157.601439 104.897062 253.288027c0 14.122726 11.461923 25.584649 25.584649 25.584649s25.584649-11.461923 25.584649-25.584649C920.945033 815.126924 910.097142 761.501499 888.810714 711.048571zM347.848891 297.293624c0-90.262642 73.479113-163.741755 163.741755-163.741755s163.741755 73.479113 163.741755 163.741755-73.479113 163.741755-163.741755 163.741755S347.848891 387.556266 347.848891 297.293624z" fill="#000000" p-id="5132"></path></svg>
        </div>
        <div class="item-other">
            <span class="item-name">{{item.name}}</span>
            <div class="item-info">
              <span class="item-size">{{item.songs.length}}首</span>
            </div>
        </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .classify-list{
    height: 100%;
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
          left: -100%;
          transition: 0.15s ease-out;
        }
        &:hover{
          cursor: pointer;
          &::after{
            left: 0;
          }
        }
        .item-img{
          margin-right: 10Px;
          padding: 5Px;
          width: 50Px;
          height: 50Px;
          img{
            width: 100%;
            height: 100%;
          }
          svg{
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
        left: 0;
      }
    }
  }
</style>