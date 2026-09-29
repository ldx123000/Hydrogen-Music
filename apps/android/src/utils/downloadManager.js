// 全局下载管理器初始化
import { useLocalStore } from '../store/localStore'
import { usePlayerStore } from '../store/playerStore'
import { storeToRefs } from 'pinia'
import { getSirenLyricText, getSirenSong } from '../api/siren'
import { noticeOpen } from './dialog'
import { scanMusic } from './locaMusic'
import { getPreferredQuality } from './quality'
import { resolveTrackWithMatchedFallback } from './musicUrlResolver'
import { getSirenAudioExtension, getSirenSourceId, SIREN_SOURCE } from './siren'
import { getLyricWithCloudFallback } from './player/lyricFallback'

let isInitialized = false

export const initDownloadManager = () => {
    if (isInitialized) return
    
    const localStore = useLocalStore()
    const playerStore = usePlayerStore()
    const { downloadList, isDownloading, isFirstDownload } = storeToRefs(localStore)
    const { quality } = storeToRefs(playerStore)
    
    let currentIndex = -1

    const getItemArtists = item => {
        if (Array.isArray(item?.ar)) return item.ar.map(artist => artist?.name).filter(Boolean)
        if (Array.isArray(item?.artists)) return item.artists.map(artist => artist?.name || artist).filter(Boolean)
        return []
    }

    const downloadSirenTrack = async item => {
        try {
            const sourceId = getSirenSourceId(item)
            if (!sourceId) throw new Error('缺少塞壬歌曲 ID')

            const songData = await getSirenSong(sourceId)
            const streamUrl = songData?.sourceUrl || item?.streamUrl || item?.sourceUrl || ''
            const lyricUrl = songData?.lyricUrl || item?.lyricUrl || ''

            if (!streamUrl) throw new Error('该歌曲无法下载')

            if (streamUrl) {
                item.streamUrl = streamUrl
                item.sourceUrl = streamUrl
            }
            if (lyricUrl) item.lyricUrl = lyricUrl

            let lyricPayload = null
            try {
                const lyricText = lyricUrl ? await getSirenLyricText(lyricUrl) : ''
                lyricPayload = {
                    id: sourceId,
                    lrc: lyricText || null,
                    tlyric: null,
                    romalrc: null,
                }
            } catch (_) {
                lyricPayload = null
            }

            const coverUrl = item.coverUrl || item?.al?.picUrl || null
            const artists = getItemArtists(item)
            const album = item?.al?.name || item?.album?.name || item?.album?.title || item?.album || null

            windowApi.download({
                url: streamUrl,
                name: item?.name,
                type: getSirenAudioExtension(streamUrl),
                id: item?.id || `siren:${sourceId}`,
                source: SIREN_SOURCE,
                lyrics: lyricPayload,
                coverUrl,
                artists,
                album,
            })
        } catch (error) {
            console.error('塞壬歌曲下载失败:', error)
            noticeOpen("该歌曲无法下载！", 2)
            downloadList.value.splice(currentIndex, 1)
            downNext()
        }
    }
    
    const download = async () => {
        if (currentIndex < 0 || currentIndex >= downloadList.value.length) return

        const currentItem = downloadList.value[currentIndex] || {}
        if (currentItem.source === SIREN_SOURCE) {
            await downloadSirenTrack(currentItem)
            return
        }

        const id = currentItem.id
        try {
            const preferredQuality = getPreferredQuality(quality.value)
            const trackInfo = await resolveTrackWithMatchedFallback(currentItem, preferredQuality, {
                id,
                waitForMatchedMetadata: true,
            })
            if (!trackInfo || !trackInfo.url) {
                noticeOpen("该歌曲无法下载！", 2)
                downloadList.value.splice(currentIndex, 1)
                downNext()
                return
            }

            // 获取歌词（不阻塞音频下载；即使失败也继续）
            let lyricPayload = null
            try {
                const lyr = await getLyricWithCloudFallback(currentItem)
                lyricPayload = {
                    id,
                    lrc: lyr && lyr.lrc && lyr.lrc.lyric ? lyr.lrc.lyric : null,
                    tlyric: lyr && lyr.tlyric && lyr.tlyric.lyric ? lyr.tlyric.lyric : null,
                    romalrc: lyr && lyr.romalrc && lyr.romalrc.lyric ? lyr.romalrc.lyric : null,
                }
            } catch (_) {
                // ignore lyric fetch errors
            }

            // 提取封面地址（优先专用 coverUrl，其次专辑图 al.picUrl）
            const item = downloadList.value[currentIndex] || {}
            const coverUrl = item.coverUrl || (item.al && item.al.picUrl) || null
            const artists = Array.isArray(item.ar) ? item.ar.map(a => a && a.name ? a.name : '') : []
            const album = (item.al && item.al.name) || (item.album && item.album.name) || null

            const fileObj = {
                url: trackInfo.url,
                name: item.name,
                type: trackInfo.type,
                id,
                source: trackInfo.source === 'matched-source' ? 'matched-source' : 'netease',
                lyrics: lyricPayload,
                coverUrl,
                artists,
                album,
            }
            windowApi.download(fileObj)
        } catch (error) {
            console.error('歌曲下载解析失败:', error)
            noticeOpen("该歌曲无法下载！", 2)
            downloadList.value.splice(currentIndex, 1)
            downNext()
        }
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

    /**
     * 「立即开始下载」。
     *
     * 桌面端由主进程在收到 download-start 后触发 download-next 来推队列；
     * 安卓端没有主进程，所以这里直接推一次，并把状态先摆正
     * （否则 download-next 回来看不到"正在下载且列表非空"就不会往下走）。
     * 已经是下载中的话直接忽略，保持幂等。
     */
    const startQueue = () => {
        if (isDownloading.value && currentIndex >= 0) return
        if (downloadList.value.length === 0) return
        isDownloading.value = true
        isFirstDownload.value = false
        currentIndex = 0
        download()
    }

    // 原生插件与 webBridge 通过这个事件通知"可以开始了"
    window.addEventListener('hm:download-start', startQueue)

    windowApi.downloadError(code => {
        if (code == 'noSavePath') {
            noticeOpen('请先在设置中设置下载目录', 2)
            return
        }
        // 目录不可写是最常见的失败：能读到文件但 provider 不支持 createDocument。
        // 明确告诉用户"重新选目录"，而不是笼统的"下载失败"。
        if (typeof code === 'string' && code.indexOf('saveFailed') === 0) {
            console.warn('[download] 写入目录失败:', code)
            noticeOpen('无法写入下载目录，请在设置里重新选择（建议用系统文件选择器选「Download」）', 4)
            return
        }
        noticeOpen('下载失败', 2)
    })
    
    isInitialized = true
}
