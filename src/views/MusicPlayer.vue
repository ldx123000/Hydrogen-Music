<script setup>
import Player from '../components/Player.vue';
import Lyric from '../components/Lyric.vue';
import ProgramIntro from '../components/ProgramIntro.vue';
import Comments from '../components/Comments.vue';
import MusicVideo from '../components/MusicVideo.vue';
import PlayerVideo from '../components/PlayerVideo.vue';
import { ref, watch, nextTick, computed } from 'vue';
import { usePlayerStore } from '../store/playerStore';
const playerStore = usePlayerStore();

// 右侧内容切换状态 (0: 歌词, 1: 评论)
const rightPanelMode = ref(0);
const lyricKey = ref(0);

// 监听面板模式变化，当切换到歌词时刷新歌词组件
watch(rightPanelMode, (newMode, oldMode) => {
    if (newMode === 0 && oldMode === 1) {
        // 从评论区切换到歌词时，强制刷新歌词组件
        lyricKey.value++;
        
        // 确保 lyricShow 状态正确，并触发歌词位置同步
        nextTick(() => {
            playerStore.lyricShow = true;
            // 触发当前歌词索引的重新设置，确保组件能同步到正确位置
            if (playerStore.currentLyricIndex >= 0) {
                const currentIndex = playerStore.currentLyricIndex;
                playerStore.currentLyricIndex = -1;
                setTimeout(() => {
                    playerStore.currentLyricIndex = currentIndex;
                }, 50);
            }
        });
    }
});

// 当播放电台节目时，右侧显示电台简介而非歌词
const isDj = computed(() => playerStore.listInfo && playerStore.listInfo.type === 'dj');

const withCoverParam = (url, size = 512) => {
    if (!url) return null;
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    const hasQuery = url.includes('?');
    const hasParam = /(?:\\?|&)param=\\d+y\\d+/.test(url);
    if (hasParam) return url;
    return `${url}${hasQuery ? '&' : '?'}param=${size}y${size}`;
};

const coverBgUrl = computed(() => {
    const list = playerStore.songList || [];
    const idx = typeof playerStore.currentIndex === 'number' ? playerStore.currentIndex : 0;
    const song = list[idx] || null;
    if (!song) return null;
    if (song.type === 'local') return playerStore.localBase64Img || null;
    const url = song.coverUrl || song.al?.picUrl || song.blurPicUrl || song.img1v1Url || null;
    return withCoverParam(url, 512);
});

const showCoverBackdrop = computed(() => {
    return !!playerStore.coverBlur && !!coverBgUrl.value && !playerStore.videoIsPlaying;
});

// 当切到本地歌曲时，若右侧是评论区则自动切回歌词，避免无按钮无法关闭
const currentTrack = computed(() => {
    const list = playerStore.songList || [];
    const idx = typeof playerStore.currentIndex === 'number' ? playerStore.currentIndex : 0;
    return list[idx] || null;
});

const commentPanelKey = computed(() => {
    const track = currentTrack.value;
    const idx = typeof playerStore.currentIndex === 'number' ? playerStore.currentIndex : 0;
    if (isDj.value) {
        const pid = track && (track.programId || track.programID || track.programid);
        return `comments-dj-${pid || 'none'}-${idx}`;
    }
    const sid = (track && (track.id || track.songId || track.musicId)) || playerStore.songId || 'none';
    return `comments-song-${sid}-${idx}`;
});

watch(currentTrack, (song) => {
    try {
        if (song && song.type === 'local' && rightPanelMode.value === 1) {
            rightPanelMode.value = 0;
        }
    } catch (_) {}
});
</script>

<template>
    <div class="music-player">
        <Transition name="fade3">
            <div
                v-if="showCoverBackdrop"
                class="back-drop"
                :style="{ backgroundImage: coverBgUrl ? `url(${coverBgUrl})` : 'none' }"
            ></div>
        </Transition>
        <Player
            class="player-container"
            :class="{
                'player-hide': playerStore.videoIsPlaying && !playerStore.playerShow,
                'player-blur': playerStore.videoIsPlaying,
                'cover-blur': showCoverBackdrop,
            }"
            v-model:rightPanelMode="rightPanelMode"
        ></Player>

        <!-- 右侧面板 -->
        <div class="right-panel" :class="{ 'panel-hide': playerStore.videoIsPlaying && !playerStore.playerShow }">
            <!-- 内容区域 -->
            <Transition name="panel-switch" mode="out-in">
                <ProgramIntro v-if="rightPanelMode === 0 && isDj" key="program-intro" />
                <Lyric class="lyric-container" v-else-if="rightPanelMode === 0" :key="`lyric-${lyricKey}`"></Lyric>
                <Comments class="comments-container" v-else-if="rightPanelMode === 1" :key="commentPanelKey"></Comments>
            </Transition>
        </div>

        <Transition name="fade">
            <MusicVideo class="music-video" v-if="playerStore.addMusicVideo"></MusicVideo>
        </Transition>
        <Transition name="fade2">
            <PlayerVideo class="back-video" v-show="playerStore.videoIsPlaying" v-if="playerStore.currentMusicVideo && playerStore.musicVideo"></PlayerVideo>
        </Transition>
    </div>
