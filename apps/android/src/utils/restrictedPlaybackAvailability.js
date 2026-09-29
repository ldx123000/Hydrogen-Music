function isNoCopyrightSong(song) {
    return song?.reason === '无版权' || (song?.noCopyrightRcmd !== null && song?.noCopyrightRcmd !== undefined)
}

function isDelistedSong(song) {
    return song?.reason === '已下架' || Number(song?.privilege?.st) < 0
}

function isKnownRestrictedSong(song) {
    return song?.playable === false || isNoCopyrightSong(song) || isDelistedSong(song)
}

function normalizeReasonText(value) {
    return typeof value === 'string' ? value.trim() : ''
}

export function hasNoCopyrightAlternativeHint(song) {
    const recommendation = song?.noCopyrightRcmd
    if (!recommendation || typeof recommendation !== 'object') return false
    if (recommendation.thirdPartySong) return true
    if (Number(recommendation.type) === 2) return true

    const typeDesc = normalizeReasonText(recommendation.typeDesc)
    return /其[它他]版本可播|可播/.test(typeDesc)
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

export function getNoCopyrightRecommendedSongId(song) {
    const recommendedId = song?.noCopyrightRcmd?.songId
    if (recommendedId === undefined || recommendedId === null) return null

    const normalizedId = String(recommendedId).trim()
    if (!normalizedId || normalizedId === String(song?.id ?? '')) return null
    return normalizedId
}

export function hasRestrictedPlaybackAlternative(song) {
    return !!getNoCopyrightRecommendedSongId(song) || hasNoCopyrightAlternativeHint(song)
}

export function shouldBlockRestrictedPlayback(song) {
    return isKnownRestrictedSong(song) && !hasRestrictedPlaybackAlternative(song)
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
