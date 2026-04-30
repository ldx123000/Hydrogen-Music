import { loadLastSong } from './player'
import { scanMusic } from './locaMusic'
import { initDownloadManager } from './downloadManager'
import { usePlayerStore } from '../store/playerStore'
import { useLocalStore } from '../store/localStore'
import { storeToRefs } from 'pinia'
import { getPreferredQuality } from './quality'
import { initializeCurrentAccountSession } from './accountSession'
import defaultCoverUrl from '../assets/img/default-cover.svg'

const playerStore = usePlayerStore()
const { quality, lyricSize, tlyricSize, rlyricSize, lyricInterludeTime, searchAssistLimit, showSongTranslation, coverSize } = storeToRefs(playerStore)
const localStore = useLocalStore()
let imageFallbackInstalled = false

export const initSettings = () => {
    windowApi.getSettings().then(settings => {
        const rawSearchAssistLimit = Number.parseInt(settings?.music?.searchAssistLimit, 10)
        if (!quality.value) quality.value = getPreferredQuality(settings?.music?.level)
        lyricSize.value = settings.music.lyricSize
        tlyricSize.value = settings.music.tlyricSize
        rlyricSize.value = settings.music.rlyricSize
        lyricInterludeTime.value = settings.music.lyricInterlude
        searchAssistLimit.value = Number.isFinite(rawSearchAssistLimit) ? Math.max(1, rawSearchAssistLimit) : 8
        showSongTranslation.value = settings?.music?.showSongTranslation !== false
        coverSize.value = settings?.music?.coverSize ?? 400
        localStore.downloadedFolderSettings = settings.local.downloadFolder
        localStore.localFolderSettings = settings.local.localFolder
        localStore.quitApp = settings.other.quitApp
        if(localStore.downloadedFolderSettings && !localStore.downloadedMusicFolder) {
            scanMusic({type:'downloaded',refresh:false})
        }
        if(localStore.localFolderSettings.length != 0 && !localStore.localMusicFolder) {
            scanMusic({type:'local',refresh:false})
        }
        if(!localStore.downloadedFolderSettings && localStore.downloadedMusicFolder) {
            localStore.downloadedMusicFolder = null
            localStore.downloadedFiles = null
            windowApi.clearLocalMusicData('downloaded')
        }
        if(localStore.localFolderSettings.length == 0 && localStore.localMusicFolder) {
            localStore.localMusicFolder = null,
            localStore.localMusicList = null
            localStore.localMusicClassify = null
            windowApi.clearLocalMusicData('local')
        }
    })
}
export const resolveImageUrl = (url) => {
    // 空地址直接回退到默认封面，避免页面出现裂图或空白占位。
    if (!url) return defaultCoverUrl
    if (url.startsWith('data:') || url.startsWith('blob:')) return url
    const size = playerStore.coverSize ?? 400
    return url
        .replace('http://', 'https://')
        .replace(/\{size\}/g, size)
        .replace(/([?&])param=\d+y\d+/, `$1param=${size}y${size}`)
        .replace(/^(https?:\/\/[^?]*)$/, `$1?param=${size}y${size}`)
}

export const getDefaultCoverUrl = () => defaultCoverUrl

function handleGlobalImageError(event) {
    const target = event?.target
    if (!(target instanceof HTMLImageElement)) return
    if (target.dataset?.fallbackApplied === '1') return

    target.dataset.fallbackApplied = '1'
    target.src = defaultCoverUrl
}

export function installGlobalImageFallback() {
    if (imageFallbackInstalled || typeof window === 'undefined' || typeof document === 'undefined') return
    // 使用捕获阶段统一接管所有 img 加载失败事件，减少逐个组件补 @error 的成本。
    document.addEventListener('error', handleGlobalImageError, true)
    imageFallbackInstalled = true
}

//初始化
export const init = async () => {
    initSettings()
    installGlobalImageFallback()
    initDownloadManager()  // 初始化下载管理器
    
    // 重置FM模式状态 - 应用启动时不应保持FM模式
    if(playerStore.listInfo && playerStore.listInfo.type === 'personalfm') {
        playerStore.listInfo = null
        playerStore.songList = null
        playerStore.currentIndex = 0
        playerStore.songId = null
    }
    
    try {
        await initializeCurrentAccountSession()
    } catch (error) {
        console.error('用户信息加载失败:', error)
    } finally {
        loadLastSong()
    }
}
