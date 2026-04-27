const COVER_TRANSFORM_PARAMS = new Set([
    'param',
    'thumbnail',
    'imageView',
    'imageView2',
    'imageMogr2',
    'enlarge',
    'quality',
    'type',
    'interlace',
    'blur',
    'crop',
    'axis',
    'rotate',
])

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function isCoverTransformParamKey(key) {
    return COVER_TRANSFORM_PARAMS.has(key) || /^(?:imageView2?|imageMogr2)(?:\/|$)/.test(key)
}

function removeKnownTransformParams(searchParams) {
    Array.from(searchParams.keys()).forEach(key => {
        if (isCoverTransformParamKey(key)) searchParams.delete(key)
    })
}

function stripKnownTransforms(url) {
    const hashIndex = url.indexOf('#')
    const hash = hashIndex >= 0 ? url.slice(hashIndex) : ''
    const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url
    const queryIndex = withoutHash.indexOf('?')
    if (queryIndex < 0) return url

    const base = withoutHash.slice(0, queryIndex)
    const query = withoutHash.slice(queryIndex + 1)
    const nextQuery = query
        .split('&')
        .filter(Boolean)
        .filter(part => {
            const rawKey = part.split('=')[0] || ''
            let key = rawKey
            try {
                key = decodeURIComponent(rawKey)
            } catch (_) {}
            return !isCoverTransformParamKey(key)
        })
        .join('&')

    return `${base}${nextQuery ? `?${nextQuery}` : ''}${hash}`
}

function appendQueryParam(url, param) {
    const hashIndex = url.indexOf('#')
    const hash = hashIndex >= 0 ? url.slice(hashIndex) : ''
    const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url
    return `${withoutHash}${withoutHash.includes('?') ? '&' : '?'}${param}${hash}`
}

export function normalizeCoverUrl(url) {
    const normalizedUrl = normalizeText(url)
    if (!normalizedUrl) return ''
    if (normalizedUrl.startsWith('data:') || normalizedUrl.startsWith('blob:')) return normalizedUrl

    try {
        const parsedUrl = new URL(normalizedUrl)
        removeKnownTransformParams(parsedUrl.searchParams)
        return parsedUrl.toString()
    } catch (_) {
        return stripKnownTransforms(normalizedUrl)
    }
}

export function withCoverParam(url, size = 512) {
    const normalizedUrl = normalizeCoverUrl(url)
    if (!normalizedUrl || normalizedUrl.startsWith('data:') || normalizedUrl.startsWith('blob:')) return normalizedUrl
    return appendQueryParam(normalizedUrl, `param=${size}y${size}`)
}

export function getSongCoverUrl(song) {
    if (!song || typeof song !== 'object') return ''

    const nestedSong = song.song && typeof song.song === 'object' ? song.song : null
    const candidates = [
        song.al?.picUrl,
        song.album?.picUrl,
        nestedSong?.al?.picUrl,
        nestedSong?.album?.picUrl,
        song.coverUrl,
        song.coverDeUrl,
        song.blurPicUrl,
        song.img1v1Url,
        nestedSong?.coverUrl,
        nestedSong?.coverDeUrl,
        nestedSong?.blurPicUrl,
        nestedSong?.img1v1Url,
    ]

    for (const candidate of candidates) {
        const coverUrl = normalizeCoverUrl(candidate)
        if (coverUrl) return coverUrl
    }

    return ''
}

export function buildCoverBackdropCandidates(song, localBase64Img, { size = 512, includeAlbumPicUrl = false } = {}) {
    if (!song) return []
    if (song.type === 'local') return localBase64Img ? [localBase64Img] : []

    const candidates = []
    const pushCandidate = url => {
        const normalizedUrl = normalizeCoverUrl(url)
        if (!normalizedUrl) return

        const sizedUrl = withCoverParam(normalizedUrl, size)
        if (sizedUrl && !candidates.includes(sizedUrl)) candidates.push(sizedUrl)
        if (sizedUrl !== normalizedUrl && !candidates.includes(normalizedUrl)) candidates.push(normalizedUrl)
    }

    const fallbackUrls = [
        song.al?.picUrl,
        includeAlbumPicUrl ? song.album?.picUrl : '',
        song.coverUrl,
        song.coverDeUrl,
        song.blurPicUrl,
        song.img1v1Url,
    ]

    pushCandidate(getSongCoverUrl(song))
    fallbackUrls.forEach(pushCandidate)
    return candidates
}
