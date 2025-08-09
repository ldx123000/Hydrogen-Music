// 全局下载管理器初始化
import { useLocalStore } from '../store/localStore'
import { usePlayerStore } from '../store/playerStore'
import { storeToRefs } from 'pinia'
import { checkMusic, getMusicUrl } from '../api/song'
import { noticeOpen } from './dialog'
import { scanMusic } from './locaMusic'

let isInitialized = false

export const initDownloadManager = () => {
    if (isInitialized) return
    
    const localStore = useLocalStore()
    const playerStore = usePlayerStore()
    const { downloadList, isDownloading, isFirstDownload } = storeToRefs(localStore)
    const { quality } = storeToRefs(playerStore)
    
    let currentIndex = -1
    
    const download = () => {
        if (currentIndex < 0 || currentIndex >= downloadList.value.length) return
        
        let id = downloadList.value[currentIndex].id
        checkMusic(id).then(result => {
            if(result.success == true) {
                getMusicUrl(id, quality.value).then(songInfo => {
                    let fileObj = {
                        url: songInfo.data[0].url,
                        name: downloadList.value[currentIndex].name,
                        type: songInfo.data[0].type
                    }
                    windowApi.download(fileObj)
                })
            } else {
                noticeOpen("该歌曲无法下载！", 2)
                downloadList.value.splice(currentIndex, 1)
                downNext()
            }
        })
    }

    const downNext = () => {
        if(downloadList.value.length != 0) {
            download()
        } else {
            isDownloading.value = false
            currentIndex = -1
            downloadList.value = []
            isFirstDownload.value = true
            noticeOpen("全部下载完毕", 2)
            
            // 下载完成后自动刷新下载目录
            setTimeout(() => {
                if (localStore.downloadedFolderSettings) {
                    noticeOpen("正在刷新下载目录...", 2)
                    // 延迟一点时间再扫描，确保用户能看到"全部下载完毕"的提示
                    setTimeout(() => {
                        scanMusic({type:'downloaded', refresh:true})
                    }, 500)
                }
            }, 1500) // 延迟1.5秒确保文件系统更新完成
        }
    }

    // 注册全局下载回调
    windowApi.downloadNext(() => {
        if(isDownloading.value && downloadList.value.length != 0) {
            downloadList.value.splice(currentIndex, 1)
            downNext()
        } else {
            if(downloadList.value.length != 0) {
                isDownloading.value = true
                currentIndex = 0
                download()
            }
        }
    })
    
    isInitialized = true
}