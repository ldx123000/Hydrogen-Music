<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue';
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
const lycCurrentIndex = ref(null);
const interludeIndex = ref(null);
const interludeAnimation = ref(false);
const interludeRemainingTime = ref(null);
// 当从有间奏的行切换到下一行时，立即折叠上一行的间奏，避免其收起动画影响高度测量
const interludeFastClose = ref(false);
let interludeInTimer = null;
let interludeOutTimer = null;
let interludeProgressInterval = null;
// 在“上一句预计结束”时再启动间奏的延迟定时器（启发式）
let interludeDeferStartTimer = null;

let initMax = null;
let initOffset = null;
let size = null;

let lyricLastPosition = null;
// 切回歌词时抑制首帧闪烁（先隐藏，定位完成后再显示）
const suppressLyricFlash = ref(true);

// 在高频同步中避免并发测量
const syncingLayout = ref(false);

// —— 每首歌自适应的演唱时长估计模型 ——
// 以该首歌中“非间奏”的行间间隔，反推每个“文本单位”的平均时长（秒/单位），用于估计单行演唱结束点
const songSecPerUnit = ref(0.22); // 回退默认：每个文本单位约 0.22s

function textUnitCount(text) {
    if (!text || typeof text !== 'string') return 0;
    const trimmed = text.trim();
    if (!trimmed) return 0;
    // 汉字（含扩展、兼容区）
    const han = (trimmed.match(/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g) || []).length;
    // 日文平假名、片假名、片假名扩展、半角片假名
    const hira = (trimmed.match(/[\u3040-\u309F]/g) || []).length;
    const kata = (trimmed.match(/[\u30A0-\u30FF]/g) || []).length; // 含长音符“ー”
    const kataExt = (trimmed.match(/[\u31F0-\u31FF]/g) || []).length;
    const halfKata = (trimmed.match(/[\uFF66-\uFF9D]/g) || []).length;
    // 英文按词估计
    const words = trimmed.split(/\s+/).filter(Boolean).length;
    // 将英文词按 0.6 的权重折算为“单位”，避免对长单词过度计数
    // 假名与汉字都按 1.0 的单位权重计算，避免日文歌词被低估
    return han + hira + kata + kataExt + halfKata + words * 0.6;
}

function median(arr) {
    if (!arr.length) return NaN;
    const a = arr.slice().sort((x, y) => x - y);
    const mid = a.length >> 1;
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function recomputeSongTimingModel() {
    try {
        const arr = Array.isArray(lyricsObjArr.value) ? lyricsObjArr.value : [];
        if (!arr.length) return;
        const candidates = [];
        const thr = Number(lyricInterludeTime.value || 0) || 8; // 用户阈值或回退 8s
        const upper = Math.min(Math.max(thr - 1, 4.5), 10); // 认为 <= upper 的行间隔主要是演唱
        const lower = 0.8; // 过滤极短的间隔
        for (let i = 0; i < arr.length - 1; i++) {
            const cur = arr[i];
            const nextIdx = findNextContentIndex(i);
            if (nextIdx === -1) continue;
            const next = arr[nextIdx];
            if (!cur || !next) continue;
            const t0 = Number(cur.time);
            const t1 = Number(next.time);
            if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue;
            const gap = t1 - t0;
            if (!(gap > lower && gap <= upper)) continue;
            const units = textUnitCount(String(cur.lyric || ''));
            if (!(units > 0)) continue;
            const spUnit = gap / units; // 秒/单位
            if (Number.isFinite(spUnit) && spUnit > 0.05 && spUnit < 0.8) candidates.push(spUnit);
        }
        if (candidates.length) {
            const med = median(candidates);
            // 夹在合理区间，避免异常值
            songSecPerUnit.value = Math.min(0.45, Math.max(0.08, med));
        } else {
            // 回退默认
            songSecPerUnit.value = 0.22;
        }
    } catch (_) {
        // 回退默认
        songSecPerUnit.value = 0.22;
    }
}

const waitForNextFrame = () =>
    new Promise(resolve => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => resolve());
        } else {
            setTimeout(resolve, 16);
        }
    });

