import { watch } from 'vue';
import { usePlayerStore } from '../store/playerStore';
import { storeToRefs } from 'pinia';

let lyricProgressInterval = null;
let lyricIndexInterval = null; // 新增：用于计算歌词行号的定时器
let unwatchPlaying = null;
let unwatchIsDesktopLyricOpen = null;
let unwatchCurrentIndex = null;
let unwatchLyricsObjArr = null;
let unwatchCurrentLyricIndex = null;
let unwatchProgress = null;
let unwatchLyric = null;

const playerStore = usePlayerStore();
const {
    playing,
    progress,
    currentIndex,
    songList,
    lyricsObjArr,
    currentLyricIndex,
    isDesktopLyricOpen,
    time,
    currentMusic, // 新增：需要访问 currentMusic 来获取播放进度
    lyric, // 新增：原始歌词数据
} = storeToRefs(playerStore);

// 统一的多轨歌词解析：支持
// - lrc/tlyric/romalrc 三种来源按时间对齐
// - 单个 LRC 中同一时间多行（原/译/罗马）自动合并
const regNewLine = /\n/;
// 更宽松的时间标签：允许 : ： . ． 。 , ， ; ； / - _ 或空白作为分隔，支持 [mm sep ss] 与 [mm sep ss sep cc]
const timeTag = /\[(\d{1,3})\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,2})(?:\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,3}))?\]/g;

function parseTimeTag(tag) {
    const m = tag.match(/\[(\d{1,3})\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,2})(?:\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,3}))?\]/);
    if (!m) return 0;
    const mm = parseInt(m[1] || '0', 10);
    const ss = parseInt(m[2] || '0', 10);
    const ms = m[3] ? parseInt((m[3] + '00').slice(0, 3), 10) : 0;
    return mm * 60 + ss + ms / 1000;
}

function buildMultiTrack(olrc, tlrc, rlrc) {
    const byTime = new Map(); // key: time(3位小数) -> { time, lyric, tlyric, rlyric, active }

    const feed = (text, fieldOrder = ['lyric', 'tlyric', 'rlyric'], directField = null) => {
        if (!text || typeof text !== 'string') return;
        const lines = text.split(/\r?\n/);
        for (const raw of lines) {
            if (!raw) continue;
            const tags = Array.from(raw.matchAll(timeTag));
            if (!tags || tags.length === 0) continue;
            const lyricText = raw.split(']').pop().trim();
            if (!lyricText) continue;

            for (const t of tags) {
                const sec = parseTimeTag(t[0]);
                const key = sec.toFixed(3);
                if (!byTime.has(key)) byTime.set(key, { time: sec, lyric: '', tlyric: '', rlyric: '', active: true });
                const obj = byTime.get(key);
                if (directField) {
                    // 明确指定来源（tlyric/romalrc）
                    if (!obj[directField]) obj[directField] = lyricText;
                } else {
                    // 未指定：按顺序填入第一个空位（用于同一 LRC 内的多行）
                    for (const f of fieldOrder) {
                        if (!obj[f]) { obj[f] = lyricText; break; }
                    }
                }
            }
        }
    };

    // 优先用独立的翻译/罗马音来源填充
    feed(tlrc, ['tlyric', 'lyric', 'rlyric'], 'tlyric');
    feed(rlrc, ['rlyric', 'lyric', 'tlyric'], 'rlyric');
    // 最后用原始 LRC（可能包含同一时间多行）补齐
    feed(olrc, ['lyric', 'tlyric', 'rlyric'], null);

    // 纯音乐检测（任何轨迹含有提示时）
    let isPureMusic = false;
    for (const obj of byTime.values()) {
        if (obj.lyric && obj.lyric.includes('纯音乐')) { isPureMusic = true; break; }
        if (obj.tlyric && obj.tlyric.includes('纯音乐')) { isPureMusic = true; break; }
    }
    if (isPureMusic) {
        return [
            { lyric: '纯音乐，请欣赏', tlyric: '', rlyric: '', time: 0, active: true },
            { lyric: '', tlyric: '', rlyric: '', time: Math.trunc((songList.value[currentIndex.value]?.dt || 0) / 1000), active: true },
        ];
    }

    return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

// 与原先在线歌词一致的处理逻辑（仅用于“在线”）
// 修复：
// 1) 处理同一行包含多个时间标签的情况 [mm:ss.xxx][mm:ss.xxx]文本
// 2) 正确移除所有时间标签，避免将“[04:03.890”当作正文渲染
// 3) 兼容 1-2 位分钟与 2-3 位毫秒
// 与 timeTag 一致的全局移除/匹配表达式
const regTimeTagGlobal = /\[(\d{1,3})\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,2})(?:\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,3}))?\]/g;

