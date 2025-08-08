/**
 * usePlayer - 播放器相关的通用逻辑
 * 提供播放控制、状态管理等功能
 */

import { computed, ref, watch } from 'vue'
import { usePlayerStore } from '../store/playerStore'
import { storeToRefs } from 'pinia'
import { formatDuration } from '../utils/time'

export function usePlayer() {
    const playerStore = usePlayerStore()
    
    // 从store获取响应式状态
    const {
        currentMusic,
        playing,
        progress,
        volume,
        playMode,
        songList,
        currentIndex,
        time,
        songId
    } = storeToRefs(playerStore)

    // 计算属性
    const isPlaying = computed(() => playing.value)
    const currentSong = computed(() => currentMusic.value)
    const playProgress = computed(() => progress.value)
    const currentTime = computed(() => time.value)
    const totalTime = computed(() => currentMusic.value?.dt || 0)
    
    // 格式化时间显示
    const formattedCurrentTime = computed(() => 
        formatDuration(currentTime.value / 1000)
    )
    const formattedTotalTime = computed(() => 
        formatDuration(totalTime.value / 1000)
    )
    
    // 播放进度百分比
    const progressPercentage = computed(() => {
        if (!totalTime.value) return 0
        return (currentTime.value / totalTime.value) * 100
    })

    // 播放控制方法
    const play = () => {
        playerStore.setPlaying(true)
    }

    const pause = () => {
        playerStore.setPlaying(false)
    }

    const togglePlay = () => {
        if (playing.value) {
            pause()
        } else {
            play()
        }
    }

    const next = () => {
        if (songList.value && songList.value.length > 0) {
            let nextIndex = currentIndex.value + 1
            if (nextIndex >= songList.value.length) {
                nextIndex = 0 // 循环播放
            }
            playerStore.setCurrentIndex(nextIndex)
        }
    }

    const previous = () => {
        if (songList.value && songList.value.length > 0) {
            let prevIndex = currentIndex.value - 1
            if (prevIndex < 0) {
                prevIndex = songList.value.length - 1 // 循环播放
            }
            playerStore.setCurrentIndex(prevIndex)
        }
    }

    const setVolume = (newVolume) => {
        playerStore.setVolume(Math.max(0, Math.min(100, newVolume)))
    }

    const seekTo = (time) => {
        playerStore.setTime(time)
    }

    const seekToProgress = (percentage) => {
        if (totalTime.value) {
            const targetTime = (percentage / 100) * totalTime.value
            seekTo(targetTime)
        }
    }

    // 播放模式控制
    const togglePlayMode = () => {
        const modes = [0, 1, 2, 3] // 0:列表循环 1:单曲循环 2:随机播放 3:播放一次
        const currentModeIndex = modes.indexOf(playMode.value)
        const nextModeIndex = (currentModeIndex + 1) % modes.length
        playerStore.setPlayMode(modes[nextModeIndex])
    }

    const getPlayModeText = () => {
        const modeTexts = {
            0: '列表循环',
            1: '单曲循环',
            2: '随机播放',
            3: '播放一次'
        }
        return modeTexts[playMode.value] || '列表循环'
    }

    // 歌曲列表管理
    const hasPrevious = computed(() => {
        return songList.value && songList.value.length > 0 && 
               (playMode.value !== 3 || currentIndex.value > 0)
    })

    const hasNext = computed(() => {
        return songList.value && songList.value.length > 0 && 
               (playMode.value !== 3 || currentIndex.value < songList.value.length - 1)
    })

    // 播放指定歌曲
    const playById = (id) => {
        if (songList.value) {
            const index = songList.value.findIndex(song => song.id === id)
            if (index !== -1) {
                playerStore.setCurrentIndex(index)
                play()
            }
        }
    }

    const playByIndex = (index) => {
        if (songList.value && index >= 0 && index < songList.value.length) {
            playerStore.setCurrentIndex(index)
            play()
        }
    }

    return {
        // 状态
        currentMusic,
        playing,
        progress,
        volume,
        playMode,
        songList,
        currentIndex,
        time,
        songId,
        
        // 计算属性
        isPlaying,
        currentSong,
        playProgress,
        currentTime,
        totalTime,
        formattedCurrentTime,
        formattedTotalTime,
        progressPercentage,
        hasPrevious,
        hasNext,
        
        // 方法
        play,
        pause,
        togglePlay,
        next,
        previous,
        setVolume,
        seekTo,
        seekToProgress,
        togglePlayMode,
        getPlayModeText,
        playById,
        playByIndex
    }
}