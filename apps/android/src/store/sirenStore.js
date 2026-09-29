import { defineStore } from 'pinia'
import { getSirenAlbumDetail, getSirenAlbums, getSirenSong } from '../api/siren'
import { normalizeSirenAlbum, normalizeSirenAlbumDetail, getSirenSourceId } from '../utils/siren'

function getErrorMessage(error, fallback) {
    return error?.message || fallback
}

const DURATION_CACHE_KEY = 'siren_song_durations'
const DURATION_FETCH_CONCURRENCY = 4
const DURATION_CACHE_WRITE_INTERVAL_MS = 1000

function loadDurationCache() {
    try {
        return JSON.parse(localStorage.getItem(DURATION_CACHE_KEY) || '{}')
    } catch {
        return {}
    }
}

function saveDurationCacheUpdates(updates) {
    try {
        const updateKeys = Object.keys(updates || {})
        if (updateKeys.length === 0) return true
        const cache = loadDurationCache()
        for (const key of updateKeys) {
            cache[key] = updates[key]
        }
        localStorage.setItem(DURATION_CACHE_KEY, JSON.stringify(cache))
        return true
    } catch { /* ignore */ }
    return false
}

async function runWithConcurrency(items, limit, worker) {
    const sourceItems = Array.isArray(items) ? items : []
    const workerLimit = Math.max(1, Math.min(Number(limit) || 1, sourceItems.length || 1))
    let nextIndex = 0

    await Promise.all(Array.from({ length: workerLimit }, async () => {
        while (nextIndex < sourceItems.length) {
            const currentIndex = nextIndex
            nextIndex += 1
            try {
                await worker(sourceItems[currentIndex], currentIndex)
            } catch { /* keep preload best-effort */ }
        }
    }))
}

function getAudioDuration(url) {
    return new Promise(resolve => {
        const audio = new Audio()
        audio.preload = 'metadata'
        audio.onloadedmetadata = () => {
            const ms = Math.round((audio.duration || 0) * 1000)
            audio.src = ''
            resolve(ms > 0 ? ms : null)
        }
        audio.onerror = () => {
            audio.src = ''
            resolve(null)
        }
        audio.src = url
    })
}

// 追踪每张专辑的时长加载 Promise
const durationTaskByAlbum = new Map()

