<script setup>
  import { onActivated, ref } from 'vue'
  import { useRouter } from 'vue-router';
  import { getNewAlbum } from '../api/album';
  import { getRecommendedArtists } from '../api/artist';
  import { getRecommendedSongList, getTopList } from '../api/playlist'
  import { useLibraryStore } from '../store/libraryStore'
  import { useLocalStore } from '../store/localStore';
  import { usePlayerStore } from '../store/playerStore';
  const libraryStore = useLibraryStore()
  const localStore = useLocalStore()
  const playerStore = usePlayerStore()
  const router = useRouter()
  //0为歌单,1为歌手,2为专辑,3为排行榜
  const props = defineProps(['recType'])
  const recType = ref(props.recType)
  const recTitle = ref('')
  const recTitleEN = ref('')
  const recommendationList = ref([{}])

  onActivated(() => {
    /**
     * 第一个参数为推荐歌手的国家,第二个为推荐歌单请求数量，第三个为最新专辑的国家，
     * 最后为当前列表的类型
     */
    loadData(1, 10, 'all', recType.value)
  })
  //设置标题
  const setTitle = (cn, en) => {
    recTitle.value = cn
    recTitleEN.value = en
  }
  //随机选取数据
  const shuffleData = (originData, limit, total) => {
    let indexs = [];
    while (indexs.length < limit) {
        let num = parseInt(Math.random() * total)
        if (!indexs.includes(num)) indexs.push(num)
        else indexs = [];
    }
    return originData.filter((item,index) => {
        return indexs.includes(index)
    });
  }

  //加载数据
  async function loadData(artistNation,limit,albumNation,recType) {
    if(recType == 0) {
        const listData = await getRecommendedSongList(limit)
        recommendationList.value = listData.result
        setTitle("推荐歌单", "RECOMMENDED SONG LIST")
    } else if(recType == 1) {
        const listData = await getRecommendedArtists(artistNation)
        setTitle("推荐歌手", "RECOMMENDED ARTISTS")
        recommendationList.value = shuffleData(listData.artists, 5, 50)
    } else if(recType == 2) {
        const listData = await getNewAlbum({
            limit: limit,
            area: albumNation
        })
        setTitle("最新专辑", "NEWEST ALBUM")
        recommendationList.value = listData.albums
    } else if(recType == 3) {
        const listData = await getTopList()
        setTitle("排行榜", "TOP LIST")
        //选取指定排行榜
        let indexs = [0,3,8,11,15]
        recommendationList.value = listData.list.filter((item,index) => {
            return indexs.includes(index)
        });;
    }
    // console.log(recommendationList.value)
  }

  const checkDetail = (id) => {
    libraryStore.libraryInfo = null
    localStore.currentSelectedSongs = null
    if(props.recType == 0) router.push('/mymusic/playlist/' + id)
    if(props.recType == 1) router.push('/mymusic/artist/' + id)
    if(props.recType == 2) router.push('/mymusic/album/' + id)
    if(props.recType == 3) router.push('/mymusic/playlist/' + id)
    playerStore.forbidLastRouter = true
  }
  const checkArtist = (artistId) => {
    router.push('/mymusic/artist/' + artistId)
    playerStore.forbidLastRouter = true
  }
</script>

<template>
  <div class="rec-list-item">
    <div class="item-header">
        <div class="header">
            <div class="header-title-en">{{recTitleEN}}</div>
            <div class="line"></div>
            <!-- <div class="header-more">查看更多</div> -->
        </div>
        <div class="header-title-cn">{{recTitle}}</div>
    </div>
    <div class="item-list">
        <div class="item" v-for="(item,index) in recommendationList">
            <div class="item-img" :class="recType == 1 ? 'item-img-circle' : 'item-img-sqaure'" @click="checkDetail(item.id)">
                <img :src="(item.coverImgUrl || item.img1v1Url || item.picUrl) + '?param=450y450'" alt="">
            </div>
            <div class="item-name" :class="{'item-name-center': recType == 1}">{{item.name}}</div>
            <div class="item-sub" @click="checkArtist(item.artist.id)" v-if="item.artist">{{ item.artist.name }}</div>
            <div class="item-sub" v-else>{{ item.updateFrequency}}</div>
        </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .rec-list-item{
    .item-header{
        .header{
            width: 100%;
            display: flex;
            flex-direction: row;
            align-items: center;
            .header-title-en{
                margin-right: 6px;
                padding: 1px 0 1px 2px;
                width: 20vw;
                background-color: black;
                font: 0.7vw Geometos;
                color: white;
                text-align: left;
                white-space: nowrap;
            }
            .line{
                width: 100%;
                height: 1px;
                background-color: rgb(176 176 176);
            }
            .header-more{
                width: 60px;
                text-align: right;
                font: 10px SourceHanSansCN-Bold;
                color: rgb(112 112 112);
                transition: 0.2s;
                &:hover{
                    cursor: pointer;
                    color: black;
                }
            }
        }
        .header-title-cn{
            text-align: left;
            font: 2.1vw SourceHanSansCN-Bold;
            line-height: 2.5vw;
            color: black;
        }
    }
    .item-list{
        margin-top: 13px;
        width: 100%;
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 3.4vw 2.5vw;
        .item{
            .item-img{
                // width: 168px;
                // height: 168px;
                overflow: hidden;
                transition: 0.2s;
                &:hover{
                    cursor: pointer;
                    box-shadow: 0 0 10Px 1Px rgba(0, 0, 0, 0.1);
                }
                img{
                    width: 100%;
                    height: 100%;
                    border: 1px solid rgba(0,0,0,0.04);
                    vertical-align: bottom;
                }
            }
            .item-img-sqaure{
                border-radius: 0;
            }
            .item-img-circle{
                border-radius: 50%;
                img{
                    border-radius: 50%;
                }
            }
            .item-name,.item-sub{
                margin-top: 5px;
                text-align: left;
                font: 1.5vw SourceHanSansCN-Bold;
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
            .item-sub{
                font: 1.2vw Source Han Sans;
                font-weight: normal;
                color: rgb(109, 109, 109);
                &:hover{
                    color: black;
                }
            }
        }
    }
  }
</style>