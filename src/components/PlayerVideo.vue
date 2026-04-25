<script setup>
  import { onMounted, onUnmounted } from 'vue'
  import Plyr from 'plyr'
  import '../assets/css/plyr.css'
  import { musicVideoCheck } from '../utils/player';
  import { usePlayerStore } from '../store/playerStore';
  const playerStore = usePlayerStore()
  let plyrInstance = null
  let nativeVideoElement = null
  
  onMounted(() => {
    const config = {
      autoplay: false,
      controls: []
    };
    const player = new Plyr('#video-player', config)
    plyrInstance = player
    playerStore.musicVideoDOM = player
    
    let sources = []
    let videoPath = playerStore.currentMusicVideo.path
    
    // 处理本地文件路径，确保使用 file:// 协议
    if (videoPath && !videoPath.startsWith('http')) {
      videoPath = windowApi?.toFileUrl ? windowApi.toFileUrl(videoPath) : videoPath
    }
    
    sources.push({
      src: videoPath,
      type: "video/mp4",
    })
    
    player.source = {
      type: 'video',
      sources: sources,
    }
    
    player.on('error', (event) => {
      console.error('视频播放错误:', event)
    })
    
    player.on('play', () => {
      let seek = 0
      try {
        const value = playerStore.currentMusic?.seek?.()
        if (Number.isFinite(value)) seek = value
      } catch (_) {}
      musicVideoCheck(seek, true)
    })
    
    // 检查视频元素
    const videoElement = player.media
    nativeVideoElement = videoElement
    if (videoElement) {
      // 监听原生视频元素的错误事件
      videoElement.onerror = function(e) {
        console.error('原生视频元素错误:', e)
        console.error('错误详情:', {
          code: videoElement.error?.code,
          message: videoElement.error?.message
        })
      }
    }
  })

  onUnmounted(() => {
    if (nativeVideoElement) {
      nativeVideoElement.onerror = null
      nativeVideoElement = null
    }
    if (plyrInstance) {
      try {
        plyrInstance.destroy()
      } catch (error) {
        console.warn('销毁视频播放器失败:', error)
      }
      if (playerStore.musicVideoDOM === plyrInstance) {
        playerStore.musicVideoDOM = null
      }
      plyrInstance = null
    }
  })
</script>

<template>
    <div class="back-video">
        <video id="video-player" class="video-player" playsinline></video>
    </div>
</template>

<style scoped lang="scss">
.back-video {
    width: 100%;
    height: 100%;
    background: black;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 0;
    pointer-events: none;
}

.video-player {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover; /* 确保视频填满容器 */
    background: black;
}

/* 覆盖 Plyr 的默认样式 */
:deep(.plyr) {
    width: 100% !important;
    height: 100% !important;
}

:deep(.plyr__video-wrapper) {
    width: 100% !important;
    height: 100% !important;
}

:deep(.plyr video) {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
}
</style>
