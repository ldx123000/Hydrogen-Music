<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { songTime2 } from '../utils/player';
import VueSlider from 'vue-slider-component';
import PlayList from './PlayList.vue';
import { startMusic, pauseMusic, playLast, playNext, changeProgress, changePlayMode, likeSong } from '../utils/player';
import { getDjDetail, subDj } from '../api/dj';
import { useUserStore } from '../store/userStore';
import { usePlayerStore } from '../store/playerStore';
import { useLocalStore } from '../store/localStore';
import { useOtherStore } from '../store/otherStore';
import { storeToRefs } from 'pinia';
import { toggleDesktopLyric } from '../utils/desktopLyric';

// 定义 props 和 emit
const props = defineProps({
    rightPanelMode: {
        type: Number,
        default: 0,
    },
});

const emit = defineEmits(['update:rightPanelMode']);

// 切换右侧面板模式
const switchRightPanel = mode => {
    emit('update:rightPanelMode', mode);
};

const router = useRouter();
const userStore = useUserStore();
const localStore = useLocalStore();
const playerStore = usePlayerStore();
const otherStore = useOtherStore();
const {
    playing,
    progress,
    volume,
    playMode,
    currentIndex,
    songList,
    songId,
    widgetState,
    lyricShow,
    lyricType,
    playlistWidgetShow,
    time,
    playerChangeSong,
    localBase64Img,
    musicVideo,
    addMusicVideo,
    videoIsPlaying,
    playerShow,
    listInfo,
    lyricsObjArr,
    currentLyricIndex, // 添加当前歌词索引
    isDesktopLyricOpen,
    coverBlur,
} = storeToRefs(playerStore);

// 检查是否在FM模式
const isInFMMode = computed(() => {
    return listInfo.value && listInfo.value.type === 'personalfm';
});

// 是否为电台(DJ)模式
const isDjMode = computed(() => listInfo.value && listInfo.value.type === 'dj');

// 当前电台订阅状态与rid
const djSubed = ref(false);
const djRid = computed(() => (isDjMode.value && listInfo.value?.id) ? listInfo.value.id : null);

const loadDjSubStatus = async () => {
    try {
        if (!djRid.value) return;
        const res = await getDjDetail(djRid.value);
        const detail = (res && (res.data || res.djRadio)) || res || {};
        djSubed.value = !!detail.subed;
    } catch (_) {
        djSubed.value = false;
    }
};

watch(djRid, () => { djSubed.value = false; if (djRid.value) loadDjSubStatus(); });

const checkIsLike = computed(() => id => {
    return userStore.likelist.includes(id);
});

// 智能判断当前歌曲有哪些类型的歌词
const hasOriginalLyric = computed(() => {
    if (!lyricsObjArr.value || !Array.isArray(lyricsObjArr.value)) return false;
    return lyricsObjArr.value.some(item => item.lyric && item.lyric.trim() !== '');
});

const hasTransLyric = computed(() => {
    if (!lyricsObjArr.value || !Array.isArray(lyricsObjArr.value)) return false;
    return lyricsObjArr.value.some(item => item.tlyric && item.tlyric.trim() !== '');
});

const hasRomaLyric = computed(() => {
    if (!lyricsObjArr.value || !Array.isArray(lyricsObjArr.value)) return false;
    return lyricsObjArr.value.some(item => item.rlyric && item.rlyric.trim() !== '');
});

const toAlbum = () => {
    const currentSong = songList.value?.[currentIndex.value];
    if (!currentSong) return;
    // 电台节目：打开“收藏-电台”的大右侧详情界面
    if (isDjMode.value) {
        const rid = (listInfo.value && listInfo.value.id) || null;
        if (!rid) return;
        router.push('/mymusic/dj/' + rid);
        widgetState.value = true;
        lyricShow.value = false;
        playlistWidgetShow.value = false;
        playerStore.forbidLastRouter = true;
        if (videoIsPlaying.value) videoIsPlaying.value = false;
        return;
    }
    // 普通歌曲：仍然跳转专辑
    if (currentSong.type != 'local') {
        router.push('/mymusic/album/' + currentSong.al.id);
        widgetState.value = true;
        lyricShow.value = false;
        playlistWidgetShow.value = false;
        playerStore.forbidLastRouter = true;
        if (videoIsPlaying.value) videoIsPlaying.value = false;
    }
};

const download = () => {
    const currentSong = songList.value?.[currentIndex.value];
    if (currentSong?.type != 'local') {
        let list = [];
        list.push(currentSong);
        localStore.updateDownloadList(list);
    }
};

const checkArtist = artistId => {
    const currentSong = songList.value?.[currentIndex.value];
    // 电台模式下禁止点击作者
    if (isDjMode.value) return;
    if (currentSong?.type != 'local') {
        router.push('/mymusic/artist/' + artistId);
        widgetState.value = true;
        lyricShow.value = false;
        playlistWidgetShow.value = false;
        playerStore.forbidLastRouter = true;
        if (videoIsPlaying.value) videoIsPlaying.value = false;
    }
};
const toAddMusicVideo = () => {
    const currentSong = songList.value?.[currentIndex.value];
    if (currentSong) {
        addMusicVideo.value = {
            id: songId.value,
            name: currentSong.name,
            dt: time.value,
        };
    }
};
const backToVideo = () => {
    if (videoIsPlaying.value) playerShow.value = false;
};

const addToPlaylist = () => {
    const currentSong = songList.value?.[currentIndex.value];
    if (currentSong && currentSong.type !== 'local') {
        otherStore.selectedItem = currentSong;
        otherStore.addPlaylistShow = true;
    }
};

// 订阅/取消订阅 电台
const toggleDjSub = async (isSubscribe) => {
    if (!djRid.value) return;
    try {
        await subDj(djRid.value, isSubscribe);
        djSubed.value = !!isSubscribe;
    } catch (_) {
        // 忽略错误，保留原状态
    }
};
</script>

