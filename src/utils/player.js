import pinia from '../store/pinia'
import { Howl, Howler } from 'howler'
import { formatDuration } from './time';
import { noticeOpen } from './dialog'
import { checkMusic, getMusicUrl, likeMusic, getLyric } from '../api/song'
import { getLikelist, getUserPlaylist } from '../api/user'
import { useUserStore } from '../store/userStore'
import { usePlayerStore } from '../store/playerStore'
import { useLibraryStore } from '../store/libraryStore'
import { useOtherStore } from '../store/otherStore'
import { storeToRefs } from 'pinia'
import {watch} from "vue";

const otherStore = useOtherStore()
const userStore = useUserStore()
const libraryStore = useLibraryStore(pinia)
const playerStore = usePlayerStore(pinia)
const { libraryInfo } = storeToRefs(libraryStore)
const { currentMusic, playing, progress, volume, quality, playMode, songList, shuffledList, shuffleIndex, listInfo, songId, currentIndex, time, playlistWidgetShow, playerChangeSong, lyric, lyricsObjArr, lyricShow, lyricEle, isLyricDelay, widgetState, localBase64Img, musicVideo, currentMusicVideo, musicVideoDOM, videoIsPlaying, playerShow, lyricBlur, currentLyricIndex } = storeToRefs(playerStore)

let isProgress = false
let musicProgress = null
let loadLast = true
let playModeOne = false //为true代表顺序播放已全部结束
let refreshingStream = false
let lastRefreshAttempt = 0

watch(volume, (v) => {
  window.playerApi?.setVolume?.(v)
})

// 统一更新窗口标题和（macOS）Dock菜单
function updateWindowTitleDock() {
    try {
        const curList = songList.value || []
        const idx = typeof currentIndex.value === 'number' ? currentIndex.value : 0
        const cur = curList[idx]
        if (!cur) {
            // 无当前歌曲，恢复默认标题
            windowApi.setWindowTile('Hydrogen Music')
            return
        }
        const sName = cur.name || cur.localName || 'Hydrogen Music'
        const aName = (cur.ar && cur.ar[0] && cur.ar[0].name) ? cur.ar[0].name : ''

        const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''
        const isMac = /Mac/i.test(platform)
        if (isMac) {
            windowApi.updateDockMenu({ name: sName, artist: aName })
        } else {
            const title = aName ? `${sName} - ${aName}` : sName
            windowApi.setWindowTile(title)
        }
    } catch (e) {
        // 保底不抛错
    }
}
let currentTiming = null
let videoCheckInterval = null
let closedVideoMemory = new Set() // 记录用户主动关闭视频的歌曲ID

/**
 * 基于当前歌曲ID检查并加载对应的视频
 */
export function checkAndLoadVideoForCurrentSong() {
    // 首先清理现有的视频状态
    unloadMusicVideo()

    // 检查是否启用了音乐视频功能
    if (!musicVideo.value || !songId.value) {
        return
    }

    // 检查用户是否主动关闭了该歌曲的视频显示
    if (closedVideoMemory.has(songId.value)) {
        return
    }

    // 立即检查当前歌曲是否有对应的视频文件
    windowApi.musicVideoIsExists({ id: songId.value, method: 'verify' }).then(result => {
        // 验证歌曲ID是否仍然匹配（防止快速切歌）
        if (result && result !== '404' && result !== false && result.data &&
            result.data.path && result.data.id === songId.value &&
            songId.value && songId.value === result.data.id) {

            // 再次检查记忆状态（防止异步过程中状态变化）
            if (closedVideoMemory.has(songId.value)) {
                return
            }

            currentMusicVideo.value = result.data

            // 等待音乐开始播放后再启动视频检查
            setTimeout(() => {
                // 再次确认歌曲ID仍然匹配且未被用户关闭
                if (songId.value === result.data.id && currentMusicVideo.value &&
                    currentMusicVideo.value.id === songId.value &&
                    !closedVideoMemory.has(songId.value)) {

                    // 根据歌曲类型启动对应的视频时间检查
                    if (songList.value && songList.value[currentIndex.value] && songList.value[currentIndex.value].type === 'local') {
                        startLocalMusicVideo()
                    } else {
                        startMusicVideo()
                    }
                }
            }, 500)
        }
    }).catch(error => {
        console.error('检查视频文件时出错:', error)
    })
}

/**
 * 关闭当前音乐视频显示功能，恢复到原本无视频状态
 */
export function pauseCurrentMusicVideo() {
    if (!musicVideo.value) {
        return false
    }

    if (!currentMusicVideo.value || !currentMusicVideo.value.id) {
        return false
    }

    if (currentMusicVideo.value.id !== songId.value) {
        return false
    }

    // 将当前歌曲ID添加到关闭记忆中
    closedVideoMemory.add(songId.value)

    // 完全卸载当前音乐视频，恢复到无视频状态
    unloadMusicVideo()

    return true
}

/**
 * 重新打开当前音乐的视频显示
 */
export function reopenCurrentMusicVideo() {
    if (!musicVideo.value) {
        return false
    }

    if (!songId.value) {
        return false
    }

    // 如果当前已经有视频在播放，不需要重新打开
    if (currentMusicVideo.value && currentMusicVideo.value.id === songId.value) {
        return true
    }

    // 从关闭记忆中移除当前歌曲ID
    closedVideoMemory.delete(songId.value)

    // 调用统一的视频检查和加载函数
    checkAndLoadVideoForCurrentSong()

    return true
}

/**
 * 检查指定歌曲是否被用户主动关闭了视频显示
 */
export function isVideoClosedByUser(songId) {
    return closedVideoMemory.has(songId)
}

export function loadLastSong() {
    if (loadLast) {
        windowApi.getLastPlaylist().then(list => {
            if (list) {
                songList.value = list.songList
                shuffledList.value = list.shuffledList
            }
            if (songList.value) {
                // 恢复播放状态时，需要先设置歌曲ID
                setId(songList.value[currentIndex.value].id, currentIndex.value)

                if (songList.value[currentIndex.value].type == 'local') getSongUrl(songList.value[currentIndex.value].id, currentIndex.value, false, true)
                else getSongUrl(songList.value[currentIndex.value].id, currentIndex.value, false, false)
                if (musicVideo.value) loadMusicVideo(songList.value[currentIndex.value].id)
            }
        })
    }
}

