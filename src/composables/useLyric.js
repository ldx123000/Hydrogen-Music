/**
 * useLyric - 歌词显示和交互的优化逻辑
 * 减少DOM操作，提升性能
 */

import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '../store/playerStore'
import { storeToRefs } from 'pinia'

export function useLyric() {
    const playerStore = usePlayerStore()
    const {
        playing,
        progress,
        lyricsObjArr,
        lyricShow,
        lyricSize,
        tlyricSize,
        rlyricSize,
        lyricType,
        videoIsPlaying
    } = storeToRefs(playerStore)

    // DOM引用
    const lyricContainer = ref(null)
    const lyricScrollArea = ref(null)

    // 状态管理
    const currentLyricIndex = ref(-1)
    const isUserScrolling = ref(false)
    const scrollTimer = ref(null)
    const isLyricActive = ref(true)

    // 样式状态 - 使用CSS变量减少DOM操作
    const lyricTransform = ref(0)
    const containerHeight = ref(0)

    // 计算属性
    const activeLyrics = computed(() => {
        if (!lyricsObjArr.value) return []
        return lyricsObjArr.value.filter(item => item.lyric)
    })

    const lyricStyles = computed(() => ({
        '--lyric-transform': `translateY(${lyricTransform.value}px)`,
        '--container-height': `${containerHeight.value}px`,
        '--lyric-size': `${lyricSize.value}px`,
        '--tlyric-size': `${tlyricSize.value}px`,
        '--rlyric-size': `${rlyricSize.value}px`,
        '--bg-color': videoIsPlaying.value ? 'rgba(0, 0, 0, 0.8)' : 'black'
    }))

    const showOriginal = computed(() => lyricType.value.includes('original'))
    const showTrans = computed(() => lyricType.value.includes('trans'))
    const showRoma = computed(() => lyricType.value.includes('roma'))

    // 核心方法 - 使用requestAnimationFrame优化动画
    const updateLyricPosition = (index) => {
        if (!isLyricActive.value || index === currentLyricIndex.value) return

        currentLyricIndex.value = index
        
        // 使用requestAnimationFrame优化滚动动画
        requestAnimationFrame(() => {
            const lineHeight = 60 // 估算的行高
            const centerOffset = containerHeight.value / 2
            const targetTransform = centerOffset - (index * lineHeight)
            
            lyricTransform.value = targetTransform
        })
    }

    // 监听进度变化，更新当前歌词
    const updateCurrentLyric = () => {
        if (!activeLyrics.value.length || !playing.value) return

        const currentTime = progress.value
        let newIndex = -1

        // 使用二分查找优化性能（对于长歌词）
        if (activeLyrics.value.length > 20) {
            let left = 0
            let right = activeLyrics.value.length - 1
            
            while (left <= right) {
                const mid = Math.floor((left + right) / 2)
                const lyric = activeLyrics.value[mid]
                
                if (lyric.time <= currentTime) {
                    newIndex = mid
                    left = mid + 1
                } else {
                    right = mid - 1
                }
            }
        } else {
            // 对于短歌词，使用简单遍历
            for (let i = activeLyrics.value.length - 1; i >= 0; i--) {
                if (activeLyrics.value[i].time <= currentTime) {
                    newIndex = i
                    break
                }
            }
        }

        if (newIndex !== currentLyricIndex.value && !isUserScrolling.value) {
            updateLyricPosition(newIndex)
        }
    }

    // 防抖处理用户滚动
    const handleUserScroll = (event) => {
        isUserScrolling.value = true
        isLyricActive.value = false
        
        // 清除之前的定时器
        if (scrollTimer.value) {
            clearTimeout(scrollTimer.value)
        }

        // 计算滚动位置
        const deltaY = event.deltaY
        lyricTransform.value -= deltaY

        // 限制滚动范围
        const maxScroll = Math.max(0, activeLyrics.value.length * 60 - containerHeight.value)
        lyricTransform.value = Math.max(-maxScroll, Math.min(0, lyricTransform.value))

        // 3秒后恢复自动滚动
        scrollTimer.value = setTimeout(() => {
            isUserScrolling.value = false
            isLyricActive.value = true
            updateCurrentLyric() // 恢复到当前播放位置
        }, 3000)
    }

    // 点击歌词跳转
    const seekToLyric = (time, index) => {
        if (typeof time === 'number' && time >= 0) {
            playerStore.setProgress(time)
            currentLyricIndex.value = index
            updateLyricPosition(index)
        }
    }

    // 初始化容器高度
    const initializeContainer = () => {
        nextTick(() => {
            if (lyricContainer.value) {
                containerHeight.value = lyricContainer.value.clientHeight || 400
            }
        })
    }

    // 重置歌词状态
    const resetLyricState = () => {
        currentLyricIndex.value = -1
        lyricTransform.value = 0
        isUserScrolling.value = false
        isLyricActive.value = true
        
        if (scrollTimer.value) {
            clearTimeout(scrollTimer.value)
        }
    }

    // 监听器
    watch(progress, updateCurrentLyric)
    
    watch(lyricsObjArr, () => {
        resetLyricState()
        nextTick(initializeContainer)
    })

    watch(lyricShow, (newVal) => {
        if (newVal) {
            nextTick(() => {
                initializeContainer()
                updateCurrentLyric()
            })
        }
    })

    // 生命周期
    onMounted(() => {
        initializeContainer()
        
        // 监听窗口大小变化
        window.addEventListener('resize', initializeContainer)
    })

    onUnmounted(() => {
        if (scrollTimer.value) {
            clearTimeout(scrollTimer.value)
        }
        window.removeEventListener('resize', initializeContainer)
    })

    return {
        // DOM引用
        lyricContainer,
        lyricScrollArea,
        
        // 状态
        currentLyricIndex,
        isUserScrolling,
        isLyricActive,
        containerHeight,
        lyricTransform,
        
        // 计算属性
        activeLyrics,
        lyricStyles,
        showOriginal,
        showTrans,
        showRoma,
        
        // 方法
        handleUserScroll,
        seekToLyric,
        updateCurrentLyric,
        resetLyricState,
        initializeContainer
    }
}