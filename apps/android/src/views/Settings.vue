<script setup>
const appVersion = __APP_VERSION__
import { computed, ref, onActivated, onBeforeUnmount, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { noticeOpen, dialogOpen } from '@/utils/dialog'
import { applySettingsSnapshot, initSettings } from '@/utils/initApp'
import { getVipInfo } from '@/api/user'
import { isLogin } from '@/utils/authority'
import { useUserStore } from '@/store/userStore'
import { usePlayerStore } from '@/store/playerStore'
import Selector from '../components/Selector.vue'
import FontSelector from '../components/FontSelector.vue'
import UpdateDialog from '../components/UpdateDialog.vue'
import { setTheme, getSavedTheme } from '@/utils/theme'
import { confirmAccountLogout, initializeCurrentAccountSession } from '@/utils/accountSession'
import { applyCurrentHifiOutputSettings, enforceLocalOnlyPlayback, restoreOnlinePlayback } from '@/utils/player/lazy'
import { getSettingsSnapshot, setCachedSettingsSnapshot } from '@/utils/settingsSnapshot'
import { applyCustomFontStyle, syncDesktopLyricCustomFont } from '@/utils/setFont'
import { buildFontOptions, loadSystemFontOptions, resolveSystemFontLabel, resolveSystemFontValue } from '@/utils/fontResolver'
import { markHifiOutputModeConfigured, resolveInitialHifiOutputMode } from '@/utils/hifiOutputModeMigration'
import settingsSchema from '@/shared/settingsSchema.js'

const { MUSIC_LEVEL_OPTIONS, normalizeSettings } = settingsSchema

const router = useRouter()
const userStore = useUserStore()
const playerStore = usePlayerStore()

const vipInfo = ref(null)
const musicLevel = ref('lossless')
const musicLevelOptions = ref(MUSIC_LEVEL_OPTIONS.map(option => ({ ...option })))
const lyricSize = ref(20)
const tlyricSize = ref(13)
const rlyricSize = ref(12)

/**
 * 歌词字体大小：三档预设（小/中/大），由一条滑轨控件切换。
 *
 * 原来「歌词 / 翻译 / 罗马音」是三个自由输入框，手机上要点开输入法手填数字，
 * 很难用；而且三者的大小比例本来就应该固定（罗马音 < 翻译 < 原文）。
 * 这里用一档控制三者，比值沿用原来的 20 / 13 / 12。
 *
 * 档位只有三个、且彼此有序，用下拉菜单是杀鸡用牛刀（还要多一次点击），
 * 改成滑轨后一次点击直达。原「超小」档已去掉，老数据会由 pickFontSizePreset
 * 映射到最接近的一档（16px → 小 18px）。
 */
const FONT_SIZE_PRESETS = [
    { label: '小', value: 'sm', lyric: 18, tran: 12, roma: 11 },
    { label: '中', value: 'md', lyric: 20, tran: 13, roma: 12 },
    { label: '大', value: 'lg', lyric: 24, tran: 15, roma: 14 },
]

/** 由已保存的字号反推最接近的档位（老数据是任意数字，需要映射到某一档）。
 *  默认档位（中）按 value 取、不写死下标 —— 数组长度会变，下标会错位。 */
const DEFAULT_FONT_SIZE_PRESET = 'md'
const findFontSizePreset = value =>
    FONT_SIZE_PRESETS.find(item => item.value === value)
    || FONT_SIZE_PRESETS.find(item => item.value === DEFAULT_FONT_SIZE_PRESET)
    || FONT_SIZE_PRESETS[0]

const pickFontSizePreset = lyric => {
    const current = Number(lyric)
    if (!Number.isFinite(current)) return DEFAULT_FONT_SIZE_PRESET
    let best = findFontSizePreset(DEFAULT_FONT_SIZE_PRESET)
    let bestDiff = Infinity
    FONT_SIZE_PRESETS.forEach(item => {
        const diff = Math.abs(item.lyric - current)
        if (diff < bestDiff) { bestDiff = diff; best = item }
    })
    return best.value
}

const fontSizePreset = ref(DEFAULT_FONT_SIZE_PRESET)

/** 当前档位在轨道上的序号（0/1/2），滑轨滑块靠它位移。 */
const fontSizePresetIndex = computed(() => {
    const index = FONT_SIZE_PRESETS.findIndex(item => item.value === fontSizePreset.value)
    return index < 0 ? 0 : index
})

/** 切换档位时同步写入三个字号（保存逻辑沿用原有的 lyricSize 等字段）。 */
const applyFontSizePreset = value => {
    const preset = findFontSizePreset(value)
    fontSizePreset.value = preset.value
    lyricSize.value = preset.lyric
    tlyricSize.value = preset.tran
    rlyricSize.value = preset.roma
    // 必须同时写进 playerStore —— 歌词渲染只认它上面的值，
    // 只更新本页 ref 的话界面会显示新档位但字号毫无变化。
    playerStore.lyricSize = preset.lyric
    playerStore.tlyricSize = preset.tran
    playerStore.rlyricSize = preset.roma
}

const lyricInterlude = ref(13)
const searchAssistLimit = ref(8)
const globalShortcuts = ref(false)
const rememberWindowSize = ref(false)
const quitApp = ref('minimize')
const quitAppOptions = ref([
    {
        label: '最小化至托盘',
        value: 'minimize',
    },
    {
        label: '直接退出',
        value: 'quit',
    },
])
const theme = ref('system')
const themeOptions = ref([
    { label: '跟随系统', value: 'system' },
    { label: '浅色', value: 'light' },
    { label: '深色', value: 'dark' },
])
const hifiAudioDeviceOptions = ref([{ label: '自动', value: 'auto' }])
const hifiOutputState = ref({
    available: false,
    mpvPath: '',
    source: '',
    platform: '',
})
const getRendererPlatform = () => {
    try {
        return globalThis.process?.platform || ''
    } catch (_) {
        return ''
    }
}
const hifiOutputPlatform = computed(() => hifiOutputState.value.platform || getRendererPlatform())
// Android 版没有随包附带的 MPV 后端，「本地音乐 HiFi 输出」这一整块（后端路径、
// 独占模式、输出设备选择）在手机上都无从谈起。原生 App 里直接隐藏，
// 本地音乐改由系统播放器输出。
const isNativeApp = computed(() => typeof window !== 'undefined' && window.__HM_APP__ === true)
const showHifiSettings = computed(() => !isNativeApp.value)
const localHifiOutputModeOptions = computed(() => {
    if (hifiOutputPlatform.value === 'darwin') {
        return [
            { label: 'CoreAudio 共享', value: 'shared' },
            { label: 'CoreAudio 独占', value: 'exclusive' },
        ]
    }
    if (hifiOutputPlatform.value === 'linux') {
        return [
            { label: 'PipeWire 共享', value: 'shared' },
            { label: 'PipeWire 独占', value: 'exclusive' },
        ]
    }
    return [
        { label: 'WASAPI 共享', value: 'shared' },
        { label: 'WASAPI 独占', value: 'exclusive' },
    ]
})
const hifiOutputBusy = ref(false)
const downloadFolder = ref(null)
const downloadCreateSongFolder = ref(false)
const downloadSaveLyricFile = ref(false)
const videoFolder = ref(null)
const localFolder = ref([])
const shortcutsList = ref(null)
const selectedShortcut = ref(null)
const newShortcut = ref([])
const shortcutCharacter = ['=', '-', '~', '@', '#', '$', '[', ']', ';', "'", ',', '.', '/', '!']
const customFont = ref('')
const customFontLabel = ref('')
const systemFonts = ref([])
const systemFontsLoading = ref(false)
let systemFontsLoadPromise = null

const fontOptions = computed(() =>
    buildFontOptions({
        systemFonts: systemFonts.value,
        customFont: customFont.value,
        customFontLabel: customFontLabel.value,
    })
)

// 更新相关状态
const showUpdateDialog = ref(false)
const newVersion = ref('')
let updateListenersInitialized = false
let removeUpdateListeners = null
const PERFORMANCE_CONFIRM_MESSAGE = '开启后此功能会消耗一定性能且可能造成卡顿，确定开启吗？'
const GAPLESS_CONFIRM_MESSAGE = '开启后会提前预缓冲下一首音频，可能增加网络流量和内存占用，确定开启吗？'
const LOCAL_HIFI_OUTPUT_CONFIRM_MESSAGE = '开启后本地音乐会使用 MPV 后端输出，独占模式会占用音频设备，确定开启吗？'

const loadVipInfo = async () => {
    const requestUserId = userStore.user?.userId
    if (userStore.localOnlyMode || !requestUserId || !isLogin()) {
        vipInfo.value = null
        return
    }

    try {
        const result = await getVipInfo()
        if (userStore.user?.userId != requestUserId) return
        vipInfo.value = result?.data || null
    } catch (error) {
        if (userStore.user?.userId != requestUserId) return
        console.error('加载 VIP 信息失败:', error)
        vipInfo.value = null
    }
}

const applySettingsToForm = settings => {
    if (!settings) return
    const normalizedSettings = normalizeSettings(settings)
    musicLevel.value = normalizedSettings.music.level
    lyricSize.value = normalizedSettings.music.lyricSize
    tlyricSize.value = normalizedSettings.music.tlyricSize
    rlyricSize.value = normalizedSettings.music.rlyricSize
    // 老数据是任意数字，映射到最接近的档位显示
    fontSizePreset.value = pickFontSizePreset(lyricSize.value)
    // 歌词渲染读的是 playerStore 上的这三个字段，只改本页的 ref 不会生效。
    // 冷启动时也必须同步一次，否则设置页显示"大"、实际渲染还是默认值。
    playerStore.lyricSize = lyricSize.value
    playerStore.tlyricSize = tlyricSize.value
    playerStore.rlyricSize = rlyricSize.value
    lyricInterlude.value = normalizedSettings.music.lyricInterlude
    searchAssistLimit.value = normalizedSettings.music.searchAssistLimit
    playerStore.showSongTranslation = normalizedSettings.music.showSongTranslation !== false
    playerStore.gaplessPlayback = normalizedSettings.music.gaplessPlayback === true
    playerStore.audioVisualizer = normalizedSettings.music.audioVisualizer === true
    // 原生 App（Android）没有 MPV 后端：即使桌面端存过「已开启」也要强制关掉，
    // 否则本地音乐会走一条在手机上不存在的输出链路。
    playerStore.localHifiOutput = !isNativeApp.value && normalizedSettings.music.localHifiOutput === true
    playerStore.localHifiOutputMode = resolveInitialHifiOutputMode(normalizedSettings.music.localHifiOutputMode)
    playerStore.localHifiMpvPath = normalizedSettings.music.localHifiMpvPath
    playerStore.localHifiAudioDevice = normalizedSettings.music.localHifiAudioDevice
    videoFolder.value = normalizedSettings.local.videoFolder
    downloadFolder.value = normalizedSettings.local.downloadFolder
    downloadCreateSongFolder.value = !!normalizedSettings.local.downloadCreateSongFolder
    downloadSaveLyricFile.value = !!normalizedSettings.local.downloadSaveLyricFile
    localFolder.value = normalizedSettings.local.localFolder
    shortcutsList.value = normalizedSettings.shortcuts
    globalShortcuts.value = normalizedSettings.other.globalShortcuts
    rememberWindowSize.value = normalizedSettings.other.rememberWindowSize
    quitApp.value = normalizedSettings.other.quitApp
    customFont.value = normalizedSettings.other.customFont
    customFontLabel.value = normalizedSettings.other.customFontLabel
}

onActivated(() => {
    void getSettingsSnapshot().then(applySettingsToForm)
    void loadSystemFonts()
    void refreshHifiOutputBackend()

    // Initialize theme selection
    try {
        theme.value = getSavedTheme()
    } catch (_) {
        theme.value = 'system'
    }

    void loadVipInfo()

    // 设置更新事件监听器
    setupUpdateListeners()
})

// 当从“首页/子页”切换到“主播放器界面”（widgetState: true -> false）时，
// 如果当前仍处于设置路由，则自动保存设置（避免未发生路由切换导致 onBeforeRouteLeave 不触发）。
watch(
    () => playerStore.widgetState,
    (now, prev) => {
        try {
            const isLeavingToPlayer = prev === true && now === false
            const inSettings = router.currentRoute.value?.name === 'settings'
            if (isLeavingToPlayer && inSettings) {
                saveSettings()
                noticeOpen('设置已保存', 2)
            }
        } catch (_) {
            // ignore
        }
    }
)

// 设置更新监听器
const setupUpdateListeners = () => {
    if (updateListenersInitialized) return
    updateListenersInitialized = true
    // 监听手动更新检查结果（不显示大窗弹出）
    removeUpdateListeners = windowApi.manualUpdateAvailable(version => {
        newVersion.value = version
        // 手动检查时直接在UpdateDialog中显示结果，不触发大窗弹出
    })
}

onBeforeUnmount(() => {
    removeUpdateListeners?.()
    removeUpdateListeners = null
    updateListenersInitialized = false
})

watch(
    () => userStore.user?.userId ?? null,
    (nextUserId, previousUserId) => {
        if (nextUserId === previousUserId) return
        if (!nextUserId) {
            vipInfo.value = null
            return
        }
        void loadVipInfo()
    }
)

watch(
    () => playerStore.localHifiOutputMode,
    mode => {
        markHifiOutputModeConfigured(mode)
    }
)

const setAppSettings = () => {
    const settings = {
        music: {
            level: musicLevel.value,
            lyricSize: lyricSize.value,
            tlyricSize: tlyricSize.value,
            rlyricSize: rlyricSize.value,
            lyricInterlude: lyricInterlude.value,
            searchAssistLimit: searchAssistLimit.value,
            showSongTranslation: playerStore.showSongTranslation,
            gaplessPlayback: playerStore.gaplessPlayback,
            audioVisualizer: playerStore.audioVisualizer,
            localHifiOutput: playerStore.localHifiOutput,
            localHifiOutputMode: playerStore.localHifiOutputMode,
            localHifiMpvPath: playerStore.localHifiMpvPath,
            localHifiAudioDevice: playerStore.localHifiAudioDevice,
        },
        local: {
            videoFolder: videoFolder.value,
            downloadFolder: downloadFolder.value,
            downloadCreateSongFolder: downloadCreateSongFolder.value,
            downloadSaveLyricFile: downloadSaveLyricFile.value,
            localFolder: localFolder.value,
        },
        shortcuts: shortcutsList.value,
        other: {
            globalShortcuts: globalShortcuts.value,
            rememberWindowSize: rememberWindowSize.value,
            quitApp: quitApp.value,
            customFont: customFont.value,
            customFontLabel: customFont.value ? customFontLabel.value : '',
        },
    }

    const normalizedSettings = normalizeSettings(settings)
    const snapshot = setCachedSettingsSnapshot(normalizedSettings)
    windowApi.setSettings(JSON.stringify(normalizedSettings))
    applySettingsSnapshot(snapshot, { hydrateLocalMusic: false })
    syncDesktopLyricCustomFont(snapshot?.other?.customFont, snapshot?.other?.customFontLabel)
    return snapshot
}

const saveSettings = () => {
    initSettings({ settings: setAppSettings(), hydrateLocalMusic: true })
}

const setCustomFont = (font, option = null) => {
    const rawFont = typeof font === 'string' ? font : customFont.value
    const resolvedFont = resolveSystemFontValue(rawFont)
    const fallbackLabel = option?.label || customFontLabel.value || rawFont
    const resolvedLabel = resolvedFont ? String(resolveSystemFontLabel(resolvedFont, fallbackLabel, systemFonts.value)).trim() : ''
    const appliedFont = applyCustomFontStyle(resolvedFont, resolvedLabel)
    customFont.value = appliedFont
    customFontLabel.value = appliedFont ? resolvedLabel : ''
}

const refreshCustomFont = () => {
    if (customFont.value) setCustomFont(customFont.value)
    return systemFonts.value
}

const loadSystemFonts = async () => {
    if (systemFonts.value.length > 0) {
        return refreshCustomFont()
    }
    if (systemFontsLoadPromise) return systemFontsLoadPromise

    systemFontsLoading.value = true
    systemFontsLoadPromise = loadSystemFontOptions()
        .then(fonts => {
            systemFonts.value = Array.isArray(fonts) ? fonts : []
            return refreshCustomFont()
        })
        .finally(() => {
            systemFontsLoading.value = false
            systemFontsLoadPromise = null
        })

    return systemFontsLoadPromise
}

// apply theme immediately when user changes
watch(theme, val => setTheme(val))

onBeforeRouteLeave((to, from, next) => {
    saveSettings()
    next()
    noticeOpen('设置已保存', 2)
})

const routerChange = () => {
    router.back()
}

const selectFolder = type => {
    // Android：目录选择统一走原生 SAF 插件（LocalMusic）。
    // 桌面端 openFile 由 Electron 提供真实路径；安卓上它是空实现（返回 null），
    // 所以"下载目录"以前永远停在"待选择"，下载时就会提示"请先在设置中设置下载目录"。
    const plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalMusic
    const pickViaNative = (onPicked) => {
        plugin.pickFolder()
            .then(result => { if (result && result.uri) onPicked(result) })
            .catch(() => { /* 用户取消，忽略 */ })
    }

    if (type == 'download') {
        if (plugin && typeof plugin.pickFolder === 'function') {
            // 存目录名用于显示；真正的 URI 由插件持久化，下载/扫描时使用
            pickViaNative(result => { downloadFolder.value = result.name || 'Download' })
            return
        }
        windowApi.openFile().then(path => {
            downloadFolder.value = path
        })
    } else if (type == 'local') {
        if (plugin && typeof plugin.pickFolder === 'function') {
            pickViaNative(result => {
                const label = result.name || 'Download'
                if (localFolder.value.indexOf(label) == -1) localFolder.value.push(label)
            })
            return
        }
        windowApi.openFile().then(path => {
            if (path && localFolder.value.indexOf(path) == -1) localFolder.value.push(path)
        })
    } else if (type == 'video') {
        windowApi.openFile().then(path => {
            videoFolder.value = path
        })
    }
}
const deleteLocalFolder = index => {
    localFolder.value.splice(index, 1)
}

const formatShortcutName = name => {
    return name
        .replaceAll('+', ' + ')
        .replace('Up', '↑')
        .replace('Down', '↓')
        .replace('Right', '→')
        .replace('Left', '←')
        .replace('Space', '空格')
        .replace('Numpad', '')
        .replace('num', '')
        .replace('CommandOrControl', 'Ctrl')
        .replace('Control', 'Ctrl')
}
const changeShortcut = (id, type) => {
    selectedShortcut.value = {
        id: id,
        type: type,
    }
    windowApi.unregisterShortcuts()
}
/**
 * author: yesplaymusic
 */
const updateShortcut = () => {
    let shortcut = []
    newShortcut.value.map(e => {
        if (e.keyCode >= 65 && e.keyCode <= 90) {
            shortcut.push(e.code.replace('Key', ''))
        } else if (['Control', 'Shift', 'Alt'].includes(e.key)) {
            shortcut.push(e.key)
        } else if (e.keyCode >= 48 && e.keyCode <= 57) {
            shortcut.push(e.code.replace('Digit', ''))
        } else if (e.keyCode >= 96 && e.keyCode <= 105) {
            shortcut.push(e.code.replace('Numpad', 'num'))
        } else if (e.keyCode >= 112 && e.keyCode <= 123) {
            shortcut.push(e.code)
        } else if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            shortcut.push(e.code.replace('Arrow', ''))
        } else if (shortcutCharacter.includes(e.key)) {
            shortcut.push(e.key)
        }
    })
    const sortTable = {
        Control: 1,
        Shift: 2,
        Alt: 3,
    }
    shortcut = shortcut.sort((a, b) => {
        if (!sortTable[a] || !sortTable[b]) return 0
        if (sortTable[a] - sortTable[b] <= -1) {
            return -1
        } else if (sortTable[a] - sortTable[b] >= 1) {
            return 1
        } else {
            return 0
        }
    })
    shortcut = shortcut.join('+')
    return shortcut
}
const inputShortcut = k => {
    if (!selectedShortcut.value) return
    if (newShortcut.value.find(nk => nk.keyCode === k.keyCode)) return
    else newShortcut.value.push(k)
    if (
        (k.keyCode >= 65 && k.keyCode <= 90) ||
        (k.keyCode >= 48 && k.keyCode <= 57) ||
        (k.keyCode >= 96 && k.keyCode <= 105) ||
        (k.keyCode >= 112 && k.keyCode <= 123) ||
        ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(k.key) ||
        shortcutCharacter.includes(k.key)
    ) {
        if (selectedShortcut.value.type) shortcutsList.value.find(sc => sc.id == selectedShortcut.value.id).globalShortcut = updateShortcut()
        else shortcutsList.value.find(sc => sc.id == selectedShortcut.value.id).shortcut = updateShortcut()
        newShortcut.value = []
    }
}
const setDefaultShortcuts = () => {
    shortcutsList.value = [
        { id: 'play', name: '播放/暂停', shortcut: 'CommandOrControl+P', globalShortcut: 'CommandOrControl+Alt+P' },
        { id: 'last', name: '上一首', shortcut: 'CommandOrControl+Left', globalShortcut: 'CommandOrControl+Alt+Left' },
        { id: 'next', name: '下一首', shortcut: 'CommandOrControl+Right', globalShortcut: 'CommandOrControl+Alt+Right' },
        { id: 'volumeUp', name: '增加音量', shortcut: 'CommandOrControl+Up', globalShortcut: 'CommandOrControl+Alt+Up' },
        { id: 'volumeDown', name: '减少音量', shortcut: 'CommandOrControl+Down', globalShortcut: 'CommandOrControl+Alt+Down' },
        { id: 'processForward', name: '快进(3s)', shortcut: 'CommandOrControl+]', globalShortcut: 'CommandOrControl+Alt+]' },
        { id: 'processBack', name: '后退(3s)', shortcut: 'CommandOrControl+[', globalShortcut: 'CommandOrControl+Alt+[' },
    ]
}
const clearMusicVideo = () => {
    windowApi.clearUnusedVideo().then(result => {
        if (result == 'noSavePath') {
            noticeOpen('请先在设置中设置音乐视频缓存目录', 2)
            return
        } else if (result) noticeOpen('清除完毕', 3)
        else noticeOpen('删除失败', 3)
    })
}
const togglePlayerFlag = key => {
    playerStore[key] = !playerStore[key]
}
const setConfirmedPlayerFlag = (key, message) => {
    if (playerStore[key]) {
        togglePlayerFlag(key)
        return
    }
    dialogOpen('确定开启', message, flag => {
        if (flag) togglePlayerFlag(key)
    })
}
const setMusicVideo = () => setConfirmedPlayerFlag('musicVideo', PERFORMANCE_CONFIRM_MESSAGE)
const setLyricBlur = () => setConfirmedPlayerFlag('lyricBlur', PERFORMANCE_CONFIRM_MESSAGE)
const setCoverBlur = () => setConfirmedPlayerFlag('coverBlur', PERFORMANCE_CONFIRM_MESSAGE)
const setGaplessPlayback = () => setConfirmedPlayerFlag('gaplessPlayback', GAPLESS_CONFIRM_MESSAGE)
const setAudioVisualizer = () => setConfirmedPlayerFlag('audioVisualizer', PERFORMANCE_CONFIRM_MESSAGE)
const buildHifiOutputConfig = () => ({
    mpvPath: playerStore.localHifiMpvPath,
    mode: playerStore.localHifiOutputMode,
    audioDevice: playerStore.localHifiAudioDevice,
})
const applyHifiOutputState = state => {
    if (state && typeof state === 'object') hifiOutputState.value = state
}
const loadHifiOutputState = async () => {
    if (!windowApi?.getHifiOutputState) return null
    try {
        const state = await windowApi.getHifiOutputState(buildHifiOutputConfig())
        applyHifiOutputState(state)
        return state
    } catch (error) {
        console.error('加载 HiFi 输出状态失败:', error)
        return null
    }
}
const loadHifiAudioDevices = async () => {
    if (!windowApi?.listHifiOutputDevices) return hifiAudioDeviceOptions.value
    try {
        const result = await windowApi.listHifiOutputDevices(buildHifiOutputConfig())
        const devices = Array.isArray(result?.devices) ? result.devices : []
        const options = [{ label: '自动', value: 'auto' }]
        devices.forEach(device => {
            if (!device?.value || device.value === 'auto') return
            options.push({
                label: device.label || device.value,
                value: device.value,
            })
        })
        if (playerStore.localHifiAudioDevice && playerStore.localHifiAudioDevice !== 'auto' && !options.some(option => option.value === playerStore.localHifiAudioDevice)) {
            options.push({
                label: playerStore.localHifiAudioDevice,
                value: playerStore.localHifiAudioDevice,
            })
        }
        hifiAudioDeviceOptions.value = options
        return options
    } catch (error) {
        console.error('加载 HiFi 输出设备失败:', error)
        return hifiAudioDeviceOptions.value
    }
}
const refreshHifiOutputBackend = async () => {
    if (hifiOutputBusy.value) return
    hifiOutputBusy.value = true
    try {
        await loadHifiOutputState()
        if (playerStore.localHifiOutput) await loadHifiAudioDevices()
    } finally {
        hifiOutputBusy.value = false
    }
}
const setLocalHifiOutput = async () => {
    if (playerStore.localHifiOutput) {
        playerStore.localHifiOutput = false
        await applyCurrentHifiOutputSettings()
        return
    }

    const state = await loadHifiOutputState()
    if (!state?.available) {
        noticeOpen('未找到 MPV 后端', 2)
        return
    }

    dialogOpen('确定开启', LOCAL_HIFI_OUTPUT_CONFIRM_MESSAGE, flag => {
        if (!flag) return
        playerStore.localHifiOutput = true
        void loadHifiAudioDevices()
        void applyCurrentHifiOutputSettings()
    })
}
const selectHifiMpvPath = async () => {
    if (hifiOutputBusy.value || !windowApi?.selectHifiOutputMpv) return
    hifiOutputBusy.value = true
    try {
        const filePath = await windowApi.selectHifiOutputMpv()
        if (!filePath) return
        playerStore.localHifiMpvPath = filePath
        await loadHifiOutputState()
        await loadHifiAudioDevices()
    } catch (error) {
        console.error('选择 MPV 后端失败:', error)
        noticeOpen('选择失败', 2)
    } finally {
        hifiOutputBusy.value = false
    }
}
const clearHifiMpvPath = async () => {
    playerStore.localHifiMpvPath = ''
    await refreshHifiOutputBackend()
}
const confirmLogout = () => {
    confirmAccountLogout(router)
}
const save = () => {
    selectedShortcut.value = null
    setCustomFont()
    saveSettings()
    noticeOpen('设置已保存', 2)
}
const toGithub = () => {
    windowApi.toRegister('https://github.com/ldx123000/Hydrogen-Music')
}

