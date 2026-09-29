<script setup>
  import { useRouter } from 'vue-router';
  import { usePlayerStore } from '../store/playerStore';
  import { useOtherStore } from '../store/otherStore';

  const router = useRouter()
  const playerStore = usePlayerStore()
  const otherStore = useOtherStore()
  const props = defineProps(['listdata', 'type'])
  const checkDetail = (id) => {
    playerStore.forbidLastRouter = true
    if(props.type == 'playlist') router.push('/mymusic/playlist/' + id)
    if(props.type == 'artist') router.push('/mymusic/artist/' + id)
    if(props.type == 'mv') otherStore.getMvData(id)
  }
</script>

<template>
  <div class="result-list">
    <div class="item-list">
        <div class="item" v-for="(item,index) in listdata">
            <div class="item-img" :class="type == 'artist' ? 'item-img-circle' : 'item-img-sqaure'" @click="checkDetail(item.id)">
                <img v-lazy :src="(item.coverImgUrl || item.img1v1Url || item.picUrl || item.cover) + '?param=300y300'" alt="">
            </div>
            <div class="item-name" :class="{'item-name-center': type == 'artist'}">{{item.name}}</div>
        </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .result-list{
    width: 100%;
    .item-list{
        margin-top: 13px;
        width: 100%;
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 34px 25px;
        .item{
            .item-img{
                img{
                    width: 100%;
                    height: 100%;
                    border: 1px solid rgba(0,0,0,0.04);
                    vertical-align: bottom;
                    transition: 0.2s;
                    &:hover{
                        cursor: pointer;
                        box-shadow: 0 0 10Px 1Px rgba(0, 0, 0, 0.1);
                    }
                }
            }
            .item-img-sqaure{
                border-radius: 0;
            }
            .item-img-circle{
                border-radius: 50%;
                img{
                    width: 80%;
                    widows: 80%;
                    border-radius: 50%;
                }
            }
            .item-name,.item-sub{
                margin-top: 5px;
                text-align: left;
                font: 14px SourceHanSansCN-Bold;
                font-weight: bold;
                color: black;
                overflow: hidden;
                display: -webkit-box;
                -webkit-box-orient:vertical;
                -webkit-line-clamp: 2;
                word-break: break-all;
                transition: 0.2s;
                &:hover{
                    cursor: pointer;
                    color: rgba(43, 43, 43, 1);
                }
            }
            .item-name-center{
                margin-top: 15px;
                text-align: center;
            }
        }
    }
  }
</style>