import pinia from '../store/pinia'
import { isLogin, clearLoginCookies } from '../utils/authority'
import { loadLastSong } from './player'
import { scanMusic } from './locaMusic'
import { initDownloadManager } from './downloadManager'
import { getUserProfile, getLikelist, getUserPlaylist } from '../api/user'
import { useUserStore } from '../store/userStore'
import { usePlayerStore } from '../store/playerStore'
import { useLocalStore } from '../store/localStore'
import { storeToRefs } from 'pinia'
import { getPreferredQuality } from './quality'

const userStore = useUserStore(pinia)
const playerStore = usePlayerStore()
const { quality, lyricSize, tlyricSize, rlyricSize, lyricInterludeTime, searchAssistLimit, showSongTranslation } = storeToRefs(playerStore)
const localStore = useLocalStore()
const { updateUser } = userStore

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
export const getUserLikelist = () => {
    if(userStore.user.userId)
        getLikelist(userStore.user.userId).then(result => {
            userStore.likelist = result.ids
        })
    else {
        userStore.likelist = []
    }
}

export const initFavoritePlaylist = async () => {
    if (userStore.user && userStore.user.userId) {
        try {
            const params = {
                uid: userStore.user.userId,
                limit: 50,
                offset: 0,
                timestamp: new Date().getTime()
            }
            
            const result = await getUserPlaylist(params)
            if (result && result.playlist && result.playlist.length > 0) {
                // 找到用户的"我喜欢的音乐"播放列表
                const favoritePlaylist = result.playlist.find(playlist => 
                    playlist.creator.userId === userStore.user.userId && 
                    playlist.specialType === 5
                )
                
                if (favoritePlaylist) {
                    userStore.updateFavoritePlaylistId(favoritePlaylist.id)
                } else {
                    // 回退到名称匹配或第一个创建的播放列表
                    const playlistByName = result.playlist.find(playlist => 
                        playlist.creator.userId === userStore.user.userId && 
                        (playlist.name.includes('我喜欢') || playlist.name.includes('喜欢的音乐'))
                    )
                    
                    if (playlistByName) {
                        userStore.updateFavoritePlaylistId(playlistByName.id)
                    } else {
                        const firstCreatedPlaylist = result.playlist.find(playlist => 
                            playlist.creator.userId === userStore.user.userId
                        )
                        if (firstCreatedPlaylist) {
                            userStore.updateFavoritePlaylistId(firstCreatedPlaylist.id)
                        }
                    }
                }
            }
        } catch (error) {
            console.error('初始化喜欢音乐播放列表失败:', error)
        }
    }
}
//初始化
export const init = () => {
    initSettings()
    initDownloadManager()  // 初始化下载管理器
    
    // 重置FM模式状态 - 应用启动时不应保持FM模式
    if(playerStore.listInfo && playerStore.listInfo.type === 'personalfm') {
        playerStore.listInfo = null
        playerStore.songList = null
        playerStore.currentIndex = 0
        playerStore.songId = null
    }
    
    if(isLogin()) {
        // 先加载用户信息，再恢复播放状态，确保喜欢列表已加载
        getUserProfile().then(result => {
            updateUser(result.profile)
            // 加载用户喜欢列表
            return getUserLikelist()
        }).then(() => {
            // 初始化喜欢音乐播放列表
            initFavoritePlaylist()
            // 用户数据加载完成后，再恢复上次播放状态
            loadLastSong()
        }).catch(error => {
            console.error('用户信息加载失败:', error)
            // 登录状态异常，清理登录信息并自动退出
            clearLoginCookies()
            userStore.user = null
            userStore.likelist = null
            userStore.favoritePlaylistId = null
            // 即使登录失效，也要恢复播放状态
            loadLastSong()
        })
    } else {
        // 未登录状态直接恢复播放状态
        loadLastSong()
        
        // 未登录时，需要保留播放相关的本地数据，只清理用户相关数据
        const keysToKeep = []
        
        // 保留pinia持久化的数据（播放器状态）和其他重要数据
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('cookie:') || 
                key.startsWith('playerStore') || 
                key.startsWith('localStore') ||
                key === 'lastPlaylist') {
                keysToKeep.push({key, value: localStorage.getItem(key)})
            }
        })
        
        // 清空localStorage
        window.localStorage.clear()
        
        // 恢复需要保留的数据
        keysToKeep.forEach(item => {
            localStorage.setItem(item.key, item.value)
        })
        
        console.log('清理用户数据，保留播放和cookie数据')
    }
}