function getSafeCurrentSeek() {
    try {
        if (currentMusic.value && typeof currentMusic.value.seek === 'function') {
            const seekValue = currentMusic.value.seek()
            if (typeof seekValue === 'number' && !Number.isNaN(seekValue)) return seekValue
        }
    } catch (error) {
        console.warn('获取播放进度失败:', error)
    }
    return typeof progress.value === 'number' && !Number.isNaN(progress.value) ? progress.value : 0
}

async function refreshStreamAndResume(eventType, error) {
    const now = Date.now()
    if (refreshingStream || now - lastRefreshAttempt < 500) return
    const currentSong = songList.value && songList.value[currentIndex.value]
    if (!currentSong || currentSong.type === 'local') return
    if (!songId.value) return

    refreshingStream = true
    lastRefreshAttempt = now

    const resumePosition = getSafeCurrentSeek()

    try {
        const preferredQuality = quality.value || currentSong.quality || 'standard'
        const songInfo = await getMusicUrl(songId.value, preferredQuality)
        const trackInfo = songInfo && songInfo.data && songInfo.data[0]

        if (!trackInfo || !trackInfo.url) {
            console.error('刷新歌曲播放地址失败：未返回url', songInfo)
            noticeOpen('当前歌曲链接已失效，请尝试切换下一首', 2)
            return
        }

        try {
            setSongLevel(trackInfo.level)
        } catch (err) {
            console.warn('更新歌曲音质信息失败:', err)
        }

        progress.value = resumePosition
        play(trackInfo.url, true, resumePosition)
    } catch (fetchError) {
        console.error('刷新歌曲播放地址失败:', fetchError)
        noticeOpen('刷新播放地址失败，请尝试切换歌曲', 2)
    } finally {
        refreshingStream = false
    }
}

export function play(url, autoplay, resumeSeek = null) {
    // 切歌或重新播放前，先停止旧的进度计时，避免残留一帧旧进度覆盖UI
    clearInterval(musicProgress)
    if (currentMusic.value) {
        currentMusic.value.unload()
        Howler.unload()
    }
    // 播放前更新音量
    window.playerApi?.setVolume?.(volume.value)
    // 每次播放新音乐时，检查当前歌曲是否有对应的视频
    checkAndLoadVideoForCurrentSong()

    const normalizedSeek = typeof resumeSeek === 'number' && !Number.isNaN(resumeSeek) ? Math.max(resumeSeek, 0) : null

    currentMusic.value = new Howl({
        src: url,
        autoplay: autoplay,
        html5: true,
        preload: true,
        format: ['mp3', 'flac', 'aac', 'm4a', 'wav', 'ogg', 'webm', 'mp4', 'weba', 'oga'],
        loop: (playMode.value == 2),
        volume: volume.value,
        xhr: {
            method: 'GET',
            withCredentials: true,
        },
        onplayerror: function (_id, err) {
            console.warn('检测到播放错误，尝试刷新播放地址', err)
            refreshStreamAndResume('playerror', err)
        },
        onloaderror: function (_id, err) {
            console.warn('加载音频失败，尝试刷新播放地址', err)
            refreshStreamAndResume('loaderror', err)
        },
        onend: function () {
            clearInterval(musicProgress)

            // 处理FM模式的播放结束逻辑
            if (listInfo.value && listInfo.value.type === 'personalfm') {
                // FM模式：根据当前播放模式决定行为
                if (playMode.value == 2) {
                    // 单曲循环模式：重新播放当前歌曲
                    // FM mode: replaying current song (single loop)
                    const fmPlayModeEvent = new CustomEvent('fmPlayModeResponse', {
                        detail: { action: 'loop' }
                    })
                    window.dispatchEvent(fmPlayModeEvent)
                } else {
                    // 其他模式（顺序播放、列表循环、随机播放）：播放下一首漫游歌曲
                    // FM mode: playing next song for all other modes
                    const fmPlayModeEvent = new CustomEvent('fmPlayModeResponse', {
                        detail: { action: 'next' }
                    })
                    window.dispatchEvent(fmPlayModeEvent)
                }
                return
            }

            // 原有的播放结束逻辑（非FM模式）
            if (playMode.value == 0 && currentIndex.value < songList.value.length - 1) { playNext(); return } //顺序播放
            if (playMode.value == 0 && currentIndex.value == songList.value.length - 1) { playing.value = false; playModeOne = true; windowApi.playOrPauseMusicCheck(playing.value); return } //顺序播放结束暂停状态
            if (playMode.value == 1) { playNext(); return } //列表循环
            if (playMode.value == 3) { playNext() } //随机播放(为列表循环)
            if (playMode.value == 2) { clearLycAnimation() } // 单曲循环播放结束时清除歌词动画
        }
    })
    currentMusic.value.once('load', () => {
        time.value = Math.floor(currentMusic.value.duration())
        let targetSeek = null

        if (normalizedSeek !== null) {
            targetSeek = Math.min(normalizedSeek, currentMusic.value.duration() || normalizedSeek)
            loadLast = false
        } else if (loadLast && !autoplay) {
            targetSeek = Math.min(progress.value || 0, currentMusic.value.duration() || 0)
            loadLast = false
        }

        if (targetSeek !== null && !Number.isNaN(targetSeek)) {
            currentMusic.value.volume(0)
            currentMusic.value.seek(targetSeek)
            progress.value = targetSeek
        }
        playerChangeSong.value = false
        // 通知 Media Session：新曲目加载完成，刷新一次系统时长/进度（静态策略）
        try {
            window.dispatchEvent(new CustomEvent('mediaSession:seeked', {
                detail: { duration: Math.floor(currentMusic.value.duration() || 0), toTime: progress.value || 0 }
            }))
        } catch (_) {}
    })
    currentMusic.value.on('play', () => {
        currentMusic.value.fade(0, volume.value, 200)
        startProgress()
        playing.value = true
        windowApi.playOrPauseMusicCheck(playing.value)
        // 切歌/播放开始时统一更新窗口标题与（macOS）Dock 菜单
        updateWindowTitleDock()
    })
    currentMusic.value.on('pause', () => {
        clearInterval(musicProgress)
        playing.value = false
        windowApi.playOrPauseMusicCheck(playing.value)
        currentMusic.value.fade(volume.value, 0, 200)
    })
}

