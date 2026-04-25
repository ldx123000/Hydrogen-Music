const settingsDefaults = require('./settingsDefaults.json')

const DEFAULT_MUSIC_LEVEL = settingsDefaults.defaultMusicLevel

const MUSIC_LEVEL_OPTIONS = Object.freeze(settingsDefaults.musicLevelOptions.map(option => Object.freeze({ ...option })))

const AVAILABLE_MUSIC_LEVELS = new Set(MUSIC_LEVEL_OPTIONS.map(option => option.value))

const DEFAULT_SETTINGS = Object.freeze(clonePlain(settingsDefaults.defaultSettings))

function clonePlain(value) {
    return JSON.parse(JSON.stringify(value))
}

function getDefaultSettings() {
    return clonePlain(DEFAULT_SETTINGS)
}

function normalizeSearchAssistLimit(value) {
    const num = Number.parseInt(value, 10)
    if (!Number.isFinite(num)) return DEFAULT_SETTINGS.music.searchAssistLimit
    return Math.max(1, num)
}

function normalizeMusicLevel(level) {
    return AVAILABLE_MUSIC_LEVELS.has(level) ? level : DEFAULT_MUSIC_LEVEL
}

function normalizeMusicSettings(music = {}) {
    const normalized = { ...music }
    normalized.searchAssistLimit = normalizeSearchAssistLimit(normalized.searchAssistLimit)
    normalized.level = normalizeMusicLevel(normalized.level)
    normalized.showSongTranslation = normalized.showSongTranslation !== false
    normalized.gaplessPlayback = normalized.gaplessPlayback === true
    delete normalized.levelMigratedToLosslessV1
    return normalized
}

function normalizeSettings(settings = {}) {
    const defaults = getDefaultSettings()
    const source = settings && typeof settings === 'object' ? settings : {}
    const normalized = {
        ...defaults,
        ...source,
        music: normalizeMusicSettings({
            ...defaults.music,
            ...(source.music && typeof source.music === 'object' ? source.music : {}),
        }),
        local: {
            ...defaults.local,
            ...(source.local && typeof source.local === 'object' ? source.local : {}),
        },
        shortcuts: Array.isArray(source.shortcuts) ? clonePlain(source.shortcuts) : defaults.shortcuts,
        other: {
            ...defaults.other,
            ...(source.other && typeof source.other === 'object' ? source.other : {}),
        },
    }

    normalized.local.localFolder = Array.isArray(normalized.local.localFolder)
        ? normalized.local.localFolder.slice()
        : []
    return normalized
}

module.exports = {
    DEFAULT_MUSIC_LEVEL,
    MUSIC_LEVEL_OPTIONS,
    getDefaultSettings,
    normalizeMusicLevel,
    normalizeMusicSettings,
    normalizeSearchAssistLimit,
    normalizeSettings,
}
