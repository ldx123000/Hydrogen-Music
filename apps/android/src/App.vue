<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue';
import Home from './views/Home.vue';
import ListenTogetherRuntime from './components/ListenTogetherRuntime.vue';
import Title from './components/Title.vue';
import SearchInput from './components/SearchInput.vue';
import AudioVisualizer from './components/AudioVisualizer.vue';
import WindowControl from './components/WindowControl.vue';
import MusicWidget from './components/MusicWidget.vue';
import MobileTabBar from './components/mobile/MobileTabBar.vue';
import { useIsMobile } from './composables/useIsMobile';
import { destroyDesktopLyric, initDesktopLyric } from './utils/desktopLyric';
import { destroyLyricRuntime, initLyricRuntime } from './composables/usePlayerRuntime';
import { initMediaSession, initNativeMediaNotification } from './utils/mediaSession';
import { usePlaylistSync } from './composables/usePlaylistSync';

import { usePlayerStore } from './store/playerStore';
import { useOtherStore } from './store/otherStore';
import { useUserStore } from './store/userStore';
import { useRouter } from 'vue-router';
import { initAndroidBackButton } from './utils/backButton';

const MusicPlayer = defineAsyncComponent(() => import('./views/MusicPlayer.vue'));
const VideoPlayer = defineAsyncComponent(() => import('./components/VideoPlayer.vue'));
const ContextMenu = defineAsyncComponent(() => import('./components/ContextMenu.vue'));
const GlobalDialog = defineAsyncComponent(() => import('./components/GlobalDialog.vue'));
const GlobalNotice = defineAsyncComponent(() => import('./components/GlobalNotice.vue'));
const Update = defineAsyncComponent(() => import('./components/Update.vue'));

const playerStore = usePlayerStore();
const otherStore = useOtherStore();
const userStore = useUserStore();
const router = useRouter();
const isMobile = useIsMobile();
usePlaylistSync();
const visualizerActive = computed(() => {
    return playerStore.audioVisualizer && playerStore.playerShow && !playerStore.widgetState && !!playerStore.currentMusic;
});
const removeCheckUpdateListener = windowApi.checkUpdate((version) => {
    otherStore.toUpdate = true;
    otherStore.newVersion = version;
});

// 返回键处理器的取消订阅函数（见下方 onMounted）
let disposeAndroidBackButton = null;

onMounted(() => {
    initLyricRuntime();
    initDesktopLyric();
    // 系统媒体控制（Android 通知栏 / 锁屏的歌曲信息与播放控制）。
    // 这个模块一直存在但从没被调用过，所以通知栏始终不显示。
    initMediaSession();
    // Android WebView 不提供 mediaSession/Notification API（真机实测全是 undefined），
    // 通知栏改由原生插件发系统通知。
    void initNativeMediaNotification();
    // Android 返回键 / 返回手势：原生只派发事件，具体行为在这里决定
    // （关播放页 → 回上一级 → 才退出 App）。之前没接管，按一下就直接退到桌面。
    disposeAndroidBackButton = initAndroidBackButton(router);
});

onUnmounted(() => {
    destroyDesktopLyric();
    destroyLyricRuntime();
    removeCheckUpdateListener?.();
    disposeAndroidBackButton?.();
});

// 双击标题栏最大化窗口的处理函数
const handleTitleBarDoubleClick = () => {
    windowApi.windowMax('window-max');
};
</script>

<template>
    <ListenTogetherRuntime />
    <div class="mainWindow" :class="{ 'has-mini-player': !!playerStore.songList }">
        <Transition name="home">
            <Home class="home" v-show="playerStore.widgetState"></Home>
        </Transition>
    </div>
    <div
        class="globalWidget"
        :class="{
            'visualizer-active': visualizerActive,
            'hm-player-mode': isMobile && !!playerStore.songList && !playerStore.widgetState,
        }"
    >
        <Title class="widget-title"></Title>
        <AudioVisualizer class="widget-visualizer"></AudioVisualizer>
        <div class="widget-search" v-if="!userStore.localOnlyMode">
            <SearchInput></SearchInput>
        </div>
    </div>
    <div class="dragBar" @dblclick="handleTitleBarDoubleClick">
        <WindowControl></WindowControl>
    </div>
    <Transition name="widget">
        <div class="musicWidget" v-if="playerStore.songList" v-show="playerStore.widgetState">
            <MusicWidget></MusicWidget>
        </div>
    </Transition>
    <Transition name="player">
        <div class="musicPlayer" v-if="playerStore.songList" v-show="!playerStore.widgetState">
            <MusicPlayer></MusicPlayer>
        </div>
    </Transition>
    <Transition name="video">
        <div class="videoPlayer" v-if="otherStore.videoPlayerShow">
            <VideoPlayer></VideoPlayer>
        </div>
    </Transition>
    <div class="contextMune">
        <ContextMenu v-if="otherStore.contextMenuShow || otherStore.addPlaylistShow"></ContextMenu>
    </div>
    <div class="globalDialog">
        <GlobalDialog v-if="otherStore.dialogShow"></GlobalDialog>
    </div>
    <div class="globalNotice">
        <GlobalNotice v-if="otherStore.noticeShow"></GlobalNotice>
    </div>
    <!-- 移动端底部导航：仅在浏览态出现，全屏播放页会占满屏幕 -->
    <MobileTabBar v-if="isMobile && playerStore.widgetState" />
    <Transition name="fade">
        <div class="update" v-if="otherStore.toUpdate">
            <Update></Update>
        </div>
    </Transition>
