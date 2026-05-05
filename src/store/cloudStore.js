import { defineStore } from "pinia";
import { getCloudDiskData } from "../api/cloud";
import { getSongDetail } from "../api/song";
import { getSongCoverUrl, normalizeCoverUrl } from "../utils/coverBackdrop";

const BYTES_PER_GB = 1024 * 1024 * 1024
const CLOUD_DETAIL_BATCH_SIZE = 100
let cloudRefreshToken = 0
let pendingCloudDataRequest = null
let pendingCloudDataUserId = null

function normalizeUserId(userId) {
    if (userId == null || userId === '') return null
    return String(userId)
}

function clearPendingRequest() {
    pendingCloudDataRequest = null
    pendingCloudDataUserId = null
}

function clearCloudDataState(store) {
    store.count = null
    store.size = null
    store.maxSize = null
    store.cloudSongs = null
    store.loadedUserId = null
    store.loadedAt = 0
}

function buildCloudDataSnapshot(result) {
    const cloudSongs = Array.isArray(result?.data) ? result.data : []
    return {
        count: Number(result?.count || 0),
        size: Number(((Number(result?.size) || 0) / BYTES_PER_GB).toFixed(1)),
        maxSize: Number(Number(result?.maxSize || 0) / BYTES_PER_GB),
        cloudSongs,
        loadedAt: Date.now(),
    }
}

function applyCloudDataSnapshotToStore(store, userId, snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false

    store.count = snapshot.count
    store.size = snapshot.size
    store.maxSize = snapshot.maxSize
    store.cloudSongs = Array.isArray(snapshot.cloudSongs) ? snapshot.cloudSongs : []
    store.loadedUserId = normalizeUserId(userId)
    store.loadedAt = Number(snapshot.loadedAt || Date.now())
    return true
}

function hasCloudDataForUser(store, userId) {
    const normalizedUserId = normalizeUserId(userId)
    return !!normalizedUserId
        && store.loadedUserId === normalizedUserId
        && Array.isArray(store.cloudSongs)
}

function getCloudItemSong(item) {
    return item && typeof item === 'object' && item.simpleSong && typeof item.simpleSong === 'object'
        ? item.simpleSong
        : null
}

function getCloudSongId(song) {
    const id = song?.id
    return id === undefined || id === null || id === '' ? '' : String(id)
}

function hasCloudItemCover(item) {
    return !!getSongCoverUrl(getCloudItemSong(item))
}

function mergeArrayIfMissing(target, key, value) {
    if (Array.isArray(target[key]) && target[key].length > 0) return
    if (!Array.isArray(value) || value.length === 0) return
    target[key] = value
}

function mergeValueIfMissing(target, key, value) {
    if (target[key] !== undefined && target[key] !== null && target[key] !== '') return
    if (value === undefined || value === null || value === '') return
    target[key] = value
}

function mergeAlbum(targetAlbum, sourceAlbum) {
    if (!sourceAlbum || typeof sourceAlbum !== 'object') return targetAlbum || null
    const album = targetAlbum && typeof targetAlbum === 'object' ? targetAlbum : {}
    mergeValueIfMissing(album, 'id', sourceAlbum.id)
    mergeValueIfMissing(album, 'name', sourceAlbum.name)
    if (sourceAlbum.picUrl) album.picUrl = normalizeCoverUrl(sourceAlbum.picUrl)
    if (sourceAlbum.blurPicUrl) album.blurPicUrl = normalizeCoverUrl(sourceAlbum.blurPicUrl)
    return album
}

function getCloudSongMetadataSignature(song) {
    if (!song || typeof song !== 'object') return ''
    const artists = Array.isArray(song.ar) ? song.ar.map(artist => artist?.name || artist).join('/') : ''
    const translations = Array.isArray(song.transNames) ? song.transNames.join('/') : ''
    return JSON.stringify([
        song.name || '',
        song.dt || '',
        song.duration || '',
        artists,
        translations,
        song.al?.name || '',
        song.album?.name || '',
        getSongCoverUrl(song),
    ])
}

