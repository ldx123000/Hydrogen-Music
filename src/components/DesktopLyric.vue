<template>
    <div class="arknights-desktop-lyric" :class="{ draggable: !locked, 'native-drag': isMac && !locked }" @contextmenu.prevent.stop="showContextMenu" @click="handleClick" @mousedown="onDragStart">
        <!-- 背景层 -->
        <div class="background-layers">
            <div class="bg-layer bg-primary"></div>
            <div class="bg-layer bg-secondary"></div>
        </div>

        <!-- 内容区域 -->
        <div class="lyric-content">
            <!-- 顶部状态栏（未锁定时整条可拖拽） -->
            <div class="status-bar" :class="{ 'native-drag': !locked && isMac, 'drag-handle': !locked && !isMac, dragging: isDragging && isWinOrLinux }">
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
                            height: currentLyricBoxHeight > 0 ? (currentLyricBoxHeight + 'px') : undefined,
                        }"
                    >
                        {{ currentLyricText }}
                    </div>
                </div>

                <!-- 下一句歌词预览 -->
                <div class="next-lyric-preview" v-if="nextLyricText"
                     :style="{ height: nextLyricRowHeight > 0 ? (nextLyricRowHeight + 'px') : undefined }">
                    <div class="preview-indicator">NEXT</div>
                    <div
                        class="next-lyric"
                        ref="nextLyricElementRef"
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
                <!-- 自动选择选项 -->
                <div class="menu-item" @click="selectLyricType('auto')">
                    <div class="item-icon">{{ selectedLyricType === 'auto' ? '🔘' : '⚪' }}</div>
                    <span class="item-text">
                        <span class="text-zh">自动选择</span>
                        <span class="text-en">AUTO SELECT</span>
                    </span>
                    <div class="item-indicator"></div>
                </div>

                <!-- 原歌词选项 -->
                <div class="menu-item" v-if="hasLyricType('original')" @click="selectLyricType('original')">
                    <div class="item-icon">{{ selectedLyricType === 'original' ? '🔘' : '⚪' }}</div>
                    <span class="item-text">
                        <span class="text-zh">原文</span>
                        <span class="text-en">ORIGINAL</span>
                    </span>
                    <div class="item-indicator"></div>
                </div>

                <!-- 翻译歌词选项 -->
                <div class="menu-item" v-if="hasLyricType('trans')" @click="selectLyricType('trans')">
                    <div class="item-icon">{{ selectedLyricType === 'trans' ? '🔘' : '⚪' }}</div>
                    <span class="item-text">
                        <span class="text-zh">翻译</span>
                        <span class="text-en">TRANSLATION</span>
                    </span>
                    <div class="item-indicator"></div>
                </div>

                <!-- 罗马音选项 -->
                <div class="menu-item" v-if="hasLyricType('roma')" @click="selectLyricType('roma')">
                    <div class="item-icon">{{ selectedLyricType === 'roma' ? '🔘' : '⚪' }}</div>
                    <span class="item-text">
                        <span class="text-zh">罗马音</span>
                        <span class="text-en">ROMANIZATION</span>
                    </span>
                    <div class="item-indicator"></div>
                </div>

                <div class="menu-separator">
                    <div class="separator-line"></div>
                </div>

                <div class="menu-item" @click="toggleLock">
                    <div class="item-icon">🔒</div>
                    <span class="item-text">
                        <span class="text-zh">{{ zhLockText }}</span>
                        <span class="text-en">{{ enLockText }}</span>
                    </span>
                    <div class="item-indicator"></div>
                </div>

                <div class="menu-item" @click="adjustFontSize(2)">
                    <div class="item-icon" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 6h6M6 3v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </div>
                    <span class="item-text">
                        <span class="text-zh">增大字体</span>
                        <span class="text-en">INCREASE FONT</span>
                    </span>
                    <div class="item-indicator"></div>
                </div>

                <div class="menu-item" @click="adjustFontSize(-2)">
                    <div class="item-icon" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </div>
                    <span class="item-text">
                        <span class="text-zh">减小字体</span>
                        <span class="text-en">DECREASE FONT</span>
                    </span>
                    <div class="item-indicator"></div>
                </div>

                <div class="menu-separator">
                    <div class="separator-line"></div>
                </div>

                <div class="menu-item danger" @click="closeLyric">
                    <div class="item-icon">✕</div>
                    <span class="item-text">
                        <span class="text-zh">关闭歌词</span>
                        <span class="text-en">CLOSE LYRIC</span>
                    </span>
                    <div class="item-indicator"></div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watchEffect } from 'vue';