const waitForLayoutCommit = async () => {
    await nextTick();
    await waitForNextFrame();
};

// 是否存在歌词列表与有效原文内容
const hasLyricsList = computed(() => Array.isArray(lyricsObjArr.value) && lyricsObjArr.value.length > 0);
const hasAnyLyricContent = computed(() => {
    if (!Array.isArray(lyricsObjArr.value)) return false;
    return lyricsObjArr.value.some(item => !!(item && item.lyric && String(item.lyric).trim()))
});

// 计算指定索引之前（含该索引）的累计高度，优先使用实际DOM高度，回退为均匀估算
function computeCumulativeOffset(index) {
    if (!lyricEle.value || !lyricEle.value.length) {
        return (index + 1) * (size || 0)
    }
    let offset = 0
    for (let i = 0; i <= index && i < lyricEle.value.length; i++) {
        const el = lyricEle.value[i]
        if (el && el.offsetParent !== null) offset += el.clientHeight + 10
        else offset += (size || 0)
    }
    return offset
}

// 计算整份歌词的总高度（用于边界与容器高度），优先DOM，回退估算
function computeTotalHeight() {
    if (!lyricEle.value || !lyricEle.value.length) return initMax || 0
    let total = 0
    for (let i = 0; i < lyricEle.value.length; i++) {
        const el = lyricEle.value[i]
        if (el && el.offsetParent !== null) total += el.clientHeight + 10
        else total += (size || 0)
    }
    return total
}

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

    // 判断本首歌实际是否存在翻译/罗马音，避免没有对应内容时仍按照勾选项计算高度
    const hasAnyTrans = Array.isArray(lyricsObjArr.value) && lyricsObjArr.value.some(item => !!(item.tlyric && item.tlyric.trim()))
    const hasAnyRoma = Array.isArray(lyricsObjArr.value) && lyricsObjArr.value.some(item => !!(item.rlyric && item.rlyric.trim()))

    const showOriginal = lyricType.value.indexOf('noOriginal') == -1 && lyricType.value.indexOf('original') != -1
    const showTrans = (lyricType.value.indexOf('noTrans') == -1 && lyricType.value.indexOf('trans') != -1) && hasAnyTrans
    const showRoma = (lyricType.value.indexOf('noRoma') == -1 && lyricType.value.indexOf('roma') != -1) && hasAnyRoma

    size = (
        parseInt(showOriginal ? lyricSize.value : 0) +
        parseInt(showTrans ? tlyricSize.value : 0) +
        parseInt(showRoma ? rlyricSize.value : 0)
    ) * 1.5 + 30;
    initMax = lyricsObjArr.value.length * size;
    heightVal.value = initMax;
    initOffset = -(initMax - 260);
    // 使用DOM实际高度计算偏移，回退到均匀估算
    let offset = computeCumulativeOffset(lycCurrentIndex.value)
    if (change) {
        // 同步容器总高度并重算基础偏移
        const total = computeTotalHeight()
        initMax = total || initMax
        initOffset = -(initMax - 260)
        lineOffset.value = initOffset - offset
        minHeightVal.value = offset
        maxHeightVal.value = initMax + offset
    } else {
        const total = computeTotalHeight()
        initMax = total || initMax
        initOffset = -(initMax - 260)
        maxHeightVal.value = initMax
    }
    if (lyricScrollArea.value) lyricScrollArea.value.style.height = initMax + 'Px';
};

