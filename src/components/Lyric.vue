<script setup>
import { ref, watch, onMounted } from 'vue';
import { changeProgress, musicVideoCheck, songTime } from '../utils/player';
import { usePlayerStore } from '../store/playerStore';
import { storeToRefs } from 'pinia';

const playerStore = usePlayerStore();
const {
    playing,
    progress,
    lyricsObjArr,
    songList,
    currentIndex,
    currentMusic,
    widgetState,
    lyricShow,
    lyricEle,
    isLyricDelay,
    lyricSize,
    tlyricSize,
    rlyricSize,
    lyricType,
    playerChangeSong,
    lyricInterludeTime,
    lyricBlur,
    playerShow,
    videoIsPlaying,
} = storeToRefs(playerStore);

const lyricScroll = ref();
const lyricScrollArea = ref();
const heightVal = ref(0);
const minHeightVal = ref(null);
const maxHeightVal = ref(null);
const lineOffset = ref(0);
const isLyricActive = ref(true);
const pauseActiveTimer = ref(null);
const lyricInterval = ref(null);
const lycCurrentIndex = ref(null);
const interludeIndex = ref(null);
const interludeAnimation = ref(false);
const interludeRemainingTime = ref(null);
let interludeInTimer = null;
let interludeOutTimer = null;

let initMax = null;
let initOffset = null;
let size = null;

let lyricLastPosition = null;

const clearLycAnimation = flag => {
    if (flag) isLyricDelay.value = false;
    for (let i = 0; i < lyricEle.value.length; i++) {
        lyricEle.value[i].style.transitionDelay = 0 + 's';
        // 当启用歌词模糊时，移除内联 filter 以便使用样式表控制
        if (lyricBlur.value) lyricEle.value[i].firstChild.style.removeProperty('filter');
    }
    if (flag) {
        const forbidDelayTimer = setTimeout(() => {
            isLyricDelay.value = true;
            clearTimeout(forbidDelayTimer);
        }, 500);
    }
};

const setMaxHeight = change => {
    if (!lyricsObjArr.value) return;
    size =
        (parseInt(lyricType.value.indexOf('noOriginal') == -1 && lyricType.value.indexOf('original') != -1 ? lyricSize.value : 0) +
            parseInt(lyricType.value.indexOf('noTrans') == -1 && lyricType.value.indexOf('trans') != -1 ? tlyricSize.value : 0) +
            parseInt(lyricType.value.indexOf('noRoma') == -1 && lyricType.value.indexOf('roma') != -1 ? rlyricSize.value : 0)) *
            1.5 +
        30;
    initMax = lyricsObjArr.value.length * size;
    heightVal.value = initMax;
    initOffset = -(initMax - 260);
    let offset = (lycCurrentIndex.value + 1) * size;
    if (change) {
        lineOffset.value = initOffset - offset;
        minHeightVal.value = offset;
        maxHeightVal.value = initMax + offset;
    } else {
        maxHeightVal.value = initMax;
    }
    if (lyricScrollArea.value) lyricScrollArea.value.style.height = initMax + 'Px';
};

const setDefaultStyle = () => {
    lycCurrentIndex.value = currentLyricIndex.value >= 0 ? currentLyricIndex.value : -1;
    interludeAnimation.value = false;
    lyricEle.value = document.getElementsByClassName('lyric-line');
    initMax = 0;
    setMaxHeight(false);
    minHeightVal.value = 0;
    lineOffset.value = initOffset;
    
    // 如果有当前歌词索引，立即同步位置
    if (lycCurrentIndex.value >= 0 && size > 0) {
        setTimeout(() => {
            syncLyricPosition();
        }, 50);
    }
    
    if (!lyricShow.value && !widgetState.value) {
        const changeTimer = setTimeout(() => {
            lyricShow.value = true;
            playerChangeSong.value = false;
            clearTimeout(changeTimer);
        }, 400);
    }
};

// 监听歌词数组变化，重新设置样式
watch(
    () => lyricsObjArr.value,
    newLyrics => {
        if (newLyrics && newLyrics.length > 0) {
            setTimeout(() => {
                setDefaultStyle();
            }, 50);
        }
    }
);

// 增强版的当前歌词索引监听
const { currentLyricIndex } = storeToRefs(playerStore);
watch(currentLyricIndex, (newIndex) => {
    lycCurrentIndex.value = newIndex;
    
    // 确保DOM元素存在后再进行滚动
    if (lyricEle.value && lyricEle.value[newIndex] && lyricEle.value[newIndex].offsetParent !== null) {
        let offset = 0;
        for (let i = 0; i <= newIndex; i++) {
            if (lyricEle.value[i]) offset += lyricEle.value[i].clientHeight + 10;
        }
        lineOffset.value = initOffset - offset;
        minHeightVal.value = offset;
        maxHeightVal.value = initMax + offset;
    }
}, { immediate: true }); // 添加 immediate 选项确保立即执行