// 响应式数据
const currentSong = ref(null);
const lyricsArray = ref([]);
const currentLyricIndex = ref(-1);
const progress = ref(0);
const playing = ref(false);
const locked = ref(false);
const lyricFontSize = ref(22);

// 桌面歌词显示类型配置 - 单选模式
const selectedLyricType = ref('auto'); // 'auto' | 'original' | 'trans' | 'roma'

// 右键菜单文案（默认中文，悬停显示英文）
const enLockText = computed(() => (locked.value ? 'UNLOCK POSITION' : 'LOCK POSITION'));
const zhLockText = computed(() => (locked.value ? '解锁位置' : '锁定位置'));

// 同步扫描动画控制
const scanAnimationRef = ref(null);
const lyricElementRef = ref(null);
const nextLyricElementRef = ref(null);
// 动态两行扩展：当前歌词盒子目标高度（px）
const currentLyricBoxHeight = ref(0);
// 下一句预览行（含上下内边距）的目标高度（px）
const nextLyricRowHeight = ref(0);
let lyricResizeObserver = null;
let rafAdjust = 0;
let baselineWindowWidth = 0;
let baselineWindowHeightOneLine = 0; // 以“单行歌词高度”为基准的窗口外部高度
let lastAppliedHeight = 0;

const lineHeightPx = () => Math.round(lyricFontSize.value * 1.4);
const singleLineBoxHeight = () => Math.max(60, 24 + lineHeightPx()); // 12px 顶/底 padding 合计 24
const doubleLineBoxHeight = () => 24 + lineHeightPx() * 2;

// 隐藏测量元素：用于计算自然高度（不受当前height影响）
let measureEl = null;
const ensureMeasureEl = () => {
    if (measureEl) return measureEl;
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '-99999px';
    el.style.top = '-99999px';
    el.style.visibility = 'hidden';
    el.style.pointerEvents = 'none';
    el.style.whiteSpace = 'normal';
    el.style.wordWrap = 'break-word';
    el.style.overflowWrap = 'break-word';
    el.style.padding = '12px 16px';
    el.style.boxSizing = 'border-box';
    el.style.fontFamily = "SourceHanSansCN-Bold, 'Bender-Bold', monospace";
    document.body.appendChild(el);
    measureEl = el;
    return el;
};

const scheduleAdjustLyricLayout = () => {
    if (rafAdjust) cancelAnimationFrame(rafAdjust);
    rafAdjust = requestAnimationFrame(() => {
        applyLyricAutoExpand();
    });
};