</template>

<style scoped lang="scss">
@media screen and (max-aspect-ratio: 5/6) {
    .player-container {
        display: none;
    }
    .right-panel {
        width: 100% !important;
    }
}
.music-player {
    padding: 95px 45px 60px 45px;
    width: 100%;
    height: 100%;
    background: linear-gradient(rgba(176, 209, 217, 0.9) -20%, rgba(176, 209, 217, 0.4) 50%, rgba(176, 209, 217, 0.9) 120%);
    background-color: rgb(255, 255, 255);
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    transition: 0.2s;
    position: relative;
    overflow: hidden;

    .back-drop {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 0;
        width: 120%;
        height: 120%;
        pointer-events: none;
        background-repeat: no-repeat;
        background-position: center;
        background-size: cover;
        filter: blur(50px) saturate(120%);
        transform: translate3d(-10%, -10%, 0);
        transition: 0.3s;
    }

    .back-drop::before {
        content: '';
        display: block;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: var(--cover-backdrop-overlay, rgba(255, 255, 255, 0.3));
    }

    .player-container {
        padding: 16px 12px;
        padding-bottom: 4vh;
        width: 0;
        height: 0;
        background-color: rgba(255, 255, 255, 0.35);
        opacity: 0;
        animation: player-in 0.7s 0.2s cubic-bezier(0.4, 0, 0.12, 1) forwards;
        position: relative;
        z-index: 1;
        @keyframes player-in {
            0% {
                height: 0;
                opacity: 0;
            }
            35% {
                width: 42vh;
                height: 0;
            }
            100% {
                width: 42vh;
                height: 100%;
                opacity: 1;
            }
        }
    }
    .player-hide {
        width: 42vh;
        height: 100%;
        animation: player-hide 0.4s cubic-bezier(0.3, 0.79, 0.55, 0.99) forwards;
        @keyframes player-hide {
            0% {
                opacity: 1;
            }
            100% {
                transform: scale(0.85);
                opacity: 0;
                visibility: hidden;
            }
        }
    }
    .player-blur {
        background-color: rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(4px);
    }
    .cover-blur {
        background-color: rgba(255, 255, 255, 0.2);
        transform: translateZ(0);
    }
    .right-panel {
        margin-left: 50px;
        width: calc(100% - 42vh - 50px);
        height: 100%;
        transition: 0.6s cubic-bezier(0.3, 0.79, 0.55, 0.99);
        position: relative;
        z-index: 1;
        .lyric-container,
        .comments-container {
            width: 100%;
            height: 100%;
        }
    }
    .panel-hide {
        transform: scale(0.85);
        opacity: 0;
        visibility: hidden;
    }
    
    // 右侧面板切换动画
    .panel-switch-enter-active {
        transition: all 0.4s cubic-bezier(0.4, 0, 0.12, 1);
    }
    .panel-switch-leave-active {
        transition: all 0.3s cubic-bezier(0.3, 0.79, 0.55, 0.99);
    }
    .panel-switch-enter-from {
        opacity: 0;
        transform: translateX(30px) scale(0.95);
    }
    .panel-switch-leave-to {
        opacity: 0;
        transform: translateX(-30px) scale(0.95);
    }
    .music-video {
        position: absolute;
        z-index: 999;
    }
}
.back-video {
    width: 100%;
    height: 100%;
    background: black;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 0;
    pointer-events: none;
    .video-player {
        width: 100%;
        height: 100%;
    }
}
.fade-enter-active,
.fade-leave-active {
    transition: 0.1s;
}
.fade-enter-from,
.fade-leave-to {
    transform: scale(0.95);
    opacity: 0;
}
.fade2-enter-active {
    transition: 1s;
}
.fade2-leave-active {
    transition: 0.4s;
}
.fade2-enter-from,
.fade2-leave-to {
    opacity: 0;
}

.fade3-enter-active,
.fade3-leave-active {
    transition: opacity 0.35s ease;
}
.fade3-enter-from,
.fade3-leave-to {
    opacity: 0;
}
</style>
