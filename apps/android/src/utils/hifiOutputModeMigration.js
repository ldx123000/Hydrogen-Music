const HIFI_OUTPUT_EXCLUSIVE_OPT_IN_KEY = 'hydrogen-music:hifi-output-exclusive-opt-in-v1'

function hasExclusiveOptIn() {
    try {
        return typeof window !== 'undefined'
            && window.localStorage?.getItem(HIFI_OUTPUT_EXCLUSIVE_OPT_IN_KEY) === '1'
    } catch (_) {
        return false
    }
}

function setExclusiveOptIn(enabled) {
    try {
        if (typeof window === 'undefined') return
        if (enabled) window.localStorage?.setItem(HIFI_OUTPUT_EXCLUSIVE_OPT_IN_KEY, '1')
        else window.localStorage?.removeItem(HIFI_OUTPUT_EXCLUSIVE_OPT_IN_KEY)
    } catch (_) {}
}

function normalizeHifiOutputMode(mode) {
    if (mode === 'exclusive' || mode === 'wasapi-exclusive') return 'exclusive'
    return 'shared'
}

export function resolveInitialHifiOutputMode(mode) {
    const normalizedMode = normalizeHifiOutputMode(mode)
    if (normalizedMode !== 'exclusive') return 'shared'
    return hasExclusiveOptIn() ? 'exclusive' : 'shared'
}

export function markHifiOutputModeConfigured(mode) {
    setExclusiveOptIn(normalizeHifiOutputMode(mode) === 'exclusive')
}
