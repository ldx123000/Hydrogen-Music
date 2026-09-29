const VERIFY_CACHE_TTL_MS = 900

const cachedVerifyResults = new Map()
const inflightVerifyRequests = new Map()
const verifyRequestGenerations = new Map()

function normalizeSongId(songId) {
    if (songId === null || songId === undefined) return ''
    return String(songId).trim()
}

function cloneLookupResult(result) {
    if (result === null || result === undefined) return result
    if (typeof result !== 'object') return result

    try {
        if (typeof structuredClone === 'function') {
            return structuredClone(result)
        }
    } catch (_) {}

    try {
        return JSON.parse(JSON.stringify(result))
    } catch (_) {
        return result
    }
}

function getVerifyGeneration(songId) {
    return verifyRequestGenerations.get(songId) || 0
}

function readCachedVerifyResult(songId) {
    const entry = cachedVerifyResults.get(songId)
    if (!entry) return { hit: false, value: false }

    if (entry.expiresAt <= Date.now()) {
        cachedVerifyResults.delete(songId)
        return { hit: false, value: false }
    }

    return {
        hit: true,
        value: cloneLookupResult(entry.value),
    }
}

function writeCachedVerifyResult(songId, result, cacheMs) {
    if (!(cacheMs > 0)) {
        cachedVerifyResults.delete(songId)
        return
    }

    cachedVerifyResults.set(songId, {
        expiresAt: Date.now() + cacheMs,
        value: cloneLookupResult(result),
    })
}

export function invalidateStoredMusicVideoVerifyCache(songId) {
    const normalizedSongId = normalizeSongId(songId)

    if (!normalizedSongId) {
        const knownSongIds = new Set([
            ...cachedVerifyResults.keys(),
            ...inflightVerifyRequests.keys(),
            ...verifyRequestGenerations.keys(),
        ])
        knownSongIds.forEach(id => {
            verifyRequestGenerations.set(id, getVerifyGeneration(id) + 1)
        })
        cachedVerifyResults.clear()
        inflightVerifyRequests.clear()
        return
    }

    verifyRequestGenerations.set(normalizedSongId, getVerifyGeneration(normalizedSongId) + 1)
    cachedVerifyResults.delete(normalizedSongId)
    inflightVerifyRequests.delete(normalizedSongId)
}

export async function verifyStoredMusicVideo(songId, options = {}) {
    const normalizedSongId = normalizeSongId(songId)
    if (!normalizedSongId) return false

    const forceRefresh = options.forceRefresh === true
    const cacheMs = typeof options.cacheMs === 'number' ? options.cacheMs : VERIFY_CACHE_TTL_MS

    if (!forceRefresh) {
        const cached = readCachedVerifyResult(normalizedSongId)
        if (cached.hit) return cached.value

        const inflightRequest = inflightVerifyRequests.get(normalizedSongId)
        if (inflightRequest) return inflightRequest
    }

    const requestGeneration = getVerifyGeneration(normalizedSongId)
    const verifyPromise = Promise.resolve()
        .then(() => windowApi.musicVideoIsExists({ id: songId, method: 'verify' }))
        .then(result => {
            if (requestGeneration === getVerifyGeneration(normalizedSongId)) {
                writeCachedVerifyResult(normalizedSongId, result, cacheMs)
            }
            return cloneLookupResult(result)
        })
        .finally(() => {
            if (inflightVerifyRequests.get(normalizedSongId) === verifyPromise) {
                inflightVerifyRequests.delete(normalizedSongId)
            }
        })

    inflightVerifyRequests.set(normalizedSongId, verifyPromise)
    return verifyPromise
}
