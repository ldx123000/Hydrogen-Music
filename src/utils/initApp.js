import pinia from '../store/pinia'
import { isLogin } from '../utils/authority'
import { loadLastSong } from './player'
import { scanMusic } from './locaMusic'
import { getUserProfile, getLikelist, getUserPlaylist } from '../api/user'
import { useUserStore } from '../store/userStore'
import { usePlayerStore } from '../store/playerStore'
import { useLocalStore } from '../store/localStore'
import { storeToRefs } from 'pinia'

const userStore = useUserStore(pinia)
const playerStore = usePlayerStore()
const { quality, lyricSize, tlyricSize, rlyricSize, lyricInterludeTime } = storeToRefs(playerStore)
const localSotre = useLocalStore()
const { updateUser } = userStore

export const initSettings = () => {
    windowApi.getSettings().then(settings => {
        quality.value = settings.music.level
        lyricSize.value = settings.music.lyricSize
        tlyricSize.value = settings.music.tlyricSize
        rlyricSize.value = settings.music.rlyricSize
        lyricInterludeTime.value = settings.music.lyricInterlude
        localSotre.downloadedFolderSettings = settings.local.downloadFolder
        localSotre.localFolderSettings = settings.local.localFolder
        localSotre.quitApp = settings.other.quitApp
        if(localSotre.downloadedFolderSettings && !localSotre.downloadedMusicFolder) {
            scanMusic({type:'downloaded',refresh:false})
        }
        if(localSotre.localFolderSettings.length != 0 && !localSotre.localMusicFolder) {
            scanMusic({type:'local',refresh:false})
        }
        if(!localSotre.downloadedFolderSettings && localSotre.downloadedMusicFolder) {
            localSotre.downloadedMusicFolder = null
            localSotre.downloadedFiles = null
            windowApi.clearLocalMusicData('downloaded')
        }
        if(localSotre.localFolderSettings.length == 0 && localSotre.localMusicFolder) {
            localSotre.localMusicFolder = null,
            localSotre.localMusicList = null
            localSotre.localMusicClassify = null
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
    
    // 重置FM模式状态 - 应用启动时不应保持FM模式
    if(playerStore.listInfo && playerStore.listInfo.type === 'personalfm') {
        playerStore.listInfo = null
        playerStore.songList = null
        playerStore.currentIndex = 0
        playerStore.songId = null
    }
    
    loadLastSong()
    if(isLogin()) {
        getUserProfile().then(result => {
            updateUser(result.profile)
            getUserLikelist()
            initFavoritePlaylist()
        })
    } else {
        window.localStorage.clear()
    }
}