const setDefaultStyle = async () => {
    lycCurrentIndex.value = currentLyricIndex.value >= 0 ? currentLyricIndex.value : -1;
    interludeAnimation.value = false;
    lyricEle.value = document.getElementsByClassName('lyric-line');
    initMax = 0;
    setMaxHeight(false);
    minHeightVal.value = 0;
    lineOffset.value = initOffset;

    // 隐藏首帧，等待DOM稳定后同步到正确位置
    suppressLyricFlash.value = true;
    await nextTick();
    if (lycCurrentIndex.value >= 0 && size > 0) {
        syncLyricPosition();
    }
    await nextTick();
    suppressLyricFlash.value = false;

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
    async newLyrics => {
        if (newLyrics && newLyrics.length > 0) {
            await setDefaultStyle();
            // 重新根据本首歌的行间隔校准演唱速率
            recomputeSongTimingModel();
        }
    }
);

// 根据显示配置（翻译/原文/罗马音、字号）动态调整高度与位置
const applyLyricLayout = async ({ waitForPaint = false } = {}) => {
    if (!lyricsObjArr.value || !lyricsObjArr.value.length) return;
    if (syncingLayout.value) return;
    syncingLayout.value = true;
    try {
        await waitForLayoutCommit();
        lyricEle.value = document.getElementsByClassName('lyric-line');
        setMaxHeight(true);
        syncLyricPosition();
        if (waitForPaint) {
            await waitForLayoutCommit();
        }
    } finally {
        syncingLayout.value = false;
    }
};

const recalcLyricLayout = async () => {
    await applyLyricLayout();
};

// 过渡完成后再同步，避免在缩放/透明过渡中测量
const onLyricAreaAfterEnter = async () => {
    suppressLyricFlash.value = true;
    await applyLyricLayout({ waitForPaint: true });
    suppressLyricFlash.value = false;
};

// —— 间奏等待动画——
function clearInterludeTimers() {
    try { if (interludeInTimer) clearTimeout(interludeInTimer) } catch (_) {}
    try { if (interludeOutTimer) clearTimeout(interludeOutTimer) } catch (_) {}
    try { if (interludeDeferStartTimer) clearTimeout(interludeDeferStartTimer) } catch (_) {}
    interludeInTimer = null;
    interludeOutTimer = null;
    interludeDeferStartTimer = null;
}

function getSafeSeek() {
    try {
        if (currentMusic.value && typeof currentMusic.value.seek === 'function') {
            const s = currentMusic.value.seek();
            if (typeof s === 'number' && !Number.isNaN(s)) return s;
        }
    } catch (_) {}
    return typeof progress.value === 'number' ? progress.value : 0;
}

// 辅助：查找“下一句有正文内容的歌词”的索引（忽略仅用于时长占位、正文为空的行）
function findNextContentIndex(fromIdx) {
    if (!lyricsObjArr.value || !Array.isArray(lyricsObjArr.value)) return -1;
    for (let i = fromIdx + 1; i < lyricsObjArr.value.length; i++) {
        const it = lyricsObjArr.value[i];
        if (it && typeof it.lyric === 'string' && it.lyric.trim()) return i;
    }
    return -1;
}

// 启发式：估算一行歌词的大致演唱时长（秒）
// 中文字符约 0.25s/字，英文按单词 0.18s/词，基础时长 0.8s，夹在 [1.0s, 6.0s]
function estimateLineDurationSec(text) {
    const units = textUnitCount(text);
    const basePad = 0.5; // 最小基底，避免过短
    const est = basePad + (units > 0 ? units * songSecPerUnit.value : 0);
    return Math.min(7.0, Math.max(0.8, est));
}

// 计算“上一句预计结束时间”：行起始 + 估算时长，但不超过下一行起始
function estimateLineEndTimeSec(index, nextIndex) {
    const cur = lyricsObjArr.value?.[index];
    const nxt = lyricsObjArr.value?.[nextIndex];
    if (!cur || typeof cur.time !== 'number') return NaN;
    const lineStart = Number(cur.time);
    const nextStart = (nxt && typeof nxt.time === 'number') ? Number(nxt.time) : Infinity;
    const estDur = estimateLineDurationSec(String(cur.lyric || ''));
    const estEnd = lineStart + estDur;
    return Math.min(estEnd, nextStart);
}