export function startProgress() {
    clearInterval(musicProgress)
    progress.value = currentMusic.value.seek()
    musicProgress = setInterval(() => {
        if (currentMusic.value.seek() < time.value)
            progress.value = currentMusic.value.seek()
    }, 1000);
}

export function setId(id, index) {
    if (playMode.value != 3) {
        songId.value = id
        currentIndex.value = index
    } else {
        songId.value = id
        shuffleIndex.value = index
        currentIndex.value = (songList.value || []).findIndex((song) => song.id === songId.value)
    }
}

export function addToList(listType, songlist) {
    // 移除之前的 fmReset 事件，以保留FM状态
    // if (listInfo.value && listInfo.value.type === 'personalfm' && listType !== 'personalfm') {
    //     ...
    // }

    let listId = 'none'
    if (listType === 'rec') {
        listId = 'rec'
    } else if (listType === 'dj') {
        try {
            const hash = (typeof window !== 'undefined' && window.location && window.location.hash) ? window.location.hash : ''
            // 期望路径形如：#/mymusic/dj/:id
            const parts = hash.split('?')[0].split('/')
            // ['', 'mymusic', 'dj', ':id']
            if (parts.length >= 4 && parts[2] === 'dj' && parts[3]) {
                listId = parts[3]
            } else if (listInfo.value && listInfo.value.type === 'dj' && listInfo.value.id) {
                // 回退到当前播放器内已有的电台信息
                listId = listInfo.value.id
            }
        } catch (_) {
            // 忽略解析失败，使用默认值
        }
    } else if (libraryInfo.value) {
        listId = libraryInfo.value.id
    }

    listInfo.value = {
        id: listId,
        type: listType
    }
    songList.value = songlist.slice(0, songlist.length + 1)
    savePlaylist()
}

export function localMusicHandle(list, isToNext) {
    let addList = []
    list.forEach(song => {
        let ar = []
        if (song.common.artists)
            song.common.artists.forEach(artist => {
                ar.push({
                    id: 'local',
                    name: artist
                })
            })
        else {
            ar.push({
                id: 'local',
                name: 'NONE'
            })
        }
        addList.push(
            {
                id: song.id,
                ar: ar,
                url: song.dirPath,
                name: song.common.title,
                localName: song.common.localTitle,
                type: 'local',
                sampleRate: song.format.sampleRate / 1000,
                bitsPerSample: song.format.bitsPerSample,
                bitrate: Math.round(song.format.bitrate / 1000),
            }
        )
    });
    if (isToNext) return addList[0]
    return addList
}

export function addLocalMusicTOList(listType, localMusicList, playId, playIndex) {
    listInfo.value = {
        id: 'local',
        type: listType
    }

    songList.value = localMusicHandle(localMusicList, false)
    addSong(playId, playIndex, true, true)
    savePlaylist()
}
export function startLocalMusicVideo() {
    clearInterval(videoCheckInterval)
    videoCheckInterval = setInterval(() => {
        musicVideoCheck(currentMusic.value.seek())
    }, 200);
}

export function startMusicVideo() {
    clearInterval(videoCheckInterval)
    videoCheckInterval = setInterval(() => {
        musicVideoCheck(currentMusic.value.seek())
    }, 200);
}
export function unloadMusicVideo() {
    // 清理状态变量
    currentMusicVideo.value = null
    videoIsPlaying.value = false
    playerShow.value = true
    currentTiming = null

    // 清理定时器
    if (videoCheckInterval) {
        clearInterval(videoCheckInterval)
        videoCheckInterval = null
    }

    // 如果存在视频播放器，暂停并清理
    if (musicVideoDOM.value) {
        try {
            musicVideoDOM.value.pause()
            // 尝试清理视频源
            if (musicVideoDOM.value.source) {
                musicVideoDOM.value.source = null
            }
        } catch (error) {
            console.log('清理视频播放器时出错:', error)
        }
    }
}
export function loadMusicVideo(id) {
    // 强制清理任何现有的视频状态
    unloadMusicVideo()

    // FM模式下需要稍长的延迟，等待FM切歌异步操作完成
    const delay = listInfo.value && listInfo.value.type === 'personalfm' ? 300 : 100

    // 等待一个短暂的时间确保清理完成，然后检查视频
    setTimeout(() => {
        windowApi.musicVideoIsExists({ id: id, method: 'verify' }).then(result => {
            // 严格检查 - 只有明确返回有效结果且文件存在时才加载视频
            if (result && result !== '404' && result !== false && result.data && result.data.path && result.data.id === id) {
                // 再次验证当前歌曲ID是否仍然匹配（防止快速切歌导致的异步问题）
                if (songId.value === id) {
                    currentMusicVideo.value = result.data

                    // 为所有类型的音乐启动视频检查
                    if (songList.value && songList.value[currentIndex.value] && songList.value[currentIndex.value].type == 'local') {
                        startLocalMusicVideo()
                    } else {
                        startMusicVideo()
                    }
                }
            } else {
                // 确保彻底清理
                unloadMusicVideo()
            }
        }).catch(error => {
            console.error('检查视频文件时出错:', error)
            // 出错时确保清理
            unloadMusicVideo()
        })
    }, delay)
}