function lyricHandleOriginal(arr, tarr, rarr) {
    // 将原/译/罗马音统一解析为 { time, text } 列表，按时间排序
    const parseList = (lines) => {
        if (!lines) return [];
        const out = [];
        for (const raw of lines) {
            if (!raw) continue;
            const tags = Array.from(raw.matchAll(regTimeTagGlobal));
            if (!tags || tags.length === 0) continue;
            // 移除所有时间标签，保留纯文本
            const text = raw.replace(regTimeTagGlobal, '').trim();
            if (!text) continue;
            for (const t of tags) {
                const time = parseTimeTag(t[0]);
                out.push({ time, text });
            }
        }
        return out.sort((a, b) => a.time - b.time);
    };

    const oList = parseList(arr);
    const tList = parseList(tarr);
    const rList = parseList(rarr);

    // 纯音乐检测（任一轨迹包含“纯音乐”提示）
    if (oList.some(i => i.text.includes('纯音乐')) || tList.some(i => i.text.includes('纯音乐'))) {
        return [
            { lyric: '纯音乐，请欣赏', time: 0 },
            { lyric: '', time: Math.trunc((songList.value[currentIndex.value]?.dt || 0) / 1000) },
        ];
    }

    // 在原文时间轴上，按“最近时间点（±120ms 容差）”对齐翻译与罗马音
    const findNearest = (list, target, maxDelta = 0.12) => {
        if (!list || list.length === 0) return null;
        // 二分查找更近的起点
        let lo = 0, hi = list.length - 1, idx = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (list[mid].time <= target) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
        }
        let best = null, bestDelta = Infinity;
        for (let i = Math.max(0, idx - 2); i <= Math.min(list.length - 1, idx + 2); i++) {
            const d = Math.abs(list[i].time - target);
            if (d < bestDelta) { best = list[i]; bestDelta = d; }
        }
        return bestDelta <= maxDelta ? best : null;
    };

    const results = [];
    for (const o of oList) {
        // 跳过“作词/作曲”等信息行
        if (o.text.includes('作词') || o.text.includes('作曲')) continue;
        const obj = { lyric: o.text, tlyric: '', rlyric: '', time: o.time };
        const t = findNearest(tList, o.time);
        if (t && t.text) obj.tlyric = t.text;
        const r = findNearest(rList, o.time);
        if (r && r.text) obj.rlyric = r.text;
        if (obj.lyric) results.push(obj);
    }

    return results;
}

// 处理原始歌词数据，更新 lyricsObjArr（在线：原逻辑；本地：多轨合并）
const processLyricData = () => {
    if (!lyric.value) {
        playerStore.lyricsObjArr = [];
        return;
    }

    try {
        const hasTimeTag = lyric.value.lrc && typeof lyric.value.lrc.lyric === 'string' && lyric.value.lrc.lyric.indexOf('[') !== -1;
        const curSong = songList.value && songList.value[currentIndex.value];
        const isLocal = !!(curSong && curSong.type === 'local');
        if (hasTimeTag) {
            const olrc = lyric.value.lrc?.lyric || '';
            const tlrc = lyric.value.tlyric && lyric.value.tlyric.lyric ? lyric.value.tlyric.lyric : '';
            const rlrc = lyric.value.romalrc && lyric.value.romalrc.lyric ? lyric.value.romalrc.lyric : '';
            const processed = isLocal
                ? buildMultiTrack(olrc, tlrc, rlrc)
                : lyricHandleOriginal(
                    olrc.split(regNewLine),
                    tlrc ? tlrc.split(regNewLine) : null,
                    rlrc ? rlrc.split(regNewLine) : null
                  );
            playerStore.lyricsObjArr = processed;
        } else {
            // 纯文本歌词
            const lines = (lyric.value.lrc?.lyric || '').split(regNewLine);
            const processed = [];
            for (const line of lines) {
                if (!line || line.trim() === '') continue;
                processed.push({ lyric: line.trim(), tlyric: '', rlyric: '', time: 0, active: true });
            }
            processed.push({ lyric: '', tlyric: '', rlyric: '', time: Math.trunc((songList.value[currentIndex.value]?.dt || 0) / 1000), active: true });
            playerStore.lyricsObjArr = processed;
        }
    } catch (error) {
        console.error('处理歌词数据出错:', error);
        playerStore.lyricsObjArr = [];
    }
};

