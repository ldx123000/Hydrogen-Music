<script setup>
  import { onMounted, watch } from 'vue'
  import Plyr from 'plyr'
  import '../assets/css/plyr.css'
  import { musicVideoCheck } from '../utils/player';
  import { usePlayerStore } from '../store/playerStore';
  const playerStore = usePlayerStore()
  
  onMounted(() => {
    const config = {
      autoplay: false,
      controls: []
    };
    playerStore.musicVideoDOM = new Plyr('#video-player', config)
    let sources = []
    sources.push({
      src: playerStore.currentMusicVideo.path,
      type: "video/mp4",
    })
    playerStore.musicVideoDOM.source = {
      type: 'video',
      sources: sources,
    }
    playerStore.musicVideoDOM.on('play', () => {
      musicVideoCheck(playerStore.currentMusic.seek(), true)
    })
  })
</script>

<template>
    <div class="back-video">
        <video id="video-player" class="video-player"></video>
    </div>
</template>

<style scoped lang="scss">
  
</style>