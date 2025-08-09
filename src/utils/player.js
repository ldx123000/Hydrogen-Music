import pinia from '../store/pinia'
import Plyr from 'plyr'
import { Howl } from 'howler'
import { formatDuration } from './time';
import { noticeOpen } from './dialog'
import { checkMusic, getMusicUrl, likeMusic, getLyric } from '../api/song'
import { getLikelist, getUserPlaylist } from '../api/user'
import { updatePlaylist } from '../api/playlist'
import { useUserStore } from '../store/userStore'
import { usePlayerStore } from '../store/playerStore'
import { useLibraryStore } from '../store/libraryStore'
import { useOtherStore } from '../store/otherStore'
import { storeToRefs } from 'pinia'

const otherStore = useOtherStore()
const userStore = useUserStore()
const libraryStore = useLibraryStore(pinia)
const playerStore = usePlayerStore(pinia)
const { libraryInfo } = storeToRefs(libraryStore)
const { currentMusic, playing, progress, volume, quality, playMode, songList, shuffledList, shuffleIndex, listInfo, songId, currentIndex, time, playlistWidgetShow, playerChangeSong, lyric, lyricsObjArr, lyricShow, lyricEle, isLyricDelay, widgetState, localBase64Img, musicVideo, currentMusicVideo, musicVideoDOM, videoIsPlaying, playerShow, lyricBlur} = storeToRefs(playerStore)

let isProgress = false
let musicProgress = null
let loadLast = true
let playModeOne = false //为true代表顺序播放已全部结束
let currentTiming = null
let videoCheckInterval = null

export function loadLastSong() {
    if(loadLast) {
        windowApi.getLastPlaylist().then(list => {
            if(list) {
                songList.value = list.songList
                shuffledList.value = list.shuffledList
            }
            if(songList.value) {
                if(songList.value[currentIndex.value].type == 'local') getSongUrl(songList.value[currentIndex.value].id, currentIndex.value, false, true)
                else getSongUrl(songList.value[currentIndex.value].id, currentIndex.value, false, false)
                if(musicVideo.value) loadMusicVideo(songList.value[currentIndex.value].id)
            }
        })
    }
}

export function play(url, autoplay) {
    if(currentMusic.value) currentMusic.value.unload()
    currentMusic.value = new Howl({
        src: url,
        autoplay: autoplay,
        html5: true,
        preload: true,
        format: ['mp3', 'flac'],
        loop: (playMode.value == 2),
        volume: volume.value,
        xhr: {
            method: 'GET',
            withCredentials: true,
        },
        onend: function() {
            clearInterval(musicProgress)
            
            // 处理FM模式的播放结束逻辑
            if(listInfo.value && listInfo.value.type === 'personalfm') {
                // FM模式：根据当前播放模式决定行为
                if(playMode.value == 2) {
                    // 单曲循环模式：重新播放当前歌曲
                    // FM mode: replaying current song (single loop)
                    const fmPlayModeEvent = new CustomEvent('fmPlayModeResponse', {
                        detail: { action: 'loop' }
                    })
                    window.dispatchEvent(fmPlayModeEvent)
                } else if(playMode.value == 3) {
                    // 随机播放模式：播放下一首漫游歌曲
                    // FM mode: playing next song (random/FM mode)
                    const fmPlayModeEvent = new CustomEvent('fmPlayModeResponse', {
                        detail: { action: 'next' }
                    })
                    window.dispatchEvent(fmPlayModeEvent)
                }
                return
            }
            
            // 原有的播放结束逻辑（非FM模式）
            if(playMode.value == 0 && currentIndex.value < songList.value.length - 1) { playNext();return } //顺序播放
            if(playMode.value == 0 && currentIndex.value == songList.value.length - 1) { playing.value = false;playModeOne = true;windowApi.playOrPauseMusicCheck(playing.value);return } //顺序播放结束暂停状态
            if(playMode.value == 1) { playNext();return } //列表循环
            if(playMode.value == 3) { playNext() } //随机播放(为列表循环)
            if(playMode.value == 2) { clearLycAnimation() } // 单曲循环播放结束时清除歌词动画
        }
    })
    currentMusic.value.once('load', () => {
        time.value = Math.floor(currentMusic.value.duration())
        // 仅在非自动播放（恢复会话）时恢复上次进度
        if(loadLast && !autoplay) {
            currentMusic.value.volume(0)
            currentMusic.value.seek(progress.value)
            loadLast = false
        }
        playerChangeSong.value = false
    })
    currentMusic.value.on('play', () => {
        currentMusic.value.fade(0,volume.value,200)
        startProgress()
        playing.value = true
        windowApi.playOrPauseMusicCheck(playing.value)
    })
    currentMusic.value.on('pause', () => {
        clearInterval(musicProgress)
        playing.value = false
        windowApi.playOrPauseMusicCheck(playing.value)
        currentMusic.value.fade(volume.value,0,200)
    })
}

