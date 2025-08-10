<script setup>
  import { onMounted, watch } from 'vue'
  import Plyr from 'plyr'
  import '../assets/css/plyr.css'
  import { musicVideoCheck } from '../utils/player';
  import { usePlayerStore } from '../store/playerStore';
  const playerStore = usePlayerStore()
  
  onMounted(() => {
    console.log('PlayerVideo onMounted, currentMusicVideo:', playerStore.currentMusicVideo)
    
    const config = {
      autoplay: false,
      controls: []
    };
    playerStore.musicVideoDOM = new Plyr('#video-player', config)
    
    let sources = []
    let videoPath = playerStore.currentMusicVideo.path
    console.log('原始视频文件路径:', videoPath)
    
    // 处理本地文件路径，确保使用 file:// 协议
    if (videoPath && !videoPath.startsWith('http') && !videoPath.startsWith('file://')) {
      // 对于 Windows 路径，需要转换反斜杠为正斜杠
      videoPath = videoPath.replace(/\\/g, '/')
      // 添加 file:// 协议
      videoPath = `file://${videoPath}`
    }
    
    console.log('处理后的视频文件路径:', videoPath)
    
    sources.push({
      src: videoPath,
      type: "video/mp4",
    })
    
    playerStore.musicVideoDOM.source = {
      type: 'video',
      sources: sources,
    }
    
    // 添加视频事件监听
    playerStore.musicVideoDOM.on('ready', () => {
      console.log('视频播放器已准备就绪')
    })
    
    playerStore.musicVideoDOM.on('loadstart', () => {
      console.log('开始加载视频文件')
    })
    
    playerStore.musicVideoDOM.on('loadeddata', () => {
      console.log('视频数据已加载')
    })
    
    playerStore.musicVideoDOM.on('canplay', () => {
      console.log('视频可以开始播放')
    })
    
    playerStore.musicVideoDOM.on('error', (event) => {
      console.error('视频播放错误:', event)
    })
    
    playerStore.musicVideoDOM.on('play', () => {
      console.log('视频开始播放')
      musicVideoCheck(playerStore.currentMusic.seek(), true)
    })
    
    playerStore.musicVideoDOM.on('pause', () => {
      console.log('视频暂停播放')
    })
    
    // 检查视频元素
    const videoElement = playerStore.musicVideoDOM.media
    if (videoElement) {
      console.log('视频元素信息:', {
        src: videoElement.src,
        readyState: videoElement.readyState,
        networkState: videoElement.networkState,
        error: videoElement.error
      })
      
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