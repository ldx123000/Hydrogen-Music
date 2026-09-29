let cachedSettings = null
let inflightSettingsPromise = null

function cloneSettings(settings) {
    if (!settings || typeof settings !== 'object') return null

    try {
        if (typeof structuredClone === 'function') {
            return structuredClone(settings)
        }
    } catch (_) {}

    try {
        return JSON.parse(JSON.stringify(settings))
    } catch (_) {
        return settings
    }
}

export function getCachedSettingsSnapshot() {
    return cloneSettings(cachedSettings)
}

export function setCachedSettingsSnapshot(settings) {
    cachedSettings = cloneSettings(settings)
    return getCachedSettingsSnapshot()
}

export function clearCachedSettingsSnapshot() {
    cachedSettings = null
    inflightSettingsPromise = null
}

export async function getSettingsSnapshot(options = {}) {
    const forceReload = options.forceReload === true

    if (!forceReload && cachedSettings) {
        return getCachedSettingsSnapshot()
    }

    if (!forceReload && inflightSettingsPromise) {
        return inflightSettingsPromise
    }

    inflightSettingsPromise = Promise.resolve()
        .then(() => windowApi.getSettings())
        .then(settings => {
            cachedSettings = cloneSettings(settings)
            return getCachedSettingsSnapshot()
        })
        .finally(() => {
            inflightSettingsPromise = null
        })

    return inflightSettingsPromise
}
