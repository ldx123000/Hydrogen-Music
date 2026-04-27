import pinia from '../store/pinia'
import { Howl, Howler } from 'howler'
import { songTime as formatSongTime, songTime2 as formatSongProgressTime } from './time';
import { noticeOpen } from './dialog'
import { checkMusic, likeMusic, getLyric } from '../api/song'
import { getSirenLyricText, getSirenSong } from '../api/siren'
import { updatePlaylist } from '../api/playlist'
import { getLikelist, getUserPlaylist } from '../api/user'
import { useUserStore } from '../store/userStore'
import { usePlayerStore } from '../store/playerStore'
import { useLibraryStore } from '../store/libraryStore'
import { useOtherStore } from '../store/otherStore'
import { storeToRefs } from 'pinia'
import { markRaw, toRaw, watch } from "vue";
import { getPreferredQuality } from './quality'
import { resolveTrackByQualityPreference } from './musicUrlResolver'
import { getSongDisplayName } from './songName'
import { getSirenSourceId, getSirenAudioExtension, isSirenSong } from './siren'
import { syncLyricIndexForSeek } from '../composables/usePlayerRuntime'
import { schedulePlaylistCacheInvalidation } from './cacheInvalidation'
import { PLAYBACK_TICK_FAST_INTERVAL_MS, subscribePlaybackTick } from './player/playbackTicker'
import { initPlayerExternalBridge as initExternalBridge } from './player/externalBridge'
import { loadStoredPlaylist, persistPlaylistBeforeExit, saveStoredPlaylist } from './player/playlistPersistence'
import { createShuffledList } from './player/queue'
import { getPrefetchedSongAssets, getSongAssetKey, prefetchSongAssets } from './player/assetPrefetch'
import { createDecodedAudioPlayer } from './player/webAudioGapless'
import { runIdleTask } from './player/idleTask'
import { createEmptyLyric } from './player/lyricPayload'
import { verifyStoredMusicVideo } from './musicVideoLookup'
import { isSeekInMusicVideoTiming, isValidMusicVideoTiming } from './musicVideoTiming'
import { getIndexedSong, getIndexedSongOrFirst } from './songList'
import {
    DEFAULT_FAVORITE_PLAYLIST_NAME,
    normalizeFavoritePlaylistMeta,
    resolveFavoritePlaylistMeta as resolveFavoritePlaylistMetaBase,
} from './favoritePlaylist'

const otherStore = useOtherStore()
const userStore = useUserStore()
const libraryStore = useLibraryStore(pinia)
const playerStore = usePlayerStore(pinia)
const { libraryInfo } = storeToRefs(libraryStore)
const { currentMusic, playing, progress, volume, quality, playMode, songList, shuffledList, shuffleIndex, listInfo, songId, currentIndex, time, playlistWidgetShow, playerChangeSong, lyric, lyricsObjArr, lyricShow, lyricEle, isLyricDelay, widgetState, localBase64Img, musicVideo, currentMusicVideo, musicVideoDOM, videoIsPlaying, playerShow, lyricBlur, currentLyricIndex, showSongTranslation, gaplessPlayback } = storeToRefs(playerStore)

const PLAYBACK_SNAPSHOT_PERSIST_INTERVAL_MS = 5000
let isProgress = false
let loadLast = true
let playModeOne = false //为true代表顺序播放已全部结束
let refreshingStream = false
let lastRefreshAttempt = 0
let streamRefreshToken = 0
let disposeProgressTicker = null
let disposeVideoTicker = null
let playerExternalBridgeInitialized = false
let gaplessPreload = null
let gaplessPreloadToken = 0
const GAPLESS_PRELOAD_MAX_AGE_MS = 15 * 60 * 1000
const GAPLESS_PRELOAD_IDLE_TIMEOUT_MS = 1500
const GAPLESS_EARLY_START_SECONDS = 0.85
const GAPLESS_CROSSFADE_MS = 700
const fadeInDurationByHowl = new WeakMap()
let disposeGaplessTransitionTicker = null
let gaplessTransitionInProgress = false
let playbackSnapshotPersistTimer = null
let lastPlaybackSnapshotPersistAt = 0
const levelFieldMap = {
    standard: 'l',
    higher: 'm',
    exhigh: 'h',
    lossless: 'sq',
    hires: 'hr',
}

watch(volume, (v) => {
  window.playerApi?.setVolume?.(v)
  if (gaplessPreload?.howl && !isCurrentHowl(gaplessPreload.howl)) {
    gaplessPreload.howl.volume?.(v)
  }
})
watch(showSongTranslation, () => {
    updateWindowTitleDock()
})