export function addSong(id, index, autoplay, isLocal) {
    // 主动切歌：从头开始播放，不恢复上次进度
    loadLast = false
    // 先停止旧的进度计时，避免残留计时在下一秒把UI回写为上一首的进度
    clearInterval(musicProgress)
    // 立即重置前端进度与时长，避免看到上一首的进度与时长
    progress.value = 0
    time.value = 0
    // 清空上首的本地封面，避免下一首短暂使用上一首封面
    try { localBase64Img.value = null } catch (_) {}
    // 立即通知 SMTC/Media Session 将进度归零，避免保留上一首的时间轴
    try {
        window.dispatchEvent(new CustomEvent('mediaSession:seeked', {
            detail: { duration: 0, toTime: 0 }
        }))
    } catch (_) {}
    if (lyricShow.value) {
        lyricShow.value = false
        playerChangeSong.value = true
    }
    setId(id, index)

    // 切歌时清理视频状态（新的统一视频检查函数会处理加载）
    unloadMusicVideo()

    if (songList.value[currentIndex.value].type == 'local') isLocal = true
    else isLocal = false

    if (currentMusic.value && volume.value != 0) {
        currentMusic.value.fade(volume.value, 0, 200)
        currentMusic.value.once('fade', () => {
            getSongUrl(id, index, autoplay, isLocal)
            return
        })
        if (currentMusic.value.state() == 'loading' || currentMusic.value.state() == 'unloaded') {
            currentMusic.value.unload()
            getSongUrl(id, index, autoplay, isLocal)
        }
    } else {
        getSongUrl(id, index, autoplay, isLocal)
    }
}

export function setSongLevel(level) {
    if (level == 'standard') songList.value[currentIndex.value].level = songList.value[currentIndex.value].l
    else if (level == 'higher') songList.value[currentIndex.value].level = songList.value[currentIndex.value].m
    else if (level == 'exhigh') songList.value[currentIndex.value].level = songList.value[currentIndex.value].h
    else if (level == 'lossless') songList.value[currentIndex.value].level = songList.value[currentIndex.value].sq
    else if (level == 'hires') songList.value[currentIndex.value].level = songList.value[currentIndex.value].hr
    songList.value[currentIndex.value].quality = level
}
export async function getLocalLyric(filePath) {
    const lyric = await windowApi.getLocalMusicLyric(filePath)
    if (lyric) return lyric
    else return false
}

// 处理本地歌词数据，支持滚动播放
function processLocalLyricData() {
    if (!lyric.value || !lyric.value.lrc || !lyric.value.lrc.lyric) {
        lyricsObjArr.value = []
        return
    }

    try {
        const regNewLine = /\n/
        // 更宽松的 LRC 时间标签：允许 : ： . ． 。 , ， ; ； / - _ 或空白作为分隔
        const regTime = /\[(\d{1,3})\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,2})(?:\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,3}))?\]/g

        // 时间解析函数（返回秒，保留毫秒）
        const parseTime = (timeStr) => {
            const m = timeStr.match(/\[(\d{1,3})\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,2})(?:\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,3}))?\]/)
            if (!m) return 0
            const min = parseInt(m[1]) || 0
            const sec = parseInt(m[2]) || 0
            const ms = m[3] ? parseInt((m[3] + '00').slice(0, 3)) : 0
            return min * 60 + sec + ms / 1000
        }

        if (lyric.value.lrc.lyric.indexOf('[') !== -1) {
            // 有时间标签的LRC歌词，支持同一时间多行（原文/翻译/罗马音）
            const lines = lyric.value.lrc.lyric.split(regNewLine)
            const byTime = new Map() // key: time(固定3位小数字符串) -> { time, lyric, tlyric, rlyric, active }

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i]
                if (!line || line.trim() === '') continue
                const tags = Array.from(line.matchAll(regTime))
                if (!tags || tags.length === 0) continue
                const text = line.split(']').pop().trim()
                if (!text) continue

                for (const tag of tags) {
                    const t = parseTime(tag[0])
                    const key = t.toFixed(3)
                    if (!byTime.has(key)) {
                        byTime.set(key, { time: t, lyric: '', tlyric: '', rlyric: '', active: true })
                    }
                    const obj = byTime.get(key)
                    if (!obj.lyric) obj.lyric = text
                    else if (!obj.tlyric) obj.tlyric = text
                    else if (!obj.rlyric) obj.rlyric = text
                    // 若超过三行，后续行忽略（保持三轨）
                }
            }

            const processed = Array.from(byTime.values()).sort((a, b) => a.time - b.time)
            lyricsObjArr.value = processed
        } else {
            // 纯文本歌词
            const lines = lyric.value.lrc.lyric.split(regNewLine)
            const processedLyrics = []

            lines.forEach(line => {
                if (line.trim() === '') return
                processedLyrics.push({
                    lyric: line.trim(),
                    time: 0,
                    active: true
                })
            })

            lyricsObjArr.value = processedLyrics
        }
    } catch (error) {
        console.error('处理本地歌词数据出错:', error)
        lyricsObjArr.value = []
    }
}
export async function getSongUrl(id, index, autoplay, isLocal) {
    // 名称与歌手的兜底处理（本地歌曲兼容）
    const songName = songList.value[index].name || songList.value[index].localName || 'Hydrogen Music'
    const artistName = (songList.value[index].ar && songList.value[index].ar[0] && songList.value[index].ar[0].name) ? songList.value[index].ar[0].name : ''

    // 区分平台：mac 使用 Dock 菜单，Windows/Linux 更新窗口标题
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''
    const isMac = /Mac/i.test(platform)
    if (isMac) {
        // 更新 Dock 菜单（仅在 macOS 上）
        windowApi.updateDockMenu({ name: songName, artist: artistName })
    } else {
        // 更新窗口标题（Windows/Linux）
        const title = artistName ? `${songName} - ${artistName}` : songName
        windowApi.setWindowTile(title)
    }

    if (isLocal) {
        windowApi.getLocalMusicImage(songList.value[currentIndex.value].url).then(base64 => {
            localBase64Img.value = base64
            // 本地封面到达后，提示 Media Session 刷新一次元数据（以载入封面）
            try { window.dispatchEvent(new CustomEvent('mediaSession:updateArtwork')) } catch (_) {}
        })
        const filePath = songList.value[currentIndex.value].url.replace(/\\/g, '/')
        const fileUrl = filePath.startsWith('file://')
            ? filePath
            : 'file://' + filePath
        play(fileUrl, autoplay)
        lyric.value = null
        lyricsObjArr.value = null
        //获取本地歌词
        const localLyric = await getLocalLyric(songList.value[currentIndex.value].url)
        if (localLyric) {
            lyric.value = { lrc: { lyric: localLyric } }
            // 处理歌词数据，支持滚动播放
            processLocalLyricData()
        }
        if (!lyricShow.value && !widgetState.value) {
            lyricShow.value = true
            playerChangeSong.value = false
        }
        return
    }
    await checkMusic(id).then(result => {
        if (result.success == true) {
            getMusicUrl(id, quality.value).then(songInfo => {
                play(songInfo.data[0].url, autoplay)
                setSongLevel(songInfo.data[0].level)
            })
            getLyric(id).then(songLiric => {
                lyric.value = songLiric
            })
        } else {
            noticeOpen('当前歌曲无法播放', 2)
            clearInterval(musicProgress)
            playing.value = false
            currentMusic.value = null
            lyric.value = null
            playNext()
        }
    })
}

