<script setup>
import { ref, computed, onMounted } from 'vue'
import { onBeforeRouteUpdate, useRouter } from 'vue-router'
import { getDjDetail, getDjPrograms } from '../api/dj'
import { usePlayerStore } from '../store/playerStore'
import { playAll } from '../utils/player'
import LibrarySongList from './LibrarySongList.vue'

const router = useRouter()
const playerStore = usePlayerStore()

const loading = ref(false)
const error = ref(null)
const radioInfo = ref(null)
const programSongs = ref([])
// 介绍弹层开关，保持与歌单详情一致
const introduceDetailShow = ref(false)
const introduceDetailShowDelay = ref(false)

const rid = computed(() => router.currentRoute.value.params.id)

const coverImg = computed(() => {
  const url = radioInfo.value?.picUrl || radioInfo.value?.intervenePicUrl || ''
  return url ? `${url}?param=300y300` : ''
})

const totalCount = computed(() => radioInfo.value?.programCount || 0)
const djName = computed(() => radioInfo.value?.dj?.nickname || '')
const radioName = computed(() => radioInfo.value?.name || '电台')
const radioDesc = computed(() => radioInfo.value?.desc || radioInfo.value?.rcmdtext || '暂无描述')
const subCount = computed(() => radioInfo.value?.subCount || 0)

function convertPrograms(arr) {
  return arr.map(p => {
    const mainSong = p?.mainSong || {}
    const al = mainSong.album || mainSong.al || {}
    // 保底封面：优先节目封面
    const cover = p.coverUrl || p.blurCoverUrl || al.picUrl || null
    if (!mainSong.al) mainSong.al = {}
    if (!mainSong.al.picUrl && cover) mainSong.al.picUrl = cover
    return {
      id: mainSong.id,
      name: mainSong.name,
      ar: mainSong.artists || mainSong.ar || [],
      al: mainSong.album || mainSong.al || {},
      dt: mainSong.duration || mainSong.dt || 0,
      duration: mainSong.duration || mainSong.dt || 0,
      type: 'dj',
      playable: true,
      coverUrl: cover,
      programId: p.id,
      programName: p.name,
      programDesc: p.description || p.desc || ''
    }
  })
}

// 一次性加载全部节目（取消懒加载）
async function loadAllPrograms(radioId) {
  programSongs.value = []
  const pageLimit = 100
  let offset = 0
  // 以 programCount 为上限，逐页取齐
  while (true) {
    const res = await getDjPrograms(Number(radioId), { limit: pageLimit, offset })
    const arr = res?.programs || res?.data || []
    if (!arr.length) break
    programSongs.value = programSongs.value.concat(convertPrograms(arr))
    offset += arr.length
    if (arr.length < pageLimit) break
    if (radioInfo.value?.programCount && programSongs.value.length >= radioInfo.value.programCount) break
  }
}

async function loadDetailFor(radioId) {
  if (!radioId) return
  loading.value = true
  error.value = null
  radioInfo.value = null
  programSongs.value = []
  try {
    const requestRid = String(radioId)
    const detail = await getDjDetail(Number(requestRid))
    radioInfo.value = detail?.data || detail?.djRadio || detail || null
    await loadAllPrograms(requestRid)
  } catch (e) {
    error.value = '加载电台详情失败'
  } finally {
    loading.value = false
  }
}

onMounted(async () => { await loadDetailFor(rid.value) })
onBeforeRouteUpdate(async (to, from, next) => {
  await loadDetailFor(to.params.id)
  next()
  const scroller = document.getElementById('libraryScroll')
  if (scroller) scroller.scrollTop = 0
})