// 当当前歌词行号变化时，根据阈值决定是否展示/收起间奏
function handleInterludeOnIndexChange(newIdx) {
    if (!lyricsObjArr.value || !Array.isArray(lyricsObjArr.value)) return;
    if (typeof newIdx !== 'number') return;
    if (newIdx < 0) {
        interludeAnimation.value = false;
        clearInterludeTimers();
        interludeIndex.value = null;
        interludeRemainingTime.value = null;
        return;
    }

    // 只对“有下一句正文”的情况启用间奏，否则视为“没有下一句歌词”不展示
    const nextIdx = findNextContentIndex(newIdx);
    if (nextIdx === -1) {
        interludeAnimation.value = false;
        clearInterludeTimers();
        interludeIndex.value = null;
        interludeRemainingTime.value = null;
        return;
    }

    const currentSeek = getSafeSeek();
    const nextLineTime = Number(lyricsObjArr.value[nextIdx]?.time ?? NaN);
    if (!Number.isFinite(nextLineTime)) return;

    const threshold = Number(lyricInterludeTime.value || 0);

    // 先清理任何既有定时器
    clearInterludeTimers();

    // 启发式：以“上一句预计结束时间”为起点计算纯间奏
    const estEnd = estimateLineEndTimeSec(newIdx, nextIdx);
    if (!Number.isFinite(estEnd)) return;
    const pureGap = nextLineTime - estEnd; // 仅“上一句结束”到“下一句开始”的空档

    if (pureGap >= threshold) {
        interludeIndex.value = newIdx;
        interludeAnimation.value = false;
        const delayMs = Math.max(0, Math.round((estEnd - currentSeek) * 1000));
        interludeDeferStartTimer = setTimeout(() => {
            if (lycCurrentIndex.value !== newIdx) return;
            interludeAnimation.value = true;
            interludeDeferStartTimer = null;
        }, delayMs);
    } else {
        // 不满足阈值：确保不展示
        interludeAnimation.value = false;
        interludeFastClose.value = true;
        interludeOutTimer = setTimeout(() => {
            interludeIndex.value = null;
            interludeFastClose.value = false;
            interludeOutTimer = null;
        }, 900);
        interludeRemainingTime.value = null;
    }
}

// 在进度变化时，仅更新倒计时与“<1s 收起”的判断（不做阈值判断，避免提前收起）
function handleInterludeOnProgress() {
    if (!lyricsObjArr.value || !Array.isArray(lyricsObjArr.value)) return;
    if (!playing.value || !lyricShow.value) return;
    const idx = typeof lycCurrentIndex.value === 'number' ? lycCurrentIndex.value : -1;
    if (idx < 0) return;

    // 若没有下一句“有正文内容”的歌词，则不展示/继续间奏
    const nextIdx = findNextContentIndex(idx);
    if (nextIdx === -1) {
        interludeAnimation.value = false;
        clearInterludeTimers();
        interludeIndex.value = null;
        interludeRemainingTime.value = null;
        return;
    }

    const currentSeek = getSafeSeek();
    const nextLineTime = Number(lyricsObjArr.value[nextIdx]?.time ?? NaN);
    if (!Number.isFinite(nextLineTime)) return;
    const estEnd = estimateLineEndTimeSec(idx, nextIdx);
    if (!Number.isFinite(estEnd)) return;

    // 若尚未到“上一句预计结束”时刻，则不应显示动画
    if (currentSeek < estEnd) {
        interludeAnimation.value = false;
        interludeRemainingTime.value = null;
        return;
    }

    const gap = nextLineTime - currentSeek; // 距离下一句开始的剩余秒
    const pureGapRemaining = nextLineTime - Math.max(currentSeek, estEnd); // 仅剩余的纯间奏秒数
    if (gap < 1) {
        interludeAnimation.value = false;
        clearInterludeTimers();
        interludeOutTimer = setTimeout(() => {
            interludeIndex.value = null;
            interludeOutTimer = null;
        }, 900);
        interludeRemainingTime.value = null;
    } else {
        interludeRemainingTime.value = Math.max(0, Math.trunc(pureGapRemaining - 1));
    }
}