// 检查更新功能
const checkForUpdates = () => {
    showUpdateDialog.value = true
    windowApi.checkForUpdate()
}

// 更新对话框事件处理
const handleUpdateDownload = () => {
    windowApi.downloadUpdate()
}

const handleUpdateInstall = () => {
    windowApi.installUpdate()
}

const handleUpdateCancel = () => {
    windowApi.cancelUpdate()
}

const handleUpdateRetry = () => {
    windowApi.checkForUpdate()
}

const closeUpdateDialog = () => {
    showUpdateDialog.value = false
}

// 清空当前账号的“私人漫游”近期去重队列
const getFmRecentKey = () => {
    const uid = userStore?.user?.userId || 'guest'
    return `hm.fm.recentPlayedQueue:${uid}`
}
const clearFmRecent = () => {
    try {
        localStorage.removeItem(getFmRecentKey())
        // 通知个人FM组件刷新其内存中的近期队列
        window.dispatchEvent(new CustomEvent('fmClearRecent', { detail: { userId: userStore?.user?.userId || 'guest' } }))
        noticeOpen('已清空当前账号的私人漫游缓存', 2)
    } catch (e) {
        console.error('清空私人漫游缓存失败:', e)
        noticeOpen('清空失败', 2)
    }
}

const toggleLocalOnlyMode = async () => {
    userStore.localOnlyMode = !userStore.localOnlyMode
    if (userStore.localOnlyMode) {
        vipInfo.value = null
        await enforceLocalOnlyPlayback()
        noticeOpen('已切换为仅本地音乐模式', 2)
        return
    }

    await restoreOnlinePlayback()
    await initializeCurrentAccountSession()
    await loadVipInfo()
    noticeOpen('已恢复在线音乐功能', 2)
}
</script>

