import { usePlayerStore } from '../store/playerStore'
import { useLocalStore } from '../store/localStore'
import { useUserStore } from '../store/userStore'
import { storeToRefs } from 'pinia'
import { getPreferredQuality } from './quality'
import { initializeCurrentAccountSession } from './accountSession'
import { hasStoredBiliSession, migrateLegacyBiliSession } from './biliSession'
import { migrateLegacyAuthSession } from './authority'
import { getSettingsSnapshot, setCachedSettingsSnapshot } from './settingsSnapshot'

const playerStore = usePlayerStore()
const { quality, lyricSize, tlyricSize, rlyricSize, lyricInterludeTime, searchAssistLimit, showSongTranslation } = storeToRefs(playerStore)
const localStore = useLocalStore()
const userStore = useUserStore()

let baseInitPromise = null
let deferredInitPromise = null
let deferredInitScheduled = false
let mediaSessionInitialized = false
let sirenDurationPreloadScheduled = false
let lastSongRestoreScheduled = false
let playerModulePromise = null
let localMusicModulePromise = null
let downloadManagerModulePromise = null

function loadPlayerModule() {
    if (!playerModulePromise) playerModulePromise = import('./player')
    return playerModulePromise
}

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

const normalizeSearchAssistLimit = value => {
    const rawValue = Number.parseInt(value, 10)
    if (!Number.isFinite(rawValue)) return 8
    return Math.max(1, rawValue)
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

    const normalizedSettings = setCachedSettingsSnapshot(settings)
    quality.value = getPreferredQuality(normalizedSettings?.music?.level)
    lyricSize.value = normalizedSettings?.music?.lyricSize
    tlyricSize.value = normalizedSettings?.music?.tlyricSize
    rlyricSize.value = normalizedSettings?.music?.rlyricSize
    lyricInterludeTime.value = normalizedSettings?.music?.lyricInterlude
    searchAssistLimit.value = normalizeSearchAssistLimit(normalizedSettings?.music?.searchAssistLimit)
    showSongTranslation.value = normalizedSettings?.music?.showSongTranslation !== false

    applyLocalSettings(normalizedSettings, options)
    return normalizedSettings
}

export async function initSettings(options = {}) {
    const settings = options.settings || await getSettingsSnapshot({ forceReload: options.forceReload === true })
    const shouldHydrateLocalMusic = options.hydrateLocalMusic !== false
    return applySettingsSnapshot(settings, { hydrateLocalMusic: shouldHydrateLocalMusic })
}

function restoreLastSongOnce() {
    if (lastSongRestoreScheduled) return
    lastSongRestoreScheduled = true
    void loadPlayerModule()
        .then(({ loadLastSong }) => loadLastSong())
        .catch(error => {
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

    const { initPlayerExternalBridge } = await loadPlayerModule()
    initPlayerExternalBridge()
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
