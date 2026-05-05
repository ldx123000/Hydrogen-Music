import { search as searchMusic } from '../../api/other'
import { getLyric } from '../../api/song'
import { getCloudLyric } from '../../api/cloud'
import pinia from '../../store/pinia'
import { useCloudStore } from '../../store/cloudStore'
import { useUserStore } from '../../store/userStore'
import { createUnavailableLyric, hasUsableLyricPayload, isPlaceholderLyricPayload, normalizeLyricPayload, splitCombinedCloudLyricPayload } from './lyricPayload'

const CLOUD_LYRIC_SEARCH_LIMIT = 8
const CLOUD_LYRIC_DURATION_TOLERANCE_MS = 8000
const PUBLIC_LYRIC_API_BASE = 'https://lrclib.net/api'
const PUBLIC_LYRIC_TIMEOUT_MS = 6000
const PUBLIC_LYRIC_DURATION_TOLERANCE_SEC = 8
const ARTIST_NAME_SPLIT_REGEX = /\s*(?:\/|／|、|,|，|;|；|&|＆|\band\b|\bwith\b|\bx\b|×|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i
const CLOUD_ARTIST_NAME_SPLIT_REGEX = /\s*[;；]\s*/
const cloudLyricFallbackCache = new Map()
const UNKNOWN_ARTIST_NAMES = new Set(['未知艺术家', 'unknown', '<unknown>', '未知', ''])

function normalizeCloudArtistNameKey(value) {
    return String(value || '').trim().normalize('NFKC').toLowerCase()
}

function splitCloudArtistNames(value) {
    const name = String(value || '').trim()
    if (!name) return []
    return name.split(CLOUD_ARTIST_NAME_SPLIT_REGEX).map(item => item.trim()).filter(Boolean)
}

function normalizeCloudSongArtists(song) {
    const artists = []
    const seen = new Set()
    const pushArtist = artist => {
        const name = String(artist?.name || '').trim()
        const key = normalizeCloudArtistNameKey(name)
        if (!key || seen.has(key)) return
        seen.add(key)
        artists.push(artist)
    }
    const pushArtistName = (value, sourceArtist) => {
        const names = splitCloudArtistNames(value)
        if (names.length > 1) {
            names.forEach(name => pushArtist({ name }))
            return
        }

        const name = names[0] || String(value || '').trim()
        if (!name) return
        pushArtist(sourceArtist && typeof sourceArtist === 'object' ? { ...sourceArtist, name } : { name })
    }

    if (Array.isArray(song?.ar)) song.ar.forEach(artist => pushArtistName(artist?.name || artist, artist))
    if (artists.length === 0) pushArtistName(song?.artist || song?.artistsName)
    if (artists.length === 0) return song

    const artistText = artists.map(artist => artist.name).join(' / ')
    return {
        ...song,
        ar: artists,
        artist: artistText,
        artistsName: artistText,
    }
}

export function markCloudDiskSong(song, cloudItem = {}) {
    if (!song || typeof song !== 'object') return null
    return {
        ...normalizeCloudSongArtists(song),
        hmCloudDisk: true,
        hmCloudId: cloudItem?.id ?? cloudItem?.songId ?? '',
        hmCloudFileName: cloudItem?.fileName || '',
        hmCloudSongName: cloudItem?.songName || '',
    }
}

export function isCloudDiskSong(song) {
    if (!song || typeof song !== 'object') return false
    return song.hmCloudDisk === true || !!song.pc || song?.privilege?.cs === true
}

function stripFileExtension(value) {
    return String(value || '').replace(/\.(mp3|aac|wma|wav|ogg|m4a|ape|flac|cue|aiff|aif|alac|dsf)$/i, '')
}

function normalizeComparableText(value) {
    return stripFileExtension(value)
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[\s_\-.,，。:：;；'"`“”‘’()[\]（）【】<>《》!！?？/\\|]+/g, '')
        .trim()
}

function getSongTitle(song) {
    return stripFileExtension(song?.hmCloudSongName || song?.name || song?.localName || song?.hmCloudFileName || '').trim()
}

function collectArtistNames(song) {
    const names = []
    const pushName = value => {
        const name = String(value || '').trim()
        if (name) names.push(name)
    }

    if (Array.isArray(song?.ar)) song.ar.forEach(artist => pushName(artist?.name || artist))
    if (Array.isArray(song?.artists)) song.artists.forEach(artist => pushName(artist?.name || artist))
    pushName(song?.artist)
    pushName(song?.artistsName)

    return Array.from(new Set(names))
}

function splitArtistNameAliases(value) {
    const name = String(value || '').trim()
    if (!name) return []

    const aliases = name
        .split(ARTIST_NAME_SPLIT_REGEX)
        .map(alias => String(alias || '').trim())
        .filter(Boolean)

    aliases.push(name)
    return Array.from(new Set(aliases))
}

function collectArtistAliases(song) {
    const aliases = []
    collectArtistNames(song).forEach(name => {
        splitArtistNameAliases(name).forEach(alias => aliases.push(alias))
    })
    return Array.from(new Set(aliases))
}

function getMeaningfulArtistNames(song) {
    return collectArtistAliases(song)
        .map(name => String(name || '').trim())
        .filter(name => !UNKNOWN_ARTIST_NAMES.has(name.toLowerCase()) && !UNKNOWN_ARTIST_NAMES.has(name))
}

function getSongDurationMs(song) {
    const rawDuration = song?.dt ?? song?.duration ?? song?.time
    const duration = Number(rawDuration)
    return Number.isFinite(duration) && duration > 0 ? duration : 0
}

function getSongDurationSec(song) {
    const durationMs = getSongDurationMs(song)
    return durationMs ? Math.round(durationMs / 1000) : 0
}

function getAlbumName(song) {
    return String(song?.al?.name || song?.album?.name || song?.albumName || '').trim()
}

function getCloudLyricFallbackCacheKey(song) {
    return [
        song?.id || '',
        song?.hmCloudId || '',
        getSongTitle(song),
        collectArtistNames(song).join('/'),
        getSongDurationMs(song),
    ].join('|')
}

function getCurrentCloudLyricUserId() {
    try {
        const userStore = useUserStore()
        const userId = userStore?.user?.userId
        return userId == null || userId === '' ? '' : String(userId)
    } catch (_) {
        return ''
    }
}

function getCloudDiskSongId(song) {
    const value = song?.hmCloudId ?? song?.cloudSongId ?? song?.songId ?? ''
    return value == null || value === '' ? '' : String(value)
}

function getSongIdLike(value) {
    if (value && typeof value === 'object') {
        const id = value.id
        return id == null || id === '' ? '' : String(id)
    }
    return value == null || value === '' ? '' : String(value)
}

function getCloudStoreSongItemByTrackId(trackId) {
    const normalizedTrackId = getSongIdLike(trackId)
    if (!normalizedTrackId) return null

    try {
        const cloudStore = useCloudStore(pinia)
        const cloudSongs = Array.isArray(cloudStore?.cloudSongs) ? cloudStore.cloudSongs : []
        return cloudSongs.find(item => {
            const candidateIds = [
                item?.simpleSong?.id,
                item?.songId,
            ].map(getSongIdLike).filter(Boolean)
            return candidateIds.includes(normalizedTrackId)
        }) || null
    } catch (_) {
        return null
    }
}

function resolveCloudDiskSong(songOrId) {
    const song = songOrId && typeof songOrId === 'object' ? songOrId : null
    const trackId = getSongIdLike(song || songOrId)
    const cloudItem = getCloudStoreSongItemByTrackId(trackId)
    if (!cloudItem) return song

    const cloudSong = markCloudDiskSong(cloudItem?.simpleSong, cloudItem)
    if (!song || typeof song !== 'object') return cloudSong

    return {
        ...cloudSong,
        ...song,
        hmCloudDisk: true,
        hmCloudId: song.hmCloudId || cloudSong.hmCloudId,
        hmCloudFileName: song.hmCloudFileName || cloudSong.hmCloudFileName,
        hmCloudSongName: song.hmCloudSongName || cloudSong.hmCloudSongName,
    }
}

function withLyricSource(lyric, source) {
    if (!lyric || typeof lyric !== 'object') return lyric
    return lyric.hmLyricSource ? lyric : { ...lyric, hmLyricSource: source }
}

function getSearchKeywords(song) {
    const title = getSongTitle(song)
    if (!title) return ''

    const artists = getMeaningfulArtistNames(song)
    return [title, artists[0] || ''].filter(Boolean).join(' ')
}

function getSearchKeywordList(song) {
    const title = getSongTitle(song)
    if (!title) return []

    const keywords = []
    const titleWithArtist = getSearchKeywords(song)
    if (titleWithArtist) keywords.push(titleWithArtist)
    if (!keywords.includes(title)) keywords.push(title)
    return keywords
}

function candidateArtists(candidate) {
    return collectArtistAliases(candidate).map(normalizeComparableText).filter(Boolean)
}

function publicCandidateTitle(candidate) {
    return candidate?.trackName || candidate?.name || ''
}

function splitPublicArtistNames(value) {
    const fullName = normalizeComparableText(value)
    const names = String(value || '')
        .split(/\s*(?:,|，|、|\/|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i)
        .map(normalizeComparableText)
        .filter(Boolean)

    if (fullName) names.push(fullName)
    return Array.from(new Set(names))
}

function publicCandidateArtists(candidate) {
    return splitPublicArtistNames(candidate?.artistName || '')
}

function hasArtistMatch(targetArtists, candidateArtistNames) {
    if (!targetArtists.length || !candidateArtistNames.length) return false
    return targetArtists.some(targetArtist => {
        return candidateArtistNames.some(candidateArtist => {
            return candidateArtist === targetArtist || candidateArtist.includes(targetArtist) || targetArtist.includes(candidateArtist)
        })
    })
}

function scoreCandidate(candidate, song) {
    if (!candidate?.id || String(candidate.id) === String(song?.id)) return -1

    const targetTitle = normalizeComparableText(getSongTitle(song))
    const candidateTitle = normalizeComparableText(candidate.name)
    if (!targetTitle || !candidateTitle) return -1

    const exactTitle = candidateTitle === targetTitle
    const looseTitle = candidateTitle.includes(targetTitle) || targetTitle.includes(candidateTitle)
    if (!exactTitle && !looseTitle) return -1

    const targetArtists = getMeaningfulArtistNames(song).map(normalizeComparableText).filter(Boolean)
    const artists = candidateArtists(candidate)
    const artistMatch = targetArtists.length > 0 && artists.some(name => targetArtists.includes(name))
    const targetAlbum = normalizeComparableText(getAlbumName(song))
    const candidateAlbum = normalizeComparableText(candidate?.al?.name || candidate?.album?.name || '')
    const albumMatch = !!targetAlbum
        && !!candidateAlbum
        && (candidateAlbum === targetAlbum || candidateAlbum.includes(targetAlbum) || targetAlbum.includes(candidateAlbum))

    const targetDuration = getSongDurationMs(song)
    const candidateDuration = getSongDurationMs(candidate)
    const durationDelta = targetDuration && candidateDuration ? Math.abs(targetDuration - candidateDuration) : Infinity
    const durationClose = durationDelta <= CLOUD_LYRIC_DURATION_TOLERANCE_MS

    const hasStrongSecondarySignal = artistMatch || albumMatch || durationClose
    if (!exactTitle && !looseTitle) return -1
    if (!exactTitle && !hasStrongSecondarySignal) return -1

    let score = exactTitle ? 60 : 30
    if (targetArtists.length === 0 && exactTitle) score += 10
    if (artistMatch) score += 30
    if (albumMatch) score += 20
    if (durationClose) score += Math.max(0, 20 - Math.floor(durationDelta / 1000))
    if (exactTitle && !hasStrongSecondarySignal) score += 5
    return score
}

function getPublicLyricText(candidate) {
    return String(candidate?.syncedLyrics || candidate?.plainLyrics || '').trim()
}

function buildPublicLyricPayload(candidate) {
    const lyricText = getPublicLyricText(candidate)
    if (!lyricText) return null

    return {
        lrc: { lyric: lyricText },
        tlyric: { lyric: '' },
        romalrc: { lyric: '' },
        hmLyricSource: 'lrclib',
    }
}

function scorePublicLyricCandidate(candidate, song) {
    const lyricText = getPublicLyricText(candidate)
    if (!lyricText) return -1

    const targetTitle = normalizeComparableText(getSongTitle(song))
    const candidateTitle = normalizeComparableText(publicCandidateTitle(candidate))
    if (!targetTitle || !candidateTitle) return -1

    const exactTitle = candidateTitle === targetTitle
    const looseTitle = candidateTitle.includes(targetTitle) || targetTitle.includes(candidateTitle)
    if (!exactTitle && !looseTitle) return -1

    const targetArtists = getMeaningfulArtistNames(song).map(normalizeComparableText).filter(Boolean)
    const artistMatch = hasArtistMatch(targetArtists, publicCandidateArtists(candidate))

    const targetDurationSec = getSongDurationSec(song)
    const candidateDurationSec = Number(candidate?.duration)
    const durationDelta = targetDurationSec && Number.isFinite(candidateDurationSec)
        ? Math.abs(targetDurationSec - candidateDurationSec)
        : Infinity
    const durationClose = durationDelta <= PUBLIC_LYRIC_DURATION_TOLERANCE_SEC

    if (targetDurationSec) {
        if (!durationClose) return -1
    } else if (!exactTitle || (targetArtists.length > 0 && !artistMatch)) {
        return -1
    }

    let score = durationClose ? 100 : 50
    if (exactTitle) score += 30
    else if (looseTitle) score += 10
    if (artistMatch) score += 30
    if (durationClose) score += Math.max(0, 20 - Math.floor(durationDelta))
    if (candidate?.syncedLyrics) score += 10
    return score
}

function buildPublicLyricQuery(song, options = {}) {
    const title = getSongTitle(song)
    if (!title) return null

    const { includeArtist = true, includeAlbum = true } = options
    const artists = getMeaningfulArtistNames(song)
    const durationSec = getSongDurationSec(song)
    if (!artists.length && !durationSec) return null

    const params = new URLSearchParams()
    params.set('track_name', title)
    if (includeArtist && artists[0]) params.set('artist_name', artists[0])
    const albumName = getAlbumName(song)
    if (includeAlbum && albumName) params.set('album_name', albumName)
    if (durationSec) params.set('duration', String(durationSec))
    return params
}

async function requestPublicLyricEndpoint(endpoint, params) {
    if (typeof fetch !== 'function' || !params) return null

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), PUBLIC_LYRIC_TIMEOUT_MS) : null

    try {
        const response = await fetch(`${PUBLIC_LYRIC_API_BASE}/${endpoint}?${params.toString()}`, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            signal: controller?.signal,
        })

        if (response.status === 404) return null
        if (!response.ok) throw new Error(`lrclib-${endpoint}-${response.status}`)
        return response.json()
    } finally {
        if (timer) clearTimeout(timer)
    }
}

