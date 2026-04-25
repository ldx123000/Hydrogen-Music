import { getLyric } from '../../api/song'
import { getSirenLyricText, getSirenSong } from '../../api/siren'
import { getPreferredQuality } from '../quality'
import { resolveTrackByQualityPreference } from '../musicUrlResolver'
import { getSirenSourceId, isSirenSong } from '../siren'
import { runIdleTask } from './idleTask'
import { createEmptyLyric, normalizeLyricPayload } from './lyricPayload'

const PREFETCH_CACHE_LIMIT = 80
const IDLE_TIMEOUT_MS = 1800
const IMAGE_LOAD_TIMEOUT_MS = 10000
const IMAGE_COVER_SIZES = [512, 640]
const COVER_FIELDS = ['coverUrl', 'coverDeUrl', 'al.picUrl', 'album.picUrl', 'blurPicUrl', 'img1v1Url']

const assetCache = new Map()
const pendingPrefetches = new Map()

function normalizeId(value) {
    if (value === null || value === undefined || value === '') return ''
    return String(value)
}

function assignLyricAsset(assets, lyric) {
    assets.lyric = normalizeLyricPayload(lyric)
    assets.hasLyric = true
}

function getSirenPrefetchSourceId(song) {
    if (!song || typeof song !== 'object') return ''
    return getSirenSourceId(song.sourceId || song.cid || song.musicId || song.songId || song.id)
}

export function getSongAssetKey(song) {
    if (!song || typeof song !== 'object') return ''
    if (song.type === 'local') {
        const localId = normalizeId(song.url || song.path || song.dirPath || song.id)
        return localId ? `local:${localId}` : ''
    }
    if (isSirenSong(song)) {
        const sirenId = normalizeId(getSirenPrefetchSourceId(song) || song.id)
        return sirenId ? `siren:${sirenId}` : ''
    }
    const songId = normalizeId(song.id || song.songId || song.musicId)
    return songId ? `song:${songId}` : ''
}

function rememberAssets(key, assets) {
    if (!key || !assets) return
    assetCache.set(key, assets)

    if (assetCache.size <= PREFETCH_CACHE_LIMIT) return
    const oldestKey = assetCache.keys().next().value
    if (oldestKey) assetCache.delete(oldestKey)
}

function withCoverParam(url, size) {
    const normalizedUrl = typeof url === 'string' ? url.trim() : ''
    if (!normalizedUrl) return ''
    if (normalizedUrl.startsWith('data:') || normalizedUrl.startsWith('blob:')) return normalizedUrl

    const nextParam = `param=${size}y${size}`
    if (/(?:\?|&)param=\d+y\d+/.test(normalizedUrl)) {
        return normalizedUrl.replace(/([?&])param=\d+y\d+/, `$1${nextParam}`)
    }

    return `${normalizedUrl}${normalizedUrl.includes('?') ? '&' : '?'}${nextParam}`
}

function pushCoverCandidate(candidates, url) {
    const normalizedUrl = typeof url === 'string' ? url.trim() : ''
    if (!normalizedUrl) return

    for (const size of IMAGE_COVER_SIZES) {
        const sizedUrl = withCoverParam(normalizedUrl, size)
        if (sizedUrl && !candidates.includes(sizedUrl)) candidates.push(sizedUrl)
    }
    if (!candidates.includes(normalizedUrl)) candidates.push(normalizedUrl)
}

function getNestedValue(source, path) {
    return path.split('.').reduce((value, field) => value?.[field], source)
}

function pushSongCoverFields(candidates, song) {
    if (!song || typeof song !== 'object') return
    COVER_FIELDS.forEach(field => pushCoverCandidate(candidates, getNestedValue(song, field)))
}

function getSongCoverCandidates(song) {
    const candidates = []
    if (!song || typeof song !== 'object') return candidates

    pushSongCoverFields(candidates, song)

    const nestedSong = song.song
    if (nestedSong && typeof nestedSong === 'object') {
        pushSongCoverFields(candidates, nestedSong)
    }

    return candidates
}

function preloadImage(url) {
    if (!url || typeof Image === 'undefined') return Promise.resolve(false)

    return new Promise(resolve => {
        const image = new Image()
        let settled = false
        let timer = null
        const finish = success => {
            if (settled) return
            settled = true
            if (timer !== null) window.clearTimeout(timer)
            resolve(success)
        }

        if (typeof window !== 'undefined') {
            timer = window.setTimeout(() => finish(false), IMAGE_LOAD_TIMEOUT_MS)
        }
        image.decoding = 'async'
        image.onload = () => finish(true)
        image.onerror = () => finish(false)
        image.src = url
    })
}

