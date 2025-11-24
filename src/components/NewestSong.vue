<script setup>
  import { onActivated, ref } from 'vue'
  import { useRouter } from 'vue-router';
  import { getNewestSong } from '../api/song';
  import { addToNext, startMusic, pauseMusic } from '../utils/player';
  import { usePlayerStore } from '../store/playerStore';
  import { storeToRefs } from 'pinia';

  const router = useRouter()
  const playerStore = usePlayerStore()
  const { songId, playing } = storeToRefs(playerStore)
  const newestSongList = ref()

  onActivated(() => {
      //参数:limit限制数量，默认为10
      loadData(10)
  })
  async function loadData(limit) {
    const listData = await getNewestSong(limit)
    newestSongList.value = listData.result
  }
  const getImgUrl = (item) => {
    let img = item.picUrl || item.blurPicUrl
    return img.replace('http://', 'https://') + '?param=90y90'
  }
  const play = (song) => {
    let picUrl = {
        picUrl: song.picUrl
    }
    song.al = picUrl
    song.ar = song.song.artists
    addToNext(song, true)
  }
  const togglePlay = (song) => {
    if (songId.value === song.id) {
      if (playing.value) pauseMusic()
      else startMusic()
      return
    }
    play(song)
  }
  const checkArtist = (artistId) => {
    router.push('/mymusic/artist/' + artistId)
    playerStore.forbidLastRouter = true
  }
</script>

<template>
  <div class="newest-song">
    <div class="newest-song-title">最新歌曲</div>
    <div class="song-list">
        <div class="list-item" @dblclick="play(item)" v-for="(item, index) in newestSongList">
            <div class="item-info">
                <div class="song-img">
                    <img v-lazy :src="getImgUrl(item)" alt="">
                </div>
                <div class="song-other">
                    <div class="song-name">{{item.name}}</div>
                    <div class="song-author">
                        <span @click="checkArtist(singer.id)" v-for="(singer, index) in item.song.artists">{{singer.name}}{{index == item.song.artists.length -1 ? '' : '/'}}</span>
                    </div>
                </div>
            </div>
            <button class="item-play" @click.stop="togglePlay(item)" :aria-label="(songId === item.id && playing) ? '暂停' : '播放'">
              <svg v-if="songId === item.id && playing" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
                <rect x="256" y="200" width="160" height="624" rx="32" fill="currentColor" />
                <rect x="608" y="200" width="160" height="624" rx="32" fill="currentColor" />
              </svg>
              <svg v-else viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
                <path d="M864.5 516.2c-2.4-4.1-6.2-6.9-10.4-8.3L286.4 159c-8.9-5-20.3-2-25.5 6.6-2.1 3.6-2.8 7.5-2.3 11.3v697.5c-0.5 3.8 0.2 7.8 2.3 11.3 5.2 8.7 16.6 11.6 25.5 6.6l567.7-349c4.2-1.3 8-4.2 10.4-8.3 1.7-3 2.5-6.3 2.4-9.5 0.1-3-0.7-6.3-2.4-9.3z m-569-308.8l517.6 318.3L295.5 844V207.4z" fill="currentColor"></path>
              </svg>
            </button>
        </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .newest-song{
    width: 24.4vw;
    height: 13.7vw;
    display: flex;
    flex-direction: column;
    justify-content: start;
    position: relative;
    .newest-song-title{
        margin-bottom: 1vw;
        font: 1.5vw SourceHanSansCN-Bold;
        color: black;
        text-align: left;
        position: absolute;
        top: -2.8vw;
        left: 0;
    }
    .song-list{
        display: flex;
        flex-direction: column;
        overflow: auto;
        &::-webkit-scrollbar{
            display: none;
        }
        .list-item{
            padding-bottom: 0.8vw;
            margin-bottom: 0.8vw;
            border: {
                bottom: 1px solid black;
            };
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            &:hover{
                cursor: pointer;
            }
            .item-info{
                display: flex;
                flex-direction: row;
                .song-img{
                    width: 3.45vw;
                    height: 3.45vw;
                    margin-right: 1vw;
                    img{
                        width: 100%;
                        height: 100%;
                    }
                }
                .song-other{
                    width: 17vw;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    text-align: left;
                    .song-name{
                        font: 1.2vw SourceHanSansCN-Bold;
                        color: black;
                        text-align: left;
                        overflow: hidden;
                        display: -webkit-box;
                        -webkit-box-orient: vertical;
                        -webkit-line-clamp: 1;
                        word-break: break-all;
                    }
                    .song-author{
                        font: 1vw SourceHanSansCN-Bold;
                        color: rgb(131, 131, 131);
                        span{
                            transition: 0.2s;
                            &:hover{
                                cursor: pointer;
                                color: black;
                            }
                        }
                    }
                }
            }
            .item-play{
                width: 2vw;
                height: 2vw;
                padding: 0;
                border: none;
                outline: none;
                background: transparent !important;
                -webkit-appearance: none;
                appearance: none;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                color: inherit;
                transition: 0.2s;
                svg{
                    width: 100%;
                    height: 100%;
                }
                &:hover{
                    cursor: pointer;
                }
                &:active{
                    transform: scale(0.8);
                }
            }
        }
        .list-item:last-child{
            padding-bottom: 0;
            margin-bottom: 0;
            border: none;
        }
    }
  }
</style>