function mergeCloudSongDetail(song, detail) {
    if (!song || !detail || typeof song !== 'object' || typeof detail !== 'object') return false
    const beforeSignature = getCloudSongMetadataSignature(song)

    mergeValueIfMissing(song, 'name', detail.name)
    mergeValueIfMissing(song, 'dt', detail.dt)
    mergeValueIfMissing(song, 'duration', detail.dt || detail.duration)
    mergeArrayIfMissing(song, 'ar', detail.ar)
    mergeArrayIfMissing(song, 'tns', detail.tns)
    mergeArrayIfMissing(song, 'transNames', detail.transNames)

    const detailCoverUrl = getSongCoverUrl(detail)
    if (detailCoverUrl) song.coverUrl = detailCoverUrl
    if (detail.blurPicUrl) song.blurPicUrl = normalizeCoverUrl(detail.blurPicUrl)
    if (detail.img1v1Url) song.img1v1Url = normalizeCoverUrl(detail.img1v1Url)

    const detailAlbum = detail.al || detail.album
    const mergedAl = mergeAlbum(song.al, detailAlbum)
    if (mergedAl) song.al = mergedAl
    const mergedAlbum = mergeAlbum(song.album, detailAlbum)
    if (mergedAlbum) song.album = mergedAlbum

    return beforeSignature !== getCloudSongMetadataSignature(song)
}

async function hydrateCloudSongDetails(cloudSongs) {
    if (!Array.isArray(cloudSongs) || cloudSongs.length === 0) return false

    const ids = []
    const songsById = new Map()
    for (const item of cloudSongs) {
        if (hasCloudItemCover(item)) continue
        const song = getCloudItemSong(item)
        const songId = getCloudSongId(song)
        if (!song || !songId || songsById.has(songId)) continue
        ids.push(songId)
        songsById.set(songId, song)
    }

    if (ids.length === 0) return false

    let changed = false
    for (let i = 0; i < ids.length; i += CLOUD_DETAIL_BATCH_SIZE) {
        const batchIds = ids.slice(i, i + CLOUD_DETAIL_BATCH_SIZE)
        try {
            const result = await getSongDetail(batchIds)
            const details = Array.isArray(result?.songs) ? result.songs : []
            details.forEach(detail => {
                const targetSong = songsById.get(String(detail?.id || ''))
                if (mergeCloudSongDetail(targetSong, detail)) changed = true
            })
        } catch (error) {
            console.warn('补齐云盘歌曲详情失败:', error)
        }
    }

    return changed
}

async function fetchCloudDataSnapshotData() {
    const result = await getCloudDiskData({
        limit: 500,
        offset: 0,
        timestamp: Date.now(),
    })

    const snapshot = buildCloudDataSnapshot(result)
    const hydrated = await hydrateCloudSongDetails(snapshot.cloudSongs)
    if (hydrated) snapshot.cloudSongs = snapshot.cloudSongs.slice()
    return snapshot
}

export const useCloudStore= defineStore('cloudStore', {
    state: () => {
        return {
            count: null,
            size: null,
            maxSize: null,
            cloudSongs: null,
            loadedUserId: null,
            loadedAt: 0,
        }
    },
    actions: {
        resetAccountState() {
            cloudRefreshToken += 1
            clearPendingRequest()
            clearCloudDataState(this)
        },
        applyCloudDataSnapshot(userId, snapshot) {
            return applyCloudDataSnapshotToStore(this, userId, snapshot)
        },
        async fetchCloudDataSnapshot(userId) {
            const currentUserId = normalizeUserId(userId)
            if (!currentUserId) return null

            try {
                return await fetchCloudDataSnapshotData()
            } catch (error) {
                console.error('获取云盘数据失败:', error)
                return null
            }
        },
        async refreshCloudData(userId, options = {}) {
            const currentUserId = normalizeUserId(userId)
            const maxAge = Number(options.maxAge || 0)
            const now = Date.now()
            const hasCurrentUserData = hasCloudDataForUser(this, currentUserId)

            if (!currentUserId) {
                this.resetAccountState()
                return false
            }

            if (!options.force && hasCurrentUserData && maxAge > 0 && now - this.loadedAt < maxAge) {
                return true
            }

            if (!options.force && pendingCloudDataRequest && pendingCloudDataUserId === currentUserId) {
                return pendingCloudDataRequest
            }

            if (options.force || this.loadedUserId !== currentUserId) {
                clearCloudDataState(this)
            }

            const requestToken = ++cloudRefreshToken

            const request = fetchCloudDataSnapshotData().then(snapshot => {
                if (requestToken !== cloudRefreshToken) return false

                return applyCloudDataSnapshotToStore(this, currentUserId, snapshot)
            }).catch(error => {
                if (requestToken !== cloudRefreshToken) return false

                console.error('获取云盘数据失败:', error)
                if (!hasCurrentUserData) {
                    clearCloudDataState(this)
                }
                return false
            }).finally(() => {
                if (pendingCloudDataRequest === request) {
                    clearPendingRequest()
                }
            })

            pendingCloudDataRequest = request
            pendingCloudDataUserId = currentUserId
            return request
        }
    },
})
