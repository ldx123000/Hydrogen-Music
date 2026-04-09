const SIREN_API_BASE = 'https://monster-siren.hypergryph.com/api'
const DEFAULT_REQUEST_TIMEOUT = 15000

const albumsCache = {
    value: null,
    promise: null,
}
const albumDetailCache = new Map()
const songCache = new Map()
const lyricCache = new Map()

function buildRequestConfig(extraOptions = {}) {
    const headers = {
        Accept: 'application/json, text/plain, */*',
        ...(extraOptions.headers || {}),
    }

    return {
        timeout: DEFAULT_REQUEST_TIMEOUT,
        ...extraOptions,
        headers,
    }
}

async function requestViaMain(url, options = {}) {
    if (!windowApi || typeof windowApi.getRequestData !== 'function') {
        throw new Error('windowApi.getRequestData 不可用')
    }

    return windowApi.getRequestData({
        url,
        option: buildRequestConfig(options),
    })
}

async function requestSirenJson(path, options = {}) {
    const payload = await requestViaMain(`${SIREN_API_BASE}${path}`, options)
    if (payload && payload.code === 0 && payload.data !== undefined) return payload.data
    throw new Error(payload?.msg || payload?.message || '塞壬唱片接口请求失败')
}

export async function getSirenAlbums(force = false) {
    if (!force && Array.isArray(albumsCache.value)) return albumsCache.value
    if (!force && albumsCache.promise) return albumsCache.promise

    albumsCache.promise = requestSirenJson('/albums')
        .then(data => {
            albumsCache.value = Array.isArray(data) ? data : []
            return albumsCache.value
        })
        .finally(() => {
            albumsCache.promise = null
        })

    return albumsCache.promise
}

export async function getSirenAlbumDetail(albumCid, options = {}) {
    const cacheKey = String(albumCid || '').trim()
    if (!cacheKey) throw new Error('缺少专辑 ID')
    if (!options.force && albumDetailCache.has(cacheKey)) return albumDetailCache.get(cacheKey)

    const data = await requestSirenJson(`/album/${encodeURIComponent(cacheKey)}/detail`)
    albumDetailCache.set(cacheKey, data)
    return data
}

export async function getSirenSong(songCid, options = {}) {
    const cacheKey = String(songCid || '').trim()
    if (!cacheKey) throw new Error('缺少歌曲 ID')
    if (!options.force && songCache.has(cacheKey)) return songCache.get(cacheKey)

    const data = await requestSirenJson(`/song/${encodeURIComponent(cacheKey)}`)
    songCache.set(cacheKey, data)
    return data
}

export async function getSirenLyricText(lyricUrl, options = {}) {
    const cacheKey = String(lyricUrl || '').trim()
    if (!cacheKey) return ''
    if (!options.force && lyricCache.has(cacheKey)) return lyricCache.get(cacheKey)

    const payload = await requestViaMain(cacheKey, {
        timeout: DEFAULT_REQUEST_TIMEOUT,
        responseType: 'text',
        headers: {
            Accept: 'text/plain, */*',
        },
    })

    const lyricText = typeof payload === 'string' ? payload : String(payload || '')
    lyricCache.set(cacheKey, lyricText)
    return lyricText
}