function pickPublicLyricCandidate(results, song) {
    const candidates = (Array.isArray(results) ? results : [results]).filter(Boolean)
    const best = candidates
        .map(candidate => ({ candidate, score: scorePublicLyricCandidate(candidate, song) }))
        .filter(item => item.score >= 0)
        .sort((a, b) => b.score - a.score)[0]?.candidate

    return best ? buildPublicLyricPayload(best) : null
}

async function findPublicCloudLyricFallback(song) {
    const exactParams = buildPublicLyricQuery(song)
    const searchParams = buildPublicLyricQuery(song, { includeArtist: false, includeAlbum: false })
    if (!exactParams && !searchParams) return null

    const exactResult = await requestPublicLyricEndpoint('get', exactParams)
    const exactLyric = pickPublicLyricCandidate(exactResult, song)
    if (hasUsableLyricPayload(exactLyric)) return exactLyric

    const searchResult = await requestPublicLyricEndpoint('search', searchParams || exactParams)
    return pickPublicLyricCandidate(searchResult, song)
}

async function findNcmCloudLyricFallback(song) {
    const keywordList = getSearchKeywordList(song)
    if (keywordList.length === 0) return null

    const candidates = []
    const seenCandidateIds = new Set()

    for (const keywords of keywordList) {
        const result = await searchMusic({
            keywords,
            type: 1,
            limit: CLOUD_LYRIC_SEARCH_LIMIT,
            offset: 0,
        })
        const songs = Array.isArray(result?.result?.songs) ? result.result.songs : []
        songs.forEach(candidate => {
            const candidateId = candidate?.id == null ? '' : String(candidate.id)
            if (!candidateId || seenCandidateIds.has(candidateId)) return
            seenCandidateIds.add(candidateId)
            candidates.push(candidate)
        })
    }

    const scoredCandidates = candidates
        .map(candidate => ({ candidate, score: scoreCandidate(candidate, song) }))
        .filter(item => item.score >= 0)
        .sort((a, b) => b.score - a.score)

    for (const { candidate } of scoredCandidates) {
        try {
            const lyric = await getLyric(candidate.id)
            if (hasUsableLyricPayload(lyric)) return lyric
        } catch (_) {}
    }

    return null
}

