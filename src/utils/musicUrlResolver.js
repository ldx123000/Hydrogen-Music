import { getMusicUrl } from '../api/song'
import { getPreferredQuality } from './quality'

const ADVANCED_QUALITY_LEVELS = new Set(['jyeffect', 'sky', 'dolby', 'jymaster'])
const LINEAR_FALLBACK_ORDER = ['hires', 'lossless', 'exhigh', 'higher', 'standard']
const LINEAR_LEVEL_RANK = new Map(LINEAR_FALLBACK_ORDER.map((level, index) => [level, index]))

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

async function requestTrack(id, level) {
    const songInfo = await getMusicUrl(id, level)
    return extractTrackInfo(songInfo)
}

export async function resolveTrackByQualityPreference(id, preferredLevel) {
    const normalizedPreferredLevel = getPreferredQuality(preferredLevel)
    const preferredTrack = await requestTrack(id, normalizedPreferredLevel)

    if (!ADVANCED_QUALITY_LEVELS.has(normalizedPreferredLevel)) return preferredTrack
    if (isPlayableTrack(preferredTrack) && getTrackLevel(preferredTrack) === normalizedPreferredLevel) {
        return preferredTrack
    }

    let firstPlayableFallbackTrack = null
    for (const fallbackLevel of LINEAR_FALLBACK_ORDER) {
        const fallbackTrack = await requestTrack(id, fallbackLevel)
        if (!isPlayableTrack(fallbackTrack)) continue

        if (!firstPlayableFallbackTrack) firstPlayableFallbackTrack = fallbackTrack
        if (isLinearFallbackMatch(fallbackLevel, getTrackLevel(fallbackTrack))) return fallbackTrack
    }

    if (firstPlayableFallbackTrack) return firstPlayableFallbackTrack
    return preferredTrack
}