// 播放全部节目（从第一期开始）
const onPlayAll = () => {
  if (!programSongs.value?.length) return
  // 如果尚未加载完，先把剩余节目全部取齐，再一次性加入播放列表
  const ensureAll = async () => {
    if (finished.value) return programSongs.value
    let list = []
    // 从当前 offset 继续拉取到结束
    let offset = currentOffset
    while (!finished.value) {
      const res = await getDjPrograms(rid.value, { limit: pageSize, offset })
      const arr = res?.programs || res?.data || []
      if (!arr.length) { finished.value = true; break }
      list = list.concat(convertPrograms(arr))
      offset += arr.length
      if (arr.length < pageSize) { finished.value = true; break }
      if (radioInfo.value?.programCount && (programSongs.value.length + list.length) >= radioInfo.value.programCount) { finished.value = true; break }
    }
    // 返回汇总后的完整数组（已包含首屏）
    return programSongs.value.concat(list)
  }
  ensureAll().then(fullList => {
    playAll('dj', fullList)
    playerStore.listInfo = { id: rid.value, type: 'dj', name: radioName.value }
  })
}

// 介绍弹层动画钩子（与歌单详情保持一致）
const onAfterEnter = () => (introduceDetailShowDelay.value = true)
const onAfterLeave = () => (introduceDetailShowDelay.value = false)
</script>

<script>
export default { name: 'RadioDetail' }
</script>

<template>
  <div class="library-detail">
    <div class="view-control">
      <svg t="1669039513804" @click="router.back()" class="router-last" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1053" width="200" height="200"><path d="M716.608 1010.112L218.88 512.384 717.376 13.888l45.248 45.248-453.248 453.248 452.48 452.48z" p-id="1054"></path></svg>
    </div>
    <div class="library-introduce">
      <div class="introduce">
        <div class="introduce-img">
          <img :src="coverImg" alt="" />
        </div>
        <div class="introduce-info">
          <span class="introduce-name">{{ radioName }}</span>
          <div class="info-other">
            <div class="introduce-author">
              <span class="author" v-if="djName">{{ djName }}</span>
            </div>
            <span class="introduce-num">共 {{ totalCount }} 期</span>
            <div class="library-operation">
              <div class="operation-download" @click="onPlayAll()">
                <svg t="1668421583939" class="playall-icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6964" width="200" height="200"><path d="M864.5 516.2c-2.4-4.1-6.2-6.9-10.4-8.3L286.4 159c-8.9-5-20.3-2-25.5 6.6-2.1 3.6-2.8 7.5-2.3 11.3v697.5c-0.5 3.8 0.2 7.8 2.3 11.3 5.2 8.7 16.6 11.6 25.5 6.6l567.7-349c4.2-1.3 8-4.2 10.4-8.3 1.7-3 2.5-6.3 2.4-9.5 0.1-3-0.7-6.3-2.4-9.3z m-569-308.8l517.6 318.3L295.5 844V207.4z" p-id="6965"></path></svg>
                <span>播放全部</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="introduce-other">
        <div class="introduce-1">{{ subCount }} 人收藏</div>
        <div class="introduce-2" @click="introduceDetailShow = !introduceDetailShow">查看详情</div>
      </div>
      <transition name="metro" @after-enter="onAfterEnter" @after-leave="onAfterLeave">
        <div class="introduce-detail-text" :class="{'introduce-detail-text-active': introduceDetailShowDelay}" v-if="introduceDetailShow">
          <div class="detail-text">
            <p class="text">{{ radioDesc }}</p>
          </div>
          <div class="text-close" @click="introduceDetailShow = false">
            <svg t="1671966797621" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1965" width="200" height="200"><path d="M576 512l277.333333 277.333333-64 64-277.333333-277.333333L234.666667 853.333333 170.666667 789.333333l277.333333-277.333333L170.666667 234.666667 234.666667 170.666667l277.333333 277.333333L789.333333 170.666667 853.333333 234.666667 576 512z" fill="#ffffff" p-id="1966"></path></svg>
          </div>
          <span class="dialog-style dialog-style1"></span>
          <span class="dialog-style dialog-style2"></span>
          <span class="dialog-style dialog-style3"></span>
          <span class="dialog-style dialog-style4"></span>
        </div>
      </transition>
    </div>

    <div class="library-option">
      <div class="library-playall">
        <div class="playall" @click="onPlayAll()">
          <svg t="1668421583939" class="playall-icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6964" width="200" height="200"><path d="M864.5 516.2c-2.4-4.1-6.2-6.9-10.4-8.3L286.4 159c-8.9-5-20.3-2-25.5 6.6-2.1 3.6-2.8 7.5-2.3 11.3v697.5c-0.5 3.8 0.2 7.8 2.3 11.3 5.2 8.7 16.6 11.6 25.5 6.6l567.7-349c4.2-1.3 8-4.2 10.4-8.3 1.7-3 2.5-6.3 2.4-9.5 0.1-3-0.7-6.3-2.4-9.3z m-569-308.8l517.6 318.3L295.5 844V207.4z" p-id="6965"></path></svg>
          <span>播放全部</span>
        </div>
        <div class="playall-line"></div>
        <span class="playall-en">PLAYALL</span>
      </div>
    </div>

    <div class="library-content" :class="{'library-content3': true}">
      <div v-if="loading" class="status">正在加载...</div>
      <div v-else-if="error" class="status">{{ error }}</div>
      <LibrarySongList v-else :songlist="programSongs" :key="`dj-${rid}`" />
    </div>
  </div>
