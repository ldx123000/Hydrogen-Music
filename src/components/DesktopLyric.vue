<template>
    <div class="arknights-desktop-lyric" :class="{ draggable: !locked }" @contextmenu="showContextMenu" @click="handleClick">
        <!-- 背景层 -->
        <div class="background-layers">
            <div class="bg-layer bg-primary"></div>
            <div class="bg-layer bg-secondary"></div>
        </div>

        <!-- 内容区域 -->
        <div class="lyric-content">
            <!-- 顶部状态栏 -->
            <div class="status-bar">
                <div class="status-indicator" :class="{ active: playing }">
                    <div class="indicator-dot"></div>
                    <span class="status-text">{{ playing ? 'PLAYING' : 'PAUSED' }}</span>
                </div>
                <div class="lyric-controls">
                    <span class="font-size-label">{{ lyricFontSize }}PX</span>
                </div>
            </div>

            <!-- 歌曲信息区 -->
            <div class="song-info-section" v-if="currentSong">
                <div class="song-meta">
                    <div class="meta-row">
                        <span class="meta-label">TRACK</span>
                        <span class="meta-content">{{ currentSong.name || currentSong.localName || 'UNKNOWN' }}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">ARTIST</span>
                        <span class="meta-content">{{ getArtistNames(currentSong) || 'UNKNOWN' }}</span>
                    </div>
                </div>
            </div>

            <!-- 主歌词显示区（保留染色进度条效果） -->
            <div class="main-lyric-section">
                <div class="lyric-container">
                    <div class="lyric-prefix">></div>
                    <div
                        class="current-lyric"
                        ref="lyricElementRef"
                        :data-lyric="currentLyricText"
                        :style="{
                            fontSize: lyricFontSize + 'px',
                            opacity: currentLyricOpacity,
                        }"
                    >
                        {{ currentLyricText }}
                    </div>
                </div>

                <!-- 下一句歌词预览 -->
                <div class="next-lyric-preview" v-if="nextLyricText">
                    <div class="preview-indicator">NEXT</div>
                    <div
                        class="next-lyric"
                        :style="{
                            fontSize: lyricFontSize * 0.75 + 'px',
                            opacity: nextLyricOpacity,
                        }"
                    >
                        {{ nextLyricText }}
                    </div>
                </div>
            </div>

            <!-- 进度指示器 -->
            <div class="progress-section" v-if="lyricsArray.length > 0">
                <div class="progress-label">LYRIC PROGRESS</div>
                <div class="progress-bar">
                    <div class="progress-fill" :style="{ width: progressPercentage + '%' }"></div>
                    <div class="progress-indicator"></div>
                </div>
                <div class="progress-info">
                    <span>{{ currentLyricIndex + 1 }}</span>
                    <span>/</span>
                    <span>{{ lyricsArray.length }}</span>
                </div>
            </div>
        </div>

        <!-- 明日方舟风格右键菜单 -->
        <div class="arknights-context-menu" v-if="contextMenuVisible" :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }" @click.stop>
            <div class="menu-header">
                <span class="menu-title">DESKTOP LYRIC</span>
                <div class="title-underline"></div>
            </div>

            <div class="menu-content">
                <div class="menu-item" @click="toggleLock">
                    <div class="item-icon">🔒</div>
                    <span class="item-text">{{ locked ? 'UNLOCK POSITION' : 'LOCK POSITION' }}</span>
                    <div class="item-indicator"></div>
                </div>

                <div class="menu-item" @click="adjustFontSize(2)">
                    <div class="item-icon">➕</div>
                    <span class="item-text">INCREASE FONT</span>
                    <div class="item-indicator"></div>
                </div>

                <div class="menu-item" @click="adjustFontSize(-2)">
                    <div class="item-icon">➖</div>
                    <span class="item-text">DECREASE FONT</span>
                    <div class="item-indicator"></div>
                </div>

                <div class="menu-separator">
                    <div class="separator-line"></div>
                </div>

                <div class="menu-item danger" @click="closeLyric">
                    <div class="item-icon">✕</div>
                    <span class="item-text">CLOSE LYRIC</span>
                    <div class="item-indicator"></div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