export function startProgress() {
    clearInterval(musicProgress)
    progress.value = currentMusic.value.seek()
    musicProgress = setInterval(() => {
        if(currentMusic.value.seek() < time.value)
            progress.value = currentMusic.value.seek()
    }, 1000);
}

export function setId(id, index) {
    if(playMode.value != 3) {
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

    listInfo.value = {
        id: (listType == 'rec' ? 'rec' : (libraryInfo.value ? libraryInfo.value.id : 'none')),
        type: listType
    }
    songList.value = songlist.slice(0, songlist.length + 1)
    savePlaylist()
}

export function localMusicHandle(list, isToNext) {
    let addList = []
    list.forEach(song => {
        let ar = []
        if(song.common.artists)
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
    if(isToNext) return addList[0]
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
export function unloadMusicVideo() {
    currentMusicVideo.value = null
    videoIsPlaying.value = false
    playerShow.value = true
}
export function loadMusicVideo(id) {
    if(currentMusicVideo.value) unloadMusicVideo()
    windowApi.musicVideoIsExists({id: id, method: 'verify'}).then(result => {
        if(result == '404') {
            videoCheckInterval = null
            noticeOpen('未找到视频文件', 2)
            unloadMusicVideo()
        } else if(result) {
            currentMusicVideo.value = result.data
            if(songList.value[currentIndex.value].type == 'local') startLocalMusicVideo()
        } else {
            videoCheckInterval = null
            unloadMusicVideo()
        }
    })
}

export function addSong(id, index, autoplay, isLocal) {
    // 主动切歌：从头开始播放，不恢复上次进度
    loadLast = false
    progress.value = 0
    if(lyricShow.value) {
        lyricShow.value = false
        playerChangeSong.value = true
    }
    setId(id, index)
    if(musicVideo.value) loadMusicVideo(id)

    if(songList.value[currentIndex.value].type == 'local') isLocal = true
    else isLocal = false
    
    if(currentMusic.value && volume.value != 0) {
        currentMusic.value.fade(volume.value,0,200)
        currentMusic.value.once('fade', () => {
            getSongUrl(id, index, autoplay, isLocal)
            return
        })
        if(currentMusic.value.state() == 'loading' || currentMusic.value.state() == 'unloaded') {
            currentMusic.value.unload()
            getSongUrl(id, index, autoplay, isLocal)
        }
    } else {
        getSongUrl(id, index, autoplay, isLocal)
    }
}

export function setSongLevel(level) {
    if(level == 'standard') songList.value[currentIndex.value].level = songList.value[currentIndex.value].l
    else if(level == 'higher') songList.value[currentIndex.value].level = songList.value[currentIndex.value].m
    else if(level == 'exhigh') songList.value[currentIndex.value].level = songList.value[currentIndex.value].h
    else if(level == 'lossless') songList.value[currentIndex.value].level = songList.value[currentIndex.value].sq
    else if(level == 'hires') songList.value[currentIndex.value].level = songList.value[currentIndex.value].hr
    songList.value[currentIndex.value].quality = level
}
export async function getLocalLyric(filePath) {
    const lyric = await windowApi.getLocalMusicLyric(filePath)
    if(lyric) return lyric
    else return false
}
export async function getSongUrl(id, index, autoplay, isLocal) {
    const songName = songList.value[index].name
    const artistName = songList.value[index].ar[0].name
    
    // 更新窗口标题
    windowApi.setWindowTile(songName + " - " + artistName)
    
    // 更新 Dock 菜单（仅在 macOS 上）
    windowApi.updateDockMenu({
        name: songName,
        artist: artistName
    })
    if(isLocal) {
        windowApi.getLocalMusicImage(songList.value[currentIndex.value].url).then(base64 => {
            localBase64Img.value = base64
        })
        play(songList.value[currentIndex.value].url, autoplay)
        lyric.value = null
        lyricsObjArr.value = null
        //获取本地歌词（已禁用）
        // const localLyric = await getLocalLyric(songList.value[currentIndex.value].url)
        // if(localLyric) {
        //     lyric.value = {lrc:{lyric:localLyric}}
        // }
        if(!lyricShow.value && !widgetState.value) {
            lyricShow.value = true
            playerChangeSong.value = false
        }
        return
    }
    await checkMusic(id).then(result => {
        if(result.success == true) {
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
    if(playMode.value == 0 && currentIndex.value == songList.value.length - 1 && playModeOne && currentMusic.value.seek() == 0) {playNext();playModeOne = false;return}
    if(!playing.value) {
        currentMusic.value.play()
    }
    if(lyricShow.value) {
        isLyricDelay.value = false
        const forbidDelayTimer =  setTimeout(() => {
            isLyricDelay.value = true
            clearTimeout(forbidDelayTimer)
        }, 700);
    }
    if(videoIsPlaying.value) {
        musicVideoDOM.value.play()
        if(songList.value[currentIndex.value].type == 'local') startLocalMusicVideo()
    }
}
export function pauseMusic() {
    clearInterval(musicProgress)
    if(playing.value) {
        currentMusic.value.fade(volume.value,0,200)
        currentMusic.value.once('fade', () => {
            currentMusic.value.pause()
            playing.value = false
        })
    }
    if(videoIsPlaying.value) {
        musicVideoDOM.value.pause()
        if(songList.value[currentIndex.value].type == 'local') clearInterval(videoCheckInterval)
    }
}

export function playLast() {
    // FM模式下的特殊逻辑：触发自定义事件播放上一首FM歌曲
    if(listInfo.value && listInfo.value.type === 'personalfm') {
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
    if(playMode.value != 3) {
        if(currentIndex.value - 1 < 0) {
            index = songList.value.length - 1
            id = songList.value[index].id
        } else {
            id = songList.value[currentIndex.value - 1].id
            index = currentIndex.value - 1
        }
    }
    if(playMode.value == 3) {
        if(shuffleIndex.value - 1 < 0) {
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
    if(listInfo.value && listInfo.value.type === 'personalfm') {
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
    if(playMode.value != 3) {
        if(songList.value.length - 1 == currentIndex.value) {
            index = 0
            id = songList.value[index].id
        } else {
            index = currentIndex.value + 1
            id = songList.value[index].id
        }
    }
    if(playMode.value == 3) {
        if(shuffleIndex.value == shuffledList.value.length - 1) {
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
      if(lyricBlur.value) lyricEle.value[i].firstChild.style.setProperty("filter", "blur(0)");
    }
    const forbidDelayTimer =  setTimeout(() => {
        isLyricDelay.value = true
        clearTimeout(forbidDelayTimer)
    }, 600);
  }
export function changeProgress(toTime) {
    if(!widgetState.value && lyricShow.value && lyricEle.value) clearLycAnimation()
    if(videoIsPlaying.value) {
        musicVideoCheck(toTime, true)
    }
    currentMusic.value.seek(toTime)
}
//控制拖拽进度条
export function changeProgressByDragStart() {
    clearInterval(musicProgress)
}
export function changeProgressByDragEnd(toTime) {
    changeProgress(toTime)
    if(playing.value) startProgress()
}
// ------------
export function changePlayMode() {
    // FM模式下的特殊切换逻辑：只在模式2（单曲循环）和模式3（随机播放）之间切换
    if(listInfo.value && listInfo.value.type === 'personalfm') {
        if(playMode.value == 2) {
            playMode.value = 3  // 从单曲循环切换到随机播放（播放下一首漫游音乐）
        } else {
            playMode.value = 2  // 从随机播放（或其他模式）切换到单曲循环
        }
    } else {
        // 非FM模式下的原有逻辑
        if(playMode.value != 3) playMode.value += 1
        else playMode.value = 0
    }

    if(playMode.value == 2) currentMusic.value.loop(true) //循环模式
    else currentMusic.value.loop(false)
    if(playMode.value == 3) {
        setShuffledList()
    } else {
        shuffledList.value = null
        shuffleIndex.value = null
    }
    windowApi.changeTrayMusicPlaymode(playMode.value)
}

export function playAll(listType, list) {
    if(playMode.value == 3) {
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
    if(!isplayAll) {
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
    
    try {
        // 尝试使用播放列表操作的新方法
        const favoritePlaylistId = await getFavoritePlaylistId()
        
        if (favoritePlaylistId) {
            const params = {
                op: like ? 'add' : 'del',
                pid: favoritePlaylistId,
                tracks: songIdValue,
                timestamp: new Date().getTime()
            }
            
            const result = await updatePlaylist(params)
            
            // 根据实际返回格式判断成功
            const isSuccess = result && (
                (result.status === 200 && result.body && result.body.code === 200) ||
                result.code === 200 ||
                result.status === 200
            )
            
            if (isSuccess) {
                // 成功后更新喜欢列表
                try {
                    await updateLikelistAfterSuccess()
                } catch (updateError) {
                    console.error('更新喜欢列表失败，但不影响主逻辑:', updateError)
                }
                
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
                
                return
            }
        }
        
        // 如果播放列表操作失败或获取不到播放列表ID，回退到原API
        console.log('播放列表操作失败，回退到原API')
        throw new Error('播放列表操作失败，使用回退方案')
        
    } catch (error) {
        console.warn('使用播放列表操作失败，回退到原API:', error.message)
        
        // 回退到原来的likeMusic API
        try {
            console.log('开始调用原likeMusic API')
            const result = await likeMusic(songIdValue, like)
            console.log('原API返回结果:', result)
            if (result.code == 200) {
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
                
                if (libraryStore.listType1 == 0 && libraryStore.listType2 == 0) {
                    document.getElementById('myPlaylist').click()
                }
                console.log('原API操作成功')
            } else {
                console.log('原API返回失败:', result)
                noticeOpen("喜欢/取消喜欢 音乐失败！", 2)
            }
        } catch (fallbackError) {
            console.error('回退API也失败:', fallbackError)
            noticeOpen("喜欢/取消喜欢 音乐失败！", 2)
        }
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
    if(!songList.value) songList.value = []
    if(nextSong.id == songId.value) return

    const si = (songList.value || []).findIndex((song) => song.id === nextSong.id)
    if(si != -1) {
        songList.value.splice(si, 1)
        if(si < currentIndex.value) currentIndex.value--
    }
    songList.value.splice(currentIndex.value + 1, 0, nextSong)

    if(playMode.value == 3) {
        const shufflei = (shuffledList.value || []).findIndex((song) => song.id === nextSong.id)
        if(shufflei != -1) {
            shuffledList.value.splice(shufflei, 1)
            if(shufflei < currentIndex.value) shuffleIndex.value--
        }
        shuffledList.value.splice(shuffleIndex.value + 1, 0, nextSong)
    }
    if(autoplay) playNext()
    else noticeOpen('已添加至下一首', 2)
    if(songList.value.length == 1) addSong(nextSong.id, 0, autoplay)
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
    if(dt) {
        if (dt == 0 || dt == "--") return dt;
        // 将毫秒转换为秒
        const seconds = Math.floor(dt / 1000);
        return formatDuration(seconds);
    }
}
export function songTime2(time) {
    let min = Math.floor(time / 60)
    let sec = Math.floor(time % 60)
    if(sec == 60) {
        sec = 0
        min++
    }
    if(min < 10) min = '0' + min
    if(sec < 10) sec = '0' + sec
    return min + ':' + sec
}
/**
 * 音乐视频监测
 */
export function musicVideoCheck(seek, update) {
    if(musicVideo.value && currentMusicVideo.value && !videoIsPlaying.value || update) {
        for (let i = 0; i < currentMusicVideo.value.timing.length; i++) {
            if(seek >= currentMusicVideo.value.timing[i].start && seek < currentMusicVideo.value.timing[i].end) {
                if(playing.value) musicVideoDOM.value.play()
                const vt = currentMusicVideo.value.timing[i].videoTiming + seek - currentMusicVideo.value.timing[i].start
                musicVideoDOM.value.currentTime = vt
                if(Math.abs(musicVideoDOM.value.currentTime - vt) > 1) return
                currentTiming = currentMusicVideo.value.timing[i]
                videoIsPlaying.value = true
                if(!update) playerShow.value = false
                return
            }
        }
        videoIsPlaying.value = false
        playerShow.value = true
        musicVideoDOM.value.pause()
    } else if(videoIsPlaying.value && currentTiming) {
        if(seek > currentTiming.end) {
            videoIsPlaying.value = false
            playerShow.value = true
            currentTiming = null
        }
    }
}


window.addEventListener('mousedown', (e) => {
    if(e.target.parentNode.parentNode.id == 'widget-progress') {
      changeProgressByDragStart()
      isProgress = true
    }
})

window.addEventListener('mouseup', () => {
  if(isProgress) {
      changeProgressByDragEnd(progress.value)
      isProgress = false
  }
})
  
window.addEventListener('click', (e) => {
  if(playlistWidgetShow.value) {
      if(document.getElementsByClassName('playlist-widget')[0].contains(e.target) == false && document.getElementsByClassName('music-control')[0].contains(e.target) == false && document.getElementsByClassName('music-other')[0].contains(e.target) == false && document.getElementsByClassName('playlist-widget-player')[0].contains(e.target) == false && document.getElementsByClassName('song-control')[0].contains(e.target) == false && document.getElementsByClassName('contextMune')[0].contains(e.target) == false && e.target.className.baseVal != 'item-delete') 
        playlistWidgetShow.value = false
  }
  if(otherStore.contextMenuShow) otherStore.contextMenuShow = false
  if(!otherStore.videoIsBlur && otherStore.videoPlayerShow && document.getElementById('videoPlayer').contains(e.target) == false) otherStore.videoIsBlur = true
  else if(otherStore.videoIsBlur && otherStore.videoPlayerShow && document.getElementById('videoPlayer').contains(e.target) == true && document.getElementsByClassName('plyr__controls')[0].contains(e.target) != true) otherStore.videoIsBlur = false
  if(userStore.appOptionShow && document.getElementsByClassName('user-head')[0].contains(e.target) != true) userStore.appOptionShow = false
})
windowApi.playOrPauseMusic((event) => {
    if(playing.value) pauseMusic()
    else startMusic()
})
windowApi.lastOrNextMusic((event, option) => {
    if(option == 'last') playLast()
    else if(option == 'next') playNext()
})
windowApi.changeMusicPlaymode((event, mode) => {
    if(playMode.value != mode) playMode.value = mode
    if(playMode.value == 2) currentMusic.value.loop(true) //循环模式
    else currentMusic.value.loop(false)
    if(playMode.value == 3) {
        setShuffledList()
    } else {
        shuffledList.value = null
        shuffleIndex.value = null
    }
})
windowApi.volumeUp(() => {
    if(volume.value + 0.1 < 1) volume.value += 0.1
    else volume.value = 1
    currentMusic.value.volume(volume.value)
})
windowApi.volumeDown(() => {
    if(volume.value - 0.1 > 0) volume.value -= 0.1
    else volume.value = 0
    currentMusic.value.volume(volume.value)
})
windowApi.musicProcessControl((event, mode) => {
    if(mode == 'forward') {
        if(progress.value + 3 < currentMusic.value.duration()) progress.value += 3
        else progress.value = currentMusic.value.duration()
    } else if(mode == 'back') {
        if(progress.value - 3 > 0) progress.value -= 3
        else progress.value = 0
    }
    currentMusic.value.seek(progress.value)
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