export function startMusic() {
    if (playMode.value == 0 && currentIndex.value == songList.value.length - 1 && playModeOne && currentMusic.value.seek() == 0) { playNext(); playModeOne = false; return }
    if (!playing.value) {
        currentMusic.value.play()
    }
    if (lyricShow.value) {
        isLyricDelay.value = false
        const forbidDelayTimer = setTimeout(() => {
            isLyricDelay.value = true
            clearTimeout(forbidDelayTimer)
        }, 700);
    }

    // 检查是否有视频需要同步播放
    if (currentMusicVideo.value && currentMusicVideo.value.id === songId.value) {
        if (musicVideoDOM.value) {
            musicVideoDOM.value.play()
        }
        // 根据歌曲类型启动对应的视频时间检查
        if (songList.value && songList.value[currentIndex.value] && songList.value[currentIndex.value].type === 'local') {
            startLocalMusicVideo()
        } else {
            startMusicVideo()
        }
    } else if (musicVideo.value && songId.value) {
        // 如果没有视频但功能开启，检查是否需要加载视频
        checkAndLoadVideoForCurrentSong()
    }
}
export function pauseMusic() {
    clearInterval(musicProgress)
    if (playing.value) {
        currentMusic.value.fade(volume.value, 0, 200)
        currentMusic.value.once('fade', () => {
            currentMusic.value.pause()
            playing.value = false
        })
    }
    if (videoIsPlaying.value) {
        musicVideoDOM.value.pause()
        // 为所有类型的音乐清理视频检查
        clearInterval(videoCheckInterval)
    }
}

export function playLast() {
    // FM模式下的特殊逻辑：触发自定义事件播放上一首FM歌曲
    if (listInfo.value && listInfo.value.type === 'personalfm') {
        // FM模式下的特殊逻辑
        const fmPreviousEvent = new CustomEvent('fmPreviousResponse', {
            detail: { action: 'previous' }
        })
        window.dispatchEvent(fmPreviousEvent)
        return
    }

    // 非FM模式下的原有逻辑
    let id = null
    let index = null
    if (playMode.value != 3) {
        if (currentIndex.value - 1 < 0) {
            index = songList.value.length - 1
            id = songList.value[index].id
        } else {
            id = songList.value[currentIndex.value - 1].id
            index = currentIndex.value - 1
        }
    }
    if (playMode.value == 3) {
        if (shuffleIndex.value - 1 < 0) {
            index = shuffledList.value.length - 1
            id = shuffledList.value[index].id
        } else {
            index = shuffleIndex.value - 1
            id = shuffledList.value[index].id
        }
    }
    addSong(id, index, true)
}
export function playNext() {
    // FM模式下的特殊逻辑：触发自定义事件播放下一首FM歌曲
    if (listInfo.value && listInfo.value.type === 'personalfm') {
        // FM模式下的特殊逻辑
        const fmNextEvent = new CustomEvent('fmNextResponse', {
            detail: { action: 'next' }
        })
        window.dispatchEvent(fmNextEvent)
        return
    }

    // 非FM模式下的原有逻辑
    let id = null
    let index = null
    if (playMode.value != 3) {
        if (songList.value.length - 1 == currentIndex.value) {
            index = 0
            id = songList.value[index].id
        } else {
            index = currentIndex.value + 1
            id = songList.value[index].id
        }
    }
    if (playMode.value == 3) {
        if (shuffleIndex.value == shuffledList.value.length - 1) {
            index = 0
            id = shuffledList.value[index].id
        } else {
            index = shuffleIndex.value + 1
            id = shuffledList.value[index].id
        }
    }
    addSong(id, index, true)
}
const clearLycAnimation = () => {
    isLyricDelay.value = false
    for (let i = 0; i < lyricEle.value.length; i++) {
        lyricEle.value[i].style.transitionDelay = 0 + 's'
        // 若启用歌词模糊，移除内联样式，交由样式表控制
        if (lyricBlur.value) lyricEle.value[i].firstChild.style.removeProperty("filter");
    }
    const forbidDelayTimer = setTimeout(() => {
        isLyricDelay.value = true
        clearTimeout(forbidDelayTimer)
    }, 600);
}
// 同步歌词索引到指定时间点（用于拖动/跳转时的即时更新）
function updateLyricIndexForSeek(seekSeconds) {
    try {
        if (!Array.isArray(lyricsObjArr.value) || lyricsObjArr.value.length === 0) return
        const s = Number(seekSeconds)
        if (!Number.isFinite(s)) return

        const arr = lyricsObjArr.value
        // 容差与桌面歌词逻辑保持一致，避免边界闪烁
        const t = s + 0.2

        // 二分查找，找到最后一个 time <= t 的索引
        let l = 0
        let r = arr.length - 1
        let ans = -1
        while (l <= r) {
            const m = (l + r) >> 1
            const mt = Number(arr[m]?.time || 0)
            if (mt <= t) {
                ans = m
                l = m + 1
            } else {
                r = m - 1
            }
        }

        // 保底处理：若未找到，置为0；若超过最后一行，置为最后一行
        if (ans < 0) ans = 0
        if (ans > arr.length - 1) ans = arr.length - 1

        if (currentLyricIndex && currentLyricIndex.value !== ans) {
            currentLyricIndex.value = ans
        }
    } catch (e) {
        // 安全兜底：任何异常不影响主流程
    }
}
export function changeProgress(toTime) {
    if (!widgetState.value && lyricShow.value && lyricEle.value) clearLycAnimation()
    if (videoIsPlaying.value) {
        musicVideoCheck(toTime, true)
    }
    // 先更新进度与歌词索引，再执行实际 seek，确保 UI 与索引同步
    if (typeof toTime === 'number' && Number.isFinite(toTime)) {
        progress.value = toTime
        updateLyricIndexForSeek(toTime)
    }
    currentMusic.value.seek(toTime)
    // 静态策略下，仅在显式 seek 时通知一次系统进度
    try {
        window.dispatchEvent(new CustomEvent('mediaSession:seeked', {
            detail: { duration: Math.floor(time.value || 0), toTime }
        }))
    } catch (_) {}
}
//控制拖拽进度条
export function changeProgressByDragStart() {
    clearInterval(musicProgress)
}
export function changeProgressByDragEnd(toTime) {
    changeProgress(toTime)
    if (playing.value) startProgress()
}
// ------------
export function changePlayMode() {
    // FM模式下的特殊切换逻辑：只在模式2（单曲循环）和模式3（随机播放）之间切换
    if (listInfo.value && listInfo.value.type === 'personalfm') {
        if (playMode.value == 2) {
            playMode.value = 3  // 从单曲循环切换到随机播放（播放下一首漫游音乐）
        } else {
            playMode.value = 2  // 从随机播放（或其他模式）切换到单曲循环
        }
    } else {
        // 非FM模式下的原有逻辑
        if (playMode.value != 3) playMode.value += 1
        else playMode.value = 0
    }

    if (playMode.value == 2) currentMusic.value.loop(true) //循环模式
    else currentMusic.value.loop(false)
    if (playMode.value == 3) {
        setShuffledList()
    } else {
        shuffledList.value = null
        shuffleIndex.value = null
    }
    windowApi.changeTrayMusicPlaymode(playMode.value)

  // 通知 MPRIS 循环模式
  switch (playMode.value) {
    case 0: // 顺序播放
    case 3: // 随机播放
      window.playerApi.switchRepeatMode('off')
      break
    case 1: // 列表循环
      window.playerApi.switchRepeatMode('on')
      break
    case 2: // 单曲循环
      window.playerApi.switchRepeatMode('one')
      break
  }

  // 通知 MPRIS 随机状态
  window.playerApi.switchShuffle(playMode.value === 3)
}

