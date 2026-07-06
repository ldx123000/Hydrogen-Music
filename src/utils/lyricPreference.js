const STORAGE_KEY = 'hydrogen:lyric-selection:v1'

function getStorage() {
    return typeof localStorage === 'undefined' ? null : localStorage
}

function readPreferences(storage = getStorage()) {
    if (!storage) return {}

    try {
        const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}')
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch (_) {
        return {}
    }
}

function writePreferences(preferences, storage = getStorage()) {
    if (!storage) return false

    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(preferences))
        return true
    } catch (_) {
        return false
    }
}

export function getLyricPreferenceKey(params = {}) {
    const hash = String(params.hash || '').trim()
    if (hash) return `hash:${hash.toLowerCase()}`

    const albumAudioId = String(params.album_audio_id || '').trim()
    if (albumAudioId) return `album:${albumAudioId}`

    const keywords = String(params.keywords || '').trim()
    const duration = String(params.duration || '').trim()
    if (keywords && duration) return `query:${duration}:${keywords.toLowerCase()}`
    if (keywords) return `query:${keywords.toLowerCase()}`

    return ''
}

function normalizeCandidate(candidate) {
    const id = String(candidate?.id || '').trim()
    const accesskey = String(candidate?.accesskey || '').trim()
    return id && accesskey ? { id, accesskey } : null
}

function isSameCandidate(candidate, saved) {
    return String(candidate?.id || '') === saved?.id && String(candidate?.accesskey || '') === saved?.accesskey
}

export function findRememberedLyricCandidate(params, candidates, storage = getStorage()) {
    const key = getLyricPreferenceKey(params)
    if (!key || !Array.isArray(candidates)) return null

    const saved = readPreferences(storage)[key]
    return saved ? candidates.find(candidate => isSameCandidate(candidate, saved)) || null : null
}

export function rememberLyricCandidate(params, candidate, storage = getStorage()) {
    const key = getLyricPreferenceKey(params)
    const saved = normalizeCandidate(candidate)
    if (!key || !saved) return false

    // ponytail: this localStorage map is intentionally unbounded; add LRU pruning here if it ever grows too large.
    const preferences = readPreferences(storage)
    preferences[key] = saved
    return writePreferences(preferences, storage)
}