// 响应式数据
const currentSong = ref(null);
const lyricsArray = ref([]);
const currentLyricIndex = ref(-1);
const progress = ref(0);
const playing = ref(false);
const locked = ref(false);
const lyricFontSize = ref(22);

// 同步扫描动画控制
const scanAnimationRef = ref(null);
const lyricElementRef = ref(null);

// 启动同步扫描动画
const startScanAnimation = () => {
    if (scanAnimationRef.value) {
        cancelAnimationFrame(scanAnimationRef.value);
    }

    let startTime = null;
    const duration = 10000; // 10秒一个循环

    const animate = currentTime => {
        if (!startTime) startTime = currentTime;
        const elapsed = currentTime - startTime;
        const cycleProgress = (elapsed % duration) / duration; // 0-1之间的循环进度

        // 计算黑色进度条的位置
        let scanProgress;
        let textClipProgress;

        if (cycleProgress <= 0.05) {
            // 初始阶段 (0%-5%)
            scanProgress = -100;
            textClipProgress = 0;
        } else if (cycleProgress <= 0.35) {
            // 扫描进入阶段 (5%-35%)
            const phase = (cycleProgress - 0.05) / 0.3; // 0-1
            scanProgress = -100 + phase * 100; // -100% 到 0%
            // 文字变化稍微延迟，考虑padding
            const textPhase = Math.max(0, (phase - 0.025) / 0.975); // 延迟8%开始
            textClipProgress = textPhase * 100;
        } else if (cycleProgress <= 0.65) {
            // 停顿阶段 (35%-65%)
            scanProgress = 0;
            textClipProgress = 100;
        } else if (cycleProgress <= 0.9) {
            // 清除退出阶段 (65%-90%)
            const phase = (cycleProgress - 0.65) / 0.25; // 0-1
            scanProgress = phase * 100; // 0% 到 100%
            // 文字清除稍微延迟，让黑色条清除到文字位置时文字才开始变黑
            const textPhase = Math.max(0, (phase - 0.025) / 0.975); // 延迟6%开始，稍微快一点
            textClipProgress = 100 - textPhase * 100; // 从100%变到0%
        } else {
            // 最后阶段 (90%-100%)
            scanProgress = 100;
            textClipProgress = 0;
        }

        // 应用CSS变量
        if (lyricElementRef.value) {
            lyricElementRef.value.style.setProperty('--scan-progress', `${scanProgress}%`);

            // 根据不同阶段设置不同的clip-path方向
            if (cycleProgress <= 0.65) {
                // 扫描和停顿阶段：从左向右显示白色文字
                lyricElementRef.value.style.setProperty('--text-clip', `polygon(0% 0%, ${textClipProgress}% 0%, ${textClipProgress}% 100%, 0% 100%)`);
            } else {
                // 清除阶段：从左向右隐藏白色文字（让黑色文字从左向右显示）
                // textClipProgress从100%变到0%，所以白色文字从右边开始消失
                // 我们需要让白色文字从左边开始消失，所以使用(100-textClipProgress)作为右边界
                const leftBoundary = 100 - textClipProgress;
                lyricElementRef.value.style.setProperty('--text-clip', `polygon(${leftBoundary}% 0%, 100% 0%, 100% 100%, ${leftBoundary}% 100%)`);
            }
        }

        scanAnimationRef.value = requestAnimationFrame(animate);
    };

    scanAnimationRef.value = requestAnimationFrame(animate);
};

// 右键菜单相关
const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);