export function playAll(listType, list) {
    if (playMode.value == 3) {
        addToList(listType, list)
        setShuffledList(true)
        addSong(shuffledList.value[0].id, 0, true)
    } else {
        addToList(listType, list)
        addSong(songList.value[0].id, 0, true)
    }
}

export function setShuffledList(isplayAll) {
    shuffledList.value = shuffle(songList.value, isplayAll)
    shuffleIndex.value = 0
}

function shuffle(arr, isplayAll) { // 随机打乱数组
    let _arr = arr.slice() // 调用数组副本，不改变原数组
    for (let i = 0; i < _arr.length; i++) {
        let j = getRandomInt(0, i)
        let t = _arr[i]
        _arr[i] = _arr[j]
        _arr[j] = t
    }
    if (!isplayAll) {
        let currentSongIndex = (_arr || []).findIndex((song) => song.id === songId.value) //在打乱的列表中找到当前播放歌曲删除并添加至队列顶部
        _arr.splice(currentSongIndex, 1)
        _arr.unshift(songList.value[currentIndex.value])
    }
    return _arr
}
function getRandomInt(min, max) { // 获取min到max的一个随机数，包含min和max本身
    return Math.floor(Math.random() * (max - min + 1) + min)
}

export async function getFavoritePlaylistId() {
    // 如果已经缓存了播放列表ID，直接返回
    if (userStore.favoritePlaylistId) {
        return userStore.favoritePlaylistId
    }

    try {
        const params = {
            uid: userStore.user.userId,
            limit: 50,
            offset: 0,
            timestamp: new Date().getTime()
        }

        const result = await getUserPlaylist(params)
        if (result && result.playlist && result.playlist.length > 0) {
            // 找到用户创建的第一个播放列表（通常是"我喜欢的音乐"）
            const favoritePlaylist = result.playlist.find(playlist =>
                playlist.creator.userId === userStore.user.userId &&
                playlist.specialType === 5 // 网易云音乐中"我喜欢的音乐"的特殊类型
            )

            if (favoritePlaylist) {
                userStore.updateFavoritePlaylistId(favoritePlaylist.id)
                return favoritePlaylist.id
            }

            // 如果没找到特殊类型，尝试通过名称匹配
            const playlistByName = result.playlist.find(playlist =>
                playlist.creator.userId === userStore.user.userId &&
                (playlist.name.includes('我喜欢') || playlist.name.includes('喜欢的音乐'))
            )

            if (playlistByName) {
                userStore.updateFavoritePlaylistId(playlistByName.id)
                return playlistByName.id
            }

            // 最后回退到用户创建的第一个播放列表
            const firstCreatedPlaylist = result.playlist.find(playlist =>
                playlist.creator.userId === userStore.user.userId
            )

            if (firstCreatedPlaylist) {
                userStore.updateFavoritePlaylistId(firstCreatedPlaylist.id)
                return firstCreatedPlaylist.id
            }
        }
    } catch (error) {
    }

    return null
}