async function preloadCoverCandidates(song) {
    const candidates = getSongCoverCandidates(song)
    if (candidates.length === 0) return ''

    await Promise.allSettled(candidates.map(preloadImage))
    return candidates[0] || ''
}

function getLocalFilePath(song) {
    return song?.url || song?.path || song?.dirPath || ''
}

async function getLocalCover(song) {
    const filePath = getLocalFilePath(song)
    if (!filePath) return null
    if (typeof windowApi === 'undefined' || typeof windowApi.getLocalMusicImage !== 'function') return null
    return windowApi.getLocalMusicImage(filePath)
}

async function getLocalLyric(song) {
    const filePath = getLocalFilePath(song)
    if (!filePath) return null
    if (typeof windowApi === 'undefined' || typeof windowApi.getLocalMusicLyric !== 'function') return null
    const lyric = await windowApi.getLocalMusicLyric(filePath)
    return normalizeLyricPayload(lyric)
}

async function getSirenLyric(song) {
    const sourceId = getSirenPrefetchSourceId(song)
    let lyricUrl = song?.lyricUrl || ''

    if (!lyricUrl && sourceId) {
        const songData = await getSirenSong(sourceId)
        lyricUrl = songData?.lyricUrl || ''
    } else if (sourceId) {
        void getSirenSong(sourceId).catch(() => null)
    }

    if (!lyricUrl) return createEmptyLyric()
    const lyricText = await getSirenLyricText(lyricUrl)
    return { lrc: { lyric: lyricText || '' } }
}

async function prefetchPlaybackUrl(song, preferredQuality) {
    if (!song?.id || song.type === 'local' || isSirenSong(song)) return null
    const quality = getPreferredQuality(preferredQuality)
    return resolveTrackByQualityPreference(song.id, quality)
}

async function prefetchSongAssetsNow(song, options = {}) {
    const assets = {
        key: getSongAssetKey(song),
        coverUrl: '',
        localCover: null,
        lyric: null,
        hasLyric: false,
    }

    const tasks = []

    if (song?.type === 'local') {
        tasks.push(
            getLocalCover(song).then(cover => {
                if (cover) assets.localCover = cover
            })
        )
        tasks.push(
            getLocalLyric(song).then(lyric => assignLyricAsset(assets, lyric))
        )
    } else {
        tasks.push(
            preloadCoverCandidates(song).then(coverUrl => {
                assets.coverUrl = coverUrl
            })
        )

        if (isSirenSong(song)) {
            tasks.push(
                getSirenLyric(song).then(lyric => assignLyricAsset(assets, lyric))
            )
        } else if (song?.id) {
            tasks.push(
                getLyric(song.id).then(lyric => assignLyricAsset(assets, lyric))
            )
            tasks.push(prefetchPlaybackUrl(song, options.quality))
        }
    }

    await Promise.allSettled(tasks)
    return assets
}

export function getPrefetchedSongAssets(song) {
    const key = typeof song === 'string' ? song : getSongAssetKey(song)
    return key ? assetCache.get(key) || null : null
}

export function prefetchSongAssets(song, options = {}) {
    const key = getSongAssetKey(song)
    if (!key) return Promise.resolve(null)

    const cachedAssets = assetCache.get(key)
    if (cachedAssets && options.force !== true) return Promise.resolve(cachedAssets)

    const pendingPrefetch = pendingPrefetches.get(key)
    if (pendingPrefetch && options.force !== true) return pendingPrefetch

    const prefetchPromise = runIdleTask(() => prefetchSongAssetsNow(song, options), {
        immediate: options.immediate === true,
        timeout: IDLE_TIMEOUT_MS,
        fallbackDelay: 300,
    })
        .then(assets => {
            rememberAssets(key, assets)
            return assets
        })
        .catch(error => {
            console.warn('预加载歌曲资源失败:', error)
            return null
        })
        .finally(() => {
            if (pendingPrefetches.get(key) === prefetchPromise) {
                pendingPrefetches.delete(key)
            }
        })

    pendingPrefetches.set(key, prefetchPromise)
    return prefetchPromise
}

export function prefetchSongAssetList(songs, options = {}) {
    if (!Array.isArray(songs) || songs.length === 0) return []
    const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : songs.length
    const selectedSongs = []
    const seenKeys = new Set()

    for (const song of songs) {
        const key = getSongAssetKey(song)
        if (!key || seenKeys.has(key)) continue
        seenKeys.add(key)
        selectedSongs.push(song)
        if (selectedSongs.length >= limit) break
    }

    return selectedSongs.map(song => prefetchSongAssets(song, options))
}