async function findEmbeddedCloudLyric(song) {
    const userId = getCurrentCloudLyricUserId()
    const cloudSongId = getCloudDiskSongId(song)
    if (!userId || !cloudSongId) return null

    try {
        const rawLyric = await getCloudLyric({
            uid: userId,
            sid: cloudSongId,
            timestamp: Date.now(),
        })
        const lyric = splitCombinedCloudLyricPayload(normalizeLyricPayload(rawLyric))
        if (hasUsableLyricPayload(lyric)) return withLyricSource(lyric, 'cloud')
    } catch (_) {}

    return null
}

async function findCloudLyricFallback(song) {
    const embeddedCloudLyric = await findEmbeddedCloudLyric(song)
    if (hasUsableLyricPayload(embeddedCloudLyric)) return embeddedCloudLyric

    const ncmFallbackLyric = await findNcmCloudLyricFallback(song)
    if (hasUsableLyricPayload(ncmFallbackLyric)) return withLyricSource(ncmFallbackLyric, 'netease-search')
    return findPublicCloudLyricFallback(song)
}

async function getCloudLyricFallback(song) {
    const cacheKey = getCloudLyricFallbackCacheKey(song)
    if (!cacheKey) return null
    if (!cloudLyricFallbackCache.has(cacheKey)) {
        const fallbackPromise = findCloudLyricFallback(song)
            .catch(() => null)
            .then(lyric => {
                if (!hasUsableLyricPayload(lyric)) cloudLyricFallbackCache.delete(cacheKey)
                return lyric
            })
        cloudLyricFallbackCache.set(cacheKey, fallbackPromise)
    }
    return cloudLyricFallbackCache.get(cacheKey)
}

export async function getLyricWithCloudFallback(songOrId) {
    const song = resolveCloudDiskSong(songOrId)
    const lyricId = song ? song.id : songOrId
    const cloudSongId = getCloudDiskSongId(song)
    const hasCloudContext = !!cloudSongId
    let primaryLyric = null
    let primaryError = null

    if (lyricId) {
        try {
            primaryLyric = await getLyric(lyricId)
        } catch (error) {
            primaryError = error
        }
    }

    if (hasUsableLyricPayload(primaryLyric)) return primaryLyric

    if (hasCloudContext || isCloudDiskSong(song)) {
        const fallbackLyric = await getCloudLyricFallback(song)
        if (hasUsableLyricPayload(fallbackLyric)) return fallbackLyric
    }

    if (primaryError) throw primaryError
    if (isPlaceholderLyricPayload(primaryLyric)) return createUnavailableLyric()

    const normalizedPrimaryLyric = normalizeLyricPayload(primaryLyric)
    if (!hasUsableLyricPayload(normalizedPrimaryLyric)) return createUnavailableLyric()
    return normalizedPrimaryLyric
}