// 计算当前歌词行号
const calculateLyricIndex = () => {
    if (!lyricsObjArr.value || lyricsObjArr.value.length === 0 || !currentMusic.value) return;

    const length = lyricsObjArr.value.length - 1;
    const currentSeek = currentMusic.value.seek();

    const newIndex = lyricsObjArr.value.findIndex((item, index) => {
        if (index !== length) {
            return (currentSeek + 0.2) * 1000 < lyricsObjArr.value[index + 1].time * 1000;
        }
        return (currentSeek + 0.2) * 1000 > item.time * 1000;
    });

    if (newIndex !== -1 && newIndex !== currentLyricIndex.value) {
        playerStore.currentLyricIndex = newIndex;
    }
};


// 发送当前歌词数据
const sendCurrentLyricData = () => {
    if (!window.electronAPI) return;

    try {
        const hasData = songList.value && songList.value.length > 0 && currentIndex.value >= 0;
        const currentSong = hasData ? songList.value[currentIndex.value] : null;

        // 调试信息（可选，可以删除）
        //     hasData,
        //     currentIndex: currentIndex.value,
        //     songListLength: songList.value ? songList.value.length : 0,
        //     currentSong: currentSong ? {
        //         name: currentSong.name || currentSong.localName,
        //         ar: currentSong.ar
        //     } : null,
        //     lyricsLength: lyricsObjArr.value ? lyricsObjArr.value.length : 0
        // });

        const lyricData = {
            type: 'song-change',
            song: currentSong
                ? {
                      name: String(currentSong.name || currentSong.localName || '未知歌曲'),
                      ar: Array.isArray(currentSong.ar) ? currentSong.ar.map(artist => ({ name: String(artist.name || '未知艺术家') })) : [{ name: '未知艺术家' }],
                      type: String(currentSong.type || 'online'),
                  }
                : null,
            lyrics: Array.isArray(lyricsObjArr.value)
                ? lyricsObjArr.value.map(lyric => ({
                      lyric: String(lyric.lyric || ''),
                      tlyric: String(lyric.tlyric || ''),
                      rlyric: String(lyric.rlyric || ''), // 添加罗马音歌词数据
                      time: Number(lyric.time || 0),
                  }))
                : [],
        };

        window.electronAPI.updateLyricData(lyricData);
    } catch (error) {
        console.error('发送桌面歌词数据错误:', error);
    }
};

// 发送播放状态和歌词进度
const sendLyricProgress = () => {
    if (!isDesktopLyricOpen.value || !window.electronAPI) return;

    try {
        const playStateData = {
            type: 'play-state',
            playing: playing.value,
        };
        window.electronAPI.updateLyricData(playStateData);

        if (lyricsObjArr.value && lyricsObjArr.value.length > 0) {
            const progressData = {
                type: 'lyric-progress',
                currentIndex: currentLyricIndex.value,
                progress: progress.value,
                currentTime: (progress.value / 100) * time.value,
            };
            window.electronAPI.updateLyricData(progressData);
        }
    } catch (error) {
        // 静默处理错误
    }
};

// 切换桌面歌词（带动画效果）
export const toggleDesktopLyric = async () => {
    if (!window.electronAPI) {
        return;
    }

    try {
        if (isDesktopLyricOpen.value) {
            // 关闭动画：先触发退出动画，再实际关闭窗口
            const result = await window.electronAPI.closeLyricWindow();
            if (result && result.success) {
                playerStore.isDesktopLyricOpen = false;
            }
        } else {
            // 开启动画：先创建窗口，然后触发进入动画
            const result = await window.electronAPI.createLyricWindow();
            if (result && result.success) {
                playerStore.isDesktopLyricOpen = true;
                // 给窗口一些时间加载，然后发送数据触发进入动画
                setTimeout(() => {
                    sendCurrentLyricData();
                }, 200);
            }
        }
    } catch (error) {
        // 静默处理错误
    }
};

// 停止桌面歌词通信
const stopDesktopLyricSync = () => {
    if (lyricProgressInterval) {
        clearInterval(lyricProgressInterval);
        lyricProgressInterval = null;
    }
};

// 开始桌面歌词通信
const startDesktopLyricSync = () => {
    stopDesktopLyricSync();
    if (isDesktopLyricOpen.value && playing.value) {
        lyricProgressInterval = setInterval(sendLyricProgress, 300);
    }
};