const changeProgressLyc = (time, index) => {
    lyricScrollArea.value.style.height = initMax + 'Px';
    lycCurrentIndex.value = index;
    playerStore.currentLyricIndex = index;

    if (!playing.value) {
        let offset = (lycCurrentIndex.value + 1) * size;
        lineOffset.value = initOffset - offset;
        minHeightVal.value = offset;
        maxHeightVal.value = initMax + offset;
    }
    progress.value = time;
    changeProgress(time);
};

// 同步当前歌词位置的函数
const syncLyricPosition = () => {
    if (lycCurrentIndex.value !== null && lycCurrentIndex.value >= 0 && lyricEle.value && lyricEle.value[lycCurrentIndex.value]) {
        let offset = (lycCurrentIndex.value + 1) * size;
        lineOffset.value = initOffset - offset;
        minHeightVal.value = offset;
        maxHeightVal.value = initMax + offset;
        // 确保歌词容器高度正确
        if (lyricScrollArea.value) {
            lyricScrollArea.value.style.height = initMax + 'Px';
            heightVal.value = initMax;
        }
        // 重置为激活状态
        isLyricActive.value = true;
    }
};

// 监听歌词显示状态变化，当重新显示歌词时同步位置
watch(
    () => lyricShow.value,
    (newVal) => {
        if (newVal) {
            // 当歌词重新显示时，延迟同步位置以确保DOM已更新
            setTimeout(() => {
                syncLyricPosition();
            }, 100);
        }
    }
);

onMounted(() => {
    lyricScroll.value.addEventListener('wheel', e => {
        isLyricActive.value = false;
        heightVal.value += e.wheelDeltaY < 0 ? e.wheelDeltaY + 76 : e.wheelDeltaY - 76;

        if (heightVal.value < minHeightVal.value) heightVal.value = minHeightVal.value;
        if (heightVal.value > maxHeightVal.value) heightVal.value = maxHeightVal.value;

        lyricScrollArea.value.style.height = heightVal.value + 'Px';

        clearTimeout(pauseActiveTimer.value);
        pauseActiveTimer.value = setTimeout(() => {
            syncLyricPosition();
        }, 3000);
    });
    
    // 组件挂载后立即检查并同步歌词位置
    setTimeout(() => {
        if (lyricsObjArr.value && lyricsObjArr.value.length > 0) {
            setDefaultStyle();
            // 如果有当前歌词索引，确保同步到正确位置
            if (currentLyricIndex.value >= 0) {
                setTimeout(() => {
                    syncLyricPosition();
                }, 100);
            }
        }
    }, 100);
});
</script>

<template>
    <div class="lyric-container" :class="{ 'blur-enabled': lyricBlur }">
        <Transition name="fade">
            <div v-show="lyricsObjArr && lyricShow && lyricType.indexOf('original') != -1" class="lyric-area" ref="lyricScroll">
                <div class="lyric-scroll-area" ref="lyricScrollArea"></div>
                <div class="lyric-line" :style="{ transform: 'translateY(' + lineOffset + 'Px)' }" v-for="(item, index) in lyricsObjArr" v-show="item.lyric" :key="index">
                    <div class="line" @click="changeProgressLyc(item.time, index)" :class="{ 'line-highlight': index == lycCurrentIndex, 'lyric-inactive': !isLyricActive || item.active }">
                        <span class="roma" :style="{ 'font-size': rlyricSize + 'px' }" v-if="item.rlyric && lyricType.indexOf('roma') != -1">{{ item.rlyric }}</span>
                        <span class="original" :style="{ 'font-size': lyricSize + 'px' }" v-if="lyricType.indexOf('original') != -1">{{ item.lyric }}</span>
                        <span class="trans" :style="{ 'font-size': tlyricSize + 'px' }" v-if="item.tlyric && lyricType.indexOf('trans') != -1">{{ item.tlyric }}</span>
                        <div
                            class="hilight"
                            :class="{ 'hilight-active': index == lycCurrentIndex }"
                            :style="{ backgroundColor: videoIsPlaying ? 'var(--lyric-hilight-bg-dim)' : 'var(--lyric-hilight-bg)' }"
                        ></div>
                    </div>
                    <div v-if="lycCurrentIndex != -1 && interludeIndex == index" class="music-interlude" :class="{ 'music-interlude-in': interludeAnimation }">
                        <div class="interlude-left">
                            <div class="diamond">
                                <div class="diamond-inner"></div>
                            </div>
                        </div>
                        <div class="interlude-right">
                            <div class="triangle"></div>
                            <span class="remaining">THE REMAINING TIME: {{ interludeRemainingTime }}</span>
                            <div class="interlude-title">
                                <span class="title">MUSIC INTERLUDE</span>
                                <div class="title-style">
                                    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="49" height="50" viewBox="0 0 49 50" fill="none">
                                        <defs><rect id="path_0" x="0" y="0" width="49" height="50" /></defs>
                                        <g opacity="1" transform="translate(0 0)  rotate(0 24.5 25)">
                                            <mask id="bg-mask-0" fill="white"><use xlink:href="#path_0" /></mask>
                                            <g mask="url(#bg-mask-0)">
                                                <path id="line" style="fill: #ffffff" transform="translate(46 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(46 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(27 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(27 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(48 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(48 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(19 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 2; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(19 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(34 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(34 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(16 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(16 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(43 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(43 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(43 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(43 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(23 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 2; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(23 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(12 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 2; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(12 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(5 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(5 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(8 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 2; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(8 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(30 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 2; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(30 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(1 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 3; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(1 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(40 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 3; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(40 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                            </g>
                                        </g>
                                    </svg>
                                </div>
                            </div>
                            <div class="interlude-progress"></div>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
        <Transition name="fade">
            <div v-show="!lyricsObjArr || lyricType.indexOf('original') == -1" class="lyric-nodata">
                <div class="line1"></div>
                <span class="tip">Lyric-Area</span>
                <div class="line2"></div>
            </div>
        </Transition>

        <span class="song-quality" v-if="songList[currentIndex].type == 'local'">
            {{ songList[currentIndex].sampleRate }}KHz/{{ songList[currentIndex].bitsPerSample }}Bits/{{ songList[currentIndex].bitrate }}Kpbs
        </span>
        <span class="song-quality" v-if="songList[currentIndex].level">
            {{ songList[currentIndex].level.sr / 1000 }}KHz/{{ Math.round(songList[currentIndex].level.br / 1000) }}Kpbs/{{ songList[currentIndex].quality.toUpperCase() }}
        </span>
        <div class="border border1"></div>
        <div class="border border2"></div>
        <div class="border border3"></div>
        <div class="border border4"></div>
    </div>