const applyLyricAutoExpand = async () => {
    try {
        await nextTick();
        const el = lyricElementRef.value;
        if (!el) return;

        // 计算单行/双行目标高度
        const oneLine = singleLineBoxHeight();
        const twoLines = doubleLineBoxHeight();

        // 使用隐藏测量元素按“当前可用宽度 + 当前字体”测自然高度
        const m = ensureMeasureEl();
        const availableWidth = Math.max(120, Math.round(el.clientWidth || 400));
        m.style.width = availableWidth + 'px';
        m.style.fontSize = lyricFontSize.value + 'px';
        m.textContent = currentLyricText.value || '';
        const natural = Math.max(0, Math.round(m.scrollHeight));

        // 判断是否需要显示两行（超过单行阈值则两行）
        const needTwo = natural > (oneLine + 2);
        const target = needTwo ? twoLines : oneLine;

        // 计算 NEXT 预览的目标高度（最多两行）
        // NEXT 行字体与行高
        const nextFontPx = Math.round(lyricFontSize.value * 0.75);
        const nextLinePx = Math.max(1, Math.round(nextFontPx * 1.3));
        const nextOneLine = 16 + nextLinePx; // 上下 padding: 6 + 10 = 16
        const nextTwoLines = 16 + nextLinePx * 2;
        let nextActiveOne = 0;
        let nextActiveTarget = 0;
        if ((nextLyricText?.value || '').trim()) {
            nextActiveOne = nextOneLine;
            // 用 next 宽度测量（优先使用元素宽度）
            const m2 = ensureMeasureEl();
            const nextEl = nextLyricElementRef.value;
            const nextWidth = Math.max(120, Math.round(nextEl?.clientWidth || (el.clientWidth - 60) || 300));
            m2.style.width = nextWidth + 'px';
            m2.style.fontSize = nextFontPx + 'px';
            m2.style.lineHeight = '1.3';
            m2.textContent = nextLyricText.value;
            const nextNaturalTextHeight = Math.max(0, Math.round(m2.scrollHeight));
            const needTwoNext = nextNaturalTextHeight > (nextLinePx + 2);
            nextActiveTarget = needTwoNext ? nextTwoLines : nextOneLine;
        }

        // 首次初始化：记录“若为单行时的窗口外部高度”与当前窗口宽度
        if (!baselineWindowHeightOneLine || !baselineWindowWidth) {
            try {
                const bounds = await window.electronAPI?.getLyricWindowBounds?.();
                if (bounds && typeof bounds.width === 'number' && typeof bounds.height === 'number') {
                    baselineWindowWidth = bounds.width;
                    // 计算“单行基线外部高度”：扣除当前与NEXT的增量
                    const currentBox = target;
                    const nextBox = nextActiveTarget;
                    baselineWindowHeightOneLine = Math.max(
                        100,
                        Math.round(bounds.height - (currentBox - oneLine) - (nextBox - nextActiveOne))
                    );
                }
            } catch (_) {}
        }

        // 盒子高度平滑过渡
        if (currentLyricBoxHeight.value !== target) currentLyricBoxHeight.value = target;
        if (nextLyricRowHeight.value !== nextActiveTarget) nextLyricRowHeight.value = nextActiveTarget;

        // 根据两行/单行差值，平滑调整窗口高度：其余模块自然顺推
        if (baselineWindowHeightOneLine && baselineWindowWidth) {
            const desiredWindowHeight = Math.max(
                120,
                baselineWindowHeightOneLine + (target - oneLine) + (nextActiveTarget - nextActiveOne)
            );
            if (Math.abs(desiredWindowHeight - lastAppliedHeight) >= 2) {
                lastAppliedHeight = desiredWindowHeight;
                // 仅调整高度，宽度保持不变
                window.electronAPI?.resizeWindow?.(baselineWindowWidth, desiredWindowHeight);
            }
        }
    } catch (_) {}
};

// 平台检测：Windows/Linux 走 JS 拖拽，macOS 保持原生 drag
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isMac = /Macintosh|Mac OS X|MacOS|Darwin/i.test(ua);
const isWinOrLinux = !isMac && /(Windows|Linux|X11|Wayland)/i.test(ua);

// 拖拽控制（仅 Windows/Linux 启用纯 JS 移动窗口）
const isDragging = ref(false);
const dragStartScreen = ref({ x: 0, y: 0 });
const dragStartSize = ref({ width: 0, height: 0 });
const dragCurrentPos = ref({ x: 0, y: 0 });
const originalMinMax = ref(null);

