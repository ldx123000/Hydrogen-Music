<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getDjSubList, getDjPrograms } from '../api/dj'
import { getMusicUrl, getLyric } from '../api/song'
import { usePlayerStore } from '../store/playerStore'

const router = useRouter()
const playerStore = usePlayerStore()

const loading = ref(true)
const error = ref(null)
const radios = ref([])

const loadSubRadios = async () => {
  loading.value = true
  error.value = null
  try {
    const res = await getDjSubList({ limit: 60, offset: 0 })
    // 兼容不同返回字段
    const list = res?.djRadios || res?.data || res?.radios || []
    radios.value = Array.isArray(list) ? list : []
  } catch (e) {
    error.value = '加载我的电台失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadSubRadios)

// 播放该电台最新节目
const playLatestProgram = async (radio) => {
  try {
    const rid = radio?.id || radio?.rid
    if (!rid) return
    const pRes = await getDjPrograms(rid, { limit: 1, offset: 0 })
    const programs = pRes?.programs || pRes?.data || []
    if (!programs?.length) return
    const program = programs[0]
    const mainSong = program?.mainSong
    if (!mainSong?.id) return

    const urlRes = await getMusicUrl(mainSong.id, 'standard')
    const url = urlRes?.data?.[0]?.url
    if (!url) return

    // 封装成播放器歌曲结构
    const songItem = {
      id: mainSong.id,
      name: mainSong.name,
      ar: mainSong.artists || mainSong.ar || [],
      al: mainSong.album || mainSong.al || {},
      dt: mainSong.duration || mainSong.dt || 0,
      duration: mainSong.duration || mainSong.dt || 0,
      type: 'dj',
      coverUrl: (program && (program.coverUrl || program.blurCoverUrl)) || (mainSong.album && mainSong.album.picUrl) || (mainSong.al && mainSong.al.picUrl) || null,
      programId: program?.id,
      programName: program?.name,
      programDesc: program?.description || program?.desc || ''
    }

    playerStore.songId = songItem.id
    playerStore.currentIndex = 0
    playerStore.songList = [songItem]
    playerStore.listInfo = { id: rid, type: 'dj', name: radio?.name || '电台' }

    // 直接播放
    const { play } = await import('../utils/player')
    play(url, true)

    // 加载歌词（可能无歌词，忽略错误）
    try {
      const lyr = await getLyric(songItem.id)
      if (lyr && lyr.lrc) playerStore.lyric = lyr
    } catch (_) {}
  } catch (_) {}
}
</script>

<template>
  <div class="my-radio">
    <div class="radio-header">
      <div class="title-tip"></div>
      <div class="title-name">我的电台</div>
    </div>

    <div class="radio-content">
      <div v-if="loading" class="status">正在加载...</div>
      <div v-else-if="error" class="status">{{ error }}</div>
      <div v-else-if="!radios.length" class="status">暂无订阅电台</div>
      <div v-else class="radio-grid">
        <div
          class="radio-card"
          v-for="radio in radios"
          :key="radio.id"
          @click="playLatestProgram(radio)"
          title="播放最新节目"
        >
          <div class="cover">
            <img :src="(radio.picUrl || radio.intervenePicUrl) + '?param=240y240'" alt="" />
            <div class="overlay">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
          <div class="meta">
            <div class="name" :title="radio.name">{{ radio.name }}</div>
            <div class="sub">
              <span class="dj" v-if="radio.dj?.nickname">{{ radio.dj.nickname }}</span>
              <span class="sep" v-if="radio.dj?.nickname && (radio.programCount || radio.subCount)">·</span>
              <span v-if="radio.programCount">{{ radio.programCount }} 期</span>
            </div>
          </div>
          <span class="border b1"></span>
          <span class="border b2"></span>
          <span class="border b3"></span>
          <span class="border b4"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.my-radio {
  width: 100%;
  height: calc(100% - 110Px);
  padding: 0 45px;
  .radio-header {
    margin: 30px 0 12px 0;
    display: flex;
    align-items: center;
    .title-tip {
      margin-right: 6px;
      width: 6Px;
      height: 6Px;
      background-color: black;
    }
    .title-name {
      font: 16Px SourceHanSansCN-Bold;
      color: black;
      letter-spacing: 0.5px;
    }
  }
  .radio-content {
    background-color: rgba(255, 255, 255, 0.30);
    min-height: 60vh;
    padding: 14Px 14Px 18Px 14Px;
    position: relative;
    .status {
      padding: 24px;
      font: 14px SourceHanSansCN-Bold;
      color: black;
      text-align: left;
    }
  }
  .radio-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(180px, 1fr));
    gap: 16px 14px;
  }
  .radio-card {
    position: relative;
    background-color: rgba(255, 255, 255, 0.35);
    transition: 0.2s;
    padding: 10px;
    &:hover { cursor: pointer; transform: translateY(-2px); }
    &:active { transform: scale(0.98); }
    .cover {
      width: 100%;
      aspect-ratio: 1/1;
      position: relative;
      border: 0.5Px solid rgba(0, 0, 0, 0.12);
      overflow: hidden;
      img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .overlay {
        position: absolute; inset: 0; background: rgba(0,0,0,0.0); display: flex; align-items: center; justify-content: center; transition: 0.2s;
        svg { color: white; opacity: 0; transition: 0.2s; }
      }
      &:hover .overlay { background: rgba(0,0,0,0.35); }
      &:hover .overlay svg { opacity: 1; transform: scale(1.06); }
    }
    .meta {
      margin-top: 8px;
      .name { font: 14px SourceHanSansCN-Bold; color: black; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sub { margin-top: 3px; font: 12px SourceHanSansCN-Bold; color: rgb(105,105,105); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sep { margin: 0 6px; opacity: 0.6; }
    }
    .border { width: 1.3vh; height: 1.3vh; border: 1Px solid black; position: absolute; }
    .b1 { top: 6Px; left: 6Px; }
    .b2 { top: 6Px; right: 6Px; }
    .b3 { bottom: 6Px; right: 6Px; }
    .b4 { bottom: 6Px; left: 6Px; }
  }
}
</style>
