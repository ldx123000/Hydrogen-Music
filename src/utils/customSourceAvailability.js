function isNoCopyrightSong(song) {
    return song?.reason === '无版权' || (song?.noCopyrightRcmd !== null && song?.noCopyrightRcmd !== undefined)
}

function isDelistedSong(song) {
    return song?.reason === '已下架' || Number(song?.privilege?.st) < 0
}

function normalizeReasonText(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function normalizeKnownRestrictionReason(value) {
    const text = normalizeReasonText(value)
    if (!text) return ''
    if (/无版权|暂无版权|版权/.test(text)) return '无版权'
    if (/下架/.test(text)) return '已下架'
    if (/付费专辑/.test(text)) return '付费专辑'
    if (/会员|vip/i.test(text)) return '仅限 VIP 会员'
    return ''
}

function getKnownRestrictionReasonFromDetail(detail) {
    if (!detail || typeof detail !== 'object') return normalizeKnownRestrictionReason(detail)
    return normalizeKnownRestrictionReason(
        detail.reason
        || detail.message
        || detail.msg
        || detail.response?.data?.message
        || detail.response?.data?.msg
        || detail.data?.message
        || detail.data?.msg
    )
}

function formatRestrictedPlaybackFailureMessage(reason) {
    const text = normalizeReasonText(reason)
    return text ? `当前歌曲无法播放，${text}` : '当前歌曲无法播放'
}

export function canTryCustomSourceForRestrictedSong(song) {
    return isNoCopyrightSong(song) || isDelistedSong(song)
}

export function getNoCopyrightRecommendedSongId(song) {
    const recommendedId = song?.noCopyrightRcmd?.songId
    if (recommendedId === undefined || recommendedId === null) return null

    const normalizedId = String(recommendedId).trim()
    if (!normalizedId || normalizedId === String(song?.id ?? '')) return null
    return normalizedId
}

function hasRestrictedPlaybackFallback(song, hasCustomSource) {
    return canTryCustomSourceForRestrictedSong(song)
        && (!!getNoCopyrightRecommendedSongId(song) || hasCustomSource === true)
}

export function hasRestrictedPlaybackAlternative(song, hasCustomSource = false) {
    return hasRestrictedPlaybackFallback(song, hasCustomSource)
}

export function getRestrictedPlaybackFailureMessage(song, detail = null) {
    const explicitReason = normalizeReasonText(song?.reason)
    if (explicitReason) return formatRestrictedPlaybackFailureMessage(explicitReason)

    const detailReason = getKnownRestrictionReasonFromDetail(detail)
    if (detailReason) return formatRestrictedPlaybackFailureMessage(detailReason)

    if (isNoCopyrightSong(song)) return formatRestrictedPlaybackFailureMessage('无版权')
    if (isDelistedSong(song)) return formatRestrictedPlaybackFailureMessage('已下架')
    return formatRestrictedPlaybackFailureMessage('')
}

export async function getCustomSourceAvailability() {
    if (typeof windowApi === 'undefined' || typeof windowApi.getCustomSourceState !== 'function') {
        return {
            enabled: false,
            hasSource: false,
        }
    }

    try {
        const state = await windowApi.getCustomSourceState()
        return {
            enabled: state?.enabled === true,
            hasSource: state?.hasSource === true,
        }
    } catch (_) {
        return {
            enabled: false,
            hasSource: false,
        }
    }
}

export async function canPlayRestrictedSong(song) {
    if (hasRestrictedPlaybackFallback(song, false)) return true
    if (!canTryCustomSourceForRestrictedSong(song)) return false
    const state = await getCustomSourceAvailability()
    return hasRestrictedPlaybackFallback(song, state.hasSource)
}