const onDragStart = async (e) => {
    if (!isWinOrLinux || locked.value) return;
    // 仅响应左键
    if (e.button !== 0) return;
    try {
        e.preventDefault();
        e.stopPropagation();
        // 记录起点与初始窗口尺寸/位置
        const bounds = await window.electronAPI?.getLyricWindowBounds?.();
        if (!bounds) return;
        // 使用内容区域尺寸与位置，避免外框差异导致的尺寸漂移
        const contentBounds = await window.electronAPI?.getLyricWindowContentBounds?.();
        const useBounds = contentBounds || bounds;
        dragStartSize.value = { width: useBounds.width, height: useBounds.height };
        dragCurrentPos.value = { x: useBounds.x, y: useBounds.y };
        isDragging.value = true;
        dragStartScreen.value = { x: e.screenX, y: e.screenY };
        // 懒获取：移动时用 movement 增量
        // 防止选中文本
        document.body.style.userSelect = 'none';
        // 拖拽期间禁用窗口 resize，避免误判为调整大小
        window.electronAPI?.setLyricWindowResizable?.(false);
        // 读取并保存原始最小/最大尺寸，然后把 min/max 都锁到初始尺寸，彻底杜绝尺寸变化
        originalMinMax.value = await window.electronAPI?.getLyricWindowMinMax?.();
        await window.electronAPI?.setLyricWindowMinMax?.(
            dragStartSize.value.width,
            dragStartSize.value.height,
            dragStartSize.value.width,
            dragStartSize.value.height
        );
        // 监听全局移动/松开，避免移出手柄就终止
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    } catch (_) {}
};

const onDragMove = (e) => {
    if (!isWinOrLinux || !isDragging.value) return;
    // 使用 movementX/movementY 作为增量，保证平滑
    const dx = e.movementX ?? (e.screenX - dragStartScreen.value.x);
    const dy = e.movementY ?? (e.screenY - dragStartScreen.value.y);

    // 更新当前记录位置
    const newX = Math.round(dragCurrentPos.value.x + dx);
    const newY = Math.round(dragCurrentPos.value.y + dy);
    dragCurrentPos.value = { x: newX, y: newY };

    // 兼容无 movementX/Y 的场景，复位起点
    if (e.movementX == null || e.movementY == null) {
        dragStartScreen.value = { x: e.screenX, y: e.screenY };
    }

    // 强制保持初始尺寸
    // 用内容区域移动，进一步隔离外框差异
    window.electronAPI?.moveLyricWindowContentTo?.(newX, newY, dragStartSize.value.width, dragStartSize.value.height);
};

const onDragEnd = () => {
    if (!isWinOrLinux || !isDragging.value) return;
    isDragging.value = false;
    document.body.style.userSelect = '';
    // 恢复窗口 min/max 限制与可调整大小
    if (originalMinMax.value) {
        const { minWidth, minHeight, maxWidth, maxHeight } = originalMinMax.value;
        window.electronAPI?.setLyricWindowMinMax?.(minWidth, minHeight, maxWidth, maxHeight);
    }
    window.electronAPI?.setLyricWindowResizable?.(true);
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
};

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
        return formatLyricText(firstLyric);
    }

    const lyric = lyricsArray.value[currentLyricIndex.value];
    return formatLyricText(lyric);
});

const nextLyricText = computed(() => {
    if (!lyricsArray.value.length || currentLyricIndex.value < 0 || currentLyricIndex.value >= lyricsArray.value.length - 1) {
        return '';
    }
    const nextLyric = lyricsArray.value[currentLyricIndex.value + 1];
    return formatLyricText(nextLyric);
});

// 格式化歌词文本（单选模式）
const formatLyricText = (lyricObj) => {
    if (!lyricObj) return '♪';
    
    // 根据选择的类型返回对应歌词
    switch (selectedLyricType.value) {
        case 'original':
            return lyricObj.lyric || '♪';
        case 'trans':
            return lyricObj.tlyric || '♪';
        case 'roma':
            return lyricObj.rlyric || '♪';
        case 'auto':
        default:
            // 自动选择：翻译优先，没有翻译则显示原歌词
            return lyricObj.tlyric || lyricObj.lyric || '♪';
    }
};

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

