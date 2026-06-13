import { getMatchedMusicUrl, getMusicUrl } from '../api/song'
import { getPreferredQuality } from './quality'
import { hasNoCopyrightAlternativeHint } from './restrictedPlaybackAvailability'

const ADVANCED_QUALITY_LEVELS = new Set(['jyeffect', 'sky', 'dolby', 'jymaster'])
const LINEAR_FALLBACK_ORDER = ['hires', 'lossless', 'exhigh', 'higher', 'standard']
const LINEAR_LEVEL_RANK = new Map(LINEAR_FALLBACK_ORDER.map((level, index) => [level, index]))
const TRACK_INFO_CACHE_TTL_MS = 10 * 60 * 1000
const TRACK_INFO_CACHE_LIMIT = 80
const trackInfoCache = new Map()
const pendingTrackInfoRequests = new Map()
const REMOTE_AUDIO_METADATA_CACHE_TTL_MS = 30 * 60 * 1000
const REMOTE_AUDIO_METADATA_CACHE_LIMIT = 80
const remoteAudioMetadataCache = new Map()
const pendingRemoteAudioMetadataRequests = new Map()
const MATCHED_AUDIO_SAMPLE_RATE = 44100
const MATCHED_AUDIO_BITRATE_BY_LEVEL = Object.freeze({
    standard: 128000,
    higher: 192000,
    exhigh: 320000,
})
const IPHONE_PLAYBACK_REQUEST_PARAMS = Object.freeze({
    ua: 'NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)',
    cookie: 'os=iPhone OS; appver=9.0.90; osver=16.2; channel=distribution',
})

function extractTrackInfo(songInfo) {
    return songInfo && songInfo.data && songInfo.data[0] ? songInfo.data[0] : null
}