export const useSirenStore = defineStore('sirenStore', {
    state: () => ({
        albums: [],
        albumsLoading: false,
        albumsError: '',
        albumDetailsById: {},
        albumLoadingById: {},
        albumErrorById: {},
        keyword: '',
    }),
    actions: {
        setKeyword(keyword) {
            this.keyword = String(keyword ?? '')
        },
        async ensureAlbums(force = false) {
            if (!force && Array.isArray(this.albums) && this.albums.length > 0) return this.albums

            this.albumsLoading = true
            this.albumsError = ''
            try {
                const albums = await getSirenAlbums(force)
                this.albums = Array.isArray(albums) ? albums.map(normalizeSirenAlbum) : []
                return this.albums
            } catch (error) {
                this.albumsError = getErrorMessage(error, '塞壬唱片专辑列表加载失败')
                return []
            } finally {
                this.albumsLoading = false
            }
        },
        async ensureAlbumDetail(albumId, force = false) {
            const normalizedAlbumId = String(albumId || '').trim()
            if (!normalizedAlbumId) return null
            if (!force && this.albumDetailsById[normalizedAlbumId]) return this.albumDetailsById[normalizedAlbumId]

            this.albumLoadingById = {
                ...this.albumLoadingById,
                [normalizedAlbumId]: true,
            }
            this.albumErrorById = {
                ...this.albumErrorById,
                [normalizedAlbumId]: '',
            }

            try {
                const detail = await getSirenAlbumDetail(normalizedAlbumId, { force })
                const normalizedDetail = normalizeSirenAlbumDetail(detail)
                this.albumDetailsById = {
                    ...this.albumDetailsById,
                    [normalizedAlbumId]: normalizedDetail,
                }
                // 异步补充每首歌的时长（不阻塞页面渲染）
                const task = this._fillSongDurations(normalizedAlbumId, normalizedDetail)
                durationTaskByAlbum.set(normalizedAlbumId, task)
                task.finally(() => durationTaskByAlbum.delete(normalizedAlbumId))
                return normalizedDetail
            } catch (error) {
                this.albumErrorById = {
                    ...this.albumErrorById,
                    [normalizedAlbumId]: getErrorMessage(error, '塞壬唱片专辑详情加载失败'),
                }
                return null
            } finally {
                this.albumLoadingById = {
                    ...this.albumLoadingById,
                    [normalizedAlbumId]: false,
                }
            }
        },
        async preloadAllDurations() {
            try {
                const albums = await this.ensureAlbums()
                if (!Array.isArray(albums) || albums.length === 0) return

                for (const album of albums) {
                    const albumId = String(album.id || '').trim()
                    if (!albumId) continue
                    await this.ensureAlbumDetail(albumId)
                    // 等待该专辑的时长加载任务完成后再处理下一张，避免并发过多
                    const task = durationTaskByAlbum.get(albumId)
                    if (task) await task
                }
            } catch { /* 预加载失败不影响正常使用 */ }
        },
        async _fillSongDurations(albumId, albumDetail) {
            const songs = albumDetail?.songs
            if (!Array.isArray(songs) || songs.length === 0) return

            const durationCache = loadDurationCache()

            // 第一步：从缓存中立即填充已知时长
            let cachedCount = 0
            const needFetch = []
            for (const song of songs) {
                if (song.duration && song.dt) continue
                const sourceId = getSirenSourceId(song)
                const cached = sourceId ? durationCache[sourceId] : null
                if (cached) {
                    song.duration = cached
                    song.dt = cached
                    cachedCount++
                } else {
                    needFetch.push(song)
                }
            }
            if (cachedCount > 0) {
                this.albumDetailsById = { ...this.albumDetailsById }
            }
            if (needFetch.length === 0) return

            // 第二步：小并发流水线获取（API -> 音频元数据），每完成一首立即更新 UI
            const triggerUpdate = () => {
                this.albumDetailsById = { ...this.albumDetailsById }
            }

            let batchTimer = null
            const batchUpdate = () => {
                if (batchTimer) return
                batchTimer = setTimeout(() => {
                    batchTimer = null
                    triggerUpdate()
                }, 300)
            }

            const pendingDurationCacheUpdates = {}
            let durationCacheTimer = null
            const flushDurationCache = () => {
                const updateKeys = Object.keys(pendingDurationCacheUpdates)
                if (updateKeys.length === 0) return
                const updates = {}
                for (const key of updateKeys) {
                    updates[key] = pendingDurationCacheUpdates[key]
                }
                if (saveDurationCacheUpdates(updates)) {
                    for (const key of updateKeys) {
                        delete pendingDurationCacheUpdates[key]
                    }
                }
            }
            const scheduleDurationCacheFlush = () => {
                if (durationCacheTimer) return
                durationCacheTimer = setTimeout(() => {
                    durationCacheTimer = null
                    flushDurationCache()
                }, DURATION_CACHE_WRITE_INTERVAL_MS)
            }

            await runWithConcurrency(needFetch, DURATION_FETCH_CONCURRENCY, async song => {
                const sourceId = getSirenSourceId(song)
                if (!sourceId) return

                try {
                    const songData = await getSirenSong(sourceId)
                    const url = songData?.sourceUrl || song.streamUrl
                    if (!url) return

                    if (songData?.sourceUrl) {
                        song.streamUrl = songData.sourceUrl
                        song.sourceUrl = songData.sourceUrl
                    }

                    const ms = await getAudioDuration(url)
                    if (!ms) return

                    song.duration = ms
                    song.dt = ms
                    pendingDurationCacheUpdates[sourceId] = ms
                    scheduleDurationCacheFlush()
                    batchUpdate()
                } catch { /* ignore */ }
            })

            // 最终确保全部更新
            if (batchTimer) {
                clearTimeout(batchTimer)
                batchTimer = null
            }
            if (durationCacheTimer) {
                clearTimeout(durationCacheTimer)
                durationCacheTimer = null
            }
            flushDurationCache()
            triggerUpdate()
        },
    },
})
