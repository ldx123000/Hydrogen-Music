import { getSongDetail } from '../../api/song'
import { getSirenLyricText, getSirenSong } from '../../api/siren'
import { getPreferredQuality } from '../quality'
import { resolveTrackByQualityPreference } from '../musicUrlResolver'
import { getSirenSourceId, isSirenSong } from '../siren'
import { getSongCoverUrl, normalizeCoverUrl, withCoverParam } from '../coverBackdrop'
import { runIdleTask } from './idleTask'
import { createEmptyLyric, normalizeLyricPayload } from './lyricPayload'
import { getLyricWithCloudFallback } from './lyricFallback'

const PREFETCH_CACHE_LIMIT = 80
const IDLE_TIMEOUT_MS = 1800
const IMAGE_LOAD_TIMEOUT_MS = 10000
const IMAGE_COVER_SIZES = [100, 128, 256, 512, 640, 1024]
const COVER_FIELDS = ['al.picUrl', 'album.picUrl', 'coverUrl', 'coverDeUrl', 'blurPicUrl', 'img1v1Url']
const QUALITY_FIELDS = ['l', 'm', 'h', 'sq', 'hr']

const assetCache = new Map()
const pendingPrefetches = new Map()

function isBlankValue(value) {
    return value == null || value === ''
}

function normalizeId(value) {
    if (isBlankValue(value)) return ''
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

function pushCoverCandidate(candidates, url) {
    const normalizedUrl = normalizeCoverUrl(url)
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

    pushCoverCandidate(candidates, getSongCoverUrl(song))
    pushSongCoverFields(candidates, song)

    const nestedSong = song.song
    if (nestedSong && typeof nestedSong === 'object') {
        pushSongCoverFields(candidates, nestedSong)
    }

    return candidates
}

function getSongAlbumCoverUrl(song) {
    if (!song || typeof song !== 'object') return ''
    const nestedSong = song.song && typeof song.song === 'object' ? song.song : null
    return normalizeCoverUrl(
        song.al?.picUrl ||
        song.album?.picUrl ||
        nestedSong?.al?.picUrl ||
        nestedSong?.album?.picUrl ||
        ''
    )
}

function hasRemoteSongMetadata(song) {
    if (!song || typeof song !== 'object') return true
    return !!(
        song.name &&
        Array.isArray(song.ar) &&
        song.ar.length > 0 &&
        getSongAlbumCoverUrl(song)
    )
}

function shouldHydrateRemoteSongMetadata(song) {
    if (!song?.id || typeof song !== 'object') return false
    if (song.type === 'fm') return true
    return !hasRemoteSongMetadata(song)
}

function assignIfMissing(target, key, value) {
    if (!isBlankValue(target[key])) return
    if (isBlankValue(value)) return
    target[key] = value
}

function assignArrayIfMissing(target, key, value) {
    if (Array.isArray(target[key]) && target[key].length > 0) return
    if (!Array.isArray(value) || value.length === 0) return
    target[key] = value
}

function mergeAlbumMetadata(targetAlbum, sourceAlbum) {
    if (!sourceAlbum || typeof sourceAlbum !== 'object') return targetAlbum || null
    const nextAlbum = targetAlbum && typeof targetAlbum === 'object' ? targetAlbum : {}
    assignIfMissing(nextAlbum, 'id', sourceAlbum.id)
    assignIfMissing(nextAlbum, 'name', sourceAlbum.name)
    if (sourceAlbum.picUrl) nextAlbum.picUrl = normalizeCoverUrl(sourceAlbum.picUrl)
    if (sourceAlbum.blurPicUrl) nextAlbum.blurPicUrl = normalizeCoverUrl(sourceAlbum.blurPicUrl)
    return nextAlbum
}

function mergeSongMetadata(song, detail) {
    if (!song || typeof song !== 'object' || !detail || typeof detail !== 'object') return

    assignIfMissing(song, 'name', detail.name)
    assignIfMissing(song, 'dt', detail.dt)
    assignIfMissing(song, 'duration', detail.dt || detail.duration)
    const detailCoverUrl = getSongCoverUrl(detail)
    if (detailCoverUrl) song.coverUrl = detailCoverUrl
    if (detail.blurPicUrl) song.blurPicUrl = normalizeCoverUrl(detail.blurPicUrl)
    if (detail.img1v1Url) song.img1v1Url = normalizeCoverUrl(detail.img1v1Url)
    assignArrayIfMissing(song, 'ar', detail.ar)
    assignArrayIfMissing(song, 'tns', detail.tns)
    assignArrayIfMissing(song, 'transNames', detail.transNames)

    const detailAlbum = detail.al || detail.album
    const mergedAl = mergeAlbumMetadata(song.al, detailAlbum)
    if (mergedAl) song.al = mergedAl
    const mergedAlbum = mergeAlbumMetadata(song.album, detailAlbum)
    if (mergedAlbum) {
        song.album = mergedAlbum
    } else if (!song.album && mergedAl) {
        song.album = mergedAl
    }

    QUALITY_FIELDS.forEach(levelKey => {
        assignIfMissing(song, levelKey, detail[levelKey])
    })
}

export async function hydrateRemoteSongMetadata(song) {
    if (!shouldHydrateRemoteSongMetadata(song)) return

    try {
        const result = await getSongDetail(song.id)
        const detail = Array.isArray(result?.songs) ? result.songs[0] : null
        mergeSongMetadata(song, detail)
    } catch (_) {
        // Metadata prefetch is best-effort; normal playback can still continue.
    }
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
        const sirenSong = isSirenSong(song)
        const metadataTask = sirenSong ? Promise.resolve() : hydrateRemoteSongMetadata(song)
        tasks.push(
            metadataTask
                .then(() => preloadCoverCandidates(song))
                .then(coverUrl => {
                    assets.coverUrl = coverUrl
                })
        )

        if (sirenSong) {
            tasks.push(
                getSirenLyric(song).then(lyric => assignLyricAsset(assets, lyric))
            )
        } else if (song?.id) {
            tasks.push(
                getLyricWithCloudFallback(song).then(lyric => assignLyricAsset(assets, lyric))
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