// 计算属性
const currentLyricText = computed(() => {
    if (!currentSong.value) {
        return '♪ 等待歌曲数据 ♪';
    }

    if (!lyricsArray.value || lyricsArray.value.length === 0) {
        return '♪ 暂无歌词 ♪';
    }

    if (currentLyricIndex.value < 0 || currentLyricIndex.value >= lyricsArray.value.length) {
        const firstLyric = lyricsArray.value[0];
        return firstLyric?.tlyric || firstLyric?.lyric || '♪ 暂无歌词 ♪';
    }

    const lyric = lyricsArray.value[currentLyricIndex.value];
    return lyric?.tlyric || lyric?.lyric || '♪';
});

const nextLyricText = computed(() => {
    if (!lyricsArray.value.length || currentLyricIndex.value < 0 || currentLyricIndex.value >= lyricsArray.value.length - 1) {
        return '';
    }
    const nextLyric = lyricsArray.value[currentLyricIndex.value + 1];
    return nextLyric?.tlyric || nextLyric?.lyric || '';
});

const currentLyricOpacity = computed(() => {
    return playing.value ? 1 : 0.6;
});

const nextLyricOpacity = computed(() => {
    return playing.value ? 0.7 : 0.4;
});

// 歌词进度百分比
const progressPercentage = computed(() => {
    if (!lyricsArray.value.length || currentLyricIndex.value < 0) {
        return 0;
    }
    return ((currentLyricIndex.value + 1) / lyricsArray.value.length) * 100;
});

// 辅助函数
const getArtistNames = song => {
    if (!song) return '';
    if (song.type === 'local') {
        return song.ar || '未知艺术家';
    }
    return song.ar?.map(artist => artist.name).join(' / ') || '未知艺术家';
};

// IPC 通信处理
const handleLyricUpdate = (event, data) => {
    try {
        if (data.type === 'song-change') {
            currentSong.value = data.song;
            lyricsArray.value = data.lyrics || [];
            currentLyricIndex.value = -1;
        } else if (data.type === 'lyric-progress') {
            currentLyricIndex.value = data.currentIndex;
            progress.value = data.progress;
        } else if (data.type === 'play-state') {
            playing.value = data.playing;
        }
    } catch (error) {
        // 静默处理错误
    }
};

// 右键菜单相关
const showContextMenu = event => {
    event.preventDefault();
    contextMenuX.value = event.clientX;
    contextMenuY.value = event.clientY;
    contextMenuVisible.value = true;
};

const hideContextMenu = () => {
    contextMenuVisible.value = false;
};

const handleClick = () => {
    if (contextMenuVisible.value) {
        hideContextMenu();
    }
};

// 菜单功能
const toggleLock = () => {
    locked.value = !locked.value;
    if (window.electronAPI) {
        window.electronAPI.setLyricWindowMovable(!locked.value);
    }
    hideContextMenu();
};

const adjustFontSize = delta => {
    lyricFontSize.value = Math.max(16, Math.min(48, lyricFontSize.value + delta));
    hideContextMenu();
};

const closeLyric = () => {
    if (window.electronAPI) {
        // 先通知主窗口桌面歌词即将关闭
        window.electronAPI.notifyLyricWindowClosed();
        // 然后关闭窗口
        window.electronAPI.closeLyricWindow();
    }
    hideContextMenu();
};

// 生命周期
onMounted(() => {
    if (window.electronAPI) {
        try {
            window.electronAPI.onLyricUpdate(handleLyricUpdate);
            window.electronAPI.requestLyricData();
        } catch (error) {
            // 静默处理错误
        }
    }

    document.addEventListener('click', hideContextMenu);
    document.addEventListener('contextmenu', e => {
        if (!e.target.closest('.desktop-lyric')) {
            e.preventDefault();
        }
    });

    // 启动同步扫描动画
    startScanAnimation();
});

onUnmounted(() => {
    document.removeEventListener('click', hideContextMenu);

    // 清理动画
    if (scanAnimationRef.value) {
        cancelAnimationFrame(scanAnimationRef.value);
    }
});
</script>

