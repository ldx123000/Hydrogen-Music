<script setup>
import { computed } from 'vue'
import { usePlayerStore } from '../store/playerStore'
import { storeToRefs } from 'pinia'

const playerStore = usePlayerStore()
const { songList, currentIndex } = storeToRefs(playerStore)

const current = computed(() => (songList.value && songList.value[currentIndex.value]) || {})
const cover = computed(() => (current.value.coverUrl || (current.value.al && current.value.al.picUrl) || '') + (current.value.coverUrl || (current.value.al && current.value.al.picUrl) ? '?param=300y300' : ''))
const title = computed(() => current.value.programName || current.value.name || '节目')
const desc = computed(() => current.value.programDesc || '暂无节目简介')
</script>

<template>
  <div class="program-intro">
    <div class="intro-header">
      <div class="cover"><img v-if="cover" :src="cover" alt="" /></div>
      <div class="meta">
        <div class="title">{{ title }}</div>
      </div>
    </div>
    <div class="intro-content">
      <div class="desc" v-text="desc"></div>
    </div>
    <span class="border b1"></span>
    <span class="border b2"></span>
    <span class="border b3"></span>
    <span class="border b4"></span>
  </div>
</template>

<style scoped lang="scss">
.program-intro {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;flex-direction: column;background: transparent;
  .intro-header { display:flex;align-items:center;gap:14px;margin-bottom:12px; }
  .cover { width:80px;height:80px;border:0.5Px solid rgba(0,0,0,0.12);overflow:hidden;background: rgba(0,0,0,0.04);
    img{ width:100%;height:100%;object-fit:cover;display:block; }
  }
  .meta { display:flex;flex-direction:column;align-items:flex-start;min-width:0; }
  .title { font: 18Px SourceHanSansCN-Bold; color:black; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .intro-content { flex:1; background: rgba(255,255,255,0.30); padding: 14Px; overflow:auto; }
  .desc { font: 14px SourceHanSansCN-Bold; color:black; white-space:pre-wrap; text-align:left; line-height:1.7; }
  .border { width: 1.5vh; height: 1.5vh; border: 1Px solid black; position: absolute; }
  .b1 { top: 6Px; left: 6Px; }
  .b2 { top: 6Px; right: 6Px; }
  .b3 { bottom: 6Px; right: 6Px; }
  .b4 { bottom: 6Px; left: 6Px; }
}
</style>