// Resize 触发同步：容器尺寸改变后重新测量与同步
let lyricResizeObserver = null;
let resizeRaf = 0;
const scheduleLayout = () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(async () => {
        await applyLyricLayout();
    });
};

// 仅在类型变化时做常规重算（显示/隐藏由可见性观察处理）
watch(
    lyricType,
    async () => {
        await recalcLyricLayout();
    },
    { deep: true, flush: 'post' }
);

// 当“间奏阈值”调整时，重新校准本歌演唱速率模型
watch(
    () => lyricInterludeTime.value,
    () => {
        recomputeSongTimingModel();
    }
);

// 观察歌词区域的真实可见性（包含 lyrics 存在、显示开关和原文开关，并且有可显示的原文内容）
const lyricAreaVisible = computed(() => {
    return !!(hasLyricsList.value && hasAnyLyricContent.value && lyricShow.value && lyricType.value && lyricType.value.indexOf('original') !== -1);
});

// 在切换为“显示原文”和“显示歌词”之前，先同步开启 no-flash，避免用户看到首帧
const showOriginal = computed(() => !!(lyricType.value && lyricType.value.indexOf('original') !== -1));
watch(
    showOriginal,
    show => {
        if (show) suppressLyricFlash.value = true;
    },
    { flush: 'sync' }
);
watch(
    () => lyricShow.value,
    show => {
        if (show) suppressLyricFlash.value = true;
    },
    { flush: 'sync' }
);

// 当区域从隐藏 -> 显示时，隐藏首帧并等待布局稳定后再同步，避免位置错乱
watch(
    lyricAreaVisible,
    async (visible) => {
        if (visible) {
            suppressLyricFlash.value = true;
            // 具体的布局同步放在过渡 after-enter 回调中完成
        }
    },
    { flush: 'post' }
);

watch([lyricSize, tlyricSize, rlyricSize], recalcLyricLayout, { flush: 'post' });

// 增强版的当前歌词索引监听（统一复用 syncLyricPosition，避免重复逻辑导致状态不一致）
const { currentLyricIndex } = storeToRefs(playerStore);
watch(
    currentLyricIndex,
    async (newIndex) => {
        // 若上一行存在已展开的间奏，为防止其收起过渡影响高度测量，启用快速折叠
        if (interludeIndex.value != null && interludeIndex.value !== newIndex) {
            interludeFastClose.value = true;
        }
        lycCurrentIndex.value = newIndex;
        // 等待DOM稳定后，统一调用同步函数，确保 scroll-area 高度与偏移一并更新
        await nextTick();
        syncLyricPosition();
        // 短暂延时后恢复正常过渡（供后续可能的间奏展开使用）
        if (interludeFastClose.value) {
            setTimeout(() => { interludeFastClose.value = false; }, 120);
        }
        // 仅在索引变化时做阈值判断，是否展示/收起间奏
        handleInterludeOnIndexChange(newIndex);
    },
    { immediate: true, flush: 'post' }
); // 添加 immediate 选项确保立即执行

const changeProgressLyc = (time, index) => {
    lyricScrollArea.value.style.height = initMax + 'Px';
    lycCurrentIndex.value = index;
    playerStore.currentLyricIndex = index;

    if (!playing.value) {
        const offset = computeCumulativeOffset(lycCurrentIndex.value)
        const total = computeTotalHeight()
        initMax = total || initMax
        initOffset = -(initMax - 260)
        lineOffset.value = initOffset - offset
        minHeightVal.value = offset
        maxHeightVal.value = initMax + offset
    }
    progress.value = time;
    changeProgress(time);
};