<style scoped lang="scss">
// 明日方舟风格桌面歌词样式（去掉四角装饰）
.arknights-desktop-lyric {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;

    font-family: 'SourceHanSansCN-Bold', 'Bender-Bold', monospace;
    user-select: none;
    overflow: hidden;

    // 进入动画 - 改进版本，更流畅
    animation: lyricWindowAppear 0.6s cubic-bezier(0.4, 0, 0.12, 1) forwards;

    @keyframes lyricWindowAppear {
        0% {
            opacity: 0;
            transform: scale(0.9) translateY(20px);
        }
        60% {
            opacity: 0.8;
            transform: scale(1.02) translateY(-2px);
        }
        100% {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
    }

    // 离开动画
    &.lyric-window-leaving {
        animation: lyricWindowDisappear 0.4s cubic-bezier(0.3, 0.79, 0.55, 0.99) forwards;
    }

    @keyframes lyricWindowDisappear {
        0% {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
        100% {
            opacity: 0;
            transform: scale(0.85) translateY(15px);
        }
    }

    &.draggable {
        -webkit-app-region: drag;
        cursor: move;
    }
}

// 背景分层系统
.background-layers {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;

    .bg-layer {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;

        &.bg-primary {
            // 与主播放器一致的蓝绿色渐变背景
            background: linear-gradient(rgba(176, 209, 217, 0.95) -20%, rgba(176, 209, 217, 0.7) 50%, rgba(176, 209, 217, 0.95) 120%);
            backdrop-filter: blur(20px);
        }

        &.bg-secondary {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(0, 0, 0, 0.1);
            margin: 8px;
        }
    }
}

// 主内容区域
.lyric-content {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 16px;
    z-index: 5;

    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
}

// 顶部状态栏
.status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 24px;

    .status-indicator {
        display: flex;
        align-items: center;
        gap: 8px;

        .indicator-dot {
            width: 8px;
            height: 8px;
            border: 1px solid rgba(0, 0, 0, 0.5);
            background: rgba(0, 0, 0, 0.2);
            transition: all 0.3s ease;
        }

        .status-text {
            font-family: 'Bender-Bold', monospace;
            font-size: 9px;
            font-weight: bold;
            color: rgba(0, 0, 0, 0.6);
            letter-spacing: 1px;
        }

        &.active {
            .indicator-dot {
                background: #000000;
                border-color: #000000;
                box-shadow: 0 0 8px rgba(0, 0, 0, 0.5);
                animation: statusPulse 2s ease-in-out infinite;
            }

            .status-text {
                color: #000000;
            }
        }
    }

    .lyric-controls {
        .font-size-label {
            font-family: 'Bender-Bold', monospace;
            font-size: 9px;
            font-weight: bold;
            color: rgba(0, 0, 0, 0.5);
            letter-spacing: 1px;
        }
    }

    @keyframes statusPulse {
        0%,
        100% {
            transform: scale(1);
        }
        50% {
            transform: scale(1.2);
        }
    }
}

// 歌曲信息区域
.song-info-section {
    position: relative;
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(0, 0, 0, 0.1);
    padding: 8px 12px;
    flex-shrink: 0;

    .song-meta {
        position: relative;
        z-index: 2;

        .meta-row {
            display: flex;
            align-items: center;
            margin-bottom: 6px;
            gap: 12px;

            &:last-child {
                margin-bottom: 0;
            }

            .meta-label {
                font-family: 'Bender-Bold', monospace;
                font-size: 8px;
                font-weight: bold;
                color: rgba(0, 0, 0, 0.6);
                letter-spacing: 1px;
                min-width: 40px;
                text-align: right;
            }

            .meta-content {
                font-family: 'SourceHanSansCN-Bold';
                font-size: 12px;
                font-weight: bold;
                color: #000000;
                flex: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
        }
    }
}

// 主歌词显示区域
.main-lyric-section {
    position: relative;
    flex: 1;
    background: rgba(255, 255, 255, 0.15);
    border: 2px solid rgba(0, 0, 0, 0.2);
    min-height: 120px;

    display: flex;
    flex-direction: column;
    justify-content: center;

    .lyric-container {
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        padding: 16px 20px;
        gap: 12px;

        .lyric-prefix {
            font-family: 'Bender-Bold', monospace;
            font-size: 16px;
            font-weight: bold;
            color: #666666; // 改为灰色
            text-shadow: 0 0 8px rgba(102, 102, 102, 0.6);
            animation: prefixGlow 3s ease-in-out infinite alternate;
        }

        .current-lyric {
            font-family: 'SourceHanSansCN-Bold';
            flex: 1;
            text-align: left;
            max-width: 400px; // 适配更短的窗口
            word-wrap: break-word;
            overflow-wrap: break-word;
            line-height: 1.4;
            min-height: 60px;
            position: relative;
            overflow: hidden;

            // 使用JavaScript控制的同步进度条扫描效果
            background: rgba(255, 255, 255, 0.1);
            position: relative;
            overflow: hidden;

            // 黑色进度条层
            &::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.95);
                transform: translateX(var(--scan-progress, -100%));
                transition: none;
                z-index: 1;
            }

            padding: 12px 16px;
            border-radius: 0; // 直角设计
            color: #000000;

            // 白色文字遮罩层 - 使用JavaScript控制实现完美同步
            &::before {
                content: attr(data-lyric);
                position: absolute;
                top: 12px;
                left: 16px;
                right: 16px;
                bottom: 12px;
                color: #ffffff;
                font-weight: bold;
                line-height: 1.4;
                word-wrap: break-word;
                overflow-wrap: break-word;
                pointer-events: none;
                z-index: 2;
                text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);

                // 使用JavaScript控制的遮罩，与进度条完全同步
                clip-path: var(--text-clip, polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%));
                transition: none;
            }
        }
    }

    .next-lyric-preview {
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        padding: 6px 20px 10px;
        gap: 10px;
        border-top: 1px solid rgba(0, 0, 0, 0.1);

        .preview-indicator {
            font-family: 'Bender-Bold', monospace;
            font-size: 8px;
            font-weight: bold;
            color: rgba(0, 0, 0, 0.5);
            letter-spacing: 1px;
            min-width: 30px;
        }

        .next-lyric {
            font-family: 'SourceHanSansCN-Bold';
            color: rgba(0, 0, 0, 0.6);
            line-height: 1.3;
            flex: 1;
            text-align: left;
            word-wrap: break-word;
        }
    }

    @keyframes prefixGlow {
        0% {
            text-shadow: 0 0 8px rgba(102, 102, 102, 0.6);
        }
        100% {
            text-shadow: 0 0 15px rgba(102, 102, 102, 0.9), 0 0 25px rgba(102, 102, 102, 0.4);
        }
    }
}

