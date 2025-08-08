<template>
    <div class="lyric-container" ref="lyricContainer" :style="lyricStyles">
        <Transition name="fade">
            <div 
                v-show="activeLyrics.length && lyricShow && showOriginal" 
                class="lyric-area"
                @wheel.prevent="handleUserScroll"
            >
                <div 
                    class="lyric-content" 
                    :style="{ 
                        transform: `translateY(${lyricTransform}px)`,
                        transition: isUserScrolling ? 'none' : 'transform 0.3s ease-out'
                    }"
                >
                    <div 
                        v-for="(item, index) in activeLyrics" 
                        :key="index"
                        class="lyric-line"
                        :class="{ 
                            'lyric-line--active': index === currentLyricIndex,
                            'lyric-line--inactive': !isLyricActive 
                        }"
                        @click="seekToLyric(item.time, index)"
                    >
                        <!-- 罗马音 -->
                        <span 
                            v-if="item.rlyric && showRoma" 
                            class="lyric-text lyric-text--roma"
                        >
                            {{ item.rlyric }}
                        </span>
                        
                        <!-- 原文歌词 -->
                        <span 
                            v-if="showOriginal" 
                            class="lyric-text lyric-text--original"
                        >
                            {{ item.lyric }}
                        </span>
                        
                        <!-- 翻译 -->
                        <span 
                            v-if="item.tlyric && showTrans" 
                            class="lyric-text lyric-text--trans"
                        >
                            {{ item.tlyric }}
                        </span>
                        
                        <!-- 高亮背景 -->
                        <div 
                            class="lyric-highlight"
                            :class="{ 'lyric-highlight--active': index === currentLyricIndex }"
                        ></div>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<script setup>
import { useLyric } from '../composables/useLyric'
import { usePlayerStore } from '../store/playerStore'
import { storeToRefs } from 'pinia'

const playerStore = usePlayerStore()
const { lyricShow } = storeToRefs(playerStore)

const {
    lyricContainer,
    currentLyricIndex,
    isUserScrolling,
    isLyricActive,
    lyricTransform,
    activeLyrics,
    lyricStyles,
    showOriginal,
    showTrans,
    showRoma,
    handleUserScroll,
    seekToLyric
} = useLyric()
</script>

<style scoped>
.lyric-container {
    position: relative;
    height: 100%;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.lyric-area {
    position: relative;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.lyric-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    will-change: transform;
}

.lyric-line {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60px;
    padding: 10px 20px;
    margin: 5px 0;
    cursor: pointer;
    transition: all 0.3s ease;
    border-radius: 8px;
    user-select: none;
}

.lyric-line:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

.lyric-line--active {
    transform: scale(1.05);
}

.lyric-line--inactive {
    opacity: 0.6;
}

.lyric-text {
    display: block;
    text-align: center;
    line-height: 1.4;
    color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition: all 0.3s ease;
}

.lyric-text--roma {
    font-size: var(--rlyric-size, 14px);
    opacity: 0.8;
    margin-bottom: 2px;
}

.lyric-text--original {
    font-size: var(--lyric-size, 18px);
    font-weight: 500;
    margin: 2px 0;
}

.lyric-text--trans {
    font-size: var(--tlyric-size, 16px);
    opacity: 0.9;
    margin-top: 2px;
}

.lyric-line--active .lyric-text {
    color: #ffffff;
    font-weight: 600;
}

.lyric-highlight {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--bg-color, rgba(0, 0, 0, 0.8));
    opacity: 0;
    border-radius: 8px;
    transition: opacity 0.3s ease;
    pointer-events: none;
    z-index: -1;
}

.lyric-highlight--active {
    opacity: 0.8;
}

/* 淡入淡出过渡 */
.fade-enter-active, .fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
    opacity: 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
    .lyric-line {
        min-height: 50px;
        padding: 8px 16px;
        margin: 3px 0;
    }
    
    .lyric-text--roma {
        font-size: 12px;
    }
    
    .lyric-text--original {
        font-size: 16px;
    }
    
    .lyric-text--trans {
        font-size: 14px;
    }
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
    .lyric-text {
        color: #ffffff;
    }
}

/* 滚动条样式（如果需要） */
.lyric-area::-webkit-scrollbar {
    display: none;
}

.lyric-area {
    -ms-overflow-style: none;
    scrollbar-width: none;
}

/* 性能优化 */
.lyric-content {
    contain: layout style paint;
}

.lyric-line {
    contain: layout paint;
}
</style>