export async function likeSong(like) {
    const songIdValue = songId.value

    // 检查前置条件
    if (!songIdValue) {
        console.error('likeSong失败: 没有当前歌曲ID')
        noticeOpen("操作失败：没有选中的歌曲", 2)
        return
    }

    if (!userStore.user || !userStore.user.userId) {
        console.error('likeSong失败: 用户信息未加载')
        noticeOpen("操作失败：用户信息未加载，请稍后重试", 2)
        return
    }

    if (!userStore.likelist) {
        console.error('likeSong失败: 喜欢列表未加载')
        noticeOpen("操作失败：喜欢列表未加载，请稍后重试", 2)
        return
    }

    try {
        console.log('调用官方 /like API, songId:', songIdValue, 'like:', like, 'userId:', userStore.user.userId)
        const result = await likeMusic(songIdValue, like)
        console.log('likeMusic 返回结果:', result)

        if (result && result.code == 200) {
            console.log('官方 /like API 成功')
            await updateLikelistAfterSuccess()
            otherStore.addPlaylistShow = false
            libraryStore.needTimestamp.push('/playlist/detail')
            libraryStore.needTimestamp.push('/playlist/track/all')

            let noCacheTimer = null
            if (noCacheTimer) clearTimeout(noCacheTimer)
            noCacheTimer = setTimeout(() => {
                const detailIndex = libraryStore.needTimestamp.indexOf('/playlist/detail')
                const trackIndex = libraryStore.needTimestamp.indexOf('/playlist/track/all')
                if (detailIndex !== -1) libraryStore.needTimestamp.splice(detailIndex, 1)
                if (trackIndex !== -1) libraryStore.needTimestamp.splice(trackIndex, 1)
                clearTimeout(noCacheTimer)
            }, 130000)

            try {
                if (libraryStore.listType1 == 0 && libraryStore.listType2 == 0) {
                    const myPlaylistElement = document.getElementById('myPlaylist')
                    if (myPlaylistElement) {
                        myPlaylistElement.click()
                    }
                }
            } catch (e) {
                console.error('点击myPlaylist失败，忽略:', e)
            }
        } else {
            console.error('官方 /like API 失败:', result)
            const errorMsg = result?.message || result?.msg || '未知错误'
            noticeOpen(`喜欢/取消喜欢 音乐失败：${errorMsg}`, 2)
        }
    } catch (error) {
        console.error('调用 /like API 异常:', error)
        const errorMsg = error?.response?.data?.message || error?.message || '网络错误'
        noticeOpen(`喜欢/取消喜欢 音乐失败：${errorMsg}`, 2)
    }
}

async function updateLikelistAfterSuccess() {
    try {
        const res = await getLikelist(userStore.user.userId)
        userStore.likelist = res.ids

        // 如果当前正在查看"我喜欢的音乐"歌单，实时更新歌单内容
        await updateFavoritePlaylistIfViewing()
    } catch (error) {
        console.error('更新喜欢列表失败:', error)
    }
}

async function updateFavoritePlaylistIfViewing() {
    // 检查当前是否在查看"我喜欢的音乐"歌单
    if (libraryStore.libraryInfo && userStore.favoritePlaylistId &&
        libraryStore.libraryInfo.id == userStore.favoritePlaylistId) {

        console.log('当前正在查看我喜欢的音乐，正在更新歌单内容...')

        try {
            // 重新获取歌单详情
            await libraryStore.updatePlaylistDetail(userStore.favoritePlaylistId)
            console.log('我喜欢的音乐歌单已更新')
        } catch (error) {
            console.error('更新我喜欢的音乐歌单失败:', error)
        }
    }
}

export function addToNext(nextSong, autoplay) {
    if (!songList.value) songList.value = []
    if (nextSong.id == songId.value) return

    const si = (songList.value || []).findIndex((song) => song.id === nextSong.id)
    if (si != -1) {
        songList.value.splice(si, 1)
        if (si < currentIndex.value) currentIndex.value--
    }
    songList.value.splice(currentIndex.value + 1, 0, nextSong)

    if (playMode.value == 3) {
        const shufflei = (shuffledList.value || []).findIndex((song) => song.id === nextSong.id)
        if (shufflei != -1) {
            shuffledList.value.splice(shufflei, 1)
            if (shufflei < currentIndex.value) shuffleIndex.value--
        }
        shuffledList.value.splice(shuffleIndex.value + 1, 0, nextSong)
    }
    if (autoplay) playNext()
    else noticeOpen('已添加至下一首', 2)
    if (songList.value.length == 1) addSong(nextSong.id, 0, autoplay)
}
export function addToNextLocal(song, autoplay) {
    addToNext(localMusicHandle([song], true), autoplay)
}
export function savePlaylist() {
    let list = {
        songList: songList.value,
        shuffledList: shuffledList.value
    }
    windowApi.saveLastPlaylist(JSON.stringify(list))
}
export function songTime(dt) {
    if (dt) {
        if (dt == 0 || dt == "--") return dt;
        // 将毫秒转换为秒
        const seconds = Math.floor(dt / 1000);
        return formatDuration(seconds);
    }
}
export function songTime2(time) {
    let min = Math.floor(time / 60)
    let sec = Math.floor(time % 60)
    if (sec == 60) {
        sec = 0
        min++
    }
    if (min < 10) min = '0' + min
    if (sec < 10) sec = '0' + sec
    return min + ':' + sec
}
/**
 * 音乐视频监测
 */
