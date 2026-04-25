import { getMusicUrl } from '../api/song'
import { getPreferredQuality } from './quality'

const ADVANCED_QUALITY_LEVELS = new Set(['jyeffect', 'sky', 'dolby', 'jymaster'])
const LINEAR_FALLBACK_ORDER = ['hires', 'lossless', 'exhigh', 'higher', 'standard']
const LINEAR_LEVEL_RANK = new Map(LINEAR_FALLBACK_ORDER.map((level, index) => [level, index]))
const TRACK_INFO_CACHE_TTL_MS = 10 * 60 * 1000
const TRACK_INFO_CACHE_LIMIT = 80
const trackInfoCache = new Map()
const pendingTrackInfoRequests = new Map()
const IPHONE_PLAYBACK_REQUEST_PARAMS = Object.freeze({
    ua: 'NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)',
    cookie: 'os=iPhone OS; appver=9.0.90; osver=16.2; channel=distribution',
})

function extractTrackInfo(songInfo) {
    return songInfo && songInfo.data && songInfo.data[0] ? songInfo.data[0] : null
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
    const preferredTrack = await requestTrack(id, normalizedPreferredLevel, playbackRequestParams)

    if (!ADVANCED_QUALITY_LEVELS.has(normalizedPreferredLevel)) return preferredTrack
    if (isPlayableTrack(preferredTrack) && getTrackLevel(preferredTrack) === normalizedPreferredLevel) {
        return preferredTrack
    }

    let firstPlayableFallbackTrack = null
    for (const fallbackLevel of LINEAR_FALLBACK_ORDER) {
        const fallbackTrack = await requestTrack(id, fallbackLevel, playbackRequestParams)
        if (!isPlayableTrack(fallbackTrack)) continue

        if (!firstPlayableFallbackTrack) firstPlayableFallbackTrack = fallbackTrack
        if (isLinearFallbackMatch(fallbackLevel, getTrackLevel(fallbackTrack))) return fallbackTrack
    }

    if (firstPlayableFallbackTrack) return firstPlayableFallbackTrack
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
