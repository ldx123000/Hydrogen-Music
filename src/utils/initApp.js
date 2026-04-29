import { usePlayerStore } from '../store/playerStore'
import { useLocalStore } from '../store/localStore'
import { useUserStore } from '../store/userStore'
import { storeToRefs } from 'pinia'
import { getPreferredQuality } from './quality'
import { initializeCurrentAccountSession } from './accountSession'
import { hasStoredBiliSession, migrateLegacyBiliSession } from './biliSession'
import { migrateLegacyAuthSession } from './authority'
import { getSettingsSnapshot, setCachedSettingsSnapshot } from './settingsSnapshot'
import { initPlayerExternalBridge, loadLastSong } from './player/lazy'
import { applyCustomFontStyle, syncDesktopLyricCustomFont } from './setFont'
import { resolveSystemFontOptionAsync, resolveSystemFontValueAsync } from './fontResolver'
import settingsSchema from '../shared/settingsSchema.js'

const { normalizeSettings } = settingsSchema

const playerStore = usePlayerStore()
const { quality, lyricSize, tlyricSize, rlyricSize, lyricInterludeTime, searchAssistLimit, showSongTranslation, gaplessPlayback, audioVisualizer } = storeToRefs(playerStore)
const localStore = useLocalStore()
const userStore = useUserStore()

let baseInitPromise = null
let deferredInitPromise = null
let deferredInitScheduled = false
let mediaSessionInitialized = false
let sirenDurationPreloadScheduled = false
let lastSongRestoreScheduled = false
let localMusicModulePromise = null
let downloadManagerModulePromise = null
let customFontResolveToken = 0

function loadLocalMusicModule() {
    if (!localMusicModulePromise) localMusicModulePromise = import('./locaMusic')
    return localMusicModulePromise
}

function loadDownloadManagerModule() {
    if (!downloadManagerModulePromise) downloadManagerModulePromise = import('./downloadManager')
    return downloadManagerModulePromise
}

function scanMusicDeferred(options) {
    void loadLocalMusicModule()
        .then(({ scanMusic }) => scanMusic(options))
        .catch(error => {
            console.error('本地音乐扫描模块加载失败:', error)
        })
}

const idle = typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
    ? callback => window.requestIdleCallback(callback, { timeout: 1000 })
    : callback => setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 500)

function applyLocalSettings(settings, { hydrateLocalMusic = false } = {}) {
    const nextDownloadFolder = settings?.local?.downloadFolder || null
    const nextLocalFolders = Array.isArray(settings?.local?.localFolder) ? settings.local.localFolder : []

    localStore.downloadedFolderSettings = nextDownloadFolder
    localStore.localFolderSettings = nextLocalFolders
    localStore.quitApp = settings?.other?.quitApp

    if (!nextDownloadFolder && localStore.downloadedMusicFolder) {
        localStore.downloadedMusicFolder = null
        localStore.downloadedFiles = null
        localStore.lookupIndex = {
            ...localStore.lookupIndex,
            downloadedFoldersByName: {},
            songSearchByScope: {
                ...localStore.lookupIndex.songSearchByScope,
                downloaded: {},
            },
        }
        windowApi.clearLocalMusicData('downloaded')
    } else if (hydrateLocalMusic && nextDownloadFolder && !localStore.downloadedMusicFolder) {
        scanMusicDeferred({ type: 'downloaded', refresh: false })
    }

    if (nextLocalFolders.length === 0 && localStore.localMusicFolder) {
        localStore.localMusicFolder = null
        localStore.localMusicList = null
        localStore.localMusicClassify = null
        localStore.lookupIndex = {
            ...localStore.lookupIndex,
            localFoldersByName: {},
            albumsById: {},
            artistsById: {},
            songSearchByScope: {
                ...localStore.lookupIndex.songSearchByScope,
                local: {},
            },
        }
        windowApi.clearLocalMusicData('local')
    } else if (hydrateLocalMusic && nextLocalFolders.length !== 0 && !localStore.localMusicFolder) {
        scanMusicDeferred({ type: 'local', refresh: false })
    }
}

export function applySettingsSnapshot(settings, options = {}) {
    if (!settings) return null

    const normalizedSettings = setCachedSettingsSnapshot(normalizeSettings(settings))
    quality.value = getPreferredQuality(normalizedSettings?.music?.level)
    lyricSize.value = normalizedSettings?.music?.lyricSize
    tlyricSize.value = normalizedSettings?.music?.tlyricSize
    rlyricSize.value = normalizedSettings?.music?.rlyricSize
    lyricInterludeTime.value = normalizedSettings?.music?.lyricInterlude
    searchAssistLimit.value = normalizedSettings?.music?.searchAssistLimit
    showSongTranslation.value = normalizedSettings?.music?.showSongTranslation !== false
    gaplessPlayback.value = normalizedSettings?.music?.gaplessPlayback === true
    audioVisualizer.value = normalizedSettings?.music?.audioVisualizer === true
    applyCustomFontSetting(normalizedSettings)

    applyLocalSettings(normalizedSettings, options)
    return normalizedSettings
}