// 进度指示器
.progress-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.05);
    padding: 8px 12px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0; // 直角设计

    .progress-label {
        font-family: 'Bender-Bold', monospace;
        font-size: 8px;
        font-weight: bold;
        color: rgba(0, 0, 0, 0.6);
        letter-spacing: 1px;
        text-align: center;
    }

    .progress-bar {
        position: relative;
        height: 4px;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(0, 0, 0, 0.3);
        border-radius: 0; // 直角设计
        overflow: hidden;

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #000000, #333333);
            transition: width 0.5s ease;
            position: relative;

            &::after {
                content: '';
                position: absolute;
                top: 0;
                right: -8px;
                width: 8px;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.8));
                animation: progressShine 2s ease-in-out infinite;
            }
        }

        .progress-indicator {
            position: absolute;
            top: -2px;
            right: 0;
            width: 8px;
            height: 8px;
            background: #000000;
            border: 1px solid #333333;
            border-radius: 0; // 直角设计
            opacity: 0.8;
        }
    }

    .progress-info {
        display: flex;
        justify-content: center;
        gap: 4px;

        span {
            font-family: 'Bender-Bold', monospace;
            font-size: 8px;
            font-weight: bold;
            color: rgba(0, 0, 0, 0.5);
            letter-spacing: 1px;
        }
    }

    @keyframes progressShine {
        0%,
        100% {
            opacity: 0;
        }
        50% {
            opacity: 1;
        }
    }
}