<template>
    <div class="settings-page" @click="selectedShortcut = null">
        <div class="view-control">
            <svg t="1669039513804" @click="routerChange()" class="router-last" viewBox="-107 -86 1195 1195" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1053" width="200" height="200">
                <path d="M716.608 1010.112L218.88 512.384 717.376 13.888l45.248 45.248-453.248 453.248 452.48 452.48z" p-id="1054"></path>
            </svg>
            <span class="setting-title">
                <span class="setting-title-hint">设置(离开页面以保存设置或</span>
                <span class="save" @click="save()"><span class="save-desktop">点击</span><span class="save-mobile">保存</span></span>
                <span class="setting-title-hint">保存)</span>
            </span>
        </div>
        <div class="settings-container">
            <h1 class="settings-title">设置</h1>
            <div class="settings-user-info" v-if="!userStore.localOnlyMode && isLogin()">
                <div class="user">
                    <div class="user-head">
                        <img :src="userStore.user.avatarUrl + '?param=300y300'" alt="" />
                    </div>
                    <div class="user-info">
                        <div class="user-name">{{ userStore.user.nickname }}</div>
                        <div class="user-vip" v-if="vipInfo && userStore.user.vipType != 0">
                            <img :src="vipInfo.redVipDynamicIconUrl" alt="" />
                        </div>
                    </div>
                </div>
                <div class="logout" @click="confirmLogout()">
                    <span>退出</span>
                </div>
            </div>
            <div class="settings">
                <div class="settings-item">
                    <h2 class="item-title">音乐</h2>
                    <div class="line"></div>
                    <div class="item-options">
                        <div class="option" v-if="!userStore.localOnlyMode">
                            <div class="option-name">音质选择</div>
                            <div class="option-operation">
                                <Selector v-model="musicLevel" :options="musicLevelOptions" :maxItems="9"></Selector>
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">开启背景封面模糊</div>
                            <div class="option-operation">
                                <div class="toggle" @click="setCoverBlur()">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': playerStore.coverBlur }">{{ playerStore.coverBlur ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="playerStore.coverBlur"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">开启歌词模糊</div>
                            <div class="option-operation">
                                <div class="toggle" @click="setLyricBlur()">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': playerStore.lyricBlur }">{{ playerStore.lyricBlur ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="playerStore.lyricBlur"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">显示歌曲翻译</div>
                            <div class="option-operation">
                                <div class="toggle" @click="playerStore.showSongTranslation = !playerStore.showSongTranslation">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': playerStore.showSongTranslation }">
                                        {{ playerStore.showSongTranslation ? '已开启' : '已关闭' }}
                                    </div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="playerStore.showSongTranslation"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">歌曲无缝衔接</div>
                            <div class="option-operation">
                                <div class="toggle" @click="setGaplessPlayback()">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': playerStore.gaplessPlayback }">{{ playerStore.gaplessPlayback ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="playerStore.gaplessPlayback"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">音频可视化</div>
                            <div class="option-operation">
                                <div class="toggle" @click="setAudioVisualizer()">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': playerStore.audioVisualizer }">{{ playerStore.audioVisualizer ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="playerStore.audioVisualizer"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option" v-if="!userStore.localOnlyMode">
                            <div class="option-name">搜索下拉条目数量</div>
                            <div class="option-operation">
                                <input v-model="searchAssistLimit" name="searchAssistLimit" />
                            </div>
                        </div>
                        <!-- 歌词字体大小：原来「歌词 / 翻译 / 罗马音」是三个自由输入框，
                             手机上要调出输入法手填数字，很难用；改成三档预设。
                             三者比例固定（罗马音 < 翻译 < 原文），仍写回原来的三个字段。
                             三档彼此有序，用滑轨比下拉少一次点击。 -->
                        <div class="option">
                            <div class="option-name">歌词字体大小</div>
                            <div class="option-operation">
                                <div class="font-size-slider" role="radiogroup" aria-label="歌词字体大小">
                                    <div
                                        class="slider-thumb"
                                        :style="{ transform: `translateX(${fontSizePresetIndex * 100}%)` }"
                                        aria-hidden="true"
                                    ></div>
                                    <div
                                        v-for="preset in FONT_SIZE_PRESETS"
                                        :key="preset.value"
                                        class="slider-cell"
                                        :class="{ 'is-active': fontSizePreset === preset.value }"
                                        role="radio"
                                        :aria-checked="fontSizePreset === preset.value ? 'true' : 'false'"
                                        @click="applyFontSizePreset(preset.value)"
                                    >{{ preset.label }}</div>
                                </div>
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">歌词间奏等待时间(单位：秒)</div>
                            <div class="option-operation">
                                <input v-model="lyricInterlude" name="lyricInterlude" />
                            </div>
                        </div>
                        <!-- 音乐视频（B 站）功能在 Android 上没有意义：
                             播放与下载依赖 Electron 主进程的网络豁免（windowApi.requestTrustedResource
                             之外的 getBiliVideo / musicVideoIsExists 等在 webBridge 里都是空实现），
                             设置项留着也点不动，整块在移动端隐藏。 -->
                        <div class="option hm-mobile-hide" v-if="!userStore.localOnlyMode">
                            <div class="option-name">开启音乐视频功能</div>
                            <div class="option-operation">
                                <div class="toggle" @click="setMusicVideo()">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': playerStore.musicVideo }">{{ playerStore.musicVideo ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="playerStore.musicVideo"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option hm-mobile-hide" v-if="!userStore.localOnlyMode && playerStore.musicVideo">
                            <div class="option-name">删除所有未被使用的音乐视频</div>
                            <div class="option-operation">
                                <div class="button" @click="clearMusicVideo()">清除</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="settings-item">
                    <h2 class="item-title">本地</h2>
                    <div class="line"></div>
                    <div class="item-options">
                        <div class="option">
                            <div class="option-name">仅本地音乐模式</div>
                            <div class="option-operation">
                                <div class="toggle" @click="toggleLocalOnlyMode()">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': userStore.localOnlyMode }">{{ userStore.localOnlyMode ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="userStore.localOnlyMode"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <!-- 本地 HiFi 输出整块依赖随包的 MPV 后端，Android 上隐藏 -->
                        <template v-if="showHifiSettings">
                        <div class="option">
                            <div class="option-name">本地音乐 HiFi 输出</div>
                            <div class="option-operation">
                                <div class="toggle" @click="setLocalHifiOutput()">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': playerStore.localHifiOutput }">{{ playerStore.localHifiOutput ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="playerStore.localHifiOutput"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option" v-if="playerStore.localHifiOutput">
                            <div class="option-name">本地 HiFi 输出模式</div>
                            <div class="option-operation">
                                <Selector
                                    v-model="playerStore.localHifiOutputMode"
                                    :options="localHifiOutputModeOptions"
                                    @change="applyCurrentHifiOutputSettings"
                                ></Selector>
                            </div>
                        </div>
                        <div class="option" v-if="playerStore.localHifiOutput">
                            <div class="option-name">本地 HiFi 输出设备</div>
                            <div class="option-operation">
                                <Selector
                                    v-model="playerStore.localHifiAudioDevice"
                                    :options="hifiAudioDeviceOptions"
                                    :maxItems="8"
                                    :searchable="true"
                                    :optionWidth="280"
                                    @open="loadHifiAudioDevices"
                                    @change="applyCurrentHifiOutputSettings"
                                ></Selector>
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">MPV 后端</div>
                            <div class="select-download-folder">
                                <div class="selected-folder" :title="hifiOutputState.mpvPath || playerStore.localHifiMpvPath">
                                    {{ hifiOutputState.available ? (hifiOutputState.source === 'builtin' ? '内置 MPV' : hifiOutputState.mpvPath) : '未检测到' }}
                                </div>
                                <div class="select-option" @click="selectHifiMpvPath">{{ hifiOutputBusy ? '检测中' : '选择' }}</div>
                                <div class="select-option" @click="refreshHifiOutputBackend">刷新</div>
                                <div class="select-option" v-if="playerStore.localHifiMpvPath" @click="clearHifiMpvPath">清除</div>
                            </div>
                        </div>
                        </template>
                        <div class="option" v-if="!userStore.localOnlyMode && playerStore.musicVideo">
                            <div class="option-name">音乐视频缓存</div>
                            <div class="select-download-folder">
                                <div class="selected-folder" :title="videoFolder">{{ videoFolder ? videoFolder : '待选择' }}</div>
                                <div class="select-option" @click="selectFolder('video')">选择</div>
                            </div>
                        </div>
                        <div class="option" v-if="!userStore.localOnlyMode">
                            <div class="option-name">下载目录</div>
                            <div class="select-download-folder">
                                <div class="selected-folder" :title="downloadFolder">{{ downloadFolder ? downloadFolder : '待选择' }}</div>
                                <div class="select-option" @click="selectFolder('download')">选择</div>
                            </div>
                        </div>
                        <div class="option" v-if="!userStore.localOnlyMode">
                            <div class="option-name">下载歌曲时创建独立文件夹</div>
                            <div class="option-operation">
                                <div class="toggle" @click="downloadCreateSongFolder = !downloadCreateSongFolder">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': downloadCreateSongFolder }">{{ downloadCreateSongFolder ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="downloadCreateSongFolder"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option" v-if="!userStore.localOnlyMode">
                            <div class="option-name">下载歌曲时创建独立歌词文件</div>
                            <div class="option-operation">
                                <div class="toggle" @click="downloadSaveLyricFile = !downloadSaveLyricFile">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': downloadSaveLyricFile }">{{ downloadSaveLyricFile ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="downloadSaveLyricFile"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">本地目录</div>
                            <!-- 与「下载目录」用同一套 UI（select-download-folder + select-option），
                                 两处外观、间距、对齐完全一致；也不再显示那段说明文字。 -->
                            <div class="select-download-folder">
                                <div class="selected-folder" :title="item" @contextmenu="deleteLocalFolder(index)" v-for="(item, index) in localFolder">{{ item ? item : '请添加' }}</div>
                                <div class="select-option" @click="selectFolder('local')">添加</div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- 快捷键：整块在移动端隐藏。
                     Android 上没有物理键盘，也没有 Electron 的 globalShortcut 能力，
                     「开启全局快捷键」「功能说明 / 快捷键 / 全局快捷键」列表和
                     「恢复默认快捷键」全都没有意义（之前只隐藏了开关那一行，
                     剩下的标题和列表还留在页面上）。 -->
                <div class="settings-item hm-mobile-hide">
                    <h2 class="item-title">快捷键</h2>
                    <div class="line"></div>
                    <div class="item-options" tabindex="0" @keydown="inputShortcut($event)">
                        <div class="option hm-mobile-hide">
                            <div class="option-name">开启全局快捷键</div>
                            <div class="option-operation">
                                <div class="toggle" @click="globalShortcuts = !globalShortcuts">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': globalShortcuts }">{{ globalShortcuts ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="globalShortcuts"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="shortcuts-title hm-mobile-hide">
                            <div class="title-function">功能说明</div>
                            <div class="title-shortcuts">快捷键</div>
                            <div class="title-globalShortcuts" :class="{ 'forbid-shortcuts': !globalShortcuts }">全局快捷键</div>
                        </div>
                        <div class="shortcuts hm-mobile-hide" v-for="(item, index) in shortcutsList">
                            <div class="shortcut-name">{{ item.name }}</div>
                            <div
                                class="shortcut"
                                :class="{ 'shortcut-selected': selectedShortcut && selectedShortcut.id == item.id && !selectedShortcut.type }"
                                @click.stop="changeShortcut(item.id, false)"
                            >
                                {{ formatShortcutName(item.shortcut) }}
                            </div>
                            <div
                                class="globalShortcut"
                                :class="{ 'shortcut-selected': selectedShortcut && selectedShortcut.id == item.id && selectedShortcut.type, 'forbid-shortcuts': !globalShortcuts }"
                                @click.stop="changeShortcut(item.id, true)"
                            >
                                {{ formatShortcutName(item.globalShortcut) }}
                            </div>
                        </div>
                        <div class="default-shortcuts hm-mobile-hide" @click="setDefaultShortcuts()">恢复默认快捷键</div>
                    </div>
                </div>
                <div class="settings-item">
                    <h2 class="item-title">其他</h2>
                    <div class="line"></div>
                    <div class="item-options">
                        <div class="option">
                            <div class="option-name">主题</div>
                            <div class="option-operation">
                                <Selector v-model="theme" :options="themeOptions"></Selector>
                            </div>
                        </div>
                        <div class="option" v-if="!userStore.localOnlyMode">
                            <div class="option-name">开启首页页面</div>
                            <div class="option-operation">
                                <div class="toggle" @click="userStore.homePage = !userStore.homePage">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': userStore.homePage }">{{ userStore.homePage ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="userStore.homePage"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option" v-if="!userStore.localOnlyMode">
                            <div class="option-name">开启云盘页面</div>
                            <div class="option-operation">
                                <div class="toggle" @click="userStore.cloudDiskPage = !userStore.cloudDiskPage">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': userStore.cloudDiskPage }">{{ userStore.cloudDiskPage ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="userStore.cloudDiskPage"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option" v-if="!userStore.localOnlyMode">
                            <div class="option-name">开启私人漫游页面</div>
                            <div class="option-operation">
                                <div class="toggle" @click="userStore.personalFMPage = !userStore.personalFMPage">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': userStore.personalFMPage }">{{ userStore.personalFMPage ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="userStore.personalFMPage"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option" v-if="!userStore.localOnlyMode">
                            <div class="option-name">开启塞壬唱片页面</div>
                            <div class="option-operation">
                                <div class="toggle" @click="userStore.sirenPage = !userStore.sirenPage">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': userStore.sirenPage }">{{ userStore.sirenPage ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="userStore.sirenPage"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option" v-if="!userStore.localOnlyMode && userStore.personalFMPage">
                            <div class="option-name">清空漫游缓存</div>
                            <div class="option-operation">
                                <div class="button" @click="clearFmRecent">清空</div>
                            </div>
                        </div>
                        <div class="option hm-mobile-hide">
                            <div class="option-name">记住窗口大小</div>
                            <div class="option-operation">
                                <div class="toggle" @click="rememberWindowSize = !rememberWindowSize">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': rememberWindowSize }">{{ rememberWindowSize ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="rememberWindowSize"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option hm-mobile-hide">
                            <div class="option-name">退出应用时</div>
                            <div class="option-operation">
                                <Selector v-model="quitApp" :options="quitAppOptions"></Selector>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="app-version">
                <div class="app-icon">
                    <img src="@shared-assets/icon/icon.ico" alt="" />
                </div>
                <div class="version">Hydrogen Music</div>
                <div class="version">Android V{{ appVersion }}</div>
                <div class="app-author" @click="toGithub()">Made by ldx123000 | Modified from Hydrogen Music</div>
                <div class="app-author original">Android 移植贡献：CY · 羟醛缩合可以增长碳链</div>
            </div>
        </div>

        <!-- 更新对话框 -->
        <UpdateDialog
            :visible="showUpdateDialog"
            :new-version="newVersion"
            @close="closeUpdateDialog"
            @download="handleUpdateDownload"
            @install="handleUpdateInstall"
            @cancel="handleUpdateCancel"
            @retry="handleUpdateRetry"
        />
    </div>