function persistResolvedCustomFont(settings, resolvedCustomFont, resolvedCustomFontLabel = '') {
    if (!settings || !resolvedCustomFont) return

    const previousOther = settings.other || {}
    const previousCustomFont = previousOther.customFont || ''
    const previousCustomFontLabel = previousOther.customFontLabel || ''
    const customFontLabel = resolvedCustomFontLabel || previousCustomFontLabel || previousCustomFont
    if (
        previousCustomFont === resolvedCustomFont
        && previousCustomFontLabel === customFontLabel
    ) return

    const nextSettings = normalizeSettings({
        ...settings,
        other: {
            ...previousOther,
            customFont: resolvedCustomFont,
            customFontLabel,
        },
    })

    setCachedSettingsSnapshot(nextSettings)
    try {
        if (typeof windowApi !== 'undefined') windowApi?.setSettings?.(JSON.stringify(nextSettings))
    } catch (_) {}
}

function applyCustomFontSetting(settings) {
    const customFont = settings?.other?.customFont
    const customFontLabel = settings?.other?.customFontLabel || ''
    const insertedFont = applyCustomFontStyle(customFont, customFontLabel)
    const token = ++customFontResolveToken

    if (!insertedFont) {
        syncDesktopLyricCustomFont('', '')
        return
    }

    const needsDisplayLabelResolve = !customFontLabel || customFontLabel === insertedFont
    const resolveFont = needsDisplayLabelResolve
        ? resolveSystemFontOptionAsync(insertedFont, customFontLabel || insertedFont)
        : resolveSystemFontValueAsync(insertedFont).then(value => ({ value, label: customFontLabel }))

    void resolveFont
        .then(({ value: resolvedFont, label: resolvedFontLabel }) => {
            if (token !== customFontResolveToken) return
            if (!resolvedFont) return

            applyCustomFontStyle(resolvedFont, resolvedFontLabel)
            syncDesktopLyricCustomFont(resolvedFont, resolvedFontLabel)
            persistResolvedCustomFont(settings, resolvedFont, resolvedFontLabel)
        })
        .catch(() => {})
}

export async function initSettings(options = {}) {
    const settings = options.settings || await getSettingsSnapshot({ forceReload: options.forceReload === true })
    const shouldHydrateLocalMusic = options.hydrateLocalMusic !== false
    return applySettingsSnapshot(settings, { hydrateLocalMusic: shouldHydrateLocalMusic })
}

function restoreLastSongOnce() {
    if (lastSongRestoreScheduled) return
    lastSongRestoreScheduled = true
    void loadLastSong().catch(error => {
        lastSongRestoreScheduled = false
        console.error('恢复上次播放失败:', error)
    })
}

function resetStartupPlayerState() {
    if (playerStore.listInfo && playerStore.listInfo.type === 'personalfm') {
        playerStore.listInfo = null
        playerStore.songList = null
        playerStore.currentIndex = 0
        playerStore.songId = null
    }
}

async function ensureMediaSessionReady() {
    if (mediaSessionInitialized) return

    const runtimePlatform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''
    if (/Win/i.test(runtimePlatform)) {
        mediaSessionInitialized = true
        return
    }

    try {
        const { initMediaSession } = await import('./mediaSession')
        initMediaSession()
        mediaSessionInitialized = true
    } catch (_) {}
}

function scheduleSirenDurationPreload() {
    if (sirenDurationPreloadScheduled || !userStore.sirenPage) return
    sirenDurationPreloadScheduled = true

    idle(async () => {
        try {
            const { useSirenStore } = await import('../store/sirenStore')
            const sirenStore = useSirenStore()
            await sirenStore.preloadAllDurations()
        } catch (_) {}
    })
}

async function runBaseAppInit() {
    migrateLegacyAuthSession()
    migrateLegacyBiliSession()
    if (!hasStoredBiliSession() && userStore.biliUser) {
        userStore.clearBiliAccountState()
    }

    await initPlayerExternalBridge()
    const { initDownloadManager } = await loadDownloadManagerModule()
    initDownloadManager()
    await initSettings({ hydrateLocalMusic: false })
    resetStartupPlayerState()
}

function ensureBaseAppInit() {
    if (!baseInitPromise) {
        baseInitPromise = runBaseAppInit().catch(error => {
            baseInitPromise = null
            throw error
        })
    }

    return baseInitPromise
}

async function runDeferredAppInit() {
    await ensureBaseAppInit()
    const settings = await initSettings({ hydrateLocalMusic: true })
    const mediaSessionReadyPromise = ensureMediaSessionReady()

    try {
        await initializeCurrentAccountSession()
    } catch (error) {
        console.error('用户信息加载失败:', error)
    } finally {
        restoreLastSongOnce()
    }

    scheduleSirenDurationPreload()
    await mediaSessionReadyPromise
    return settings
}

export function ensureDeferredAppInit() {
    if (!deferredInitPromise) {
        deferredInitPromise = runDeferredAppInit().catch(error => {
            deferredInitPromise = null
            throw error
        })
    }

    return deferredInitPromise
}

export function scheduleDeferredAppInit() {
    if (deferredInitScheduled) return
    deferredInitScheduled = true

    idle(() => {
        void ensureDeferredAppInit()
    })
}

export const init = async () => {
    await ensureBaseAppInit()
    scheduleDeferredAppInit()
}