export function musicVideoCheck(seek, update) {
    // 多重严格检查
    if (!musicVideo.value) {
        return // 功能未启用
    }

    if (!currentMusicVideo.value) {
        return // 没有视频数据
    }

    if (!currentMusicVideo.value.timing || !Array.isArray(currentMusicVideo.value.timing) || currentMusicVideo.value.timing.length === 0) {
        return // 没有有效的时间轴数据
    }

    if (!musicVideoDOM.value) {
        return // 视频播放器不存在
    }

    // 检查当前歌曲ID是否匹配，FM模式下需要特殊处理
    const isPersonalFM = listInfo.value && listInfo.value.type === 'personalfm'

    if (!songId.value || !currentMusicVideo.value.id) {
        unloadMusicVideo()
        return
    }

    // FM模式和普通模式都需要严格检查ID匹配
    if (songId.value !== currentMusicVideo.value.id) {
        unloadMusicVideo() // 清理不匹配的视频
        return
    }

    // 普通模式下还需要检查歌曲列表中的当前歌曲ID是否也匹配
    if (!isPersonalFM && songList.value && currentIndex.value >= 0 && songList.value[currentIndex.value] &&
        songList.value[currentIndex.value].id !== currentMusicVideo.value.id) {
        unloadMusicVideo() // 清理不匹配的视频
        return
    }

    if (musicVideo.value && currentMusicVideo.value && (!videoIsPlaying.value || update)) {
        let foundValidTiming = false

        for (let i = 0; i < currentMusicVideo.value.timing.length; i++) {
            const timing = currentMusicVideo.value.timing[i]

            // 验证时间段数据的完整性
            if (typeof timing.start !== 'number' || typeof timing.end !== 'number' || typeof timing.videoTiming !== 'number') {
                console.warn('无效的时间段数据:', timing)
                continue
            }

            if (seek >= timing.start && seek < timing.end) {
                foundValidTiming = true

                if (playing.value && musicVideoDOM.value) {
                    musicVideoDOM.value.play()
                }
                const vt = timing.videoTiming + seek - timing.start
                if (musicVideoDOM.value) {
                    musicVideoDOM.value.currentTime = vt
                }
                currentTiming = timing
                videoIsPlaying.value = true
                if (!update) playerShow.value = false
                return
            }
        }

        if (!foundValidTiming) {
            videoIsPlaying.value = false
            playerShow.value = true
            if (musicVideoDOM.value) {
                musicVideoDOM.value.pause()
            }
        }
    } else if (videoIsPlaying.value && currentTiming) {
        if (seek > currentTiming.end) {
            videoIsPlaying.value = false
            playerShow.value = true
            currentTiming = null
        }
    }
}


function setVolumeForPlay(value) {
  volume.value = Math.max(0, Math.min(1, value))
  console.log(volume.value)
  currentMusic.value.volume(volume.value)
}


window.addEventListener('mousedown', (e) => {
    if (e.target.parentNode.parentNode.id == 'widget-progress') {
        changeProgressByDragStart()
        isProgress = true
    }
})

window.addEventListener('mouseup', () => {
    if (isProgress) {
        changeProgressByDragEnd(progress.value)
        isProgress = false
    }
})

window.addEventListener('click', (e) => {
    if (playlistWidgetShow.value) {
        if (document.getElementsByClassName('playlist-widget')[0].contains(e.target) == false && document.getElementsByClassName('music-control')[0].contains(e.target) == false && document.getElementsByClassName('music-other')[0].contains(e.target) == false && document.getElementsByClassName('playlist-widget-player')[0].contains(e.target) == false && document.getElementsByClassName('song-control')[0].contains(e.target) == false && document.getElementsByClassName('contextMune')[0].contains(e.target) == false && e.target.className.baseVal != 'item-delete')
            playlistWidgetShow.value = false
    }
    if (otherStore.contextMenuShow) otherStore.contextMenuShow = false
    if (!otherStore.videoIsBlur && otherStore.videoPlayerShow && document.getElementById('videoPlayer').contains(e.target) == false) otherStore.videoIsBlur = true
    else if (otherStore.videoIsBlur && otherStore.videoPlayerShow && document.getElementById('videoPlayer').contains(e.target) == true && document.getElementsByClassName('plyr__controls')[0].contains(e.target) != true) otherStore.videoIsBlur = false
    if (userStore.appOptionShow && document.getElementsByClassName('user-head')[0].contains(e.target) != true) userStore.appOptionShow = false
})
windowApi.playOrPauseMusic((event) => {
    if (playing.value) pauseMusic()
    else startMusic()
})
windowApi.lastOrNextMusic((event, option) => {
    if (option == 'last') playLast()
    else if (option == 'next') playNext()
})
windowApi.changeMusicPlaymode((event, mode) => {
    if (playMode.value != mode) playMode.value = mode
    if (playMode.value == 2) currentMusic.value.loop(true) //循环模式
    else currentMusic.value.loop(false)
    if (playMode.value == 3) {
        setShuffledList()
    } else {
        shuffledList.value = null
        shuffleIndex.value = null
    }
})
windowApi.volumeUp(() => {
    if (volume.value + 0.1 < 1) volume.value += 0.1
    else volume.value = 1
    currentMusic.value.volume(volume.value)
})
windowApi.volumeDown(() => {
    if (volume.value - 0.1 > 0) volume.value -= 0.1
    else volume.value = 0
    currentMusic.value.volume(volume.value)
})
windowApi.musicProcessControl((event, mode) => {
    if (mode == 'forward') {
        if (progress.value + 3 < currentMusic.value.duration()) progress.value += 3
        else progress.value = currentMusic.value.duration()
    } else if (mode == 'back') {
        if (progress.value - 3 > 0) progress.value -= 3
        else progress.value = 0
    }
    // 统一使用 changeProgress，确保歌词、视频等状态同步
    changeProgress(progress.value)
})
windowApi.playOrPauseMusicCheck(playing.value)
windowApi.changeTrayMusicPlaymode(playMode.value)
windowApi.beforeQuit(() => {
    //关闭之前清除下载管理中的状态
    windowApi.downloadPause('shutdown')
    let list = {
        songList: songList.value,
        shuffledList: shuffledList.value
    }
    windowApi.exitApp(JSON.stringify(list))
})

window.playerApi.onSetPosition((positionSeconds) => {
  changeProgress(positionSeconds)
})
window.playerApi.onPlayPause(() => {
  if (playing.value) pauseMusic()
  else startMusic()
})

// 播放下一首
window.playerApi.onNext(() => {
  playNext() // 你自己实现的渲染端播放下一首逻辑
})

// 播放上一首
window.playerApi.onPrevious(() => {
  playLast()
})

// 播放/暂停
window.playerApi.onPlayM(() => {
  startMusic()
})
window.playerApi.onPauseM(() => {
  pauseMusic()
})

//循环模式切换
window.playerApi.onRepeat(() => {
  changePlayMode()
})

// 随机播放切换
window.playerApi.onShuffle(() => {
  if (playMode.value !== 3) {
    playMode.value = 3
    setShuffledList()
  } else {
    playMode.value = 0
    shuffledList.value = null
    shuffleIndex.value = null
  }
  window.playerApi.switchShuffle(playMode.value === 3)
})

window.playerApi.onVolumeChanged((v) => {
    setVolumeForPlay(v)
  }
)
