import { defineStore } from "pinia";

function normalizePersistedVolume(value) {
    const volume = Number(value)
    if (!Number.isFinite(volume)) return 0.3
    if (volume > 1 && volume <= 100) return volume / 100
    return Math.max(0, Math.min(1, volume))
}

function normalizePlayerStorePayload(key, value) {
    if (key !== 'playerStore' || typeof value !== 'string' || !value) return value

    try {
        const parsed = JSON.parse(value)
        if (!parsed || typeof parsed !== 'object' || parsed.volume === undefined) return value

        const normalizedVolume = normalizePersistedVolume(parsed.volume)
        if (normalizedVolume === parsed.volume) return value

        return JSON.stringify({
            ...parsed,
            volume: normalizedVolume,
        })
    } catch (_) {
        return value
    }
}

const persistedPlayerStorage = {
    getItem(key) {
        return normalizePlayerStorePayload(key, localStorage.getItem(key))
    },
    setItem(key, value) {
        localStorage.setItem(key, value)
    },
    removeItem(key) {
        localStorage.removeItem(key)
    },
}

export const usePlayerStore = defineStore('playerStore', {
    state: () => {
        return {
            widgetState: true,//是否开启widget
            currentMusic: null,//播放列表的索引
            playing: false,//是否正在播放
            progress: 0,//进度条
            volume: 0.3,//音量
            // volumeBeforeMuted: 0,//静音前音量
            playMode: 0,//0为顺序播放，1为列表循环，2为单曲循环，3为随机播放
            listInfo: null,
            songList: null,//播放列表
            shuffledList: null,//随机播放列表
            shuffleIndex: 0,//随机播放列表的索引
            songId: null,
            currentIndex: 0,
            time: 0, //歌曲总时长
            quality: null,
            playlistWidgetShow: false,
            playerChangeSong: false, //player页面切换歌曲更换歌名动画,
            lyric: null,
            lyricsObjArr: null,
            currentLyricIndex: -1, // 当前歌词索引，用于桌面歌词同步
            lyricSize: null,
            tlyricSize: null,
            rlyricSize: null,
            lyricType: ['original'],
            lyricInterludeTime: null, //歌词间奏等待时间
            searchAssistLimit: 8, //搜索下拉面板显示数量
            lyricShow: false, //歌词是否显示
            lyricEle: null,//歌词DOM
            isLyricDelay: true, //调整进度的时候禁止赋予delay属性
            localBase64Img: null, //如果是本地歌曲，获取封面
            forbidLastRouter: false, //在主动跳转router时禁用回到上次离开的路由的地址功能
            musicVideo: false,
            addMusicVideo: false,
            currentMusicVideo: null,
            musicVideoDOM: null,
            videoIsPlaying: false,
            playerShow: true,
            lyricBlur: false,
            showSongTranslation: true, // 歌曲名是否显示翻译（原名 (翻译)）
            isDesktopLyricOpen: false, // 桌面歌词是否打开
            coverBlur: false, // 播放页使用封面模糊背景
            coverSize: 400,
            chorusMode: false, // 是否开启只听副歌模式
        }
    },
    actions: {
    },
    persist: {
        storage: persistedPlayerStorage,
        pick: ['progress','volume','playMode','shuffleIndex','listInfo','songId','currentIndex','time','quality','lyricType','musicVideo','lyricBlur','showSongTranslation','coverBlur','chorusMode']
    },
})