// 同步当前歌词位置的函数
const syncLyricPosition = () => {
    if (lycCurrentIndex.value !== null && lycCurrentIndex.value >= 0 && lyricEle.value && lyricEle.value[lycCurrentIndex.value]) {
        const offset = computeCumulativeOffset(lycCurrentIndex.value)
        const total = computeTotalHeight()
        initMax = total || initMax
        initOffset = -(initMax - 260)
        lineOffset.value = initOffset - offset
        minHeightVal.value = offset
        maxHeightVal.value = initMax + offset
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
    async (newVal) => {
        if (newVal) {
            // 当歌词重新显示时，先隐藏，再同步位置，避免看到跳变
            suppressLyricFlash.value = true;
            // 具体的布局同步放在过渡 after-enter 回调中完成
        }
    }
);

// 检测大幅进度跳转（拖动进度条）时立即恢复歌词同步
watch(
    () => progress.value,
    (newVal, oldVal) => {
        // 仅更新倒计时与 <1s 收起，不做阈值判断
        handleInterludeOnProgress();
        if (typeof oldVal !== 'number') return;
        if (Math.abs(newVal - oldVal) <= 1.2) return;

        if (pauseActiveTimer.value) {
            clearTimeout(pauseActiveTimer.value);
            pauseActiveTimer.value = null;
        }

        isLyricActive.value = true;
        syncLyricPosition();
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
    
    // 组件挂载后立即检查并同步歌词位置（先隐藏，定位完成后再显示，避免闪烁）
    setTimeout(async () => {
        if (lyricsObjArr.value && lyricsObjArr.value.length > 0) {
            suppressLyricFlash.value = true;
            await nextTick();
            setDefaultStyle();
            // 如果有当前歌词索引，确保同步到正确位置
            if (currentLyricIndex.value >= 0) {
                syncLyricPosition();
            }
            await nextTick();
            suppressLyricFlash.value = false;
        }
    }, 100);
    // 监听容器尺寸变化，变化后重新同步（例如窗口尺寸变化、父容器变化、字体替换等）
    if (typeof ResizeObserver !== 'undefined') {
        lyricResizeObserver = new ResizeObserver(() => scheduleLayout());
        if (lyricScroll.value) lyricResizeObserver.observe(lyricScroll.value);
    } else {
        window.addEventListener('resize', scheduleLayout);
    }
});

onUnmounted(() => {
    clearInterludeTimers();
    if (interludeProgressInterval) { clearInterval(interludeProgressInterval); interludeProgressInterval = null; }
    if (lyricResizeObserver) {
        lyricResizeObserver.disconnect();
        lyricResizeObserver = null;
    } else {
        window.removeEventListener('resize', scheduleLayout);
    }
});

// 启动/停止 200ms 的进度轮询
watch([playing, lyricShow], ([p, show]) => {
    if (p && show) {
        if (!interludeProgressInterval) {
            interludeProgressInterval = setInterval(() => {
                handleInterludeOnProgress();
            }, 200);
        }
    } else {
        if (interludeProgressInterval) {
            clearInterval(interludeProgressInterval);
            interludeProgressInterval = null;
        }
    }
});
</script>

<template>
    <div class="lyric-container" :class="{ 'blur-enabled': lyricBlur }">
        <Transition name="fade" @after-enter="onLyricAreaAfterEnter">
            <div v-show="hasLyricsList && hasAnyLyricContent && lyricShow && lyricType.indexOf('original') != -1" class="lyric-area" :class="{ 'no-flash': suppressLyricFlash }" ref="lyricScroll">
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
                    <div v-if="lycCurrentIndex != -1 && interludeIndex == index" class="music-interlude" :class="{ 'music-interlude-in': interludeAnimation, 'music-interlude-fast-close': interludeFastClose }">
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
            <div v-show="!hasLyricsList || lyricType.indexOf('original') == -1 || !hasAnyLyricContent" class="lyric-nodata">
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
        &.no-flash {
            opacity: 0;
            /* 取消进入过渡的缩放，以免影响布局测量/视觉位置 */
            transform: none !important;
        }
        &.no-flash, &.no-flash * {
            transition: none !important;
        }
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
                &.music-interlude-fast-close{
                    transition: none !important;
                    height: 0 !important;
                    opacity: 0 !important;
                    transform: scale(0) !important;
                }
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