// 停止歌词行号计算
const stopLyricIndexCalculation = () => {
    if (lyricIndexInterval) {
        clearInterval(lyricIndexInterval);
        lyricIndexInterval = null;
    }
};

// 开始歌词行号计算（独立于桌面歌词）
const startLyricIndexCalculation = () => {
    stopLyricIndexCalculation();
    if (playing.value) {
        lyricIndexInterval = setInterval(calculateLyricIndex, 200);
    }
};

// 初始化歌词服务
export const initDesktopLyric = () => {
    if (window.electronAPI) {
        // 检查启动时桌面歌词窗口是否已存在
        window.electronAPI.isLyricWindowVisible().then(isVisible => {
            playerStore.isDesktopLyricOpen = isVisible;
        });

        // 监听来自主进程的歌词数据请求
        window.electronAPI.getCurrentLyricData(() => {
            sendCurrentLyricData();
        });

        // 监听桌面歌词窗口关闭事件
        window.electronAPI.onDesktopLyricClosed(() => {
            playerStore.isDesktopLyricOpen = false;
        });
    }

    // 监听播放状态变化 - 控制歌词行号计算和桌面歌词通信
    unwatchPlaying = watch(() => playing.value, (newVal) => {
        if (isDesktopLyricOpen.value) {
            sendLyricProgress();
        }
        
        if (newVal) {
            // 播放时开始歌词行号计算（总是运行）
            startLyricIndexCalculation();
            // 如果桌面歌词开启，也开始桌面歌词通信
            if (isDesktopLyricOpen.value) {
                startDesktopLyricSync();
            }
        } else {
            // 暂停时停止所有定时器
            stopLyricIndexCalculation();
            stopDesktopLyricSync();
        }
    });
        
    unwatchIsDesktopLyricOpen = watch(() => isDesktopLyricOpen.value, (newVal) => {
        if (newVal) {
            sendCurrentLyricData();
            if (playing.value) {
                startDesktopLyricSync();
            }
        } else {
            stopDesktopLyricSync();
        }
    });
    
    unwatchCurrentIndex = watch(() => currentIndex.value, (newIndex, oldIndex) => {
        
        // 歌曲切换时，重新启动歌词行号计算（无论桌面歌词是否开启）
        if (playing.value) {
            startLyricIndexCalculation();
        }
        
        // 如果桌面歌词开启，发送新歌曲数据
        if (isDesktopLyricOpen.value) {
            setTimeout(() => {
                sendCurrentLyricData();
            }, 500); // 增加延迟时间确保歌词数据已更新
            
            if (playing.value) {
                startDesktopLyricSync();
            }
        }
    });
    
    unwatchLyricsObjArr = watch(() => lyricsObjArr.value, (newLyrics, oldLyrics) => {
        if (isDesktopLyricOpen.value && newLyrics && newLyrics.length > 0) {
            // 检查歌词是否真的发生了变化
            const lyricsChanged = !oldLyrics || 
                                oldLyrics.length !== newLyrics.length ||
                                (newLyrics.length > 0 && oldLyrics.length > 0 && 
                                 newLyrics[0].lyric !== oldLyrics[0].lyric);
            
            if (lyricsChanged) {
                setTimeout(() => {
                    sendCurrentLyricData();
                }, 50);
            }
        }
    });
    
    unwatchCurrentLyricIndex = watch(() => currentLyricIndex.value, () => {
        if (isDesktopLyricOpen.value) {
            sendLyricProgress();
        }
    });

    unwatchProgress = watch(() => progress.value, () => {
        if (isDesktopLyricOpen.value) {
            sendLyricProgress();
        }
    });

    // 监听原始歌词数据变化
    unwatchLyric = watch(() => lyric.value, (newLyric) => {
        processLyricData();
        if (isDesktopLyricOpen.value) {
            // 歌词更新后发送新数据
            setTimeout(() => {
                sendCurrentLyricData();
            }, 100);
        }
    });
};

// 销毁服务
export const destroyDesktopLyric = () => {
    stopLyricIndexCalculation();
    stopDesktopLyricSync();
    if (unwatchPlaying) unwatchPlaying();
    if (unwatchIsDesktopLyricOpen) unwatchIsDesktopLyricOpen();
    if (unwatchCurrentIndex) unwatchCurrentIndex();
    if (unwatchLyricsObjArr) unwatchLyricsObjArr();
    if (unwatchCurrentLyricIndex) unwatchCurrentLyricIndex();
    if (unwatchProgress) unwatchProgress();
    if (unwatchLyric) unwatchLyric();
};