function normalizePlaybackNumber(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function normalizePlaybackDuration(value) {
    const parsed = normalizePlaybackNumber(value)
    return parsed > 0 ? parsed : 0
}

function clampPlaybackProgress(value, maxDuration = null) {
    const parsed = normalizePlaybackNumber(value)
    if (parsed <= 0) return 0

    const safeMax = normalizePlaybackDuration(maxDuration)
    return safeMax > 0 ? Math.min(parsed, safeMax) : parsed
}

function getCurrentSong() {
    return getIndexedSong(songList.value, currentIndex.value)
}

function getCurrentSongOrFirst() {
    return getIndexedSongOrFirst(songList.value, currentIndex.value)
}

function hasCurrentSongSelected() {
    return !!getCurrentSong()
}

function clearCurrentSongLevel(song) {
    if (!song) return
    song.level = null
    song.actualLevel = ''
    song.quality = ''
}

function applySirenTrackInfo(song, streamUrl) {
    if (!song) return
    const ext = getSirenAudioExtension(streamUrl)
    const sr = Howler.ctx?.sampleRate || 44100
    song.level = { sr, br: sr * 16 * 2, size: 0 }
    song.actualLevel = ext
    song.quality = ext
}

function updateCurrentSongDurationFromHowl() {
    const currentSong = getCurrentSong()
    if (!currentSong || !currentMusic.value || typeof currentMusic.value.duration !== 'function') return

    const durationMs = Math.round((currentMusic.value.duration() || 0) * 1000)
    if (!Number.isFinite(durationMs) || durationMs <= 0) return

    currentSong.duration = durationMs
    currentSong.dt = durationMs
}

async function resolveSirenSongPlayback(targetSong, options = {}) {
    const sourceId = getSirenSourceId(targetSong)
    if (!sourceId) throw new Error('缺少塞壬歌曲 ID')

    const songData = await getSirenSong(sourceId, options)
    const streamUrl = songData?.sourceUrl || targetSong?.streamUrl || targetSong?.sourceUrl || ''
    const lyricUrl = songData?.lyricUrl || targetSong?.lyricUrl || ''

    if (streamUrl) {
        targetSong.streamUrl = streamUrl
        targetSong.sourceUrl = streamUrl
    }
    if (lyricUrl) targetSong.lyricUrl = lyricUrl

    return {
        streamUrl,
        lyricUrl,
    }
}

async function getSirenLyricPayload(lyricUrl) {
    if (!lyricUrl) return createEmptyLyric()
    const lyricText = await getSirenLyricText(lyricUrl)
    return {
        lrc: {
            lyric: lyricText || '',
        },
    }
}

function syncWindowsTaskbarPlaybackState() {
    try {
        const runtimePlatform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''
        if (!/Win/i.test(runtimePlatform)) return
        const hasCurrentSong = hasCurrentSongSelected()
        windowApi.updatePlaylistStatus({
            hasCurrentSong,
            hasPrevious: hasCurrentSong,
            hasNext: hasCurrentSong,
        })
    } catch (_) {
        // ignore
    }
}

watch(
    () => [Array.isArray(songList.value) ? songList.value.length : 0, currentIndex.value, songId.value],
    () => {
        syncWindowsTaskbarPlaybackState()
    },
    { immediate: true }
)

// 统一更新窗口标题和（macOS）Dock菜单
function updateWindowTitleDock() {
    try {
        const cur = getCurrentSongOrFirst()
        if (!cur) {
            // 无当前歌曲，恢复默认标题
            windowApi.setWindowTile('Hydrogen Music')
            return
        }
        const sName = getSongDisplayName(cur, 'Hydrogen Music', showSongTranslation.value)
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
let closedVideoMemory = new Set() // 记录用户主动关闭视频的歌曲ID
const NORMAL_PLAY_MODES = Object.freeze([0, 1, 2, 3])
let preFmPlayMode = null
const LIKE_SYNC_RETRY_DELAY = 280
const LIKE_SYNC_RETRY_LIMIT = 2
const LIKE_REQUEST_COOLDOWN_MS = 1200
let likeActionToken = 0
let likeRequestQueue = Promise.resolve()
let nextLikeRequestAvailableAt = 0
const PLAYBACK_DIRECTION_NEXT = 1
const PLAYBACK_DIRECTION_PREVIOUS = -1

function isPersonalFMContext() {
    return listInfo.value?.type === 'personalfm'
}

function getActivePlaybackQueue() {
    const isShuffleMode = playMode.value == 3
    const activeList = isShuffleMode ? shuffledList.value : songList.value
    const list = Array.isArray(activeList) ? activeList : []
    const rawIndex = Number(isShuffleMode ? shuffleIndex.value : currentIndex.value)
    const activeIndex = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < list.length ? rawIndex : 0

    return {
        isShuffleMode,
        list,
        activeIndex,
    }
}

function getPlaybackTarget(direction = PLAYBACK_DIRECTION_NEXT, options = {}) {
    if (isPersonalFMContext()) return null

    const { list, activeIndex, isShuffleMode } = getActivePlaybackQueue()
    if (list.length === 0) return null
    if (options.skipSingleCurrent && list.length === 1 && String(list[0]?.id || '') === String(songId.value || '')) return null
    if (options.stopAtSequentialEnd && !isShuffleMode && playMode.value == 0 && direction > 0 && activeIndex >= list.length - 1) return null

    const step = direction < 0 ? -1 : 1
    let targetIndex = activeIndex + step
    if (targetIndex < 0) targetIndex = list.length - 1
    else if (targetIndex >= list.length) targetIndex = 0

    const targetSong = list[targetIndex] || null
    if (!targetSong) return null

    return {
        song: targetSong,
        id: targetSong.id,
        index: targetIndex,
    }
}

function getNextButtonPlaybackCandidate() {
    return getPlaybackTarget(PLAYBACK_DIRECTION_NEXT, {
        skipSingleCurrent: true,
    })
}

function getNextAutoPlaybackCandidate() {
    if (playMode.value == 2) return null

    return getPlaybackTarget(PLAYBACK_DIRECTION_NEXT, {
        skipSingleCurrent: true,
        stopAtSequentialEnd: true,
    })
}

function scheduleNextSongAssetPrefetch() {
    const nextSong = getNextButtonPlaybackCandidate()?.song || null
    if (!nextSong) {
        if (gaplessPlayback.value) clearGaplessPreload()
        return
    }
    void prefetchSongAssets(nextSong, { quality: quality.value, immediate: true })
    if (gaplessPlayback.value) {
        void preloadGaplessSongPlayback(nextSong, { quality: quality.value })
    }
}

function clearGaplessPreload(invalidatePending = true) {
    const entry = gaplessPreload
    if (invalidatePending) gaplessPreloadToken += 1
    if (!entry) return

    try { entry.howl?.unload?.() } catch (_) {}
    gaplessPreload = null
}

function isGaplessPreloadUsable(entry, song, url = '') {
    if (!entry || !song) return false
    if (Date.now() - entry.createdAt > GAPLESS_PRELOAD_MAX_AGE_MS) return false
    if (entry.key !== getSongAssetKey(song)) return false
    if (entry.quality && entry.quality !== getPreferredQuality(quality.value)) return false
    if (url && entry.url && entry.url !== url) return false
    return !!(entry.howl && typeof entry.howl.play === 'function' && entry.howl.state?.() !== 'unloaded')
}

async function resolveSongPlaybackInfo(song, options = {}) {
    if (!song || typeof song !== 'object') return null
    if (song.type === 'local') {
        const localPath = song.url || song.path || song.dirPath
        if (!localPath) return null
        return {
            url: windowApi?.toFileUrl ? windowApi.toFileUrl(localPath) : localPath,
            localPath,
            trackInfo: null,
            isSiren: false,
        }
    }

    if (isSirenSong(song)) {
        const sirenPlayback = await resolveSirenSongPlayback(song, options.force ? { force: true } : {})
        return sirenPlayback?.streamUrl
            ? {
                url: sirenPlayback.streamUrl,
                lyricUrl: sirenPlayback.lyricUrl,
                trackInfo: null,
                isSiren: true,
            }
            : null
    }

    const playbackId = options.id ?? song.id
    if (!playbackId) return null

    if (options.checkAvailability) {
        const availability = await checkMusic(playbackId)
        if (availability?.success != true) {
            return {
                unavailable: true,
                availability,
            }
        }
    }

    const preferredQuality = getPreferredQuality(options.quality ?? quality.value)
    const trackInfo = await resolveTrackByQualityPreference(playbackId, preferredQuality, {
        force: options.force === true,
    })
    return trackInfo?.url
        ? {
            url: trackInfo.url,
            trackInfo,
            isSiren: false,
        }
        : null
}

export function preloadGaplessSongPlayback(song, options = {}) {
    if (!gaplessPlayback.value || playMode.value == 2) {
        clearGaplessPreload()
        return Promise.resolve(null)
    }

    const key = getSongAssetKey(song)
    if (!key || key === getSongAssetKey(getCurrentSong())) return Promise.resolve(null)

    const preferredQuality = song?.type === 'local' || isSirenSong(song) ? '' : getPreferredQuality(options.quality ?? quality.value)
    if (gaplessPreload?.key === key && gaplessPreload?.quality === preferredQuality && gaplessPreload?.howl?.state?.() !== 'unloaded') {
        return Promise.resolve(gaplessPreload)
    }

    const token = ++gaplessPreloadToken
    return runIdleTask(async () => {
        try {
            if (token !== gaplessPreloadToken || !gaplessPlayback.value) return null

            const playbackInfo = await resolveSongPlaybackInfo(song, { quality: preferredQuality })
            if (token !== gaplessPreloadToken || !gaplessPlayback.value || !playbackInfo?.url) return null

            const nextHowl = markRaw(await createDecodedAudioPlayer(playbackInfo.url, {
                localPath: playbackInfo.localPath,
            }))
            const entry = {
                key,
                song,
                songId: song.id,
                url: playbackInfo.url,
                quality: preferredQuality,
                trackInfo: playbackInfo.trackInfo,
                howl: nextHowl,
                createdAt: Date.now(),
            }

            clearGaplessPreload(false)
            gaplessPreload = entry
            return entry
        } catch (error) {
            console.warn('预缓冲下一首音频失败:', error)
            return null
        }
    }, {
        timeout: GAPLESS_PRELOAD_IDLE_TIMEOUT_MS,
        fallbackDelay: 250,
    })
}

function hasPrefetchedLyric(assets) {
    return !!(assets?.hasLyric && assets.lyric && typeof assets.lyric === 'object')
}

function applyPrefetchedLyricForSong(song, targetSongId) {
    if (songId.value !== targetSongId) return false
    const assets = getPrefetchedSongAssets(song)
    if (!hasPrefetchedLyric(assets)) return false
    lyric.value = assets.lyric
    restorePlayerLyricAfterSongChange()
    return true
}

function applyPrefetchedLocalCoverForSong(song, targetSongId) {
    if (songId.value !== targetSongId) return false
    const assets = getPrefetchedSongAssets(song)
    if (!assets?.localCover) return false
    localBase64Img.value = assets.localCover
    try { window.dispatchEvent(new CustomEvent('mediaSession:updateArtwork')) } catch (_) {}
    return true
}

function resetCurrentLyricState() {
    lyric.value = null
    lyricsObjArr.value = null
    currentLyricIndex.value = -1
}

function loadLocalCoverForSong(song, targetSongId) {
    if (applyPrefetchedLocalCoverForSong(song, targetSongId)) return

    windowApi.getLocalMusicImage(song.url).then(base64 => {
        if (songId.value !== targetSongId) return
        localBase64Img.value = base64
        try { window.dispatchEvent(new CustomEvent('mediaSession:updateArtwork')) } catch (_) {}
    }).catch(() => {
        if (songId.value === targetSongId) localBase64Img.value = null
    })
}

async function loadLocalLyricForSong(song, targetSongId) {
    if (applyPrefetchedLyricForSong(song, targetSongId)) return true

    const localLyric = await getLocalLyric(song.url)
    if (songId.value !== targetSongId) return false
    lyric.value = localLyric || createEmptyLyric()
    restorePlayerLyricAfterSongChange()
    return true
}

async function loadSirenLyricForSong(song, targetSongId, lyricUrl = song?.lyricUrl) {
    if (applyPrefetchedLyricForSong(song, targetSongId)) return true

    try {
        const sirenLyric = await getSirenLyricPayload(lyricUrl)
        if (songId.value !== targetSongId) return false
        lyric.value = sirenLyric
        restorePlayerLyricAfterSongChange()
        return true
    } catch (error) {
        console.error('加载塞壬歌词失败:', error)
        if (songId.value !== targetSongId) return false
        lyric.value = createEmptyLyric()
        restorePlayerLyricAfterSongChange()
        return false
    }
}

async function loadRemoteLyricForSong(targetSongId, emptyFallback = false) {
    try {
        const songLiric = await getLyric(targetSongId)
        if (songId.value !== targetSongId) return false
        lyric.value = emptyFallback ? (songLiric || createEmptyLyric()) : songLiric
        restorePlayerLyricAfterSongChange()
        return true
    } catch (error) {
        console.warn('获取歌词失败:', error)
        if (songId.value !== targetSongId) return false
        lyric.value = createEmptyLyric()
        restorePlayerLyricAfterSongChange()
        return false
    }
}

function hydrateSongAssets(song, targetSongId, options = {}) {
    if (options.resetLyric !== false) resetCurrentLyricState()
    if (!song) return Promise.resolve(false)

    if (song.type === 'local') {
        loadLocalCoverForSong(song, targetSongId)
        return loadLocalLyricForSong(song, targetSongId)
    }

    if (isSirenSong(song)) {
        return loadSirenLyricForSong(song, targetSongId, options.lyricUrl)
    }

    if (applyPrefetchedLyricForSong(song, targetSongId)) return Promise.resolve(true)

    return loadRemoteLyricForSong(targetSongId, options.emptyFallback === true)
}

function resetSongSwitchState() {
    loadLast = false
    progress.value = 0
    time.value = 0
    try { localBase64Img.value = null } catch (_) {}
    try {
        window.dispatchEvent(new CustomEvent('mediaSession:seeked', {
            detail: { duration: 0, toTime: 0 }
        }))
    } catch (_) {}

    if (lyricShow.value) {
        lyricShow.value = false
        playerChangeSong.value = true
    }
}

watch(
    () => [
        listInfo.value?.type || '',
        playMode.value,
        currentIndex.value,
        shuffleIndex.value,
        songId.value,
        quality.value,
        gaplessPlayback.value,
        Array.isArray(songList.value) ? songList.value.length : 0,
        Array.isArray(shuffledList.value) ? shuffledList.value.length : 0,
    ],
    () => {
        scheduleNextSongAssetPrefetch()
    },
    { immediate: true }
)

watch(gaplessPlayback, enabled => {
    if (!enabled) clearGaplessPreload()
})

function normalizePlayMode(mode, inFM = isPersonalFMContext()) {
    const parsedMode = Number(mode)
    const isValidMode = Number.isInteger(parsedMode) && NORMAL_PLAY_MODES.includes(parsedMode)
    const currentSafeMode = Number.isInteger(playMode.value) && NORMAL_PLAY_MODES.includes(playMode.value) ? playMode.value : 0
    const safeMode = isValidMode ? parsedMode : currentSafeMode
    if (inFM) return safeMode === 2 ? 2 : 3
    return safeMode
}

function syncPlayModeExternalState(mode) {
    windowApi.changeTrayMusicPlaymode(mode)
    syncWindowsTaskbarPlaybackState()

    // 通知 MPRIS 循环模式
    switch (mode) {
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
    window.playerApi.switchShuffle(mode === 3)
}

function applyPlayMode(mode, options = {}) {
    const inFM = Object.prototype.hasOwnProperty.call(options, 'inFM') ? options.inFM : isPersonalFMContext()
    const syncExternal = options.syncExternal !== false
    const nextMode = normalizePlayMode(mode, inFM)
    playMode.value = nextMode

    if (currentMusic.value && typeof currentMusic.value.loop === 'function') {
        currentMusic.value.loop(nextMode == 2)
    }
    if (nextMode == 3) {
        if (Array.isArray(songList.value) && songList.value.length > 0) {
            setShuffledList()
        } else {
            shuffledList.value = []
            shuffleIndex.value = 0
        }
    } else {
        shuffledList.value = null
        shuffleIndex.value = null
    }

    if (syncExternal) syncPlayModeExternalState(nextMode)
    scheduleNextSongAssetPrefetch()
    return nextMode
}
watch(
    () => (listInfo.value && listInfo.value.type) ? listInfo.value.type : null,
    (nextType, prevType) => {
        const enteringPersonalFM = nextType === 'personalfm' && prevType !== 'personalfm'
        const leavingPersonalFM = prevType === 'personalfm' && nextType !== 'personalfm'

        if (enteringPersonalFM) {
            preFmPlayMode = normalizePlayMode(playMode.value, false)
            const nextFmMode = playMode.value == 2 ? 2 : 3
            applyPlayMode(nextFmMode, { inFM: true })
            return
        }

        if (leavingPersonalFM) {
            const restoreMode = preFmPlayMode === null ? normalizePlayMode(playMode.value, false) : preFmPlayMode
            preFmPlayMode = null
            applyPlayMode(restoreMode, { inFM: false })
        }
    }
)

/**
 * 基于当前歌曲ID检查并加载对应的视频
 */
export function checkAndLoadVideoForCurrentSong() {
    loadMusicVideoForSong(songId.value, {
        respectEnabled: true,
        respectClosedMemory: true,
        startDelay: 500,
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
        loadStoredPlaylist().then(list => {
            if (list) {
                songList.value = list.songList
                shuffledList.value = list.shuffledList
                const storedProgress = normalizePersistedProgress(list.progress)
                if (storedProgress !== null) progress.value = storedProgress
            }
            syncWindowsTaskbarPlaybackState()
            if (songList.value) {
                const currentSong = getCurrentSongOrFirst()
                if (!currentSong) return
                // 恢复播放状态时，需要先设置歌曲ID
                setId(currentSong.id, currentIndex.value)
                syncWindowsTaskbarPlaybackState()

                if (currentSong.type == 'local') getSongUrl(currentSong.id, currentIndex.value, false, true)
                else getSongUrl(currentSong.id, currentIndex.value, false, false)
                if (musicVideo.value) loadMusicVideo(currentSong.id)
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

function normalizePersistedProgress(value) {
    const progressValue = Number(value)
    if (!Number.isFinite(progressValue) || progressValue < 0) return null
    return progressValue
}

function buildPersistedPlaylistPayload() {
    return {
        songList: songList.value,
        shuffledList: shuffledList.value,
        progress: getSafeCurrentSeek(),
        songId: songId.value,
        currentIndex: currentIndex.value,
        updatedAt: Date.now(),
    }
}

function clearPlaybackSnapshotPersistTimer() {
    if (!playbackSnapshotPersistTimer) return
    clearTimeout(playbackSnapshotPersistTimer)
    playbackSnapshotPersistTimer = null
}

function persistPlaybackSnapshotNow() {
    clearPlaybackSnapshotPersistTimer()
    if (!songList.value) return

    lastPlaybackSnapshotPersistAt = Date.now()
    saveStoredPlaylist(buildPersistedPlaylistPayload())
}

function schedulePlaybackSnapshotPersist() {
    if (!songList.value || playbackSnapshotPersistTimer) return

    const elapsed = Date.now() - lastPlaybackSnapshotPersistAt
    const delay = Math.max(0, PLAYBACK_SNAPSHOT_PERSIST_INTERVAL_MS - elapsed)

    playbackSnapshotPersistTimer = setTimeout(() => {
        playbackSnapshotPersistTimer = null
        persistPlaybackSnapshotNow()
    }, delay)
}

function stopProgressSampling() {
    if (disposeProgressTicker) {
        disposeProgressTicker()
        disposeProgressTicker = null
    }
    if (disposeGaplessTransitionTicker) {
        disposeGaplessTransitionTicker()
        disposeGaplessTransitionTicker = null
    }
}

function stopMusicVideoSampling() {
    if (!disposeVideoTicker) return
    disposeVideoTicker()
    disposeVideoTicker = null
}

function getCurrentHowl() {
    return currentMusic.value && typeof currentMusic.value === 'object' ? currentMusic.value : null
}

function isCurrentHowl(howl) {
    return currentMusic.value === howl || toRaw(currentMusic.value) === howl
}

function resetFailedPlaybackState() {
    stopProgressSampling()
    try {
        currentMusic.value?.unload?.()
    } catch (error) {
        console.warn('清理失败的播放器实例时出错:', error)
    }
    playing.value = false
    currentMusic.value = null
    lyric.value = null
    progress.value = 0
    time.value = 0
    try { windowApi.playOrPauseMusicCheck(playing.value) } catch (_) {}
    syncWindowsTaskbarPlaybackState()
}

function isTransientPlaybackRequestError(error) {
    const status = Number(error?.response?.status || error?.status || error?.response?.data?.code)
    if (status === 408 || status === 429 || status >= 500) return true

    const code = String(error?.code || error?.response?.data?.errorCode || '')
    if (/^(ERR_NETWORK|ECONNABORTED|ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND)$/i.test(code)) return true

    const message = String(error?.response?.data?.msg || error?.response?.data?.message || error?.message || '')
    return /timeout|timed\s*out|etimedout|econnaborted|econnreset|eai_again|enotfound|getaddrinfo|network/i.test(message)
}

function handlePlaybackLoadFailure(error, { advance = false } = {}) {
    if (error) console.error('获取歌曲播放信息失败:', error)
    const isNetworkError = isTransientPlaybackRequestError(error)
    noticeOpen(isNetworkError ? '网络请求失败，请稍后重试' : '当前歌曲无法播放', 2)
    resetFailedPlaybackState()
    if (advance && !isNetworkError) playNext()
}

function startMusicVideoSampling() {
    stopMusicVideoSampling()
    disposeVideoTicker = subscribePlaybackTick(snapshot => {
        musicVideoCheck(snapshot.seek)
    }, {
        id: 'player-mv-sync',
        interval: PLAYBACK_TICK_FAST_INTERVAL_MS,
        immediate: true,
    })
}

async function refreshStreamAndResume(eventType, error) {
    const now = Date.now()
    if (refreshingStream || now - lastRefreshAttempt < 500) return
    const currentSong = getCurrentSong()
    if (!currentSong || currentSong.type === 'local') return
    if (!songId.value) return

    const targetSongId = songId.value
    const targetHowl = currentMusic.value
    refreshingStream = true
    lastRefreshAttempt = now
    const token = ++streamRefreshToken

    const resumePosition = getSafeCurrentSeek()

    try {
        const playbackInfo = await resolveSongPlaybackInfo(currentSong, {
            id: targetSongId,
            quality: quality.value,
            force: true,
        })
        const nextStreamUrl = playbackInfo?.url || ''

        // 防止旧歌曲的异步刷新覆盖当前已切换的新歌曲。
        if (token !== streamRefreshToken || songId.value !== targetSongId || currentMusic.value !== targetHowl) {
            return
        }

        if (!nextStreamUrl) {
            console.error('刷新歌曲播放地址失败：未返回url', playbackInfo?.trackInfo)
            noticeOpen('当前歌曲链接已失效，请尝试切换下一首', 2)
            return
        }

        try {
            applyPlaybackInfoToCurrentSong(currentSong, playbackInfo)
        } catch (err) {
            console.warn('更新歌曲音质信息失败:', err)
        }

        progress.value = resumePosition
        play(nextStreamUrl, true, resumePosition)
    } catch (fetchError) {
        console.error('刷新歌曲播放地址失败:', fetchError)
        noticeOpen('刷新播放地址失败，请尝试切换歌曲', 2)
    } finally {
        refreshingStream = false
    }
}

function handleHowlPlaybackError(playback, eventType, error, message) {
    if (!isCurrentHowl(playback)) {
        if (gaplessPreload?.howl === playback) gaplessPreload = null
        return
    }
    console.warn(message, error)
    refreshStreamAndResume(eventType, error)
}

function createPlaybackHowl(url) {
    let nextHowl = null
    nextHowl = markRaw(new Howl({
        src: url,
        autoplay: false,
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
            handleHowlPlaybackError(nextHowl, 'playerror', err, '检测到播放错误，尝试刷新播放地址')
        },
        onloaderror: function (_id, err) {
            handleHowlPlaybackError(nextHowl, 'loaderror', err, '加载音频失败，尝试刷新播放地址')
        },
        onend: function () {
            if (!isCurrentHowl(nextHowl)) return
            handlePlaybackEnded()
        }
    }))

    bindPlaybackLifecycleEvents(nextHowl)

    return nextHowl
}

function preparePlaybackSwitch(nextHowl = null, allowGlobalUnload = false) {
    stopProgressSampling()
    const previousHowl = getCurrentHowl()
    if (previousHowl && previousHowl !== nextHowl) {
        try { previousHowl.unload() } catch (_) {}
    }
    if (allowGlobalUnload) {
        try { Howler.unload() } catch (_) {}
    }
}

function syncActivatedHowlAfterLoad(nextHowl, normalizedSeek, autoplay) {
    if (!isCurrentHowl(nextHowl)) return
    const loadedDuration = normalizePlaybackDuration(nextHowl.duration())
    time.value = loadedDuration
    updateCurrentSongDurationFromHowl()
    let targetSeek = null

    if (normalizedSeek !== null) {
        targetSeek = clampPlaybackProgress(normalizedSeek, loadedDuration)
        loadLast = false
    } else if (loadLast && !autoplay) {
        targetSeek = clampPlaybackProgress(progress.value || 0, loadedDuration)
        loadLast = false
    }

    if (targetSeek !== null && !Number.isNaN(targetSeek)) {
        nextHowl.volume(0)
        nextHowl.seek(targetSeek)
        progress.value = clampPlaybackProgress(targetSeek, loadedDuration)
    }
    playerChangeSong.value = false
    try {
        window.dispatchEvent(new CustomEvent('mediaSession:seeked', {
            detail: { duration: Math.floor(time.value || 0), toTime: progress.value || 0 }
        }))
    } catch (_) {}
}

function activatePlaybackHowl(nextHowl, { autoplay, resumeSeek = null, instantStart = false, fadeInMs = 200 } = {}) {
    const normalizedSeek = typeof resumeSeek === 'number' && !Number.isNaN(resumeSeek) ? Math.max(resumeSeek, 0) : null
    bindPlaybackLifecycleEvents(nextHowl, {
        endEvent: nextHowl?.__hmWebAudioPlayer ? 'end' : '',
    })
    currentMusic.value = nextHowl
    window.playerApi?.setVolume?.(volume.value)
    checkAndLoadVideoForCurrentSong()

    if (nextHowl.state?.() === 'loaded') {
        syncActivatedHowlAfterLoad(nextHowl, normalizedSeek, autoplay)
    } else {
        nextHowl.once('load', () => {
            syncActivatedHowlAfterLoad(nextHowl, normalizedSeek, autoplay)
        })
    }

    if (autoplay) {
        fadeInDurationByHowl.set(nextHowl, instantStart ? 0 : fadeInMs)
        nextHowl.volume(instantStart ? volume.value : 0)
        nextHowl.play()
    }
}

function bindPlaybackLifecycleEvents(playback, options = {}) {
    if (!playback || playback.__hmPlayerEventsBound) return
    playback.__hmPlayerEventsBound = true

    playback.on('play', () => handlePlaybackStarted(playback))
    playback.on('pause', () => handlePlaybackPaused(playback))
    if (options.endEvent) {
        playback.on(options.endEvent, () => {
            if (!isCurrentHowl(playback)) return
            handlePlaybackEnded()
        })
    }
}

function handlePlaybackStarted(playback) {
    if (!isCurrentHowl(playback)) return
    const fadeInMs = fadeInDurationByHowl.has(playback) ? fadeInDurationByHowl.get(playback) : 200
    fadeInDurationByHowl.delete(playback)
    if (fadeInMs <= 0) {
        playback.volume(volume.value)
    } else {
        playback.fade(0, volume.value, fadeInMs)
    }
    startProgress()
    playing.value = true
    windowApi.playOrPauseMusicCheck(playing.value)
    syncWindowsTaskbarPlaybackState()
    updateWindowTitleDock()
}

function handlePlaybackPaused(playback) {
    if (!isCurrentHowl(playback)) return
    stopProgressSampling()
    playing.value = false
    windowApi.playOrPauseMusicCheck(playing.value)
    syncWindowsTaskbarPlaybackState()
    playback.fade(volume.value, 0, 200)
}

function takeGaplessPreloadForCurrentSong(url) {
    if (!gaplessPlayback.value) return null
    const currentSong = getCurrentSong()
    if (!isGaplessPreloadUsable(gaplessPreload, currentSong, url)) return null

    const entry = gaplessPreload
    gaplessPreload = null
    return entry
}

function hydrateGaplessStartedSongAssets(targetSong, targetSongId) {
    void hydrateSongAssets(targetSong, targetSongId, {
        resetLyric: true,
        emptyFallback: true,
    })
}

function fadeOutPreviousHowlForGapless(previousHowl, nextHowl) {
    if (!previousHowl || previousHowl === nextHowl) return

    try {
        const fromVolume = typeof previousHowl.volume === 'function' ? previousHowl.volume() : volume.value
        previousHowl.fade(fromVolume, 0, GAPLESS_CROSSFADE_MS)
        previousHowl.once?.('fade', () => {
            try { previousHowl.unload?.() } catch (_) {}
        })
    } catch (_) {
        try { previousHowl.unload?.() } catch (_) {}
        return
    }

    if (typeof window !== 'undefined') {
        window.setTimeout(() => {
            try { previousHowl.unload?.() } catch (_) {}
        }, GAPLESS_CROSSFADE_MS + 80)
    }
}

function resetPlaybackStateForGaplessStart() {
    gaplessPreload = null
    resetSongSwitchState()
}

function applyGaplessTrackInfo(targetSong, entry) {
    applyPlaybackInfoToCurrentSong(targetSong, {
        url: entry.url,
        trackInfo: entry.trackInfo,
        isSiren: isSirenSong(targetSong),
    })
}

function applyGaplessTargetState(target) {
    if (target.isPersonalFm) {
        songId.value = target.id
        currentIndex.value = 0
        songList.value = [{ ...target.song, type: 'fm' }]
        listInfo.value = {
            id: 'personalfm',
            type: 'personalfm',
            name: '私人漫游',
        }
        return
    }

    setId(target.id, target.index)
}

function dispatchGaplessTargetStarted(target) {
    if (!target.isPersonalFm) {
        scheduleNextSongAssetPrefetch()
        return
    }

    try {
        window.dispatchEvent(new CustomEvent('fmGaplessStarted', {
            detail: { action: 'next', songId: target.id }
        }))
    } catch (_) {}
}

function startGaplessTarget(target, entry, options = {}) {
    if (!target?.song || target.id == null || !entry?.howl) return false

    const previousHowl = getCurrentHowl()
    resetPlaybackStateForGaplessStart()
    applyGaplessTargetState(target)
    syncWindowsTaskbarPlaybackState()
    unloadMusicVideo()
    applyGaplessTrackInfo(target.song, entry)
    hydrateGaplessStartedSongAssets(target.song, target.id)
    stopProgressSampling()
    activatePlaybackHowl(entry.howl, {
        autoplay: true,
        instantStart: options.early !== true,
        fadeInMs: GAPLESS_CROSSFADE_MS,
    })
    fadeOutPreviousHowlForGapless(previousHowl, entry.howl)
    dispatchGaplessTargetStarted(target)
    return true
}

function getGaplessStartTarget(entry) {
    if (isPersonalFMContext()) {
        if (!entry?.song) return null
        return {
            song: entry.song,
            id: entry.song.id,
            isPersonalFm: true,
        }
    }

    const candidate = getNextAutoPlaybackCandidate()
    if (!candidate) return null
    return {
        song: candidate.song,
        id: candidate.id,
        index: candidate.index,
        isPersonalFm: false,
    }
}

function tryStartGaplessNextFromEnd(options = {}) {
    if (!gaplessPlayback.value) return false

    const entry = gaplessPreload
    const target = getGaplessStartTarget(entry)
    if (!target || !isGaplessPreloadUsable(entry, target.song)) return false

    return startGaplessTarget(target, entry, options)
}

function maybeStartGaplessNextBeforeEnd(snapshot) {
    if (gaplessTransitionInProgress) return
    if (!gaplessPlayback.value || playMode.value == 2) return
    if (!snapshot?.playing) return

    const duration = normalizePlaybackDuration(snapshot.duration)
    const seek = clampPlaybackProgress(snapshot.seek, duration)
    if (duration <= 0 || seek <= 0) return

    const remaining = duration - seek
    if (remaining <= 0 || remaining > GAPLESS_EARLY_START_SECONDS) return

    gaplessTransitionInProgress = true
    const started = tryStartGaplessNextFromEnd({ early: true })
    if (!started) {
        gaplessTransitionInProgress = false
    } else if (typeof window !== 'undefined') {
        window.setTimeout(() => {
            gaplessTransitionInProgress = false
        }, GAPLESS_CROSSFADE_MS + 120)
    } else {
        gaplessTransitionInProgress = false
    }
}

function startGaplessTransitionMonitor() {
    if (disposeGaplessTransitionTicker) {
        disposeGaplessTransitionTicker()
        disposeGaplessTransitionTicker = null
    }
    if (!gaplessPlayback.value || playMode.value == 2) return

    disposeGaplessTransitionTicker = subscribePlaybackTick(maybeStartGaplessNextBeforeEnd, {
        id: 'player-gapless-transition',
        interval: 25,
        immediate: false,
    })
}

function handlePlaybackEnded() {
    stopProgressSampling()
    if (tryStartGaplessNextFromEnd()) return

    if (isPersonalFMContext()) {
        if (playMode.value == 2) {
            const fmPlayModeEvent = new CustomEvent('fmPlayModeResponse', {
                detail: { action: 'loop' }
            })
            window.dispatchEvent(fmPlayModeEvent)
        } else {
            const fmPlayModeEvent = new CustomEvent('fmPlayModeResponse', {
                detail: { action: 'next' }
            })
            window.dispatchEvent(fmPlayModeEvent)
        }
        return
    }

    if (playMode.value == 0 && currentIndex.value < songList.value.length - 1) { playNext(); return }
    if (playMode.value == 0 && currentIndex.value == songList.value.length - 1) { playing.value = false; playModeOne = true; windowApi.playOrPauseMusicCheck(playing.value); syncWindowsTaskbarPlaybackState(); return }
    if (playMode.value == 1) { playNext(); return }
    if (playMode.value == 3) { playNext() }
    if (playMode.value == 2) { clearLycAnimation() }
}

export function play(url, autoplay, resumeSeek = null) {
    const preloadedEntry = takeGaplessPreloadForCurrentSong(url)
    if (preloadedEntry?.howl) {
        preparePlaybackSwitch(preloadedEntry.howl, false)
        activatePlaybackHowl(preloadedEntry.howl, { autoplay, resumeSeek, instantStart: false })
        scheduleNextSongAssetPrefetch()
        return
    }

    clearGaplessPreload()
    preparePlaybackSwitch(null, true)
    const nextHowl = createPlaybackHowl(url)
    activatePlaybackHowl(nextHowl, { autoplay, resumeSeek, instantStart: false })
}

export function startProgress() {
    stopProgressSampling()
    const currentHowl = getCurrentHowl()
    if (!currentHowl || typeof currentHowl.seek !== 'function') return

    const durationLimit = normalizePlaybackDuration(time.value || currentHowl.duration?.())
    progress.value = clampPlaybackProgress(currentHowl.seek(), durationLimit)
    disposeProgressTicker = subscribePlaybackTick(snapshot => {
        progress.value = clampPlaybackProgress(snapshot.seek, snapshot.duration)
        schedulePlaybackSnapshotPersist()
    }, {
        id: 'player-progress',
        interval: PLAYBACK_TICK_FAST_INTERVAL_MS,
        immediate: true,
    })
    startGaplessTransitionMonitor()
}

function findSongIndexById(id) {
    const list = Array.isArray(songList.value) ? songList.value : []
    const targetId = id == null ? '' : String(id)
    if (!targetId) return -1

    return list.findIndex(song => song && String(song.id) === targetId)
}

function getSongByIdOrIndex(id, index = currentIndex.value) {
    const list = Array.isArray(songList.value) ? songList.value : []
    const resolvedIndex = findSongIndexById(id)
    if (resolvedIndex >= 0) return list[resolvedIndex]

    return Number.isInteger(index) && index >= 0 && index < list.length ? list[index] : null
}

export function setId(id, index) {
    const list = Array.isArray(songList.value) ? songList.value : []
    const resolvedIndex = findSongIndexById(id)

    songId.value = id

    if (playMode.value != 3) {
        if (Number.isInteger(index) && index >= 0 && index < list.length) {
            currentIndex.value = index
            return
        }

        currentIndex.value = resolvedIndex >= 0 ? resolvedIndex : 0
        return
    }

    shuffleIndex.value = index

    if (resolvedIndex >= 0) {
        currentIndex.value = resolvedIndex
        return
    }

    if (!Number.isInteger(currentIndex.value) || currentIndex.value < 0 || currentIndex.value >= list.length) {
        currentIndex.value = 0
    }
}

export function addToList(listType, songlist, listMeta = null) {
    // 移除之前的 fmReset 事件，以保留FM状态
    // if (listInfo.value && listInfo.value.type === 'personalfm' && listType !== 'personalfm') {
    //     ...
    // }

    const normalizedSongList = Array.isArray(songlist) ? songlist : []
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
            } else if (listInfo.value?.type === 'dj' && listInfo.value.id) {
                // 回退到当前播放器内已有的电台信息
                listId = listInfo.value.id
            }
        } catch (_) {
            // 忽略解析失败，使用默认值
        }
    } else if (listMeta && listMeta.id) {
        listId = listMeta.id
    } else if (listType === 'siren') {
        listId = normalizedSongList[0]?.al?.id || listInfo.value?.id || 'siren'
    } else if (libraryInfo.value) {
        listId = libraryInfo.value.id
    }

    listInfo.value = {
        id: listId,
        type: listType
    }
    songList.value = normalizedSongList.slice(0, normalizedSongList.length + 1)
    syncWindowsTaskbarPlaybackState()
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
    syncWindowsTaskbarPlaybackState()
    addSong(playId, playIndex, true, true)
    savePlaylist()
}
export function startLocalMusicVideo() {
    startMusicVideoSampling()
}

export function startMusicVideo() {
    startMusicVideoSampling()
}
export function unloadMusicVideo() {
    // 清理状态变量
    currentMusicVideo.value = null
    videoIsPlaying.value = false
    playerShow.value = true
    currentTiming = null

    // 清理定时器
    stopMusicVideoSampling()

    // 如果存在视频播放器，暂停并清理
    if (musicVideoDOM.value) {
        try {
            musicVideoDOM.value.pause()
            // 尝试清理视频源
            if (musicVideoDOM.value.source) {
                musicVideoDOM.value.source = null
            }
        } catch (error) {
            console.warn('清理视频播放器时出错:', error)
        }
    }
}

function isValidMusicVideoResult(result, targetSongId) {
    return !!(
        result &&
        result !== '404' &&
        result.data?.path &&
        result.data.id === targetSongId
    )
}

function startCurrentMusicVideoSampling(targetSongId, { respectClosedMemory = false } = {}) {
    if (
        songId.value !== targetSongId ||
        !currentMusicVideo.value ||
        currentMusicVideo.value.id !== targetSongId ||
        (respectClosedMemory && closedVideoMemory.has(targetSongId))
    ) {
        return
    }

    startMusicVideoSampling()
}

function loadMusicVideoForSong(targetSongId, options = {}) {
    unloadMusicVideo()

    if (!targetSongId) return
    if (options.respectEnabled && !musicVideo.value) return
    if (options.respectClosedMemory && closedVideoMemory.has(targetSongId)) return

    const initialDelay = Math.max(0, Number(options.initialDelay) || 0)
    const startDelay = Math.max(0, Number(options.startDelay) || 0)
    const clearOnMiss = options.clearOnMiss === true

    const verifyAndLoadMusicVideo = () => {
        verifyStoredMusicVideo(targetSongId).then(result => {
            if (!isValidMusicVideoResult(result, targetSongId)) {
                if (clearOnMiss) unloadMusicVideo()
                return
            }
            if (songId.value !== targetSongId) return
            if (options.respectClosedMemory && closedVideoMemory.has(targetSongId)) return

            currentMusicVideo.value = result.data

            const startSampling = () => {
                startCurrentMusicVideoSampling(targetSongId, {
                    respectClosedMemory: options.respectClosedMemory === true,
                })
            }

            if (startDelay > 0) setTimeout(startSampling, startDelay)
            else startSampling()
        }).catch(error => {
            console.error('检查视频文件时出错:', error)
            if (clearOnMiss) unloadMusicVideo()
        })
    }

    if (initialDelay > 0) setTimeout(verifyAndLoadMusicVideo, initialDelay)
    else verifyAndLoadMusicVideo()
}

export function loadMusicVideo(id) {
    // FM模式下需要稍长的延迟，等待FM切歌异步操作完成
    const initialDelay = isPersonalFMContext() ? 300 : 100

    loadMusicVideoForSong(id, {
        initialDelay,
        clearOnMiss: true,
    })
}

export function addSong(id, index, autoplay, isLocal) {
    // 先停止旧的进度计时，避免残留计时在下一秒把UI回写为上一首的进度
    stopProgressSampling()
    resetSongSwitchState()
    setId(id, index)
    syncWindowsTaskbarPlaybackState()
    scheduleNextSongAssetPrefetch()

    // 切歌时清理视频状态（新的统一视频检查函数会处理加载）
    unloadMusicVideo()

    const targetSong = getSongByIdOrIndex(id, currentIndex.value)
    if (!targetSong) return

    if (targetSong.type == 'local') isLocal = true
    else isLocal = false

    const currentHowl = getCurrentHowl()
    if (currentHowl && volume.value != 0) {
        currentHowl.fade(volume.value, 0, 200)
        currentHowl.once('fade', () => {
            getSongUrl(id, index, autoplay, isLocal)
            return
        })
        if (currentHowl.state() == 'loading' || currentHowl.state() == 'unloaded') {
            currentHowl.unload()
            getSongUrl(id, index, autoplay, isLocal)
        }
    } else {
        getSongUrl(id, index, autoplay, isLocal)
    }
}

function buildLevelInfoFromStream(streamInfo = {}) {
    const sr = Number(streamInfo?.sr)
    const br = Number(streamInfo?.br)
    if (!Number.isFinite(sr) || sr <= 0 || !Number.isFinite(br) || br <= 0) return null
    const size = Number(streamInfo?.size)
    return {
        sr,
        br,
        size: Number.isFinite(size) && size > 0 ? size : 0,
    }
}

export function setSongLevel(level, streamInfo = null) {
    const currentSong = getCurrentSong()
    if (!currentSong) return

    const normalizedLevel = typeof level === 'string' && level ? level : 'unknown'
    const levelField = levelFieldMap[normalizedLevel]
    const mappedLevelInfo = levelField ? currentSong[levelField] : null
    const streamLevelInfo = buildLevelInfoFromStream(streamInfo || {})

    currentSong.level = mappedLevelInfo || streamLevelInfo || null
    currentSong.actualLevel = normalizedLevel
    // 保持旧字段兼容：quality 表示当前曲目实际返回档位，而非用户偏好。
    currentSong.quality = normalizedLevel
}

function applyPlaybackInfoToCurrentSong(targetSong, playbackInfo) {
    if (!targetSong || !playbackInfo) return
    if (playbackInfo.isSiren) {
        applySirenTrackInfo(targetSong, playbackInfo.url)
        return
    }
    if (playbackInfo.trackInfo) {
        setSongLevel(playbackInfo.trackInfo.level, playbackInfo.trackInfo)
    }
}

export async function getLocalLyric(filePath) {
    const lyric = await windowApi.getLocalMusicLyric(filePath)
    if (lyric && typeof lyric === 'object') return lyric
    return false
}

function restorePlayerLyricAfterSongChange() {
    if (widgetState.value || lyricShow.value) return

    lyricShow.value = true
    playerChangeSong.value = false
}

export async function getSongUrl(id, index, autoplay, isLocal) {
    const targetSongId = id
    const targetSong = getSongByIdOrIndex(targetSongId, index)
    if (!targetSong) return

    updateWindowTitleDock()

    resetCurrentLyricState()

    if (isLocal) {
        const playbackInfo = await resolveSongPlaybackInfo(targetSong)
        if (songId.value !== targetSongId) return
        if (!playbackInfo?.url) return
        play(playbackInfo.url, autoplay)
        await hydrateSongAssets(targetSong, targetSongId, { resetLyric: false })
        return
    }
    if (isSirenSong(targetSong)) {
        clearCurrentSongLevel(targetSong)
        try {
            const playbackInfo = await resolveSongPlaybackInfo(targetSong)
            if (songId.value !== targetSongId) return

            if (!playbackInfo?.url) {
                noticeOpen('当前歌曲无法播放', 2)
                stopProgressSampling()
                playing.value = false
                currentMusic.value = null
                lyric.value = null
                playNext()
                return
            }

            play(playbackInfo.url, autoplay)

            // 在音频加载完成后设置塞壬歌曲音质信息
            const sirenHowl = getCurrentHowl()
            if (sirenHowl) {
                sirenHowl.once('load', () => {
                    if (songId.value !== targetSongId) return
                    applyPlaybackInfoToCurrentSong(targetSong, playbackInfo)
                })
            }

            await hydrateSongAssets(targetSong, targetSongId, {
                resetLyric: false,
                lyricUrl: playbackInfo.lyricUrl,
            })
        } catch (error) {
            console.error('获取塞壬歌曲播放地址失败:', error)
            noticeOpen('当前歌曲无法播放', 2)
            stopProgressSampling()
            playing.value = false
            currentMusic.value = null
            lyric.value = null
            playNext()
        }
        return
    }
    try {
        const playbackInfo = await resolveSongPlaybackInfo(targetSong, {
            id,
            quality: quality.value,
            checkAvailability: true,
        })
        if (songId.value !== targetSongId) return

        if (playbackInfo?.unavailable) {
            handlePlaybackLoadFailure(null, { advance: true })
            return
        }

        if (!playbackInfo || !playbackInfo.url) {
            handlePlaybackLoadFailure(null, { advance: true })
            return
        }

        play(playbackInfo.url, autoplay)
        applyPlaybackInfoToCurrentSong(targetSong, playbackInfo)
        void hydrateSongAssets(targetSong, targetSongId, { resetLyric: false })
    } catch (error) {
        if (songId.value !== targetSongId) return
        handlePlaybackLoadFailure(error, { advance: !isTransientPlaybackRequestError(error) })
    }
}

export function startMusic() {
    const currentHowl = getCurrentHowl()
    const list = Array.isArray(songList.value) ? songList.value : []

    if (!currentHowl || typeof currentHowl.play !== 'function') {
        const currentSong = getCurrentSong()
        if (currentSong?.id) addSong(currentSong.id, currentIndex.value, true, currentSong.type === 'local')
        return
    }

    const currentSeek = typeof currentHowl.seek === 'function' ? currentHowl.seek() : 0
    if (playMode.value == 0 && currentIndex.value == list.length - 1 && playModeOne && currentSeek == 0) { playNext(); playModeOne = false; return }
    if (!playing.value) {
        currentHowl.play()
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
        if (getCurrentSong()?.type === 'local') {
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
    stopProgressSampling()
    const currentHowl = getCurrentHowl()
    persistPlaybackSnapshotNow()
    if (playing.value && currentHowl && typeof currentHowl.fade === 'function' && typeof currentHowl.once === 'function') {
        currentHowl.fade(volume.value, 0, 200)
        currentHowl.once('fade', () => {
            currentHowl.pause?.()
            playing.value = false
        })
    } else if (!currentHowl) {
        playing.value = false
    }
    if (videoIsPlaying.value && musicVideoDOM.value) {
        musicVideoDOM.value.pause()
        // 为所有类型的音乐清理视频检查
        stopMusicVideoSampling()
    }
}

export function playLast() {
    // FM模式下的特殊逻辑：触发自定义事件播放上一首FM歌曲
    if (isPersonalFMContext()) {
        const fmPreviousEvent = new CustomEvent('fmPreviousResponse', {
            detail: { action: 'previous' }
        })
        window.dispatchEvent(fmPreviousEvent)
        return
    }

    const target = getPlaybackTarget(PLAYBACK_DIRECTION_PREVIOUS)
    if (!target) return
    addSong(target.id, target.index, true)
}
export function playNext() {
    // FM模式下的特殊逻辑：触发自定义事件播放下一首FM歌曲
    if (isPersonalFMContext()) {
        const fmNextEvent = new CustomEvent('fmNextResponse', {
            detail: { action: 'next' }
        })
        window.dispatchEvent(fmNextEvent)
        return
    }

    const target = getPlaybackTarget(PLAYBACK_DIRECTION_NEXT)
    if (!target) return
    addSong(target.id, target.index, true)
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
export function changeProgress(toTime) {
    if (!widgetState.value && lyricShow.value && lyricEle.value) clearLycAnimation()
    const currentHowl = getCurrentHowl()
    const durationLimit = normalizePlaybackDuration(currentHowl?.duration?.() || time.value)
    const normalizedTime = clampPlaybackProgress(toTime, durationLimit)
    if (videoIsPlaying.value) {
        musicVideoCheck(normalizedTime, true)
    }
    // 先更新进度与歌词索引，再执行实际 seek，确保 UI 与索引同步
    if (typeof normalizedTime === 'number' && Number.isFinite(normalizedTime)) {
        progress.value = normalizedTime
        syncLyricIndexForSeek(normalizedTime)
    }
    if (currentHowl && typeof currentHowl.seek === 'function') {
        currentHowl.seek(normalizedTime)
    }
    // 静态策略下，仅在显式 seek 时通知一次系统进度
    try {
        window.dispatchEvent(new CustomEvent('mediaSession:seeked', {
            detail: { duration: Math.floor(time.value || 0), toTime: normalizedTime }
        }))
    } catch (_) {}
    persistPlaybackSnapshotNow()
}
//控制拖拽进度条
export function changeProgressByDragStart() {
    stopProgressSampling()
}
export function changeProgressByDragEnd(toTime) {
    changeProgress(toTime)
    if (playing.value) startProgress()
}
// ------------
export function changePlayMode() {
    if (isPersonalFMContext()) {
        applyPlayMode(playMode.value == 2 ? 3 : 2, { inFM: true })
        return
    }
    applyPlayMode(playMode.value != 3 ? playMode.value + 1 : 0, { inFM: false })
}

export function playAll(listType, list, listMeta = null) {
    if (playMode.value == 3) {
        addToList(listType, list, listMeta)
        setShuffledList(true)
        addSong(shuffledList.value[0].id, 0, true)
    } else {
        addToList(listType, list, listMeta)
        addSong(songList.value[0].id, 0, true)
    }
}

export function setShuffledList(isplayAll) {
    shuffledList.value = createShuffledList(songList.value, {
        isPlayAll: isplayAll,
        currentSongId: songId.value,
        currentSong: getCurrentSong(),
    })
    shuffleIndex.value = 0
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function cloneLikelist(likelist = userStore.likelist) {
    return Array.isArray(likelist) ? likelist.slice() : []
}

export function getLikeActionErrorMessage(result, fallback = '未知错误') {
    return result?.body?.message || result?.body?.msg || result?.message || result?.msg || fallback
}

export function isSongLiked(songId, likelist = userStore.likelist) {
    const targetSongId = String(songId ?? '')
    if (!targetSongId || !Array.isArray(likelist)) return false
    return likelist.some(id => String(id) === targetSongId)
}

export function applyOptimisticLikeState(songId, like, likelist = userStore.likelist) {
    const nextLikelist = cloneLikelist(likelist)
    const likedIndex = nextLikelist.findIndex(id => String(id) === String(songId))

    if (like) {
        if (likedIndex === -1) nextLikelist.unshift(songId)
        return nextLikelist
    }

    if (likedIndex !== -1) nextLikelist.splice(likedIndex, 1)
    return nextLikelist
}

export function createLikeActionToken() {
    likeActionToken += 1
    return likeActionToken
}

export function isActiveLikeActionToken(token) {
    return token === likeActionToken
}

async function fetchLikelistSnapshot() {
    if (!userStore.user?.userId) return null
    const response = await getLikelist(userStore.user.userId)
    return Array.isArray(response?.ids) ? response.ids.slice() : null
}

export async function queueLikeRequest(actionToken, requestFactory) {
    const runTask = async () => {
        const waitMs = Math.max(0, nextLikeRequestAvailableAt - Date.now())
        if (waitMs > 0) await wait(waitMs)
        if (!isActiveLikeActionToken(actionToken)) return { skipped: true }

        let hasRequested = false
        try {
            const result = await requestFactory()
            hasRequested = true
            return result
        } finally {
            if (hasRequested) {
                nextLikeRequestAvailableAt = Date.now() + LIKE_REQUEST_COOLDOWN_MS
            }
        }
    }

    const queuedTask = likeRequestQueue.then(runTask, runTask)
    likeRequestQueue = queuedTask.catch(() => null)
    return queuedTask
}

async function resolveLikelistAfterLikeAction(songId, like, fallbackLikelist) {
    let latestSnapshot = null

    for (let attempt = 0; attempt < LIKE_SYNC_RETRY_LIMIT; attempt++) {
        try {
            const snapshot = await fetchLikelistSnapshot()
            if (Array.isArray(snapshot)) {
                latestSnapshot = snapshot
                if (isSongLiked(songId, snapshot) === !!like) return snapshot
            }
        } catch (error) {
            console.error('刷新喜欢列表失败:', error)
        }

        if (attempt < LIKE_SYNC_RETRY_LIMIT - 1) {
            await wait(LIKE_SYNC_RETRY_DELAY)
        }
    }

    if (Array.isArray(latestSnapshot)) {
        return applyOptimisticLikeState(songId, like, latestSnapshot)
    }

    return cloneLikelist(fallbackLikelist)
}

function cacheFavoritePlaylistMeta(playlist) {
    const meta = normalizeFavoritePlaylistMeta(playlist)
    if (!meta) return null
    userStore.updateFavoritePlaylistMeta(meta)
    return meta
}

export function resolveFavoritePlaylistMeta(playlists) {
    return resolveFavoritePlaylistMetaBase(playlists, userStore.user?.userId)
}

export async function getFavoritePlaylistId() {
    const cachedId = userStore.favoritePlaylistId
    const cachedName = typeof userStore.favoritePlaylistName == 'string' ? userStore.favoritePlaylistName.trim() : ''

    if (cachedId && cachedName) {
        return {
            id: cachedId,
            name: cachedName,
        }
    }

    const cachedFavoritePlaylist = resolveFavoritePlaylistMeta(libraryStore.playlistUserCreated)
    if (cachedFavoritePlaylist) return cacheFavoritePlaylistMeta(cachedFavoritePlaylist)

    if (cachedId) {
        return {
            id: cachedId,
            name: cachedName || DEFAULT_FAVORITE_PLAYLIST_NAME,
        }
    }

    if (!userStore.user?.userId) {
        return cachedName ? { id: null, name: cachedName } : null
    }

    try {
        const params = {
            uid: userStore.user.userId,
            limit: 50,
            offset: 0,
            timestamp: Date.now()
        }

        const result = await getUserPlaylist(params)
        if (result && result.playlist && result.playlist.length > 0) {
            const favoritePlaylist = resolveFavoritePlaylistMeta(result.playlist)
            if (favoritePlaylist) return cacheFavoritePlaylistMeta(favoritePlaylist)
        }
    } catch (error) {
    }

    if (cachedName) return { id: cachedId || null, name: cachedName }
    if (cachedId) return { id: cachedId, name: DEFAULT_FAVORITE_PLAYLIST_NAME }
    return null
}

export async function getFavoritePlaylistNoticeText(like) {
    if (!like) return '已取消喜欢'

    const favoritePlaylist = await getFavoritePlaylistId()
    return `已添加到${favoritePlaylist?.name || DEFAULT_FAVORITE_PLAYLIST_NAME}`
}

function applyFavoritePlaylistDetailStale(playlistId, like) {
    if (!playlistId) return
    libraryStore.invalidatePlaylistDetailCache(playlistId)
    if (typeof like == 'boolean') {
        libraryStore.updatePlaylistOverviewTrackCount(playlistId, like ? 1 : -1)
    }
}

async function markFavoritePlaylistDetailStale(like = null) {
    schedulePlaylistCacheInvalidation()
    libraryStore.markPlaylistOverviewStale()

    try {
        const favoritePlaylist = await getFavoritePlaylistId()
        applyFavoritePlaylistDetailStale(favoritePlaylist?.id, like)
    } catch (_) {
        applyFavoritePlaylistDetailStale(userStore.favoritePlaylistId, like)
    }
}

export function isPlaylistTrackOperationSuccess(result) {
    return !!(result && (
        (result.status === 200 && result.body && result.body.code === 200) ||
        result.code === 200 ||
        result.status === 200
    ))
}

export async function updateFavoritePlaylistTrack(songId, like) {
    const favoritePlaylist = await getFavoritePlaylistId()
    if (!favoritePlaylist?.id) {
        return {
            success: false,
            result: null,
            favoritePlaylist: null,
            message: '未找到我喜欢的音乐歌单',
        }
    }

    const params = {
        op: like ? 'add' : 'del',
        pid: favoritePlaylist.id,
        tracks: songId,
        timestamp: Date.now(),
    }

    const result = await updatePlaylist(params)
    return {
        success: isPlaylistTrackOperationSuccess(result),
        result,
        favoritePlaylist,
        message: getLikeActionErrorMessage(result, '未知错误'),
    }
}

export async function syncLikelistAfterLikeAction({ songId, like, actionToken, fallbackLikelist, refreshFavoritePlaylist = true } = {}) {
    const nextLikelist = await resolveLikelistAfterLikeAction(songId, like, fallbackLikelist)
    if (!isActiveLikeActionToken(actionToken)) return cloneLikelist(nextLikelist)

    userStore.updateLikelist(nextLikelist)
    if (refreshFavoritePlaylist) await updateFavoritePlaylistIfViewing()
    return nextLikelist
}

function finalizeLikeActionSideEffects({ clickMyPlaylist = true, closeAddPlaylist = true } = {}) {
    if (closeAddPlaylist) otherStore.addPlaylistShow = false
    schedulePlaylistCacheInvalidation()

    if (!clickMyPlaylist) return

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
}

export async function likeSong(like, targetSongId = songId.value) {
    const songIdValue = targetSongId
    const isExplicitTargetSong = arguments.length > 1
    const noticeLikeFailure = message => {
        if (!isExplicitTargetSong) noticeOpen(message, 2)
    }

    // 检查前置条件
    if (!songIdValue) {
        console.error('likeSong失败: 没有当前歌曲ID')
        noticeLikeFailure("操作失败：没有选中的歌曲")
        return
    }

    if (!userStore.user || !userStore.user.userId) {
        console.error('likeSong失败: 用户信息未加载')
        noticeLikeFailure("操作失败：用户信息未加载，请稍后重试")
        return
    }

    if (!Array.isArray(userStore.likelist)) {
        console.error('likeSong失败: 喜欢列表未加载')
        noticeLikeFailure("操作失败：喜欢列表未加载，请稍后重试")
        return
    }

    const actionToken = createLikeActionToken()
    const finalizeLikeActionForTarget = () => {
        const useCurrentPlayerSideEffects = !isExplicitTargetSong && songIdValue == songId.value
        finalizeLikeActionSideEffects({
            clickMyPlaylist: useCurrentPlayerSideEffects,
            closeAddPlaylist: useCurrentPlayerSideEffects,
        })
    }
    const applySuccessfulLikeAction = async noticeText => {
        if (!isActiveLikeActionToken(actionToken)) return false
        await markFavoritePlaylistDetailStale(like)
        if (!isActiveLikeActionToken(actionToken)) return false
        const fallbackLikelist = applyOptimisticLikeState(songIdValue, like)
        userStore.updateLikelist(fallbackLikelist)
        noticeOpen(noticeText, 2)
        await syncLikelistAfterLikeAction({
            songId: songIdValue,
            like,
            actionToken,
            fallbackLikelist,
        })
        if (!isActiveLikeActionToken(actionToken)) return false
        finalizeLikeActionForTarget()
        return true
    }
    const applyFavoritePlaylistFallback = async failureReason => {
        if (!isActiveLikeActionToken(actionToken)) return false
        console.warn('官方 /like API 失败，尝试使用歌单 tracks:', failureReason)
        try {
            const fallbackResult = await updateFavoritePlaylistTrack(songIdValue, like)
            if (fallbackResult.success) {
                const noticeText = like ? `已添加到${fallbackResult.favoritePlaylist?.name || DEFAULT_FAVORITE_PLAYLIST_NAME}` : '已取消喜欢'
                return applySuccessfulLikeAction(noticeText)
            }

            console.error('歌单 tracks 降级也失败:', fallbackResult.result || fallbackResult.message)
            const errorMsg = fallbackResult.message || failureReason || '未知错误'
            noticeLikeFailure(`喜欢/取消喜欢 音乐失败：${errorMsg}`)
        } catch (fallbackError) {
            console.error('歌单 tracks 降级异常:', fallbackError)
            const errorMsg = fallbackError?.response?.data?.message || fallbackError?.message || failureReason || '网络错误'
            noticeLikeFailure(`喜欢/取消喜欢 音乐失败：${errorMsg}`)
        }
        return false
    }

    try {
        const result = await queueLikeRequest(actionToken, () => likeMusic(songIdValue, like))
        if (result?.skipped) return

        if (result && result.code == 200) {
            await applySuccessfulLikeAction(await getFavoritePlaylistNoticeText(like))
        } else {
            await applyFavoritePlaylistFallback(getLikeActionErrorMessage(result))
        }
    } catch (error) {
        console.error('调用 /like API 异常:', error)
        const errorMsg = error?.response?.data?.message || error?.message || '网络错误'
        await applyFavoritePlaylistFallback(errorMsg)
    }
}

async function updateFavoritePlaylistIfViewing() {
    const favoritePlaylist = await getFavoritePlaylistId()
    const favoritePlaylistId = favoritePlaylist?.id || userStore.favoritePlaylistId
    if (!favoritePlaylistId) return

    // 检查当前是否在查看"我喜欢的音乐"歌单
    if (libraryStore.libraryInfo && libraryStore.libraryInfo.id == favoritePlaylistId) {
        try {
            schedulePlaylistCacheInvalidation()
            libraryStore.invalidatePlaylistDetailCache(favoritePlaylistId)
            // 重新获取歌单详情
            await libraryStore.updatePlaylistDetail(favoritePlaylistId, { deferRemaining: true })
        } catch (error) {
            console.error('更新我喜欢的音乐歌单失败:', error)
        }
    }
}

export function addToNext(nextSong, autoplay) {
    // FM页面已离开但播放器状态仍是personalfm时，playNext会被FM分支拦截导致无法播放
    // 在“立即播放”场景下自动退出FM上下文，确保后续走普通切歌逻辑
    if (isPersonalFMContext() && autoplay) {
        let isOnPersonalFMRoute = false
        try {
            const hash = (typeof window !== 'undefined' && window.location && window.location.hash) ? window.location.hash : ''
            isOnPersonalFMRoute = hash.includes('/personalfm')
        } catch (_) {}
        // 仍在FM页面时，保持原有“下一首FM”逻辑，避免破坏FM流程
        if (isOnPersonalFMRoute) {
            playNext()
            return
        }
        if (!isOnPersonalFMRoute) {
            listInfo.value = null
            // 退出FM后首次点播：清理FM临时单曲队列，避免FM歌曲混入后续播放列表
            songList.value = []
            currentIndex.value = 0
            songId.value = null
            // FM模式下 shuffledList 可能为空，清理后保持数组结构，避免随机模式下报错
            if (playMode.value == 3) {
                shuffledList.value = []
                shuffleIndex.value = 0
            }
        }
    }

    if (!nextSong || !nextSong.id) return
    if (!songList.value) songList.value = []
    if (nextSong.id == songId.value) return

    // 修正当前索引越界/异常，避免“插入成功但自动播放失败”
    if (!Number.isInteger(currentIndex.value) || currentIndex.value < 0) currentIndex.value = 0
    if (songList.value.length > 0 && currentIndex.value >= songList.value.length) {
        currentIndex.value = songList.value.length - 1
    }

    const si = (songList.value || []).findIndex((song) => song.id === nextSong.id)
    if (si != -1) {
        songList.value.splice(si, 1)
        if (si < currentIndex.value) currentIndex.value--
    }
    let songInsertIndex = currentIndex.value + 1
    if (songInsertIndex < 0) songInsertIndex = 0
    if (songInsertIndex > songList.value.length) songInsertIndex = songList.value.length
    songList.value.splice(songInsertIndex, 0, nextSong)

    let shuffledInsertIndex = 0
    if (playMode.value == 3) {
        if (!Array.isArray(shuffledList.value) || shuffledList.value.length === 0) {
            setShuffledList()
        }
        if (!Number.isInteger(shuffleIndex.value) || shuffleIndex.value < 0) {
            const fallbackIndex = (shuffledList.value || []).findIndex((song) => song.id === songId.value)
            shuffleIndex.value = fallbackIndex >= 0 ? fallbackIndex : 0
        }
        if (shuffledList.value.length > 0 && shuffleIndex.value >= shuffledList.value.length) {
            shuffleIndex.value = shuffledList.value.length - 1
        }

        const shufflei = (shuffledList.value || []).findIndex((song) => song.id === nextSong.id)
        if (shufflei != -1) {
            shuffledList.value.splice(shufflei, 1)
            if (shufflei < shuffleIndex.value) shuffleIndex.value--
        }
        shuffledInsertIndex = shuffleIndex.value + 1
        if (shuffledInsertIndex < 0) shuffledInsertIndex = 0
        if (shuffledInsertIndex > shuffledList.value.length) shuffledInsertIndex = shuffledList.value.length
        shuffledList.value.splice(shuffledInsertIndex, 0, nextSong)
    }

    if (!autoplay) {
        noticeOpen('已添加至下一首', 2)
        return
    }

    // 直接播放“刚插入”的目标项，避免依赖 playNext 的索引状态
    if (playMode.value == 3) addSong(nextSong.id, shuffledInsertIndex, true)
    else addSong(nextSong.id, songInsertIndex, true)
}
export function addToNextLocal(song, autoplay) {
    addToNext(localMusicHandle([song], true), autoplay)
}
export function savePlaylist() {
    saveStoredPlaylist(buildPersistedPlaylistPayload())
}
export function songTime(dt) {
    return formatSongTime(dt)
}
export function songTime2(time) {
    return formatSongProgressTime(time)
}

function syncMusicVideoTiming(timing, seek, update) {
    if (playing.value && musicVideoDOM.value) {
        musicVideoDOM.value.play()
    }

    const videoTime = timing.videoTiming + seek - timing.start
    if (musicVideoDOM.value) {
        musicVideoDOM.value.currentTime = videoTime
    }
    currentTiming = timing
    videoIsPlaying.value = true
    if (!update) playerShow.value = false
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
    const isPersonalFM = isPersonalFMContext()

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
    const currentSong = getCurrentSong()
    if (!isPersonalFM && currentSong && currentSong.id !== currentMusicVideo.value.id) {
        unloadMusicVideo() // 清理不匹配的视频
        return
    }

    const normalizedSeek = normalizePlaybackNumber(seek)

    if (currentTiming && isSeekInMusicVideoTiming(normalizedSeek, currentTiming)) {
        if (!videoIsPlaying.value || update) {
            syncMusicVideoTiming(currentTiming, normalizedSeek, update)
        }
        return
    }

    if (videoIsPlaying.value && currentTiming && !update) {
        if (normalizedSeek > currentTiming.end) {
            videoIsPlaying.value = false
            playerShow.value = true
            currentTiming = null
        }
        return
    }

    if (musicVideo.value && currentMusicVideo.value && (!videoIsPlaying.value || update)) {
        let foundTiming = false

        for (let i = 0; i < currentMusicVideo.value.timing.length; i++) {
            const timing = currentMusicVideo.value.timing[i]

            // 验证时间段数据的完整性
            if (!isValidMusicVideoTiming(timing)) {
                console.warn('无效的时间段数据:', timing)
                continue
            }

            if (!isSeekInMusicVideoTiming(normalizedSeek, timing)) continue

            foundTiming = true
            syncMusicVideoTiming(timing, normalizedSeek, update)
            return
        }

        if (!foundTiming) {
            videoIsPlaying.value = false
            playerShow.value = true
            currentTiming = null
            if (musicVideoDOM.value) {
                musicVideoDOM.value.pause()
            }
        }
    }
}


function setVolumeForPlay(value) {
  volume.value = Math.max(0, Math.min(1, value))
  currentMusic.value?.volume?.(volume.value)
}

export function initPlayerExternalBridge() {
    if (playerExternalBridgeInitialized) return
    playerExternalBridgeInitialized = true

    initExternalBridge({
        onMouseDown(event) {
            if (event?.target?.parentNode?.parentNode?.id == 'widget-progress') {
                changeProgressByDragStart()
                isProgress = true
            }
        },
        onMouseUp() {
            if (!isProgress) return
            changeProgressByDragEnd(progress.value)
            isProgress = false
        },
        onWindowClick(event) {
            const target = event?.target
            if (playlistWidgetShow.value) {
                const playlistWidget = document.getElementsByClassName('playlist-widget')[0]
                const musicControl = document.getElementsByClassName('music-control')[0]
                const musicOther = document.getElementsByClassName('music-other')[0]
                const playlistWidgetPlayer = document.getElementsByClassName('playlist-widget-player')[0]
                const songControl = document.getElementsByClassName('song-control')[0]
                const contextMenu = document.getElementsByClassName('contextMune')[0]
                const isItemDelete = target?.className?.baseVal == 'item-delete'

                if (
                    playlistWidget && musicControl && musicOther && playlistWidgetPlayer && songControl && contextMenu
                    && playlistWidget.contains(target) == false
                    && musicControl.contains(target) == false
                    && musicOther.contains(target) == false
                    && playlistWidgetPlayer.contains(target) == false
                    && songControl.contains(target) == false
                    && contextMenu.contains(target) == false
                    && !isItemDelete
                ) {
                    playlistWidgetShow.value = false
                }
            }
            if (otherStore.contextMenuShow) otherStore.contextMenuShow = false

            const videoPlayer = document.getElementById('videoPlayer')
            const controls = document.getElementsByClassName('plyr__controls')[0]
            if (!otherStore.videoIsBlur && otherStore.videoPlayerShow && videoPlayer && videoPlayer.contains(target) == false) {
                otherStore.videoIsBlur = true
            } else if (otherStore.videoIsBlur && otherStore.videoPlayerShow && videoPlayer && controls && videoPlayer.contains(target) == true && controls.contains(target) != true) {
                otherStore.videoIsBlur = false
            }

            const userHead = document.getElementsByClassName('user-head')[0]
            if (userStore.appOptionShow && userHead && userHead.contains(target) != true) userStore.appOptionShow = false
        },
        onPlayOrPause() {
            if (playing.value) pauseMusic()
            else startMusic()
        },
        onLastOrNext(_event, option) {
            if (option == 'last') playLast()
            else if (option == 'next') playNext()
        },
        onPlayModeChange(_event, mode) {
            applyPlayMode(mode)
        },
        onVolumeUp() {
            if (volume.value + 0.1 < 1) volume.value += 0.1
            else volume.value = 1
            currentMusic.value?.volume?.(volume.value)
        },
        onVolumeDown() {
            if (volume.value - 0.1 > 0) volume.value -= 0.1
            else volume.value = 0
            currentMusic.value?.volume?.(volume.value)
        },
        onProgressControl(_event, mode) {
            const duration = currentMusic.value?.duration?.() || 0
            if (mode == 'forward') {
                if (progress.value + 3 < duration) progress.value += 3
                else progress.value = duration
            } else if (mode == 'back') {
                if (progress.value - 3 > 0) progress.value -= 3
                else progress.value = 0
            }
            changeProgress(progress.value)
        },
        onBeforeQuit() {
            windowApi.downloadPause('shutdown')
            persistPlaylistBeforeExit(buildPersistedPlaylistPayload())
        },
        onSetPosition(positionSeconds) {
            changeProgress(positionSeconds)
        },
        onPlayerPlayPause() {
            if (playing.value) pauseMusic()
            else startMusic()
        },
        onPlayerNext() {
            playNext()
        },
        onPlayerPrevious() {
            playLast()
        },
        onPlayerPlay() {
            startMusic()
        },
        onPlayerPause() {
            pauseMusic()
        },
        onPlayerRepeat() {
            changePlayMode()
        },
        onPlayerShuffle() {
            if (isPersonalFMContext()) {
                applyPlayMode(playMode.value === 2 ? 3 : 2, { inFM: true })
                return
            }
            applyPlayMode(playMode.value !== 3 ? 3 : 0, { inFM: false })
        },
        onPlayerVolumeChanged(value) {
            setVolumeForPlay(value)
        },
    })

    windowApi.playOrPauseMusicCheck(playing.value)
    windowApi.changeTrayMusicPlaymode(playMode.value)
    syncWindowsTaskbarPlaybackState()
}
