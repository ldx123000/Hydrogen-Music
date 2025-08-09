import pinia from '../store/pinia'
import { useLocalStore } from '../store/localStore'
import { storeToRefs } from 'pinia'
import { nanoid } from 'nanoid'
import { noticeOpen } from './dialog'

const localStore = useLocalStore(pinia)
const { downloadedMusicFolder, downloadedFiles, localMusicFolder, localMusicList, localMusicClassify, isRefreshLocalFile } = storeToRefs(localStore)
let artistArr = []
let albumArr = []

function classifyAdd(song) {
    if(song.common.artists == undefined) song.common.artists = ['其他']
    else if(song.common.artists[0].indexOf(',') != -1) song.common.artists = song.common.artists[0].split(', ')
    song.common.artists.forEach(artist => {
        let index = (artistArr || []).findIndex((item) => item.name == artist)
        if(index == -1) {
            artistArr.push({
                id: nanoid(),
                type: 'artist',
                name: artist,
                songs: [song]
            })
        } else {
            artistArr[index].songs.push(song)
        }
    })
    
    if(song.common.album == undefined) song.common.album = '其他'
    let index = (albumArr || []).findIndex((item) => item.name == song.common.album)
    if(index == -1) {
        albumArr.push({
            id: nanoid(),
            type: 'album',
            name: song.common.album,
            songs: [song]
        })
    } else {
        albumArr[index].songs.push(song)
    }
}

function classify(arr) {
    arr.forEach(item => {
        if(item.children) classify(item.children)
        else classifyAdd(item)
    })
    let result = {
        artists: artistArr,
        albums: albumArr
    }
    return result
}

export function scanMusic(params) {
    if(isRefreshLocalFile.value)
        noticeOpen("正在扫描本地音乐,请稍等", 3)
    windowApi.scanLocalMusic(params)
}
windowApi.localMusicCount((event, count) => {
    noticeOpen('已扫描' + count + '首', 2)
})
windowApi.localMusicFiles((event, localData) => {
    if(localData.type == 'downloaded') {
        downloadedMusicFolder.value = localData.dirTree
        downloadedFiles.value = localData.locaFilesMetadata
    }
    if(localData.type == 'local') {
        localMusicFolder.value = localData.dirTree
        localMusicList.value = localData.locaFilesMetadata
        artistArr = []
        albumArr = []
        localMusicClassify.value = classify(localData.locaFilesMetadata)
    }
    if(isRefreshLocalFile.value) {
        if(localData.type == 'downloaded') {
            noticeOpen("下载目录已更新，共" + localData.count + '首音乐', 3)
        } else {
            noticeOpen("扫描完毕 共" + localData.count + '首', 3)
        }
        isRefreshLocalFile.value = false
    }
})