function inferTrackType(url, fallback = '') {
    const normalizedFallback = String(fallback || '').trim().replace(/^\./, '').toLowerCase()
    if (normalizedFallback) return normalizedFallback

    try {
        const pathname = new URL(url).pathname || ''
        const matched = pathname.match(/\.([a-z0-9]+)$/i)
        return matched?.[1]?.toLowerCase() || ''
    } catch (_) {
        const matched = String(url || '').match(/\.([a-z0-9]+)(?:\?|#|$)/i)
        return matched?.[1]?.toLowerCase() || ''
    }
}

function normalizePositiveNumber(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function normalizeAudioType(value) {
    const normalized = String(value || '').trim().replace(/^\./, '').toLowerCase()
    return /^[a-z0-9]{1,8}$/.test(normalized) ? normalized : ''
}

function inferMatchedLevelFromMetadata(trackInfo, metadata) {
    const type = normalizeAudioType(metadata?.type) || normalizeAudioType(trackInfo?.type)
    const sampleRate = normalizePositiveNumber(metadata?.sampleRate)
    const bitsPerSample = normalizePositiveNumber(metadata?.bitsPerSample)
    const bitrate = normalizePositiveNumber(metadata?.bitrate)

    if (type === 'flac' || metadata?.lossless === true) {
        return sampleRate > 48000 || bitsPerSample > 16 ? 'hires' : 'lossless'
    }
    if (bitrate > 0) {
        if (bitrate <= 128000) return 'standard'
        if (bitrate <= 192000) return 'higher'
        return 'exhigh'
    }
    return trackInfo?.level || 'exhigh'
}

function getRemoteAudioMetadataCacheKey(url) {
    return typeof url === 'string' && url.trim() ? url.trim() : ''
}

function readCachedRemoteAudioMetadata(cacheKey) {
    const cached = cacheKey ? remoteAudioMetadataCache.get(cacheKey) : null
    if (!cached) return null
    if (Date.now() - cached.createdAt > REMOTE_AUDIO_METADATA_CACHE_TTL_MS) {
        remoteAudioMetadataCache.delete(cacheKey)
        return null
    }
    return cached.metadata
}

function writeCachedRemoteAudioMetadata(cacheKey, metadata) {
    if (!cacheKey || !metadata || typeof metadata !== 'object') return
    remoteAudioMetadataCache.set(cacheKey, {
        metadata,
        createdAt: Date.now(),
    })

    if (remoteAudioMetadataCache.size <= REMOTE_AUDIO_METADATA_CACHE_LIMIT) return
    const oldestKey = remoteAudioMetadataCache.keys().next().value
    if (oldestKey) remoteAudioMetadataCache.delete(oldestKey)
}

async function requestRemoteAudioMetadata(url) {
    if (typeof windowApi === 'undefined' || typeof windowApi.getRemoteAudioMetadata !== 'function') return null
    const cacheKey = getRemoteAudioMetadataCacheKey(url)
    if (!cacheKey) return null

    const cached = readCachedRemoteAudioMetadata(cacheKey)
    if (cached) return cached

    const pendingRequest = pendingRemoteAudioMetadataRequests.get(cacheKey)
    if (pendingRequest) return pendingRequest

    const requestPromise = windowApi.getRemoteAudioMetadata({
        url: cacheKey,
        option: {
            timeout: 8000,
            headers: {
                Accept: 'audio/*,*/*',
            },
        },
    }).then(metadata => {
        if (metadata && typeof metadata === 'object') {
            writeCachedRemoteAudioMetadata(cacheKey, metadata)
            return metadata
        }
        return null
    }).catch(error => {
        console.warn('获取替代音源元数据失败:', error)
        return null
    }).finally(() => {
        if (pendingRemoteAudioMetadataRequests.get(cacheKey) === requestPromise) {
            pendingRemoteAudioMetadataRequests.delete(cacheKey)
        }
    })

    pendingRemoteAudioMetadataRequests.set(cacheKey, requestPromise)
    return requestPromise
}

function applyMatchedAudioMetadata(trackInfo, metadata) {
    if (!trackInfo || !metadata || typeof metadata !== 'object') return trackInfo

    const sampleRate = normalizePositiveNumber(metadata.sampleRate)
    const bitrate = normalizePositiveNumber(metadata.bitrate)
    const size = normalizePositiveNumber(metadata.size)
    const bitsPerSample = normalizePositiveNumber(metadata.bitsPerSample)
    const type = normalizeAudioType(metadata.type) || trackInfo.type
    const level = inferMatchedLevelFromMetadata({ ...trackInfo, type }, metadata)

    return {
        ...trackInfo,
        type,
        encodeType: type,
        level,
        sr: sampleRate ? Math.round(sampleRate) : trackInfo.sr,
        br: bitrate ? Math.round(bitrate) : trackInfo.br,
        size: size ? Math.round(size) : trackInfo.size,
        ...(bitsPerSample ? { bitsPerSample: Math.round(bitsPerSample) } : {}),
        ...(metadata.duration ? { duration: metadata.duration } : {}),
        ...(metadata.mimeType ? { mimeType: metadata.mimeType } : {}),
        ...(metadata.container ? { container: metadata.container } : {}),
        ...(metadata.codec ? { codec: metadata.codec } : {}),
        ...(metadata.lossless === true ? { lossless: true } : {}),
    }
}

function normalizeMatchedTrackInfo(id, matchedInfo, preferredLevel) {
    if (!matchedInfo || typeof matchedInfo !== 'object') return null
    const url = matchedInfo.proxyUrl || matchedInfo.data
    if (!url || typeof url !== 'string') return null

    const type = inferTrackType(url, 'mp3')
    const normalizedPreferredLevel = getPreferredQuality(preferredLevel)
    const level = type === 'flac'
        ? (normalizedPreferredLevel === 'hires' ? 'hires' : 'lossless')
        : (normalizedPreferredLevel === 'standard' || normalizedPreferredLevel === 'higher' ? normalizedPreferredLevel : 'exhigh')
    const fallbackBr = type === 'flac' ? 0 : MATCHED_AUDIO_BITRATE_BY_LEVEL[level] || MATCHED_AUDIO_BITRATE_BY_LEVEL.exhigh
    return {
        id: Number(id) || id,
        url,
        br: fallbackBr,
        size: 0,
        md5: '',
        code: 200,
        expi: 0,
        type,
        gain: 0,
        fee: 0,
        uf: null,
        payed: 0,
        flag: 0,
        canExtend: false,
        freeTrialInfo: null,
        level,
        encodeType: type,
        sr: MATCHED_AUDIO_SAMPLE_RATE,
        source: 'matched-source',
    }
}

function isPlayableTrack(trackInfo) {
    return !!(trackInfo && trackInfo.url)
}

function getTrackLevel(trackInfo) {
    return typeof trackInfo?.level === 'string' ? trackInfo.level : ''
}

function isLinearFallbackMatch(requestedLevel, actualLevel) {
    const requestedRank = LINEAR_LEVEL_RANK.get(requestedLevel)
    const actualRank = LINEAR_LEVEL_RANK.get(actualLevel)
    if (requestedRank === undefined || actualRank === undefined) return false
    // 例如请求 hires，返回 lossless/exhigh 也视为命中（按链路向下自动降级）。
    return actualRank >= requestedRank
}

function getPlaybackRequestParams(preferredLevel) {
    if (!ADVANCED_QUALITY_LEVELS.has(preferredLevel)) return {}
    return IPHONE_PLAYBACK_REQUEST_PARAMS
}

async function requestTrack(id, level, requestParams = {}) {
    const songInfo = await getMusicUrl(id, level, requestParams)
    return extractTrackInfo(songInfo)
}

async function requestMatchedTrack(id, preferredLevel) {
    const matchedInfo = await getMatchedMusicUrl(id)
    const trackInfo = normalizeMatchedTrackInfo(id, matchedInfo, preferredLevel)
    if (!trackInfo) return null
    const metadata = await requestRemoteAudioMetadata(trackInfo.url)
    return applyMatchedAudioMetadata(trackInfo, metadata)
}

function getTrackCacheKey(id, preferredLevel) {
    const normalizedId = id === null || id === undefined ? '' : String(id)
    return normalizedId ? `${normalizedId}:${preferredLevel}` : ''
}

function readCachedTrackInfo(cacheKey) {
    const cached = cacheKey ? trackInfoCache.get(cacheKey) : null
    if (!cached) return null
    if (Date.now() - cached.createdAt > TRACK_INFO_CACHE_TTL_MS) {
        trackInfoCache.delete(cacheKey)
        return null
    }
    return cached.trackInfo
}

function writeCachedTrackInfo(cacheKey, trackInfo) {
    if (!cacheKey || !isPlayableTrack(trackInfo)) return
    trackInfoCache.set(cacheKey, {
        trackInfo,
        createdAt: Date.now(),
    })

    if (trackInfoCache.size <= TRACK_INFO_CACHE_LIMIT) return
    const oldestKey = trackInfoCache.keys().next().value
    if (oldestKey) trackInfoCache.delete(oldestKey)
}

async function resolveTrackByQualityPreferenceUncached(id, normalizedPreferredLevel) {
    const playbackRequestParams = getPlaybackRequestParams(normalizedPreferredLevel)

    if (!ADVANCED_QUALITY_LEVELS.has(normalizedPreferredLevel)) {
        return requestTrack(id, normalizedPreferredLevel, playbackRequestParams)
    }

    let firstRequestError = null
    let preferredTrack = null
    try {
        preferredTrack = await requestTrack(id, normalizedPreferredLevel, playbackRequestParams)
    } catch (error) {
        firstRequestError = error
    }

    if (isPlayableTrack(preferredTrack) && getTrackLevel(preferredTrack) === normalizedPreferredLevel) {
        return preferredTrack
    }

    let firstPlayableFallbackTrack = null
    for (const fallbackLevel of LINEAR_FALLBACK_ORDER) {
        let fallbackTrack = null
        try {
            fallbackTrack = await requestTrack(id, fallbackLevel, playbackRequestParams)
        } catch (error) {
            if (!firstRequestError) firstRequestError = error
            continue
        }
        if (!isPlayableTrack(fallbackTrack)) continue

        if (!firstPlayableFallbackTrack) firstPlayableFallbackTrack = fallbackTrack
        if (isLinearFallbackMatch(fallbackLevel, getTrackLevel(fallbackTrack))) return fallbackTrack
    }

    if (firstPlayableFallbackTrack) return firstPlayableFallbackTrack
    if (!preferredTrack && firstRequestError) throw firstRequestError
    return preferredTrack
}

export async function resolveTrackByQualityPreference(id, preferredLevel, options = {}) {
    const normalizedPreferredLevel = getPreferredQuality(preferredLevel)
    const cacheKey = getTrackCacheKey(id, normalizedPreferredLevel)

    if (!options.force) {
        const cachedTrackInfo = readCachedTrackInfo(cacheKey)
        if (cachedTrackInfo) return cachedTrackInfo
        const pendingRequest = pendingTrackInfoRequests.get(cacheKey)
        if (pendingRequest) return pendingRequest
    }

    const requestPromise = resolveTrackByQualityPreferenceUncached(id, normalizedPreferredLevel)
        .then(trackInfo => {
            writeCachedTrackInfo(cacheKey, trackInfo)
            return trackInfo
        })
        .finally(() => {
            if (pendingTrackInfoRequests.get(cacheKey) === requestPromise) {
                pendingTrackInfoRequests.delete(cacheKey)
            }
        })

    if (cacheKey) pendingTrackInfoRequests.set(cacheKey, requestPromise)
    return requestPromise
}

export async function resolveMatchedTrackByQualityPreference(id, preferredLevel) {
    return requestMatchedTrack(id, preferredLevel)
}

export async function resolveTrackWithMatchedFallback(song, preferredLevel, options = {}) {
    const playbackId = options.id ?? song?.id
    const trackInfo = playbackId
        ? await resolveTrackByQualityPreference(playbackId, preferredLevel, {
            force: options.force === true,
        })
        : null
    if (isPlayableTrack(trackInfo) || !hasNoCopyrightAlternativeHint(song)) return trackInfo
    return resolveMatchedTrackByQualityPreference(song?.id ?? playbackId, preferredLevel)
}