<template>
    <div class="player-container">
        <div class="player">
            <div class="player-cover">
                <div class="cover" :class="{ 'cover-change': playerChangeSong, 'back-Video': videoIsPlaying }" @click="backToVideo()">
                    <!-- Force re-create <img> when song changes so old cover doesn't persist -->
                    <img
                        v-if="songList?.[currentIndex]?.type != 'local'"
                        :key="'remote-'+(songId || songList?.[currentIndex]?.id)"
                        :src="songList?.[currentIndex]?.coverUrl || songList?.[currentIndex]?.al?.picUrl"
                        alt=""
                    />
                    <img
                        v-else
                        v-show="localBase64Img"
                        :key="'local-'+(songId || songList?.[currentIndex]?.id)"
                        :src="localBase64Img"
                        alt=""
                    />
                    <img
                        v-if="songList?.[currentIndex]?.type == 'local' && !localBase64Img"
                        :key="'local-default-'+(songId || songList?.[currentIndex]?.id)"
                        src="http://p3.music.126.net/UeTuwE7pvjBpypWLudqukA==/3132508627578625.jpg?param=140y140"
                        alt=""
                    />
                </div>
                <div class="c-border c-border1"></div>
                <div class="c-border c-border2"></div>
                <div class="c-border c-border3"></div>
                <div class="c-border c-border4"></div>
            </div>
            <div class="player-info">
                <div class="info-music">
                    <div class="music-name-lable" :class="{ 'music-name-lable-in': playerChangeSong }"></div>
                    <span class="music-name" :class="{ 'music-name-in': playerChangeSong }">{{ songList?.[currentIndex]?.name || songList?.[currentIndex]?.localName || '加载中...' }}</span>
                </div>
                <div class="info-music">
                    <div class="music-author-lable" :class="{ 'music-author-lable-video': videoIsPlaying || coverBlur }"></div>
                    <div class="music-author">
                        <span
                            @click="checkArtist(singer.id)"
                            :class="['author', { disabled: isDjMode }]"
                            :style="{ color: (videoIsPlaying || coverBlur) ? 'var(--text)' : 'var(--muted-text)' }"
                            v-for="(singer, index) in songList?.[currentIndex]?.ar || []"
                        >
                            {{ singer.name || '' }}{{ index == (songList?.[currentIndex]?.ar?.length || 0) - 1 ? '' : ' / ' }}
                        </span>
                    </div>
                </div>
            </div>
            <div class="player-control">
                <div class="player-process">
                    <div class="process-time">
                        <span class="time-current">{{ songTime2(progress) }}</span>
                        <span class="time-end">{{ songTime2(time) }}</span>
                    </div>
                    <div class="process">
                        <vue-slider
                            id="widget-progress"
                            class="music-progress"
                            @click="changeProgress(progress)"
                            v-model="progress"
                            :min="0"
                            :max="time"
                            :interval="1"
                            :duration="0.5"
                            tooltip="none"
                        ></vue-slider>
                    </div>
                </div>

                <div class="control">
                    <svg @click="playLast()" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200" viewBox="0 0 200 200" fill="none">
                        <defs><rect id="path_0" x="0" y="0" width="200" height="200" /></defs>
                        <g opacity="1" transform="translate(0 0)  rotate(0 100 100)">
                            <mask id="bg-mask-0" fill="white"><use xlink:href="#path_0" /></mask>
                            <g mask="url(#bg-mask-0)">
                                <path id="arrow" style="fill: #cccccc" transform="translate(35.21963688171376 44.356081611360985)  rotate(-90 66.78036311828623 52.999999999999986)" opacity="0" d="" />
                                <path
                                    id="arrow"
                                    style="stroke: currentColor; stroke-width: 8; stroke-opacity: 1; stroke-dasharray: 0 0"
                                    transform="translate(35.21963688171376 44.356081611360985)  rotate(-90 66.78036311828623 52.999999999999986)"
                                    d="M133.56,105.98L66.78,0L0,106 "
                                />
                            </g>
                        </g>
                    </svg>
                    <svg
                        v-show="playing"
                        @click="pauseMusic()"
                        xmlns="http://www.w3.org/2000/svg"
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                        width="200"
                        height="200"
                        viewBox="0 0 200 200"
                        fill="none"
                    >
                        <defs><rect id="path_0" x="0" y="0" width="200" height="200" /></defs>
                        <g opacity="1" transform="translate(0 0)  rotate(0 100 100)">
                            <mask id="bg-mask-0" fill="white"><use xlink:href="#path_0" /></mask>
                            <g mask="url(#bg-mask-0)">
                                <path id="line2" style="fill: #000000" transform="translate(152 24)  rotate(0 0.0005 76)" opacity="1" d="" />
                                <path
                                    id="line2"
                                    style="stroke: currentColor; stroke-width: 8; stroke-opacity: 1; stroke-dasharray: 0 0"
                                    transform="translate(152 24)  rotate(0 0.0005 76)"
                                    d="M0,0L0,152 "
                                />
                                <path id="line1" style="fill: #000000" transform="translate(48 24)  rotate(0 0.0005 76)" opacity="1" d="" />
                                <path id="line1" style="stroke: currentColor; stroke-width: 8; stroke-opacity: 1; stroke-dasharray: 0 0" transform="translate(48 24)  rotate(0 0.0005 76)" d="M0,0L0,152 " />
                            </g>
                        </g>
                    </svg>
                    <svg
                        v-show="!playing"
                        @click="startMusic()"
                        xmlns="http://www.w3.org/2000/svg"
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                        width="200"
                        height="200"
                        viewBox="0 0 200 200"
                        fill="none"
                    >
                        <defs><rect id="path_0" x="0" y="0" width="200" height="200" /></defs>
                        <g opacity="1" transform="translate(0 0)  rotate(0 100 100)">
                            <mask id="bg-mask-0" fill="white"><use xlink:href="#path_0" /></mask>
                            <g mask="url(#bg-mask-0)">
                                <path id="三角形 1" fill-rule="evenodd" style="fill: #cccccc" transform="translate(0 12)  rotate(90 88 88)" opacity="0" d="M11.79,132L164.21,132L88,0L11.79,132Z " />
                                <path
                                    id="三角形 1"
                                    style="stroke: currentColor; stroke-width: 8; stroke-opacity: 1; stroke-dasharray: 0 0"
                                    transform="translate(0 12)  rotate(90 88 88)"
                                    d="M11.79,132L164.21,132L88,0L11.79,132Z "
                                />
                            </g>
                        </g>
                    </svg>
                    <svg @click="playNext()" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200" viewBox="0 0 200 200" fill="none">
                        <defs><rect id="path_0" x="0" y="0" width="200" height="200" /></defs>
                        <g opacity="1" transform="translate(0 0)  rotate(0 100 100)">
                            <mask id="bg-mask-0" fill="white"><use xlink:href="#path_0" /></mask>
                            <g mask="url(#bg-mask-0)">
                                <path id="arrow" style="fill: #cccccc" transform="translate(35.21963688171376 44.356081611360985)  rotate(90 66.78036311828623 52.999999999999986)" opacity="0" d="" />
                                <path
                                    id="arrow"
                                    style="stroke: currentColor; stroke-width: 8; stroke-opacity: 1; stroke-dasharray: 0 0"
                                    transform="translate(35.21963688171376 44.356081611360985)  rotate(90 66.78036311828623 52.999999999999986)"
                                    d="M133.56,105.98L66.78,0L0,106 "
                                />
                            </g>
                        </g>
                    </svg>
                </div>

                <div class="player-voluem">
                    <div class="voluem">
                        <vue-slider class="volume-slider" v-model="volume" :min="0" :max="1" :interval="0.01" :duration="0.3" tooltip="none"></vue-slider>
                    </div>
                    <div class="voluem-num">
                        <span class="voluem-title">VOLUME</span>
                        <span class="num">{{ Math.round(volume * 100) }}</span>
                    </div>
                </div>
            </div>

            <div class="song-control">
                <svg
                    t="1673355036226"
                    v-if="musicVideo"
                    @click="toAddMusicVideo()"
                    class="icon"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    p-id="16255"
                    width="200"
                    height="200"
                >
                    <path
                        d="M220 600c17.673 0 32 14.327 32 32v91.999l92 0.001c17.673 0 32 14.327 32 32 0 17.673-14.327 32-32 32h-92v92c0 17.673-14.327 32-32 32-17.673 0-32-14.327-32-32v-92H96c-17.673 0-32-14.327-32-32 0-17.673 14.327-32 32-32h92v-92c0-17.673 14.327-32 32-32z m498.268-440c35.307 0 63.928 28.654 63.928 64v147.387l125.63-80.353c21.065-13.473 48.617 1.386 49.166 26.21L957 318v368c0 25.024-27.341 40.268-48.533 27.366l-0.64-0.4-125.63-80.354V800c0 35.346-28.622 64-63.929 64H448v-68.001h266.272V228H134.923V577H67V224c0-35.346 28.622-64 63.928-64h587.34z m174.803 216.417l-110.875 70.916v109.332l110.875 70.916V376.417zM290.713 286c17.673 0 32 14.327 32 32 0 17.673-14.327 32-32 32h-65.854c-17.674 0-32-14.327-32-32 0-17.673 14.326-32 32-32h65.854z"
                        fill="#000000"
                        p-id="16256"
                    ></path>
                </svg>
                <!-- 罗马音歌词图标 - 只有在当前歌曲有罗马音歌词时才显示 -->
                <svg
                    t="1673182533775"
                    v-show="hasRomaLyric && lyricType.indexOf('roma') != -1 && lyricType.indexOf('noRoma') == -1"
                    @click="lyricType.splice(lyricType.indexOf('roma'), 1)"
                    class="icon lyric-toggle active"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    p-id="47744"
                    width="200"
                    height="200"
                >
                    <path
                        d="M927.1 270.6c-19.9 0-36.1-16.2-36.1-36.1V83.7c0-6.2-5.2-11.5-11.5-11.5H144.6c-6.2 0-11.5 5.2-11.5 11.5v150.8c0 20-16.2 36.1-36.1 36.1s-36.1-16.2-36.1-36.1V83.7C60.9 37.5 98.5 0 144.6 0h734.9c46.1 0 83.7 37.5 83.7 83.7v150.8c0.1 20-16.1 36.1-36.1 36.1zM879.6 1024h-735c-46.1 0-83.7-37.5-83.7-83.7V732.7c0-20 16.2-36.1 36.1-36.1s36.1 16.2 36.1 36.1v207.6c0 6.2 5.2 11.5 11.5 11.5h734.9c6.2 0 11.5-5.2 11.5-11.5V732.7c0-20 16.2-36.1 36.1-36.1s36.1 16.2 36.1 36.1v207.6c0.1 46.2-37.5 83.7-83.6 83.7zM302.7 662.9c-7.7 0-14.6-2.4-20.8-7.1-6.2-4.8-10.3-10.8-12.4-18.3L254 579.6c-0.6-2.4-2-3.6-4.4-3.6H147.5c-2.1 0-3.4 1.2-4 3.6l-15.9 57.9c-2.1 7.4-6.1 13.5-12.2 18.3-6 4.8-12.9 7.1-20.6 7.1H79c-6.5 0-11.6-2.7-15.5-8-2.4-3.3-3.5-6.8-3.5-10.7 0-2.1 0.3-4.2 0.9-6.2l91.5-287.8c2.4-7.4 6.6-13.4 12.8-18s13.3-6.9 21.2-6.9H213c7.7 0 14.7 2.3 21 6.9s10.7 10.6 13.1 18L339 638c0.6 2.1 0.9 4.2 0.9 6.2 0 3.9-1.3 7.4-4 10.7-3.8 5.4-8.8 8-15 8h-18.2zM159.9 520.3c-0.3 0.9-0.2 1.7 0.2 2.5 0.4 0.7 1.1 1.1 2 1.1h73c0.9 0 1.6-0.4 2.2-1.1 0.6-0.7 0.7-1.6 0.4-2.5l-9.3-33.4c-3.8-13.4-9.1-33.2-15.9-59.5s-11.2-43-13.3-50.1c0-0.6-0.3-0.9-0.9-0.9-0.6 0-1 0.3-1.3 0.9-8.5 36.2-18 72.8-28.3 109.6l-8.8 33.4zM411.9 662.9c-7.1 0-13.2-2.6-18.3-7.8-5.2-5.2-7.7-11.4-7.7-18.5V351.5c0-7.1 2.6-13.3 7.7-18.5 5.2-5.2 11.3-7.8 18.3-7.8h84.9c80.8 0 121.2 27.8 121.2 83.3 0 15.7-4.1 30.4-12.2 44.1-8.1 13.7-18.8 23.2-32.1 28.5-0.9 0-1.3 0.4-1.3 1.3s0.3 1.3 0.9 1.3c18.9 4.8 33.9 13.8 45.1 27.2 11.2 13.4 16.8 30.9 16.8 52.6 0 32.7-11.9 57.4-35.8 74.2-23.9 16.8-55.1 25.2-93.7 25.2h-93.8z m41.2-203.6c0 2.1 1 3.1 3.1 3.1H492c20.6 0 36-3.9 46-11.6s15-18.6 15-32.5c0-14.5-4.9-25.1-14.8-31.6s-25-9.8-45.3-9.8h-36.7c-2 0-3.1 1-3.1 3.1v79.3z m0 148.4c0 2.1 1 3.1 3.1 3.1h43.3c47.2 0 70.7-17.1 70.7-51.2 0-16.3-5.9-28.2-17.7-35.6-11.8-7.4-29.5-11.1-53.1-11.1h-43.3c-2 0-3.1 1.2-3.1 3.6v91.2h0.1zM830.7 669.1c-21.2 0-41-3.8-59.5-11.4-18.4-7.6-34.6-18.6-48.6-33s-25.1-32.7-33.2-54.8c-8.1-22.1-12.2-47-12.2-74.6 0-27 4.1-51.8 12.4-74.2 8.3-22.4 19.5-41.1 33.8-55.9 14.3-14.9 30.9-26.3 49.7-34.3 18.9-8 38.9-12 60.1-12 28.3 0 54.4 8.8 78.3 26.3 6.5 4.5 9.7 11 9.7 19.6 0 6.5-2.2 12.5-6.6 17.8l-1.8 2.2c-4.4 5.3-10.3 8.3-17.7 8.9h-2.7c-6.2 0-11.8-1.6-16.8-4.9-13-8-26.7-12-41.1-12-25.9 0-47.2 10.5-63.9 31.4s-25 49.2-25 84.9c0 36.5 7.9 65.3 23.7 86.2s37 31.4 63.9 31.4c17.7 0 34.2-5.3 49.5-16 5-3.6 10.7-5.3 17.2-5.3h1.8c7.1 0.3 12.8 3.1 17.2 8.5l1.8 1.8c4.7 5.4 7.1 11.6 7.1 18.7 0 8.3-2.9 14.9-8.8 19.6-24.7 20.8-54.1 31.1-88.3 31.1z"
                        p-id="47745"
                        fill="#000000"
                    ></path>
                </svg>
                <svg
                    t="1673182533775"
                    v-show="hasRomaLyric && lyricType.indexOf('roma') == -1 && lyricType.indexOf('noRoma') == -1"
                    @click="lyricType.push('roma')"
                    class="icon lyric-toggle inactive"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    p-id="47744"
                    width="200"
                    height="200"
                >
                    <path
                        d="M927.1 270.6c-19.9 0-36.1-16.2-36.1-36.1V83.7c0-6.2-5.2-11.5-11.5-11.5H144.6c-6.2 0-11.5 5.2-11.5 11.5v150.8c0 20-16.2 36.1-36.1 36.1s-36.1-16.2-36.1-36.1V83.7C60.9 37.5 98.5 0 144.6 0h734.9c46.1 0 83.7 37.5 83.7 83.7v150.8c0.1 20-16.1 36.1-36.1 36.1zM879.6 1024h-735c-46.1 0-83.7-37.5-83.7-83.7V732.7c0-20 16.2-36.1 36.1-36.1s36.1 16.2 36.1 36.1v207.6c0 6.2 5.2 11.5 11.5 11.5h734.9c6.2 0 11.5-5.2 11.5-11.5V732.7c0-20 16.2-36.1 36.1-36.1s36.1 16.2 36.1 36.1v207.6c0.1 46.2-37.5 83.7-83.6 83.7zM302.7 662.9c-7.7 0-14.6-2.4-20.8-7.1-6.2-4.8-10.3-10.8-12.4-18.3L254 579.6c-0.6-2.4-2-3.6-4.4-3.6H147.5c-2.1 0-3.4 1.2-4 3.6l-15.9 57.9c-2.1 7.4-6.1 13.5-12.2 18.3-6 4.8-12.9 7.1-20.6 7.1H79c-6.5 0-11.6-2.7-15.5-8-2.4-3.3-3.5-6.8-3.5-10.7 0-2.1 0.3-4.2 0.9-6.2l91.5-287.8c2.4-7.4 6.6-13.4 12.8-18s13.3-6.9 21.2-6.9H213c7.7 0 14.7 2.3 21 6.9s10.7 10.6 13.1 18L339 638c0.6 2.1 0.9 4.2 0.9 6.2 0 3.9-1.3 7.4-4 10.7-3.8 5.4-8.8 8-15 8h-18.2zM159.9 520.3c-0.3 0.9-0.2 1.7 0.2 2.5 0.4 0.7 1.1 1.1 2 1.1h73c0.9 0 1.6-0.4 2.2-1.1 0.6-0.7 0.7-1.6 0.4-2.5l-9.3-33.4c-3.8-13.4-9.1-33.2-15.9-59.5s-11.2-43-13.3-50.1c0-0.6-0.3-0.9-0.9-0.9-0.6 0-1 0.3-1.3 0.9-8.5 36.2-18 72.8-28.3 109.6l-8.8 33.4zM411.9 662.9c-7.1 0-13.2-2.6-18.3-7.8-5.2-5.2-7.7-11.4-7.7-18.5V351.5c0-7.1 2.6-13.3 7.7-18.5 5.2-5.2 11.3-7.8 18.3-7.8h84.9c80.8 0 121.2 27.8 121.2 83.3 0 15.7-4.1 30.4-12.2 44.1-8.1 13.7-18.8 23.2-32.1 28.5-0.9 0-1.3 0.4-1.3 1.3s0.3 1.3 0.9 1.3c18.9 4.8 33.9 13.8 45.1 27.2 11.2 13.4 16.8 30.9 16.8 52.6 0 32.7-11.9 57.4-35.8 74.2-23.9 16.8-55.1 25.2-93.7 25.2h-93.8z m41.2-203.6c0 2.1 1 3.1 3.1 3.1H492c20.6 0 36-3.9 46-11.6s15-18.6 15-32.5c0-14.5-4.9-25.1-14.8-31.6s-25-9.8-45.3-9.8h-36.7c-2 0-3.1 1-3.1 3.1v79.3z m0 148.4c0 2.1 1 3.1 3.1 3.1h43.3c47.2 0 70.7-17.1 70.7-51.2 0-16.3-5.9-28.2-17.7-35.6-11.8-7.4-29.5-11.1-53.1-11.1h-43.3c-2 0-3.1 1.2-3.1 3.6v91.2h0.1zM830.7 669.1c-21.2 0-41-3.8-59.5-11.4-18.4-7.6-34.6-18.6-48.6-33s-25.1-32.7-33.2-54.8c-8.1-22.1-12.2-47-12.2-74.6 0-27 4.1-51.8 12.4-74.2 8.3-22.4 19.5-41.1 33.8-55.9 14.3-14.9 30.9-26.3 49.7-34.3 18.9-8 38.9-12 60.1-12 28.3 0 54.4 8.8 78.3 26.3 6.5 4.5 9.7 11 9.7 19.6 0 6.5-2.2 12.5-6.6 17.8l-1.8 2.2c-4.4 5.3-10.3 8.3-17.7 8.9h-2.7c-6.2 0-11.8-1.6-16.8-4.9-13-8-26.7-12-41.1-12-25.9 0-47.2 10.5-63.9 31.4s-25 49.2-25 84.9c0 36.5 7.9 65.3 23.7 86.2s37 31.4 63.9 31.4c17.7 0 34.2-5.3 49.5-16 5-3.6 10.7-5.3 17.2-5.3h1.8c7.1 0.3 12.8 3.1 17.2 8.5l1.8 1.8c4.7 5.4 7.1 11.6 7.1 18.7 0 8.3-2.9 14.9-8.8 19.6-24.7 20.8-54.1 31.1-88.3 31.1z"
                        p-id="47745"
                        fill="#8a8a8a"
                    ></path>
                </svg>
                <!-- 翻译歌词图标 - 只有在当前歌曲有翻译歌词时才显示 -->
                <svg
                    t="1673182625534"
                    v-show="hasTransLyric && lyricType.indexOf('trans') != -1 && lyricType.indexOf('noTrans') == -1"
                    @click="lyricType.splice(lyricType.indexOf('trans'), 1)"
                    class="icon lyric-toggle active"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    p-id="49286"
                    width="200"
                    height="200"
                >
                    <path
                        d="M128 64c-35.345655 0-64 28.654345-64 64v768c0 35.345655 28.654345 64 64 64h768c35.345655 0 64-28.654345 64-64v-768c0-35.345655-28.654345-64-64-64h-768z m0-64h768C966.692487 0 1024 57.307513 1024 128v768C1024 966.692487 966.692487 1024 896 1024h-768C57.307513 1024 0 966.692487 0 896v-768C0 57.307513 57.307513 0 128 0z m329.143025 251.428487h301.715127v68.571513c-18.020046 27.895172-58.368 67.967706-96.000589 96.000589 24.064 8.704 69.777949 13.274336 137.143026 13.71336l-13.714538 68.57269c-63.360883-7.297471-123.483807-31.818152-164.572102-54.858152-43.775411 21.120294-101.211218 41.41668-164.570924 54.856975l-27.429076-68.571513c56.378851-8.492138 100.279025-12.452782 137.143026-27.427898-28.031706-24.960883-54.747513-45.038345-68.571513-82.286051h-41.142437v-68.571513z m114.85749 68.571513c12.288 25.728294 22.271411 41.183632 47.998529 60.000515 31.873471-19.969177 45.072478-35.424515 60.048772-60.000515h-108.047301zM512 512h68.571513v-41.142437h68.556211V512h68.586814v68.571513h-68.586814v41.142436h109.729251v68.57269h-109.729251v109.712772H580.57269v-109.713949h-109.71395v-68.571513h109.71395V580.57269H512V512zM306.285462 223.999411c34.286345 22.113692 81.117278 54.858152 109.713949 82.286051l-54.856974 68.57269c-21.504-26.113177-54.527411-65.665471-95.999412-96.000589l41.142437-54.856974z m137.157149 397.714538v54.856975c-56.437701 53.431614-97.586023 90.002538-123.442611 109.715127l-36.000074-58.28561c10.752-9.600883 22.285536-25.042097 22.285536-37.714979V470.857563h-82.284873v-68.572689h150.857563V662.857563c28.631982-9.103007 51.494253-22.817545 68.584459-41.143614z"
                        fill="#000000"
                        p-id="49287"
                    ></path>
                </svg>
                <svg
                    t="1673182625534"
                    v-show="hasTransLyric && lyricType.indexOf('trans') == -1 && lyricType.indexOf('noTrans') == -1"
                    @click="lyricType.push('trans')"
                    class="icon lyric-toggle inactive"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    p-id="49286"
                    width="200"
                    height="200"
                >
                    <path
                        d="M128 64c-35.345655 0-64 28.654345-64 64v768c0 35.345655 28.654345 64 64 64h768c35.345655 0 64-28.654345 64-64v-768c0-35.345655-28.654345-64-64-64h-768z m0-64h768C966.692487 0 1024 57.307513 1024 128v768C1024 966.692487 966.692487 1024 896 1024h-768C57.307513 1024 0 966.692487 0 896v-768C0 57.307513 57.307513 0 128 0z m329.143025 251.428487h301.715127v68.571513c-18.020046 27.895172-58.368 67.967706-96.000589 96.000589 24.064 8.704 69.777949 13.274336 137.143026 13.71336l-13.714538 68.57269c-63.360883-7.297471-123.483807-31.818152-164.572102-54.858152-43.775411 21.120294-101.211218 41.41668-164.570924 54.856975l-27.429076-68.571513c56.378851-8.492138 100.279025-12.452782 137.143026-27.427898-28.031706-24.960883-54.747513-45.038345-68.571513-82.286051h-41.142437v-68.571513z m114.85749 68.571513c12.288 25.728294 22.271411 41.183632 47.998529 60.000515 31.873471-19.969177 45.072478-35.424515 60.048772-60.000515h-108.047301zM512 512h68.571513v-41.142437h68.556211V512h68.586814v68.571513h-68.586814v41.142436h109.729251v68.57269h-109.729251v109.712772H580.57269v-109.713949h-109.71395v-68.571513h109.71395V580.57269H512V512zM306.285462 223.999411c34.286345 22.113692 81.117278 54.858152 109.713949 82.286051l-54.856974 68.57269c-21.504-26.113177-54.527411-65.665471-95.999412-96.000589l41.142437-54.856974z m137.157149 397.714538v54.856975c-56.437701 53.431614-97.586023 90.002538-123.442611 109.715127l-36.000074-58.28561c10.752-9.600883 22.285536-25.042097 22.285536-37.714979V470.857563h-82.284873v-68.572689h150.857563V662.857563c28.631982-9.103007 51.494253-22.817545 68.584459-41.143614z"
                        fill="#8a8a8a"
                        p-id="49287"
                    ></path>
                </svg>
                <!-- 原歌词图标 - 只有在当前歌曲有原歌词时才显示 -->
                <svg
                    t="1673182198291"
                    v-show="hasOriginalLyric && lyricType.indexOf('original') != -1 && lyricType.indexOf('noOriginal') == -1"
                    @click="lyricType.splice(lyricType.indexOf('original'), 1)"
                    class="icon lyric-toggle active"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    p-id="11459"
                    width="200"
                    height="200"
                >
                    <path
                        d="M934.4 1024h-844.8c-49.152 0-89.6-40.448-89.6-89.6v-844.8c0-49.152 40.448-89.6 89.6-89.6h844.8c49.152 0 89.6 40.448 89.6 89.6v844.8c0 49.152-40.448 89.6-89.6 89.6z m-844.8-957.44c-12.8 0-23.04 10.24-23.04 23.04v844.8c0 12.8 10.24 23.04 23.04 23.04h844.8c12.8 0 23.04-10.24 23.04-23.04v-844.8c0-12.8-10.24-23.04-23.04-23.04h-844.8z"
                        fill="#000000"
                        p-id="11460"
                    ></path>
                    <path
                        d="M803.84 283.648h-583.68c-18.432 0-33.28-14.848-33.28-33.28s14.848-33.28 33.28-33.28h583.68c18.432 0 33.28 14.848 33.28 33.28s-14.848 33.28-33.28 33.28z"
                        fill="#000000"
                        p-id="11461"
                    ></path>
                    <path
                        d="M478.72 835.072v-583.68c0-18.432 14.848-33.28 33.28-33.28s33.28 14.848 33.28 33.28v583.68c0 18.432-14.848 33.28-33.28 33.28s-33.28-14.848-33.28-33.28z"
                        fill="#000000"
                        p-id="11462"
                    ></path>
                </svg>
                <svg
                    t="1673182198291"
                    v-show="hasOriginalLyric && lyricType.indexOf('original') == -1 && lyricType.indexOf('noOriginal') == -1"
                    @click="lyricType.push('original')"
                    class="icon lyric-toggle inactive"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    p-id="11459"
                    width="200"
                    height="200"
                >
                    <path
                        d="M934.4 1024h-844.8c-49.152 0-89.6-40.448-89.6-89.6v-844.8c0-49.152 40.448-89.6 89.6-89.6h844.8c49.152 0 89.6 40.448 89.6 89.6v844.8c0 49.152-40.448 89.6-89.6 89.6z m-844.8-957.44c-12.8 0-23.04 10.24-23.04 23.04v844.8c0 12.8 10.24 23.04 23.04 23.04h844.8c12.8 0 23.04-10.24 23.04-23.04v-844.8c0-12.8-10.24-23.04-23.04-23.04h-844.8z"
                        fill="#8a8a8a"
                        p-id="11460"
                    ></path>
                    <path
                        d="M803.84 283.648h-583.68c-18.432 0-33.28-14.848-33.28-33.28s14.848-33.28 33.28-33.28h583.68c18.432 0 33.28 14.848 33.28 33.28s-14.848 33.28-33.28 33.28z"
                        fill="#8a8a8a"
                        p-id="11461"
                    ></path>
                    <path
                        d="M478.72 835.072v-583.68c0-18.432 14.848-33.28 33.28-33.28s33.28 14.848 33.28 33.28v583.68c0 18.432-14.848 33.28-33.28 33.28s-33.28-14.848-33.28-33.28z"
                        fill="#8a8a8a"
                        p-id="11462"
                    ></path>
                </svg>

                <!-- 喜欢/收藏：仅在线歌曲显示；本地与电台隐藏/分支另行处理 -->
                <template v-if="!isDjMode && (songList?.[currentIndex]?.type !== 'local')">
                    <svg
                        t="1668786418014"
                        v-if="userStore.likelist"
                        @click="likeSong(true)"
                        v-show="!checkIsLike(songId)"
                        class="icon like-icon"
                        viewBox="0 0 1024 1024"
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        p-id="1417"
                        width="200"
                        height="200"
                    >
                        <path
                            d="M736.603 35.674c-87.909 0-169.647 44.1-223.447 116.819C459.387 79.756 377.665 35.674 289.708 35.674c-158.47 0-287.397 140.958-287.397 314.233 0 103.371 46.177 175.887 83.296 234.151 107.88 169.236 379.126 379.846 390.616 388.725 11.068 8.557 24.007 12.837 36.917 12.837 12.939 0 25.861-4.28 36.917-12.837 11.503-8.879 282.765-219.488 390.614-388.725C977.808 525.793 1024 453.277 1024 349.907 1023.999 176.632 895.071 35.674 736.603 35.674zM888.196 544.065C785.507 705.207 513.139 915.679 513.139 915.679S240.802 705.206 138.081 544.065c-37.884-59.491-71.805-116.034-71.805-194.158 0-134.904 100.025-244.309 223.433-244.309 91.199 0 169.491 59.833 204.225 145.493l0-0.427 0.094 0c2.588 8.933 10.132 15.445 19.113 15.445 9.013 0 16.558-6.512 19.128-15.445l0.265 0c34.813-85.404 112.996-145.066 204.07-145.066 123.378 0 223.433 109.405 223.433 244.309C960.035 428.031 926.111 484.574 888.196 544.065z"
                            p-id="1418"
                        ></path>
                    </svg>
                    <svg
                        t="1668786896650"
                        v-if="userStore.likelist"
                        @click="likeSong(false)"
                        v-show="checkIsLike(songId)"
                        class="icon like-icon liked"
                        viewBox="0 0 1025 1024"
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        p-id="9975"
                        width="200"
                        height="200"
                    >
                        <path
                            d="M1024.549 360.609c0-170.492-133.815-309.265-298.055-309.265-81.129 0-157.91 34.998-213.344 94.701-55.509-59.702-132.367-94.701-213.344-94.701C135.49 51.344 1.751 190.041 1.751 360.609c0 5.719 0.534 10.827 0.991 15.021-0.076 1.373-0.152 2.745-0.152 4.194 0 30.193 7.319 63.361 21.73 98.59 0.458 1.295 0.915 2.516 1.449 3.657 90.812 217.844 440.412 468.474 455.279 479.985 9.227 7.092 20.205 10.6 31.263 10.6 11.209 0 22.266-3.659 31.566-10.903 12.733-9.911 310.941-224.551 429.279-427.603 4.498-6.861 7.854-13.494 10.828-19.215 0.914-1.829 1.753-3.658 2.744-5.413l0.382-0.839c0.382-0.686 0.839-1.449 1.296-2.059 7.091-13.802 12.732-26.611 17.232-39.116 12.274-32.177 18.3-60.847 18.3-87.61 0-2.058-0.077-3.888-0.229-5.414C1024.093 370.979 1024.549 366.251 1024.549 360.609z"
                            p-id="9976"
                            fill="#E5404F"
                        ></path>
                    </svg>
                </template>
                <template v-else-if="isDjMode">
                    <!-- 电台收藏/取消收藏 -->
                    <svg
                        t="1668786418014"
                        v-if="userStore.likelist"
                        @click="toggleDjSub(true)"
                        v-show="!djSubed"
                        class="icon like-icon"
                        viewBox="0 0 1024 1024"
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        p-id="1417"
                        width="200"
                        height="200"
                    >
                        <path
                            d="M736.603 35.674c-87.909 0-169.647 44.1-223.447 116.819C459.387 79.756 377.665 35.674 289.708 35.674c-158.47 0-287.397 140.958-287.397 314.233 0 103.371 46.177 175.887 83.296 234.151 107.88 169.236 379.126 379.846 390.616 388.725 11.068 8.557 24.007 12.837 36.917 12.837 12.939 0 25.861-4.28 36.917-12.837 11.503-8.879 282.765-219.488 390.614-388.725C977.808 525.793 1024 453.277 1024 349.907 1023.999 176.632 895.071 35.674 736.603 35.674zM888.196 544.065C785.507 705.207 513.139 915.679 513.139 915.679S240.802 705.206 138.081 544.065c-37.884-59.491-71.805-116.034-71.805-194.158 0-134.904 100.025-244.309 223.433-244.309 91.199 0 169.491 59.833 204.225 145.493l0-0.427 0.094 0c2.588 8.933 10.132 15.445 19.113 15.445 9.013 0 16.558-6.512 19.128-15.445l0.265 0c34.813-85.404 112.996-145.066 204.07-145.066 123.378 0 223.433 109.405 223.433 244.309C960.035 428.031 926.111 484.574 888.196 544.065z"
                            p-id="1418"
                        ></path>
                    </svg>
                    <svg
                        t="1668786896650"
                        v-if="userStore.likelist"
                        @click="toggleDjSub(false)"
                        v-show="djSubed"
                        class="icon like-icon liked"
                        viewBox="0 0 1025 1024"
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        p-id="9975"
                        width="200"
                        height="200"
                    >
                        <path
                            d="M1024.549 360.609c0-170.492-133.815-309.265-298.055-309.265-81.129 0-157.91 34.998-213.344 94.701-55.509-59.702-132.367-94.701-213.344-94.701C135.49 51.344 1.751 190.041 1.751 360.609c0 5.719 0.534 10.827 0.991 15.021-0.076 1.373-0.152 2.745-0.152 4.194 0 30.193 7.319 63.361 21.73 98.59 0.458 1.295 0.915 2.516 1.449 3.657 90.812 217.844 440.412 468.474 455.279 479.985 9.227 7.092 20.205 10.6 31.263 10.6 11.209 0 22.266-3.659 31.566-10.903 12.733-9.911 310.941-224.551 429.279-427.603 4.498-6.861 7.854-13.494 10.828-19.215 0.914-1.829 1.753-3.658 2.744-5.413l0.382-0.839c0.382-0.686 0.839-1.449 1.296-2.059 7.091-13.802 12.732-26.611 17.232-39.116 12.274-32.177 18.3-60.847 18.3-87.61 0-2.058-0.077-3.888-0.229-5.414C1024.093 370.979 1024.549 366.251 1024.549 360.609z"
                            p-id="9976"
                            fill="#E5404F"
                        ></path>
                    </svg>
                </template>
                <!-- 下载：本地歌曲不显示 -->
                <svg v-if="songList?.[currentIndex]?.type !== 'local'" t="1669445939818" @click="download()" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5311" width="200" height="200">
                    <path d="M545.472 32v837.504L947.2 467.712l44.544 46.144-478.08 478.144L32.128 510.4l44.48-44.544 405.248 403.712V32h63.616z" p-id="5312"></path>
                </svg>
                <!-- 添加到歌单：本地与电台均不显示 -->
                <svg v-if="!isDjMode && (songList?.[currentIndex]?.type !== 'local')" @click="addToPlaylist()" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="200" height="200">
                    <path d="M512 85.333333c235.648 0 426.666667 191.018667 426.666667 426.666667s-191.018667 426.666667-426.666667 426.666667S85.333333 747.648 85.333333 512 276.352 85.333333 512 85.333333z m0 85.333334a341.333333 341.333333 0 1 0 0 682.666666 341.333333 341.333333 0 0 0 0-682.666666z m0 128a42.666667 42.666667 0 0 1 42.666667 42.666666v128H682.666667a42.666667 42.666667 0 0 1 0 85.333334H554.666667v128a42.666667 42.666667 0 0 1-85.333334 0V554.666667H341.333333a42.666667 42.666667 0 0 1 0-85.333334h128V341.333333a42.666667 42.666667 0 0 1 42.666667-42.666666z" fill="#000000"></path>
                </svg>
                <!-- 显示专辑：本地歌曲不显示图标 -->
                <svg v-if="songList?.[currentIndex]?.type !== 'local'" t="1668785761323" @click="toAlbum()" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1173" width="200" height="200">
                    <path
                        d="M459.838061 502.318545c0-30.657939 24.948364-55.606303 55.606303-55.606303s55.544242 24.948364 55.544242 55.606303-24.886303 55.606303-55.544242 55.606303a55.668364 55.668364 0 0 1-55.606303-55.606303m173.242181 0c0-64.884364-52.751515-117.666909-117.635878-117.666909a117.79103 117.79103 0 0 0-117.666909 117.666909 117.79103 117.79103 0 0 0 117.666909 117.66691 117.76 117.76 0 0 0 117.604848-117.66691"
                        p-id="1174"
                        fill="#000000"
                    ></path>
                    <path
                        d="M515.413333 935.439515c-238.809212 0-433.089939-194.311758-433.089939-433.089939 0-238.840242 194.249697-433.18303 433.12097-433.183031 238.809212 0 433.12097 194.342788 433.120969 433.183031 0 238.778182-194.311758 433.089939-433.120969 433.089939m0-928.302545C242.346667 7.13697 20.262788 229.251879 20.262788 502.349576c0 273.035636 222.145939 495.181576 495.181576 495.181576s495.181576-222.17697 495.181575-495.181576c0-273.066667-222.17697-495.243636-495.181575-495.243637"
                        p-id="1175"
                        fill="#000000"
                    ></path>
                    <path
                        d="M806.353455 471.288242a31.030303 31.030303 0 0 0-31.030303 31.030303v0.031031c0 143.297939-116.580848 259.847758-259.878788 259.847757a31.030303 31.030303 0 0 0 0 62.060606c177.493333 0 321.939394-144.41503 321.939394-321.939394a31.030303 31.030303 0 0 0-31.030303-31.030303M515.413333 242.439758a31.030303 31.030303 0 0 0 0-62.060606c-177.493333 0-321.877333 144.41503-321.908363 321.908363v0.03103a31.030303 31.030303 0 0 0 62.060606 0c0-143.297939 116.580848-259.878788 259.878788-259.878787z"
                        p-id="1176"
                        fill="#000000"
                    ></path>
                </svg>
                <svg
                    t="1670376314067"
                    @click="changePlayMode()"
                    v-show="playMode == 0"
                    class="icon"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    p-id="3089"
                    width="200"
                    height="200"
                >
                    <path
                        d="M342.69 297.61c-22.96 0-41.3-18.63-41.3-41.32 0-22.67 18.34-41.03 41.3-41.03h457.64c61.35 0 117.2 25.32 157.94 65.49 40.76 40.71 65.73 96.88 65.73 158.23v146.07c0 61.65-24.97 117.52-65.73 158.23-40.73 40.17-96.58 65.46-157.94 65.46H342.69c-61.68 0-117.52-25.29-158.23-65.46-36.09-36.62-60.52-85.52-64.6-139.06h-95.4C11.09 604.22 0 592.88 0 579.52c0-6.71 2.93-13.1 7.57-17.16l67.21-67.82 67.8-67.48c9.29-9.59 24.73-9.59 34.32 0h0.56l67.5 67.48 67.21 67.82c9.58 9.29 9.58 25 0 34.91-5.24 4.65-12.22 7.57-19.23 6.95h-91.02c4.05 31.15 18.9 59.66 40.11 80.9h0.3c25.88 25.59 61.41 41.56 100.37 41.56h457.64c38.66 0 74.16-15.98 99.75-41.56C925.97 659.53 942 624.01 942 585.05V438.98c0-38.96-16.03-74.46-41.91-100.05-25.59-25.91-61.09-41.32-99.75-41.32H342.69zM187.63 555.35h47.74l-25.32-25.88v-0.27l-50.32-50.05-50.34 50.05v0.27L83.8 555.35h103.83z"
                        fill="#231815"
                        p-id="3090"
                    ></path>
                </svg>
                
                <svg
                    t="1668787163705"
                    @click="changePlayMode()"
                    v-show="playMode == 1"
                    class="icon"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    p-id="2180"
                    width="200"
                    height="200"
                >
                    <path
                        d="M694.4 854.4H195.2l48 44.8c9.6 6.4 16 16 16 28.8-3.2 19.2-19.2 32-38.4 32-9.6 0-22.4-6.4-28.8-12.8l-108.8-96c-12.8-12.8-16-35.2 0-48L192 704c6.4-6.4 19.2-9.6 28.8-9.6 19.2 0 35.2 16 35.2 35.2 0 9.6-6.4 19.2-12.8 25.6l-41.6 38.4h496c112 0 198.4-89.6 198.4-198.4v-86.4c0-19.2 12.8-32 32-32s32 12.8 32 32v86.4c0 140.8-118.4 259.2-265.6 259.2zM329.6 169.6h496l-48-44.8c-9.6-6.4-16-16-16-28.8 3.2-19.2 19.2-32 38.4-32 9.6 0 22.4 6.4 28.8 12.8l108.8 96c12.8 12.8 16 35.2 0 48L832 320c-6.4 6.4-19.2 9.6-28.8 9.6-19.2 0-35.2-16-35.2-35.2 0-9.6 6.4-19.2 12.8-25.6l41.6-38.4H326.4C217.6 233.6 128 323.2 128 435.2v89.6c0 19.2-12.8 32-32 32s-32-12.8-32-32v-86.4C64 288 182.4 169.6 329.6 169.6z"
                        p-id="2181"
                    ></path>
                </svg>
                
                <svg
                    t="1668787191526"
                    @click="changePlayMode()"
                    v-show="playMode == 2"
                    class="icon"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    p-id="2500"
                    width="200"
                    height="200"
                >
                    <path
                        d="M928 476.8c-19.2 0-32 12.8-32 32v86.4c0 108.8-86.4 198.4-198.4 198.4H201.6l41.6-38.4c6.4-6.4 12.8-16 12.8-25.6 0-19.2-16-35.2-35.2-35.2-9.6 0-22.4 3.2-28.8 9.6l-108.8 99.2c-16 12.8-12.8 35.2 0 48l108.8 96c6.4 6.4 19.2 12.8 28.8 12.8 19.2 0 35.2-12.8 38.4-32 0-12.8-6.4-22.4-16-28.8l-48-44.8h499.2c147.2 0 265.6-118.4 265.6-259.2v-86.4c0-19.2-12.8-32-32-32zM96 556.8c19.2 0 32-12.8 32-32v-89.6c0-112 89.6-201.6 198.4-204.8h496l-41.6 38.4c-6.4 6.4-12.8 16-12.8 25.6 0 19.2 16 35.2 35.2 35.2 9.6 0 22.4-3.2 28.8-9.6l105.6-99.2c16-12.8 12.8-35.2 0-48l-108.8-96c-6.4-6.4-19.2-12.8-28.8-12.8-19.2 0-35.2 12.8-38.4 32 0 12.8 6.4 22.4 16 28.8l48 44.8H329.6C182.4 169.6 64 288 64 438.4v86.4c0 19.2 12.8 32 32 32z"
                        p-id="2501"
                    ></path>
                    <path d="M544 672V352h-48L416 409.6l16 41.6 60.8-41.6V672z" p-id="2502"></path>
                </svg>

                <svg
                    t="1668787213634"
                    @click="changePlayMode()"
                    v-show="playMode == 3"
                    class="icon"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    p-id="2661"
                    width="200"
                    height="200"
                >
                    <path
                        d="M844.8 665.6c-6.4-6.4-16-12.8-25.6-9.6-19.2 0-35.2 16-35.2 35.2 0 9.6 6.4 19.2 12.8 25.6l41.6 41.6c-44.8-6.4-86.4-22.4-121.6-51.2-3.2 0-3.2-3.2-6.4-6.4L332.8 304C268.8 233.6 192 195.2 99.2 195.2c-19.2 0-35.2 16-35.2 35.2s16 32 35.2 32c73.6 0 134.4 32 182.4 86.4l384 400 6.4 6.4c48 38.4 108.8 64 172.8 70.4l-48 44.8c-9.6 6.4-16 19.2-16 28.8 0 19.2 19.2 35.2 38.4 32 9.6 0 19.2-6.4 25.6-12.8l99.2-92.8c16-16 16-41.6 0-57.6l-99.2-102.4z m-3.2-556.8c-12.8-16-32-19.2-48-6.4-9.6 6.4-12.8 16-12.8 25.6 0 12.8 3.2 22.4 16 28.8l41.6 41.6c-73.6 9.6-140.8 38.4-192 89.6l-115.2 118.4c-12.8 12.8-12.8 32 0 44.8 6.4 6.4 16 9.6 25.6 9.6s19.2-3.2 25.6-9.6l112-118.4c41.6-38.4 92.8-64 147.2-70.4l-44.8 44.8c-6.4 6.4-12.8 16-12.8 25.6 0 19.2 16 35.2 32 35.2 9.6 0 19.2-3.2 28.8-9.6L950.4 256c12.8-12.8 12.8-35.2 0-48l-108.8-99.2m-438.4 448c-9.6 0-19.2 3.2-25.6 9.6l-118.4 121.6c-48 44.8-96 67.2-160 67.2H96c-19.2 0-35.2 16-35.2 35.2s16 32 35.2 32h3.2c83.2 0 147.2-32 211.2-86.4l121.6-124.8c6.4-6.4 9.6-12.8 9.6-22.4 0-9.6-3.2-16-9.6-22.4-9.6-6.4-19.2-9.6-28.8-9.6z"
                        p-id="2662"
                    ></path>
                </svg>

                <!-- 歌词/评论切换按钮：本地歌曲隐藏评论按钮 -->
                <svg
                    v-if="songList?.[currentIndex]?.type !== 'local'"
                    t="1673520001"
                    @click="switchRightPanel(props.rightPanelMode === 0 ? 1 : 0)"
                    :class="{ 'comment-icon-active': props.rightPanelMode === 1, 'comment-icon-inactive': props.rightPanelMode === 0 }"
                    class="icon comment-icon"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    width="32"
                    height="32"
                >
                    <path
                        d="M853.333333 85.333333a85.333333 85.333333 0 0 1 85.333334 85.333334v469.333333a85.333333 85.333333 0 0 1-85.333334 85.333333H298.666667L128 896V170.666667a85.333333 85.333333 0 0 1 85.333333-85.333334h640z m0 85.333334H213.333333v530.773333L285.44 640H853.333333V170.666667z m-512 128v85.333333H256v-85.333333h85.333333z m341.333334 0v85.333333H384v-85.333333h298.666667z m-341.333334 170.666666v85.333334H256v-85.333334h85.333333z m256 0v85.333334H384v-85.333334h213.333333z"
                    ></path>
                </svg>
                <!-- 桌面歌词控制按钮 -->
                <svg
                    @click="toggleDesktopLyric"
                    :class="{ active: isDesktopLyricOpen }"
                    class="icon desktop-lyric-btn"
                    viewBox="0 0 1024 1024"
                    xmlns="http://www.w3.org/2000/svg"
                    width="200"
                    height="200"
                >
                    <path
                        d="M896 128H128c-70.4 0-128 57.6-128 128v512c0 70.4 57.6 128 128 128h768c70.4 0 128-57.6 128-128V256c0-70.4-57.6-128-128-128zM128 192h768c35.2 0 64 28.8 64 64v85.333333H64V256c0-35.2 28.8-64 64-64z m768 640H128c-35.2 0-64-28.8-64-64V405.333333h896V768c0 35.2-28.8 64-64 64z"
                    ></path>
                    <path d="M256 576h512v64H256z m0 128h384v64H256z"></path>
                </svg>
            </div>
        </div>

        <PlayList class="playlist-widget-player" :class="{ 'playlist-widget-open': playlistWidgetShow }"></PlayList>

        <span class="border border1"></span>
        <span class="border border2"></span>
        <span class="border border3"></span>
        <span class="border border4"></span>
    </div>