// 当歌词文本或字体大小变化后，重新评估是否需要两行
watchEffect(() => {
    // 依赖当前与下一句歌词、字号
    const _ = currentLyricText.value + '|' + (nextLyricText.value || '') + '|' + lyricFontSize.value;
    scheduleAdjustLyricLayout();
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
            // 当歌曲切换时，调用自动选择逻辑
            autoSelectLyricType();
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
    
    // 获取窗口尺寸
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // 估算菜单尺寸（基于菜单项数量）
    const menuItemHeight = 40; // 每个菜单项的高度
    const menuHeader = 50; // 菜单头部高度
    const menuSeparators = 20; // 分隔符高度
    
    // 计算有多少个菜单项
    let menuItemCount = 1; // AUTO SELECT
    if (hasLyricType('original')) menuItemCount++;
    if (hasLyricType('trans')) menuItemCount++;
    if (hasLyricType('roma')) menuItemCount++;
    menuItemCount += 3; // 锁定、增大字体、减小字体
    menuItemCount += 1; // 关闭歌词
    
    const estimatedMenuHeight = menuHeader + (menuItemCount * menuItemHeight) + (2 * menuSeparators);
    const menuWidth = 200; // 菜单宽度
    
    // 智能定位：避免菜单超出屏幕
    let menuX = event.clientX;
    let menuY = event.clientY;
    
    // 水平定位调整
    if (menuX + menuWidth > windowWidth) {
        menuX = Math.max(0, event.clientX - menuWidth);
    }
    
    // 垂直定位调整
    if (menuY + estimatedMenuHeight > windowHeight) {
        menuY = Math.max(0, event.clientY - estimatedMenuHeight);
    }
    
    contextMenuX.value = menuX;
    contextMenuY.value = menuY;
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

// 歌词显示模式切换
const selectLyricType = (type) => {
    selectedLyricType.value = type;
    hideContextMenu();
};

// 自动选择最佳歌词类型（当歌曲切换时调用）
const autoSelectLyricType = () => {
    if (selectedLyricType.value !== 'auto') return; // 如果用户手动选择了类型，不自动切换
    
    if (!lyricsArray.value || lyricsArray.value.length === 0) return;
    
    // 检查第一句歌词来决定默认选择
    const firstLyric = lyricsArray.value[0];
    if (!firstLyric) return;
    
    // 翻译优先，没有翻译则选原歌词
    if (firstLyric.tlyric && firstLyric.tlyric.trim()) {
        // 有翻译，保持auto模式即可
        return;
    } else if (firstLyric.lyric && firstLyric.lyric.trim()) {
        // 没有翻译但有原歌词，保持auto模式即可
        return;
    }
};

// 获取当前歌词对象
const getCurrentLyricObj = () => {
    if (!lyricsArray.value || lyricsArray.value.length === 0) return null;
    if (currentLyricIndex.value < 0 || currentLyricIndex.value >= lyricsArray.value.length) {
        return lyricsArray.value[0];
    }
    return lyricsArray.value[currentLyricIndex.value];
};

// 检查当前歌曲是否有特定类型的歌词
const hasLyricType = (type) => {
    if (!lyricsArray.value || lyricsArray.value.length === 0) return false;
    
    const checkField = type === 'original' ? 'lyric' : 
                      type === 'trans' ? 'tlyric' : 'rlyric';
    
    return lyricsArray.value.some(item => item[checkField] && item[checkField].trim() !== '');
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
        if (!e.target.closest('.arknights-desktop-lyric')) {
            e.preventDefault();
        }
    });

    // 启动同步扫描动画
    startScanAnimation();

    // 监听当前歌词盒子尺寸变化，实时自适应 1-2 行
    try {
        if (window.ResizeObserver) {
            lyricResizeObserver = new ResizeObserver(() => scheduleAdjustLyricLayout());
            if (lyricElementRef.value) lyricResizeObserver.observe(lyricElementRef.value);
        } else {
            window.addEventListener('resize', scheduleAdjustLyricLayout);
        }
    } catch (_) {}

    // 初始执行一次
    scheduleAdjustLyricLayout();
});