</template>

<style scoped lang="scss">
  .library-detail{
    width: 100%;
    height: calc(100% - 22Px);
    display: flex;
    flex-direction: column;
    .view-control{
      margin-left: -8Px;
      height: 32Px;
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
      .router-last{
        margin-right: 20Px;
      }
    }
    .library-introduce{
      width: 100%;
      display: flex;
      position: relative;
      justify-content: space-between;
      .introduce{
        width: calc(100% - 130Px);
        display: flex;
        flex-direction: row;
        .introduce-img{
          width: 120Px;
          height: 120Px;
          border: 0.5Px solid rgb(233, 233, 233);
          img{
            width: 100%;
            height: 100%;
          }
        }
        .introduce-info{
          width: calc(100% - 160Px);
          margin-left: 16Px; /* 与封面拉开水平间距，模仿歌单 */
          display: flex;
          flex-direction: column;
          justify-content: space-around;
          align-items: flex-start;
          text-align: left;
          user-select: text;
          .introduce-name{
            width: 90%;
            font:  22Px Source Han Sans;
            font-weight: bold;
            color: black;
            overflow: hidden;
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            word-break: break-all;
          }
          .info-other{
            display: flex;
            flex-direction: column;
            margin-top: 6Px; /* 标题与信息区之间留白，模仿歌单 */
            span{
              font: 11Px SourceHanSansCN-Bold;
            }
            .introduce-author{
              width: 100%;
              font-size: 12Px;
              color: black;
              transition: 0.2s;
              overflow: hidden;
              display: -webkit-box;
              -webkit-box-orient: vertical;
              -webkit-line-clamp: 1;
              word-break: break-all;
            }
            .introduce-num{
              color: rgb(122, 122, 122);
            }
            .library-operation{
              margin-top: 10Px;
              display: flex;
              flex-direction: row;
              div{
                margin-right: 20Px;
                display: flex;
                flex-direction: row;
                align-items: center;
                transition: 0.2s;
                &:hover{
                  cursor: pointer;
                  opacity: 0.6;
                }
                svg{
                  width: 16Px;
                  height: 16Px;
                }
                span{
                  margin-left: 5Px;
                  font-size: 15Px;
                  color: black;
                }
              }
            }
          }
        }
      }
      .introduce-other{
        width: 130Px;
        div{
          width: 100%;
          height: 16Px;
        }
        .introduce-1{
          border: 1Px solid black;
          font: 10Px SourceHanSansCN-Bold;
          color: black;
        }
        .introduce-2{
          margin-top: 6Px;
          background-color: black;
          font: 10Px SourceHanSansCN-Bold;
          color: white;
          transition: 0.2s;
          &:hover{
            cursor: pointer;
            background-color: rgb(40, 40, 40);
          }
        }
      }
      .introduce-detail-text{
        width: 0;
        height: 0;
        /* Frosted glass panel - Light mode wants deeper (darker) */
        background: rgba(0, 0, 0, 0.66);
        -webkit-backdrop-filter: blur(18Px) saturate(120%);
        backdrop-filter: blur(18Px) saturate(120%);
        border: 1Px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 10Px 30Px rgba(0, 0, 0, 0.45);
        position: fixed;
        z-index: 998;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        &-active {
          width: 700Px;height: 400Px;padding: 30PX 60Px;
        }
        .detail-text{
          width: 100%;
          height: 100%;
          overflow: auto;
          &::-webkit-scrollbar{
            display: none;
          }
          .text{
            margin: 0;
            font: 14Px Source Han Sans;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.92);
            text-align: left;
            text-indent: 2em;
          }
        }
        .text-close{
          width: 25Px;
          height: 25Px;
          position: absolute;
          top: 15Px;
          right: 15Px;
          opacity: 0;
          animation: text-close 0.1s 0.6s forwards;
          @keyframes text-close {
            0%{opacity: 0;}
            100%{opacity: 1;}
          }
          &:hover{
            cursor: pointer;
            opacity: 0.8 !important;
          }
          svg{
            width: 100%;
            height: 100%;
          }
          svg path{ fill: #ffffff !important; }
        }
        .dialog-style{
          width: 9Px;
          height: 9Px;
          background-color: rgba(247, 247, 247, 0.9);
          position: absolute;
          opacity: 0;
          animation: dialog-style-in 0.4s forwards;
          @keyframes dialog-style-in {
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
        .dialog-style1{ top: $position; left: $position; }
        .dialog-style2{ top: $position; right: $position; }
        .dialog-style3{ bottom: $position; right: $position; }
        .dialog-style4{ bottom: $position; left: $position; }
      }
    }
    .library-option{
      margin-top: 15Px;
      padding: 0 4Px;
      .library-playall{
        margin: 10Px 0;
        display: flex;
        flex-direction: row;
        align-items: center;
        .playall{
          display: flex;
          flex-direction: row;
          align-items: center;
          transition: 0.2s;
          &:hover{
            cursor: pointer;
            opacity: 0.6;
          }
          svg{
            width: 17Px;
            height: 17Px;
          }
          span{
            margin: 0 5Px;
            font: 12Px SourceHanSansCN-Bold;
            color: black;
            white-space: nowrap;
          }
        }
        .playall-line{
          width: 100%;
          height: 0.5Px;
          background-color: rgb(154, 154, 154);
        }
        .playall-en{
          margin-left: 4Px;
          font: 8Px Geometos;
          color: rgb(154, 154, 154);
          transition: 0.2s;
          &:hover{
            cursor: pointer;
            color: black;
          }
        }
      }
    }
    .library-content{
      /* 使用弹性布局代替固定高度，避免遮挡 */
      flex: 1;
      min-height: 0; /* 允许子滚动容器正确收缩 */
      overflow: auto;
      &::-webkit-scrollbar{ display: none; }
      .status { padding: 14Px; text-align: left; font: 14Px SourceHanSansCN-Bold; color: black; }
    }
  }
</style>

<style lang="scss">
.metro-enter-active {
  animation: introduce-detail-in 0.6s 0.3s forwards;
}
.metro-leave-active {
  animation: introduce-detail-in 0.6s 0.1s reverse;
  .text-close { display: none; }
}
@keyframes introduce-detail-in {
  0%{width: 0;height: 0;padding: 0;}
  50%{width: 700Px;height: 0;padding: 0 60Px;}
  100%{width: 700Px;height: 400Px;padding: 30PX 60Px;}
}
</style>
