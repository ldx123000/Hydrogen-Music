<script setup>
  import { ref, computed } from 'vue'
  import { formatTime } from '../utils/time'
  import { useRouter } from 'vue-router'
  import { usePlayerStore } from '../store/playerStore';

  const router = useRouter()
  const props = defineProps(['albumlist', 'type'])
  const playerStore = usePlayerStore()

  //专辑日期
  const publishTime = computed(() => (time) => {
    return formatTime(time, "YYYY-MM-DD")
  })

  const checkAlbum = (albumId) => {
    playerStore.forbidLastRouter = true
    router.push('/mymusic/album/' + albumId)
  }
</script>

<template>
  <div class="library-content">
    <div class="library-album-list">
        <div class="list-item" @click="checkAlbum(item.id)" v-for="(item, index) in props.albumlist">
            <div class="item-title" :class="{'item-title-full': props.type == 'search'}">
                <div class="item-img">
                    <div class="album-back"></div>
                    <img v-lazy :src="item.blurPicUrl + '?param=150y150'" alt="">
                </div>
                <div class="item-info">
                    <span class="item-name">{{item.name}}</span>
                    <span class="item-num" v-if="props.type == 'search'">{{item.size}}首</span>
                </div>
            </div>
            <div class="item-other" v-if="props.type != 'search'">
                <span class="item-num">{{item.size}}首</span>
                <span class="item-time">{{publishTime(item.publishTime)}}</span>
            </div>
        </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .library-content{
    width: 100%;
    .library-album-list{
        width: 100%;
        height: 100%;
        .list-item{
            width: 100%;
            padding: 12Px 8Px;
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            transition: 0.2s;
            user-select: text;
            &:hover{
                cursor: pointer;
                background-color: rgba(0, 0, 0, 0.047);
            }
            .item-title{
                width: 60%;
                display: flex;
                flex-direction: row;
                align-items: center;
                .item-img{
                    width: 56Px;
                    height: 56Px;
                    border: 0.5Px solid rgba(0, 0, 0, 0.1);
                    box-shadow: 4Px 0 2Px 0 rgba(0, 0, 0, 0.05);
                    position: relative;
                    img{
                        width: 100%;
                        height: 100%;
                    }
                    .album-back{
                        width: 54Px;
                        height: 54Px;
                        background-color: black;
                        border-radius: 50%;
                        position: absolute;
                        z-index: -1;
                        top: 50%;
                        right: -9Px;
                        transform: translateY(-50%);
                    }
                }
                .item-info{
                    margin-left: 19Px;
                    width: calc(100% - 55Px - 19Px);
                    display: flex;
                    flex-direction: column;
                    span{
                        font: 14Px SourceHanSansCN-Bold;
                        font-weight: bold;
                        color: black;
                        text-align: left;
                        overflow: hidden;
                        display: -webkit-box;
                        -webkit-box-orient: vertical;
                        -webkit-line-clamp: 1;
                        word-break: break-all;
                    }
                    .item-num{
                        font: 12Px SourceHanSansCN-Bold;
                        color: rgb(122, 122, 122);
                    }
                }
            }
            .item-title-full{
                width: 100%;
            }
            .item-other{
                margin-left: 14Px;
                width: 40%;
                display: flex;
                flex-direction: row;
                justify-content: space-between;
                span{
                    font: 12Px SourceHanSansCN-Bold;
                    color: rgb(122, 122, 122);
                }
            }
        }
    }
  }
</style>