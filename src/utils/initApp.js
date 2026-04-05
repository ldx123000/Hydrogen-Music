import { loadLastSong } from './player'
import { scanMusic } from './locaMusic'
import { initDownloadManager } from './downloadManager'
import { usePlayerStore } from '../store/playerStore'
import { useLocalStore } from '../store/localStore'
import { storeToRefs } from 'pinia'
import { getPreferredQuality } from './quality'
import { initializeCurrentAccountSession } from './accountSession'

const playerStore = usePlayerStore()
const { quality, lyricSize, tlyricSize, rlyricSize, lyricInterludeTime, searchAssistLimit, showSongTranslation } = storeToRefs(playerStore)
const localStore = useLocalStore()

export const initSettings = () => {
    windowApi.getSettings().then(settings => {
        const rawSearchAssistLimit = Number.parseInt(settings?.music?.searchAssistLimit, 10)
        quality.value = getPreferredQuality(settings?.music?.level)
        lyricSize.value = settings.music.lyricSize
        tlyricSize.value = settings.music.tlyricSize
        rlyricSize.value = settings.music.rlyricSize
        lyricInterludeTime.value = settings.music.lyricInterlude
        searchAssistLimit.value = Number.isFinite(rawSearchAssistLimit) ? Math.max(1, rawSearchAssistLimit) : 8
        showSongTranslation.value = settings?.music?.showSongTranslation !== false
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
//初始化
export const init = async () => {
    initSettings()
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