</template>

<style scoped lang="scss">
.settings-page {
    width: 100%;
    height: 100%;
    .view-control {
        margin-bottom: 15px;
        margin-left: -8px;
        height: 32px;
        display: flex;
        flex-direction: row;
        align-items: center;
        svg {
            padding: 4px;
            width: 32px;
            height: 32px;
            float: left;
            transition: 0.2s;
            &:hover {
                cursor: pointer;
                opacity: 0.7;
            }
            &:active {
                transform: scale(0.9);
            }
        }
        .router-last {
            margin-right: 5px;
        }
        .setting-title {
            font: 17px SourceHanSansCN-Bold;
            color: black;
            .save {
                font-size: 15px;
                padding: 6px;
                background-color: rgba(255, 255, 255, 0.35);
                transition: 0.1s;
                &:hover {
                    cursor: pointer;
                    opacity: 0.8;
                }
                &:active {
                    opacity: 0.5;
                }
            }
        }
    }
    .settings-container {
        margin: 0 auto;
        padding-bottom: 140px;
        width: 80%;
        height: calc(100% - 47px);
        overflow: auto;
        &::-webkit-scrollbar {
            display: none;
        }
        .settings-title {
            font-family: SourceHanSansCN-Bold;
            color: black;
            text-align: left;
        }
        .settings-user-info {
            padding: 10px 40px;
            width: 100%;
            height: 100px;
            background-color: rgba(255, 255, 255, 0.35);
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            .user {
                display: flex;
                flex-direction: row;
                align-items: center;
                .user-head {
                    margin-right: 15px;
                    width: 70px;
                    height: 70px;
                    border-radius: 50%;
                    overflow: hidden;
                    img {
                        width: 100%;
                        height: 100%;
                    }
                }
                .user-info {
                    .user-name {
                        font: 20px Source Han Sans;
                        font-weight: bold;
                        color: black;
                    }
                    .user-vip {
                        width: 40px;
                        img {
                            width: 100%;
                        }
                    }
                }
            }
            .logout {
                font: 14px SourceHanSansCN-Bold;
                font-weight: bold;
                color: black;
                transition: 0.2s;
                &:hover {
                    cursor: pointer;
                }
                &:active {
                    transform: scale(0.95);
                }
            }
        }
        .settings {
            width: 100%;
            .settings-item {
                margin-top: 45px;
                width: 100%;
                .item-title {
                    margin: 0;
                    font: 20px SourceHanSansCN-Bold;
                    color: black;
                    font-family: SourceHanSansCN-Bold;
                    color: black;
                    text-align: left;
                }
                .line {
                    margin-top: 8px;
                    margin-bottom: 25px;
                    width: 100%;
                    height: 0.5px;
                    background-color: rgba(0, 0, 0, 0.2);
                }
                .item-options {
                    outline: none;
                    .option {
                        margin-bottom: 32px;
                        display: flex;
                        flex-direction: row;
                        align-items: center;
                        justify-content: space-between;
                        .option-name {
                            font-family: SourceHanSansCN-Bold;
                            font-size: 16px;
                            color: black;
                            text-align: left;
                        }
                        input,
                        .selector {
                            margin-right: 1px;
                            width: 200px;
                            height: 34px;
                            padding: 5px 1px;
                            background-color: transparent;
                            color: black;
                            border: none;
                            outline: none;
                            appearance: none;
                            font: 13px SourceHanSansCN-Bold;
                            text-align: center;
                            transition: 0.2s;
                            &:hover {
                                cursor: pointer;
                                opacity: 0.8;
                                box-shadow: none;
                            }
                        }
                        select {
                            padding: 8px 10px;
                        }
                        option {
                            background-color: rgba(255, 255, 255, 0.35);
                            border: none;
                            outline: none;
                        }
                        .toggle {
                            margin-right: 1px;
                            height: 34px;
                            width: 200px;
                            position: relative;
                            overflow: hidden;
                            &:hover {
                                cursor: pointer;
                            }
                            .toggle-on,
                            .toggle-off {
                                padding: 5px 10px;
                                width: 100%;
                                height: 100%;
                                font: 13px SourceHanSansCN-Bold;
                                transition: 0.2s;
                                line-height: 24px;
                            }
                            .toggle-off {
                                background-color: rgba(255, 255, 255, 0.35);
                            }
                            .toggle-on {
                                background-color: black;
                                position: absolute;
                                top: 0;
                                left: 0;
                                z-index: -1;
                            }
                            .toggle-on-in {
                                color: white;
                                background-color: transparent;
                            }
                        }
                        /* 歌词字体大小：三档滑轨。
                         *
                         * 美术规范沿用同页其它控件：
                         *   · 直角、无圆角（本项目全局 border-radius: 0）
                         *   · 轨道底色 rgba(255,255,255,.35)，与 .toggle-off / .button 一致
                         *   · 选中态纯黑填充 + 白字，与 .toggle 开启态、Selector 选中项一致
                         *   · 字体 SourceHanSansCN-Bold 13px，高度 34px，宽度 200px
                         * 滑块用 z-index:0 而不是负值 —— 本项目有先例（见 .toggle-on 的
                         * z-index:-1 被父级 overflow:hidden 的层叠上下文盖住），
                         * 背景层天然在子元素之下，靠正常的绘制顺序即可。 */
                        .font-size-slider {
                            margin-right: 1px;
                            width: 200px;
                            height: 34px;
                            position: relative;
                            display: flex;
                            flex-direction: row;
                            background-color: rgba(255, 255, 255, 0.35);
                            overflow: hidden;
                            .slider-thumb {
                                width: calc(100% / 3);
                                height: 100%;
                                position: absolute;
                                top: 0;
                                left: 0;
                                z-index: 0;
                                background-color: black;
                                /* 与 Selector 的 background-position 切换同一条缓动 */
                                transition: transform 0.2s;
                            }
                            .slider-cell {
                                /* 三格等宽、文字居中。
                                 * 用 div 而不是 button：theme.css 有一条全局
                                 *   `.dark button { background-color:#2a2e34 !important; color:var(--text) !important }`，
                                 * 会把格子刷成不透明深色、盖住底下的滑块（深色下实测整条滑轨
                                 * 看不出选中的是哪一格）。本页其它同类控件（.toggle / .button /
                                 * Selector 选项）本来也都是 div，这里保持一致。 */
                                flex: 1 1 0;
                                min-width: 0;
                                height: 100%;
                                position: relative;
                                z-index: 1;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                background: transparent;
                                font: 13px SourceHanSansCN-Bold;
                                color: black;
                                cursor: pointer;
                                user-select: none;
                                -webkit-tap-highlight-color: transparent;
                                transition: color 0.2s;
                                &.is-active {
                                    color: white;
                                }
                            }
                        }
                        .button {
                            margin-right: 1px;
                            padding: 5px 10px;
                            width: 200px;
                            background-color: rgba(255, 255, 255, 0.35);
                            font: 13px SourceHanSansCN-Bold;
                            &:hover {
                                cursor: pointer;
                                opacity: 0.8;
                                box-shadow: 0 0 0 1px black;
                            }
                        }
                        .select-download-folder {
                            display: flex;
                            flex-direction: row;
                            align-items: center;
                            .selected-folder {
                                width: 50vw;
                                height: 30px;
                                background-color: rgba(255, 255, 255, 0.35);
                                font: 13px SourceHanSansCN-Bold;
                                color: black;
                                line-height: 30px;
                                overflow: hidden;
                            }
                            .select-option {
                                margin-right: 2px;
                                margin-left: 15px;
                                padding: 5px 15px;
                                font: 13px SourceHanSansCN-Bold;
                                color: black;
                                background-color: rgba(255, 255, 255, 0.35);
                                transition: 0.2s;
                                &:hover {
                                    cursor: pointer;
                                    opacity: 0.8;
                                    box-shadow: 0 0 0 1px black;
                                }
                            }
                        }
                        .local-folder {
                            display: flex;
                            flex-direction: row;
                            align-items: center;
                            .selected-local-folder-item {
                                display: flex;
                                flex-direction: column;
                                .selected-folder {
                                    margin-bottom: 10px;
                                    width: 50vw;
                                    height: 30px;
                                    background-color: rgba(255, 255, 255, 0.35);
                                    font: 13px SourceHanSansCN-Bold;
                                    color: black;
                                    line-height: 30px;
                                    overflow: hidden;
                                }
                                .tip {
                                    font: 10px SourceHanSansCN-Bold;
                                    color: black;
                                    text-align: left;
                                }
                            }
                            .add-option {
                                margin-right: 2px;
                                margin-left: 15px;
                                padding: 5px 15px;
                                font: 13px SourceHanSansCN-Bold;
                                color: black;
                                background-color: rgba(255, 255, 255, 0.35);
                                transition: 0.2s;
                                &:hover {
                                    cursor: pointer;
                                    opacity: 0.8;
                                    box-shadow: 0 0 0 1px black;
                                }
                            }
                        }
                    }
                    .forbid-shortcuts {
                        opacity: 0.5;
                        pointer-events: none;
                    }
                    .shortcuts-title {
                        font: 14px SourceHanSansCN-Bold;
                        color: black;
                        display: flex;
                        flex-direction: row;
                        align-items: center;
                        text-align: left;
                        div {
                            margin-right: 15px;
                            padding: 0 6px;
                        }
                        .title-function {
                            min-width: 130px;
                        }
                        .title-shortcuts,
                        .title-globalShortcuts {
                            min-width: 200px;
                        }
                    }
                    .shortcuts {
                        font: 14px SourceHanSansCN-Bold;
                        color: black;
                        display: flex;
                        flex-direction: row;
                        display: flex;
                        flex-direction: row;
                        align-items: center;
                        text-align: left;
                        div {
                            margin-top: 15px;
                            margin-right: 15px;
                            padding: 6px;
                            background-color: rgba(255, 255, 255, 0.35);
                        }
                        .shortcut-name {
                            min-width: 130px;
                            background-color: transparent;
                        }
                        .shortcut,
                        .globalShortcut {
                            min-width: 200px;
                            &:hover {
                                cursor: pointer;
                            }
                        }
                        .shortcut-selected {
                            box-shadow: 0 0 0 1px black;
                        }
                    }
                    .default-shortcuts {
                        margin-top: 15px;
                        margin-left: 1px;
                        width: 120px;
                        padding: 6px;
                        background-color: rgba(255, 255, 255, 0.35);
                        font: 14px SourceHanSansCN-Bold;
                        transition: 0.2s;
                        color: black;
                        &:hover {
                            cursor: pointer;
                            box-shadow: 0 0 0 1px black;
                        }
                    }
                }
            }
        }
        .app-version {
            display: flex;
            flex-direction: column;
            align-items: center;
            .app-icon {
                margin-bottom: 10px;
                width: 65px;
                height: 65px;
                img {
                    width: 100%;
                    height: 100%;
                }
            }
            .version {
                font: 14px Geometos;
                color: black;
                text-align: center;
                line-height: 1.5;
                /* 版本号后面的 bata 标记：小号、带底框，和版本号区分开 */
                .beta-tag {
                    display: inline-block;
                    margin-left: 6px;
                    padding: 0 6px;
                    border: 1px solid currentColor;
                    border-radius: 3px;
                    font: 10px SourceHanSansCN-Bold;
                    line-height: 16px;
                    vertical-align: 1px;
                    opacity: 0.75;
                }
            }
            .update-check {
                margin: 8px 0;

                .check-update-btn {
                    padding: 5px 15px;
                    background-color: rgba(255, 255, 255, 0.35);
                    color: black;
                    border: none;
                    border-radius: 0;
                    outline: none;
                    font: 13px SourceHanSansCN-Bold;
                    cursor: pointer;
                    transition: 0.2s;

                    &:hover {
                        opacity: 0.8;
                        box-shadow: 0 0 0 1px black;
                    }

                    &:focus {
                        outline: none;
                        border-radius: 0;
                        box-shadow: 0 0 0 1px black;
                    }

                    &:active {
                        outline: none;
                        border-radius: 0;
                        box-shadow: 0 0 0 1px black;
                    }
                }
            }
            .app-author {
                margin-top: 10px;
                /* 这行含中文，Bender-Bold 没有中文字形，
                   交给 SourceHanSansCN-Bold（项目里中文统一用它），字号略降避免换行 */
                font: 13px SourceHanSansCN-Bold;
                color: black;
                text-align: center;
                line-height: 1.4;
                &:hover {
                    cursor: pointer;
                    text-decoration: underline;
                }
                /* 原作者署名：次要层级，比上面那行小一点、淡一点 */
                &.original {
                    margin-top: 6px;
                    font-size: 11px;
                    opacity: 0.65;
                    &:hover {
                        text-decoration: none;
                        cursor: default;
                    }
                }
            }
        }
    }
}
.toggle-enter-active,
.toggle-leave-active {
    transition: 0.1s;
}
.toggle-enter-from,
.toggle-leave-to {
    transform: translateX(-100%);
}
</style>