onUnmounted(() => {
    document.removeEventListener('click', hideContextMenu);

    // 清理动画
    if (scanAnimationRef.value) {
        cancelAnimationFrame(scanAnimationRef.value);
    }

    if (lyricResizeObserver) {
        try { lyricResizeObserver.disconnect(); } catch (_) {}
        lyricResizeObserver = null;
    } else {
        window.removeEventListener('resize', scheduleAdjustLyricLayout);
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
    
    /* Windows透明度优化 */
    background: transparent !important;
    /* macOS: 根容器启用原生拖拽；Win/Linux: 禁用原生，走JS拖拽 */
    &.native-drag {
        -webkit-app-region: drag;
    }
    &:not(.native-drag) {
        -webkit-app-region: no-drag;
    }

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
        /* 由特定手柄控制拖拽，根容器不再强制拖拽与光标样式 */
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
            // 原浅色风格：蓝绿色渐变 + 模糊
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
    position: relative;
    
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 24px;

    /* macOS: 使用原生拖拽；Win/Linux: 关闭原生拖拽，走JS拖拽并允许右键 */
    &.drag-handle { /* Win/Linux 下用于禁止原生拖拽 */
        -webkit-app-region: no-drag;
        user-select: none;
    }
    &.dragging { /* 不强制光标，保持原版 */ }
    &.native-drag { -webkit-app-region: drag; user-select: none; }

    .status-indicator {
        display: flex;
        align-items: center;
        gap: 8px;

        .indicator-dot {
            width: 8px;
            height: 8px;
            border: 1px solid var(--border);
            background: var(--layer);
            transition: all 0.3s ease;
        }

        .status-text {
            font-family: 'Bender-Bold', monospace;
            font-size: 9px;
            font-weight: bold;
            color: var(--muted-text);
            letter-spacing: 1px;
        }

        &.active {
            .indicator-dot {
                background: var(--text);
                border-color: var(--text);
                box-shadow: 0 0 8px rgba(0, 0, 0, 0.35);
                animation: statusPulse 2s ease-in-out infinite;
            }

            .status-text { color: var(--text); }
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
    -webkit-app-region: no-drag;

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
    -webkit-app-region: no-drag;

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
            -webkit-app-region: no-drag;
            transition: height 0.22s cubic-bezier(0.3, 0, 0.12, 1);

            // 使用JavaScript控制的同步进度条扫描效果（去除默认灰色底框）
            background: transparent !important;
            position: relative;
            overflow: hidden;

            // 进度条层（随主题反转）
            &::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                /* Use theme variable so: light=black bar, dark=white bar */
                background: var(--lyric-hilight-bg);
                transform: translateX(var(--scan-progress, -100%));
                transition: none;
                z-index: 1;
            }

            padding: 12px 16px;
            border-radius: 0; // 直角设计
            color: var(--lyric-scan-outside-text) !important;

            // 白色文字遮罩层 - 使用JavaScript控制实现完美同步
            &::before {
                content: attr(data-lyric);
                position: absolute;
                top: 12px;
                left: 16px;
                right: 16px;
                bottom: 12px;
                color: var(--lyric-scan-inside-text) !important;
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
        transition: height 0.22s cubic-bezier(0.3, 0, 0.12, 1);

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
    -webkit-app-region: no-drag;

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
    max-width: 250px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(20px);
    border: 2px solid rgba(0, 0, 0, 0.2);
    border-radius: 0; // 直角设计
    z-index: 999999; // 极高层级确保显示在最顶层
    -webkit-app-region: no-drag;
    
    // 确保菜单可以超出父容器和窗口边界
    overflow-x: hidden; // 隐藏水平滚动条
    overflow-y: auto; // 保持垂直滚动
    
    // 最大高度限制，防止菜单过长
    max-height: 85vh;
    
    // 确保菜单内容完整显示
    box-sizing: border-box;
    
    // 防止菜单内容被截断
    contain: none;

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
        background: linear-gradient(rgba(176, 209, 217, 0.75) -20%, rgba(176, 209, 217, 0.60) 50%, rgba(176, 209, 217, 0.75) 120%);
        backdrop-filter: blur(8px);
        flex-shrink: 0; // 防止头部被压缩
        position: sticky;
        top: 0;
        z-index: 10; // 提高z-index确保标题始终在最上层
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); // 添加阴影增强层次感

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
        display: flex;
        flex-direction: column;
        min-height: 0; // 允许内容收缩
    }

    .menu-item {
        display: flex;
        align-items: center;
        padding: 8px 20px 8px 16px; // 右边多留4px空间给偏移动画
        cursor: pointer;
        transition: all 0.2s ease;
        gap: 12px;
        position: relative;
        -webkit-app-region: no-drag;
        flex-shrink: 0; // 防止菜单项被压缩
        min-height: 36px; // 设置最小高度
        box-sizing: border-box; // 确保padding不会导致溢出

        &:hover {
            background: rgba(0, 0, 0, 0.1);
            transform: translateX(4px); // 恢复向右偏移动画
            padding-right: 16px; // hover时减少右padding保持总宽度不变

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
            flex-shrink: 0; // 防止图标被压缩
            color: #000000; // 明亮模式下使用黑色，暗色在主题覆盖
            display: inline-flex;
            align-items: center;
            justify-content: center;

            svg { width: 12px; height: 12px; display: block; }
        }

        .item-text {
            font-family: 'Bender-Bold', monospace;
            font-size: 10px;
            font-weight: bold;
            color: #000000;
            letter-spacing: 0.5px;
            flex: 1;
            white-space: nowrap; // 防止文字换行
            overflow: hidden;
            text-overflow: ellipsis;
            position: relative; // 承载双语堆叠
            height: 1.2em; // 固定高度，避免切换时跳动
            line-height: 1.2em;

            .text-zh,
            .text-en {
                position: absolute;
                left: 0;
                right: 0;
                top: 0;
                bottom: 0;
                display: block;
                transition: transform 0.22s cubic-bezier(0.4, 0, 0.12, 1), opacity 0.22s ease;
            }

            /* 中文稍大、去字距并使用中文字体族 */
            .text-zh {
                opacity: 1;
                transform: translateY(0);
                font-size: 11px; /* 比英文略大一号 */
                letter-spacing: 0; /* 中文通常无需额外字距 */
                font-family: 'SourceHanSansCN-Bold', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'Heiti SC', 'Noto Sans CJK SC', sans-serif;
            }
            .text-en { opacity: 0; transform: translateY(6px); }
        }

        &:hover .item-text {
            .text-zh { opacity: 0; transform: translateY(-6px); }
            .text-en { opacity: 1; transform: translateY(0); }
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
        flex-shrink: 0; // 防止分隔符被压缩

        .separator-line {
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.3), transparent);
        }
    }

    // 自定义滚动条样式
    &::-webkit-scrollbar {
        width: 6px;
    }

    &::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.1);
        border-radius: 0;
    }

    &::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.4);
        border-radius: 0;
        
        &:hover {
            background: rgba(0, 0, 0, 0.6);
        }
        
        &:active {
            background: rgba(0, 0, 0, 0.8);
        }
    }

    // 滚动条角落
    &::-webkit-scrollbar-corner {
        background: transparent;
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
<style scoped>
/* Dark overrides for Desktop Lyric to match app theme, preserving original light-mode visuals */
.dark .arknights-desktop-lyric .background-layers .bg-primary { background: var(--panel) !important; backdrop-filter: blur(16px); }
.dark .arknights-desktop-lyric .background-layers .bg-secondary { background: var(--layer) !important; border: 1px solid var(--border) !important; }
.dark .arknights-desktop-lyric .song-info-section { background: var(--layer) !important; border-color: var(--border) !important; }
.dark .arknights-desktop-lyric .main-lyric-section { background: var(--layer) !important; border-color: var(--border) !important; }
.dark .arknights-desktop-lyric .next-lyric-preview { border-top-color: var(--border) !important; }
.dark .arknights-desktop-lyric .progress-section { background: var(--layer) !important; border-color: var(--border) !important; }
.dark .arknights-desktop-lyric .progress-section .progress-label { color: var(--muted-text) !important; }
.dark .arknights-desktop-lyric .progress-section .progress-bar { background: rgba(255,255,255,0.08) !important; border-color: var(--border) !important; }
.dark .arknights-desktop-lyric .progress-section .progress-bar .progress-fill { background: var(--text) !important; }
.dark .arknights-desktop-lyric .progress-section .progress-indicator { background: var(--text) !important; border-color: var(--border) !important; }
.dark .arknights-desktop-lyric .status-indicator .status-text { color: var(--muted-text) !important; }

/* Context menu dark theme */
.dark .arknights-desktop-lyric .arknights-context-menu { background: var(--panel) !important; border-color: var(--border) !important; color: var(--text) !important; }
.dark .arknights-desktop-lyric .arknights-context-menu .menu-header { background: var(--layer) !important; border-bottom-color: var(--border) !important; }
.dark .arknights-desktop-lyric .arknights-context-menu .menu-title { color: var(--text) !important; }
.dark .arknights-desktop-lyric .arknights-context-menu .title-underline { background: var(--text) !important; }
.dark .arknights-desktop-lyric .arknights-context-menu .menu-item { color: var(--text) !important; }
.dark .arknights-desktop-lyric .arknights-context-menu .menu-item .item-text { color: var(--text) !important; background: transparent !important; }
.dark .arknights-desktop-lyric .arknights-context-menu .menu-item .item-icon { color: var(--text) !important; }
.dark .arknights-desktop-lyric .arknights-context-menu .menu-item .item-indicator { background: var(--text) !important; }
.dark .arknights-desktop-lyric .arknights-context-menu .menu-item:hover { background: rgba(255,255,255,0.08) !important; }
.dark .arknights-desktop-lyric .arknights-context-menu .menu-separator .separator-line { background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent) !important; }
.dark .arknights-desktop-lyric .arknights-context-menu::-webkit-scrollbar-track { background: transparent !important; }
.dark .arknights-desktop-lyric .arknights-context-menu::-webkit-scrollbar-thumb { background: transparent !important; }
.dark .arknights-desktop-lyric .arknights-context-menu:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.35) !important; }
.dark .arknights-desktop-lyric .arknights-context-menu .menu-item.danger:hover { color: #ff453a !important; }

/* macOS: 全窗口原生拖拽（覆盖内部 no-drag），保留菜单可交互 */
.arknights-desktop-lyric.native-drag,
.arknights-desktop-lyric.native-drag .lyric-content,
.arknights-desktop-lyric.native-drag .status-bar,
.arknights-desktop-lyric.native-drag .song-info-section,
.arknights-desktop-lyric.native-drag .main-lyric-section,
.arknights-desktop-lyric.native-drag .current-lyric,
.arknights-desktop-lyric.native-drag .progress-section {
  -webkit-app-region: drag;
}

/* 右键菜单保持可交互 */
.arknights-desktop-lyric.native-drag .arknights-context-menu,
.arknights-desktop-lyric.native-drag .arknights-context-menu * {
  -webkit-app-region: no-drag;
}
</style>