// 明日方舟风格右键菜单
.arknights-context-menu {
    position: fixed;
    min-width: 200px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(20px);
    border: 2px solid rgba(0, 0, 0, 0.2);
    border-radius: 0; // 直角设计
    z-index: 10000;
    -webkit-app-region: no-drag;

    animation: menuSlideIn 0.4s cubic-bezier(0.4, 0, 0.12, 1) forwards;

    @keyframes menuSlideIn {
        0% {
            opacity: 0;
            transform: scale(0.9) translateY(-15px);
        }
        60% {
            opacity: 0.9;
            transform: scale(1.02) translateY(2px);
        }
        100% {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
    }

    .menu-header {
        padding: 12px 16px 8px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        background: rgba(0, 0, 0, 0.05);

        .menu-title {
            font-family: 'Bender-Bold', monospace;
            font-size: 11px;
            font-weight: bold;
            color: #000000;
            letter-spacing: 1px;
        }

        .title-underline {
            width: 40px;
            height: 2px;
            background: #000000;
            margin-top: 4px;
        }
    }

    .menu-content {
        padding: 8px 0;
    }

    .menu-item {
        display: flex;
        align-items: center;
        padding: 10px 16px;
        cursor: pointer;
        transition: all 0.2s ease;
        gap: 12px;
        position: relative;
        -webkit-app-region: no-drag;

        &:hover {
            background: rgba(0, 0, 0, 0.1);
            transform: translateX(4px);

            .item-icon {
                transform: scale(1.1);
            }

            .item-indicator {
                opacity: 1;
                transform: scaleX(1);
            }
        }

        &.danger:hover {
            background: rgba(255, 69, 58, 0.2);
            color: #ff453a;

            .item-icon {
                filter: drop-shadow(0 0 5px rgba(255, 69, 58, 0.5));
            }
        }

        .item-icon {
            font-size: 12px;
            width: 16px;
            text-align: center;
            transition: all 0.2s ease;
        }

        .item-text {
            font-family: 'Bender-Bold', monospace;
            font-size: 10px;
            font-weight: bold;
            color: #000000;
            letter-spacing: 0.5px;
            flex: 1;
        }

        .item-indicator {
            position: absolute;
            right: 0;
            top: 0;
            bottom: 0;
            width: 3px;
            background: #000000;
            opacity: 0;
            transform: scaleX(0);
            transform-origin: right;
            transition: all 0.2s ease;
        }
    }

    .menu-separator {
        margin: 4px 0;
        padding: 0 16px;

        .separator-line {
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.3), transparent);
        }
    }
}

// 响应式设计
@media (max-width: 768px) {
    .lyric-content {
        padding: 16px;
        gap: 12px;
    }

    .lyric-container {
        padding: 16px 20px;
        gap: 12px;

        .lyric-prefix {
            font-size: 14px;
            color: #666666;
        }

        .current-lyric {
            max-width: 400px;
            min-height: 50px;
        }
    }
}

@media (max-width: 480px) {
    .lyric-content {
        padding: 12px;
        gap: 8px;
    }

    .lyric-container {
        padding: 12px 16px;
        gap: 8px;

        .lyric-prefix {
            font-size: 12px;
            color: #666666;
        }

        .current-lyric {
            max-width: 300px;
            min-height: 45px;
        }
    }
}
</style>