</template>

<style scoped lang="scss">
.player-container {
    position: relative;
    z-index: 99;
    &:hover {
        .song-control {
            animation: song-control 0.1s forwards;
            @keyframes song-control {
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
            svg {
                transition: 0.2s;
                &:hover {
                    cursor: pointer;
                }
                &:active {
                    transform: scale(0.9);
                }
            }
        }
    }
    .player {
        width: 100%;
        height: 100%;
        transition: 0.2s;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        .player-cover {
            width: 100%;
            transition: 0.2s cubic-bezier(0.33, 0.88, 0.47, 0.94);
            position: relative;
            z-index: 99;
            .cover {
                padding: 1.5vh;
                width: 100%;
                opacity: 1;
                transform: scale(1);
                transition: 0.1s cubic-bezier(0.3, 0.79, 0.55, 0.99);
                img {
                    width: 100%;
                    max-height: 38vh;
                    object-fit: cover;
                    vertical-align: bottom;
                    box-shadow: 0 0 8px 0 rgba(0, 0, 0, 0.05);
                    // transform: scale(1.03);
                    // animation: cover-in 0.3s 0.65s cubic-bezier(0.4, 0, 0.12, 1) forwards;
                    @keyframes cover-in {
                        0% {
                            transform: scale(1.03);
                        }
                        100% {
                            transform: scale(1);
                        }
                    }
                }
            }
            .cover-change {
                opacity: 0;
                transform: scale(0.95);
            }
            .back-Video {
                &:hover {
                    cursor: pointer;
                    transform: scale(1.05);
                }
            }
            $boderpx: 2 + Px;
            .c-border {
                width: 4vh;
                height: 4vh;
                position: absolute;
            }
            .c-border1 {
                top: 1vh;
                left: 1vh;
                border: {
                    top: $boderpx solid black;
                    left: $boderpx solid black;
                }
                animation: border1 0.3s 0.65s cubic-bezier(0.4, 0, 0.12, 1) forwards;
                @keyframes border1 {
                    0% {
                        top: 1vh;
                        left: 1vh;
                    }
                    100% {
                        top: 0;
                        left: 0;
                    }
                }
            }
            .c-border2 {
                top: 1vh;
                right: 1vh;
                border: {
                    top: $boderpx solid black;
                    right: $boderpx solid black;
                }
                animation: border2 0.2s 0.65s cubic-bezier(0.4, 0, 0.12, 1) forwards;
                @keyframes border2 {
                    0% {
                        top: 1vh;
                        right: 1vh;
                    }
                    100% {
                        top: 0;
                        right: 0;
                    }
                }
            }
            .c-border3 {
                bottom: 1vh;
                right: 1vh;
                border: {
                    bottom: $boderpx solid black;
                    right: $boderpx solid black;
                }
                animation: border3 0.3s 0.65s cubic-bezier(0.4, 0, 0.12, 1) forwards;
                @keyframes border3 {
                    0% {
                        bottom: 1vh;
                        right: 1vh;
                    }
                    100% {
                        bottom: 0;
                        right: 0;
                    }
                }
            }
            .c-border4 {
                bottom: 1vh;
                left: 1vh;
                border: {
                    bottom: $boderpx solid black;
                    left: $boderpx solid black;
                }
                animation: border4 0.3s 0.65s cubic-bezier(0.4, 0, 0.12, 1) forwards;
                @keyframes border4 {
                    0% {
                        bottom: 1vh;
                        left: 1vh;
                    }
                    100% {
                        bottom: 0;
                        left: 0;
                    }
                }
            }
        }
        .player-info {
            margin-top: 1vh;
            padding: 1.5vh;
            width: 100%;
            .info-music {
                width: 100%;
                display: flex;
                flex-direction: row;
                justify-content: flex-start;
                align-items: center;
                text-align: left;
                white-space: nowrap;
                position: relative;
                &:first-child {
                    padding-bottom: 1.2vh;
                    overflow: hidden;
                }
                .music-name-lable,
                .music-author-lable {
                    position: absolute;
                }
                .music-name,
                .music-author {
                    margin-left: 10px;
                    width: 100%;
                    font-family: SourceHanSansCN-Bold;
                    user-select: text;
                    &::-webkit-scrollbar {
                        display: none;
                    }
                }
                .music-name {
                    margin-left: 1.5vh;
                    overflow: hidden;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                }
                .music-name-lable {
                    width: 100%;
                    height: 2.9vh;
                    background-color: black;
                    transition: 0.3s cubic-bezier(0.22, 0.89, 0.58, 0.99);
                    transform: translateX(calc(-100% + 5px));
                }
                .music-name-lable-in {
                    transform: translateX(0);
                }
                .music-name {
                    padding: 0.3vh 0;
                    font-family: SourceHanSansCN-Bold;
                    font-weight: bold;
                    font-size: 2.4vh;
                    color: black;
                }
                .music-name-in {
                    opacity: 0;
                }
                .music-author-lable {
                    width: 8px;
                    height: 8px;
                    border: 0.5px solid rgb(105, 105, 105);
                    position: absolute;
                    top: 1px;
                    left: -2px;
                    &::after {
                        content: '';
                        width: 4px;
                        height: 4px;
                        background-color: rgb(105, 105, 105);
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                    }
                }
                .music-author-lable-video {
                    border: 0.5px solid rgb(0, 0, 0);
                    &::after {
                        background-color: rgb(0, 0, 0);
                    }
                }
                .music-author {
                    font-size: 10px;
                    color: var(--muted-text);
                    .author {
                        transition: 0.2s;
                        &:hover {
                            cursor: pointer;
                            color: var(--text) !important;
                        }
                        &.disabled {
                            pointer-events: none;
                        }
                    }
                }
            }
        }
        .player-control {
            padding: 1.5vh;
            height: 32%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            .player-process {
                .process-time {
                    display: flex;
                    flex-direction: row;
                    justify-content: space-between;
                    align-items: center;
                    font: 1.5vh Bender-Bold;
                    color: black;
                }
                .process {
                    width: 100%;
                    height: 1.3vh;
                    position: relative;
                    .music-progress {
                        width: 100% !important;
                        height: 1.3vh !important;
                        box-shadow: 0 0 0 0.5px var(--text);
                        transition: 0.2s;
                    }
                }
            }
            .control {
                // margin: 2vh 0;
                display: flex;
                flex-direction: row;
                justify-content: space-evenly;
                align-items: center;
                svg {
                    width: 5vh;
                    height: 5vh;
                    transition: 0.2s;
                    &:hover {
                        cursor: pointer;
                    }
                    &:active {
                        transform: scale(0.9);
                    }
                }
            }
            .player-voluem {
                .voluem {
                    width: 100%;
                    height: 1.3vh;
                    position: relative;
                    .volume-slider {
                        height: 1.3vh !important;
                        box-shadow: 0 0 0 0.5px var(--text) !important;
                    }
                    .voluem-outline {
                        width: 100%;
                        height: 100%;
                        border: 1px solid var(--text);
                        position: absolute;
                    }
                    .voluem-content {
                        width: 46%;
                        height: 100%;
                        background-color: var(--text);
                        position: absolute;
                    }
                }
                .voluem-num {
                    display: flex;
                    flex-direction: row;
                    justify-content: space-between;
                    align-items: center;
                    font: 1.5vh Bender-Bold;
                    color: black;
                }
            }
        }
        .song-control {
            width: 50px;
            display: flex;
            flex-direction: column;
            align-items: center;
            position: absolute;
            bottom: 2vh;
            right: -50px;
            opacity: 0;
            svg {
                margin-top: 3vh;
                width: 2.5vh;
                height: 2.5vh;
            }
        }
    }
    .playlist-widget-player {
        position: absolute;
        right: -370px;
        bottom: 0;
    }
    .playlist-widget-open {
        height: 450px;
    }
    $boderPosition: -0.75 + vh;
    .border {
        width: 1.5vh;
        height: 1.5vh;
        background-color: black;
        position: absolute;
        z-index: 100;
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
    }
    .border4 {
        bottom: $boderPosition;
        left: $boderPosition;
    }

    // 评论图标样式
    .comment-icon {
        cursor: pointer;
        transition: all 0.3s ease;

        &.comment-icon-inactive {
            opacity: 0.5;

            path {
                fill: rgba(0, 0, 0, 0.3);
            }
        }

        &.comment-icon-active {
            opacity: 1;

            path {
                fill: #000000;
            }
        }

        &:hover {
            opacity: 0.8;
            transform: scale(1.05);
        }
    }

    .desktop-lyric-btn {
        opacity: 0.5;
        transition: all 0.2s ease;

        path {
            fill: #8a8a8a;
        }

        &.active {
            opacity: 1;

            path {
                fill: #000000;
            }
        }

        &:hover {
            opacity: 0.8;
            transform: scale(1.05);
        }

        &:active {
            transform: scale(0.95);
        }
    }
}
</style>