</template>

<style lang="scss">
#app {
    user-select: none;
    margin: 0;
    padding: 0;
    max-width: 100%;
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}
.mainWindow {
    width: 100%;
    height: 100%;
    background: linear-gradient(rgba(176, 209, 217, 0.9) -20%, rgba(176, 209, 217, 0.4) 50%, rgba(176, 209, 217, 0.9) 120%);
    opacity: 0;
    animation: mainWindows-starting 0.8s cubic-bezier(0.14, 0.91, 0.58, 1) forwards;
    @keyframes mainWindows-starting {
        0% {
            background-color: rgba(222, 235, 239, 1);
            opacity: 0;
            transform: scale(1.3);
        }
        100% {
            background-color: rgb(255, 255, 255);
            opacity: 1;
            transform: scale(1);
        }
    }
    .home {
        height: calc(100% - 78px);
    }
}
.globalWidget {
    --visualizer-width: clamp(260px, 28vw, 340px);
    --visualizer-gap: 24px;
    --visualizer-shift: calc(var(--visualizer-width) + var(--visualizer-gap));

    display: flex;
    flex-direction: row;
    align-items: center;
    position: absolute;
    top: 22px;
    z-index: 999;
    left: 45px; // 所有平台保持统一的布局位置
    pointer-events: none;

    .widget-title {
        pointer-events: auto;

        &:hover {
            cursor: pointer;
        }
    }
    .widget-search {
        margin-left: 30px;
        transform: translate3d(calc(-1 * var(--visualizer-shift)), 0, 0);
        transition: transform 0.72s cubic-bezier(0.16, 1, 0.3, 1);
        will-change: transform;
        pointer-events: auto;
    }
    .widget-visualizer {
        flex-shrink: 0;
    }
    &.visualizer-active {
        .widget-search {
            transform: translate3d(0, 0, 0);
        }
    }
}
.dragBar {
    width: 100%;
    height: 35px;
    background: transparent;
    position: fixed;
    top: 0;
    z-index: 999;
    -webkit-app-region: drag;
    .window-control {
        position: fixed;
        top: 13px;
        -webkit-app-region: no-drag;
        z-index: 999;

        // macOS 按钮在左侧
        &.macos {
            left: 15px;
            top: 11px; // 稍微调整高度使其更居中
        }

        // Windows/Linux 按钮在右侧
        &.windows {
            right: 15px;
        }
    }
}
.musicWidget {
    width: 722px;
    height: 65px;
    position: fixed;
    left: 50%;
    bottom: 35px;
    transform: translateX(-50%);
    box-shadow: 0 0 15px 2px rgba(189, 189, 189, 0.1);
}
.musicPlayer {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
}
.videoPlayer {
    width: 100%;
    height: 100%;
    position: fixed;
    pointer-events: none;
    z-index: 999;
}
.globalNotice {
    bottom: 120px;
    position: fixed;
    z-index: 999;
}
.update {
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.1);
    position: fixed;
    z-index: 999;
}

.home-enter-active {
    transition: opacity 0.4s cubic-bezier(0.14, 0.91, 0.58, 1);
}

.home-enter-active .home-content {
    transition: transform 0.4s cubic-bezier(0.14, 0.91, 0.58, 1);
}

.home-enter-from {
    opacity: 0;
}

.home-enter-from .home-content {
    transform: scale(0.9);
}

.home-leave-active {
    transition: 0.4s cubic-bezier(0.14, 0.91, 0.58, 1);
}

.home-leave-to {
    transform: scale(0.9);
    opacity: 0;
}

.widget-enter-active,
.widget-leave-active {
    transition: 0.5s cubic-bezier(0.14, 0.91, 0.58, 1);
}

.widget-enter-from,
.widget-leave-to {
    bottom: -70px;
}

.player-enter-active,
.player-leave-active {
    transition: 0.5s cubic-bezier(0.14, 0.91, 0.58, 1);
}

.player-enter-from,
.player-leave-to {
    transform: translateY(100%);
}
.video-enter-active,
.video-leave-active {
    transition: 0.1s;
}

.video-enter-from,
.video-leave-to {
    transform: scale(0.8);
    opacity: 0;
}
.fade-enter-active {
    transition: 0.4s;
}
.fade-leave-active {
    transition: 0.3s;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