</template>

<style scoped lang="scss">
.lyric-container {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1;
    .lyric-area {
        width: calc(100% - 3vh);
        height: calc(100% - 3vh);
        overflow: hidden;
        transition: 0.3s cubic-bezier(0.3, 0, 0.12, 1);
        .lyric-scroll-area {
            width: 100%;
            transition: 0.3s;
        }
        .lyric-line {
            margin-bottom: 10px;
            width: 100%;
            text-align: left;
            transition: 0.58s cubic-bezier(0.4, 0, 0.12, 1);
            .line {
                padding: 10px 130px 10px 25px;
                width: 100%;
                height: 100%;
                position: relative;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                transition-duration: 0.6s;
                transition-timing-function: cubic-bezier(0.3, 0, 0.12, 1);
                user-select: text;
                &:hover {
                    cursor: pointer;
                    background-color: rgba(0, 0, 0, 0.045);
                }
                &:active {
                    transform: scale(0.9);
                    filter: blur(0) !important;
                }
                .original,
                .trans,
                .roma {
                    font: 20px SourceHanSansCN-Bold;
                    font-weight: bold;
                    color: black;
                    text-align: left;
                    display: inline-block;
                    transition: 0.5s cubic-bezier(0.3, 0, 0.12, 1);
                }
                .hilight {
                    width: 100%;
                    height: 100%;
                    background-color: black;
                    position: absolute;
                    z-index: -1;
                    top: 0;
                    left: 0;
                    transform: translateX(-101%);
                    transition: 0.55s cubic-bezier(0.3, 0, 0.12, 1);
                }
                .hilight-active {
                    transform: translateX(0);
                    transition: 0.62s cubic-bezier(0.3, 0, 0.12, 1);
                }
            }
            .lyric-inactive {
                filter: blur(0) !important;
                span {
                    transform: scale(1.05);
                }
            }
            .line-highlight {
                transition-duration: 0.4s;
                .original,
                .trans,
                .roma {
                    transform-origin: left center;
                    transform: scale(1.15) translateX(26px);
                    color: white;
                    transition: 0.4s cubic-bezier(0.3, 0, 0.12, 1);
                }
            }
            .music-interlude {
                padding-top: 0;
                padding-left: 25px;
                width: 240px;
                height: 0;
                opacity: 0;
                transform: scale(0);
                transition: 0.8s cubic-bezier(1, -0.49, 0.61, 0.36);
                display: flex;
                flex-direction: row;
                justify-content: center;
                align-items: center;
                position: relative;
                left: 0;
                .interlude-left {
                    .diamond {
                        width: 28px;
                        height: 28px;
                        border: 2px solid black;
                        transform: rotate(45deg);
                        animation: diamond-rotate 1.6s 0.6s cubic-bezier(0.3, 0, 0.12, 1) infinite;
                        position: relative;
                        @keyframes diamond-rotate {
                            0% {
                                transform: rotate(45deg);
                            }
                            50% {
                                transform: rotate(135deg);
                            }
                            100% {
                                transform: rotate(135deg);
                            }
                        }
                        .diamond-inner {
                            width: 85%;
                            height: 85%;
                            background-color: black;
                            position: absolute;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%);
                        }
                    }
                }
                .interlude-right {
                    margin-left: 15px;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    position: relative;
                    .triangle {
                        width: 0;
                        height: 0;
                        border-top: 6px solid black;
                        border-left: 6px solid transparent;
                        position: absolute;
                        top: 1px;
                        right: 0;
                    }
                    .remaining {
                        font: 8px SourceHanSansCN-Bold;
                        color: black;
                        white-space: nowrap;
                    }
                    .interlude-title {
                        padding: 0 4px;
                        width: 100%;
                        background-color: black;
                        display: flex;
                        flex-direction: row;
                        align-items: center;
                        justify-content: space-between;
                        white-space: nowrap;
                        .title {
                            font: 10px SourceHanSansCN-Bold;
                            color: white;
                        }
                        .title-style {
                            width: 15%;
                            height: 8px;
                            overflow: hidden;
                        }
                    }
                    .interlude-progress {
                        margin-top: 3px;
                        width: 100%;
                        height: 4px;
                        background-color: black;
                    }
                }
            }
            .music-interlude-in {
                padding-top: 10px;
                height: 80px;
                opacity: 1;
                transform: scale(1);
                transition: 0.8s cubic-bezier(0.3, 0, 0.12, 1);
            }
        }
    }

    /* 开启歌词模糊后的样式：默认行模糊，当前高亮行清晰 */
    &.blur-enabled {
        .lyric-line {
            .line {
                filter: blur(2px) !important;
                transition: filter 0.25s ease;
            }
            .line.line-highlight {
                filter: none !important;
            }
        }
    }
    .lyric-area-hidden {
        transition: 0.2s cubic-bezier(0.3, 0, 0.12, 1);
        transform: scale(0.85);
        opacity: 0;
    }
    .lyric-nodata {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        position: relative;
        .line1,
        .line2 {
            width: 0;
            height: 0;
            position: absolute;
            background: linear-gradient(to bottom right, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) calc(50% - 0.5px), rgba(0, 0, 0, 0.8) 50%, rgba(0, 0, 0, 0) calc(50% + 0.5px), rgba(0, 0, 0, 0) 100%);
            animation: nodata-open1 0.8s 0.5s cubic-bezier(0.32, 0.81, 0.56, 0.98) forwards;
            @keyframes nodata-open1 {
                0% {
                    width: 0;
                    height: 0;
                }
                100% {
                    width: 38%;
                    height: 38%;
                }
            }
        }
        .tip {
            font: 16px Bender-Bold;
            color: black;
            white-space: nowrap;
            opacity: 0;
            animation: nodata-open2 0.1s 1.3s forwards;
            @keyframes nodata-open2 {
                10% {
                    opacity: 0;
                }
                20% {
                    opacity: 1;
                }
                30% {
                    opacity: 1;
                }
                40% {
                    opacity: 0;
                }
                50% {
                    opacity: 0;
                }
                60% {
                    opacity: 1;
                }
                70% {
                    opacity: 1;
                }
                80% {
                    opacity: 0;
                }
                90% {
                    opacity: 0;
                }
                100% {
                    opacity: 1;
                }
            }
        }
        .line1 {
            left: 4%;
            bottom: 4%;
        }
        .line2 {
            top: 4%;
            right: 4%;
        }
    }
    .song-quality {
        font: 1.5vh Bender-Bold;
        color: black;
        position: absolute;
        bottom: -0.9vh;
        right: 1.5vh;
    }

    $boderPosition: -0.75 + vh;
    .border {
        width: 1.5vh;
        height: 1.5vh;
        border: 1px solid black;
        position: absolute;
    }
    .border1 {
        top: $boderPosition;
        left: $boderPosition;
    }
    .border2 {
        top: $boderPosition;
        right: $boderPosition;
    }
    .border3 {
        bottom: $boderPosition;
        right: $boderPosition;
        &::after {
            content: '';
            width: 0.5vh;
            height: 0.5vh;
            background-color: black;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
        }
    }
    .border4 {
        bottom: $boderPosition;
        left: $boderPosition;
    }
}
.fade-enter-active {
    transition: 0.4s cubic-bezier(0.3, 0.79, 0.55, 0.99) !important;
}
.fade-leave-active {
    transition: 0.2s cubic-bezier(0.3, 0.79, 0.55, 0.99) !important;
}
.fade-enter-from,
.fade-leave-to {
    transform: scale(0.85);
    opacity: 0;
}
</style>
