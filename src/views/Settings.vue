<script setup>
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
import { logoutCurrentAccountSession } from '@/utils/accountSession'
import { getSettingsSnapshot, setCachedSettingsSnapshot } from '@/utils/settingsSnapshot'
import { applyCustomFontStyle, syncDesktopLyricCustomFont } from '@/utils/setFont'
import { buildFontOptions, loadSystemFontOptions, resolveSystemFontLabel, resolveSystemFontValue } from '@/utils/fontResolver'
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
const lyricInterlude = ref(13)
const searchAssistLimit = ref(8)
const globalShortcuts = ref(false)
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
const customSourceState = ref({
    enabled: false,
    hasSource: false,
    source: null,
})
const customSourceBusy = ref(false)
const customSourceTesting = ref(false)
const customSourceImportUrl = ref('')
let systemFontsLoadPromise = null

const fontOptions = computed(() => buildFontOptions({
    systemFonts: systemFonts.value,
    customFont: customFont.value,
    customFontLabel: customFontLabel.value,
}))

// 更新相关状态
const showUpdateDialog = ref(false)
const newVersion = ref('')
let updateListenersInitialized = false
let removeUpdateListeners = null
const PERFORMANCE_CONFIRM_MESSAGE = '开启后此功能会消耗一定性能且可能造成卡顿，确定开启吗？'
const GAPLESS_CONFIRM_MESSAGE = '开启后会提前预缓冲下一首音频，可能增加网络流量和内存占用，确定开启吗？'
const CUSTOM_SOURCE_CONFIRM_MESSAGE = '开启后会在网易云无法解析歌曲时调用导入的脚本获取播放地址，确定开启吗？'

const loadVipInfo = async () => {
    const requestUserId = userStore.user?.userId
    if (!requestUserId || !isLogin()) {
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

const applyCustomSourceState = state => {
    if (state && typeof state === 'object') customSourceState.value = state
}

const applyCustomSourceResult = result => {
    if (result?.state) applyCustomSourceState(result.state)
    return result
}

const loadCustomSourceState = async () => {
    if (!windowApi?.getCustomSourceState) return
    try {
        applyCustomSourceState(await windowApi.getCustomSourceState())
    } catch (error) {
        console.error('加载自定义解析源状态失败:', error)
    }
}

const applySettingsToForm = settings => {
    if (!settings) return
    const normalizedSettings = normalizeSettings(settings)
    musicLevel.value = normalizedSettings.music.level
    lyricSize.value = normalizedSettings.music.lyricSize
    tlyricSize.value = normalizedSettings.music.tlyricSize
    rlyricSize.value = normalizedSettings.music.rlyricSize
    lyricInterlude.value = normalizedSettings.music.lyricInterlude
    searchAssistLimit.value = normalizedSettings.music.searchAssistLimit
    playerStore.showSongTranslation = normalizedSettings.music.showSongTranslation !== false
    playerStore.gaplessPlayback = normalizedSettings.music.gaplessPlayback === true
    playerStore.audioVisualizer = normalizedSettings.music.audioVisualizer === true
    videoFolder.value = normalizedSettings.local.videoFolder
    downloadFolder.value = normalizedSettings.local.downloadFolder
    downloadCreateSongFolder.value = !!normalizedSettings.local.downloadCreateSongFolder
    downloadSaveLyricFile.value = !!normalizedSettings.local.downloadSaveLyricFile
    localFolder.value = normalizedSettings.local.localFolder
    shortcutsList.value = normalizedSettings.shortcuts
    globalShortcuts.value = normalizedSettings.other.globalShortcuts
    quitApp.value = normalizedSettings.other.quitApp
    customFont.value = normalizedSettings.other.customFont
    customFontLabel.value = normalizedSettings.other.customFontLabel
}

onActivated(() => {
    void getSettingsSnapshot().then(applySettingsToForm)
    void loadSystemFonts()
    void loadCustomSourceState()

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
    const resolvedLabel = resolvedFont
        ? String(resolveSystemFontLabel(resolvedFont, fallbackLabel, systemFonts.value)).trim()
        : ''
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
    if (type == 'download') {
        windowApi.openFile().then(path => {
            downloadFolder.value = path
        })
    } else if (type == 'local') {
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
const setCustomSourceEnabled = () => {
    if (!customSourceState.value?.hasSource) {
        noticeOpen('请先导入自定义解析源', 2)
        return
    }

    const nextEnabled = !customSourceState.value.enabled
    if (!nextEnabled) {
        void updateCustomSourceEnabled(false)
        return
    }

    dialogOpen('确定开启', CUSTOM_SOURCE_CONFIRM_MESSAGE, flag => {
        if (flag) void updateCustomSourceEnabled(true)
    })
}
const updateCustomSourceEnabled = async enabled => {
    if (customSourceBusy.value || !windowApi?.setCustomSourceEnabled) return
    customSourceBusy.value = true
    try {
        applyCustomSourceState(await windowApi.setCustomSourceEnabled(enabled))
    } catch (error) {
        console.error('设置自定义解析源失败:', error)
        noticeOpen('设置失败', 2)
    } finally {
        customSourceBusy.value = false
    }
}
const importCustomSource = async () => {
    if (customSourceBusy.value || !windowApi?.importCustomSource) return
    customSourceBusy.value = true
    try {
        const result = applyCustomSourceResult(await windowApi.importCustomSource())
        if (result?.canceled) return
        noticeOpen(result?.ok ? '已导入自定义解析源' : (result?.message || '导入失败'), result?.ok ? 2 : 3)
    } catch (error) {
        console.error('导入自定义解析源失败:', error)
        noticeOpen('导入失败', 3)
    } finally {
        customSourceBusy.value = false
    }
}
const importCustomSourceFromUrl = async () => {
    const url = customSourceImportUrl.value.trim()
    if (!url) {
        noticeOpen('请输入自定义解析源链接', 2)
        return
    }
    if (customSourceBusy.value || !windowApi?.importCustomSourceFromUrl) return

    customSourceBusy.value = true
    try {
        const result = applyCustomSourceResult(await windowApi.importCustomSourceFromUrl(url))
        if (result?.ok) customSourceImportUrl.value = ''
        noticeOpen(result?.ok ? '已从链接导入自定义解析源' : (result?.message || '导入失败'), result?.ok ? 2 : 3)
    } catch (error) {
        console.error('从链接导入自定义解析源失败:', error)
        noticeOpen('导入失败', 3)
    } finally {
        customSourceBusy.value = false
    }
}
const testCustomSource = async () => {
    if (customSourceBusy.value || customSourceTesting.value || !windowApi?.testCustomSource) return
    customSourceTesting.value = true
    try {
        const result = applyCustomSourceResult(await windowApi.testCustomSource({
            quality: musicLevel.value,
        }))
        noticeOpen(result?.ok ? (result?.message || '解析源可用') : (result?.message || '测试失败'), result?.ok ? 2 : 3)
    } catch (error) {
        console.error('测试自定义解析源失败:', error)
        noticeOpen('测试失败', 3)
    } finally {
        customSourceTesting.value = false
    }
}
const removeCustomSource = () => {
    if (!customSourceState.value?.hasSource || customSourceBusy.value || !windowApi?.removeCustomSource) return
    dialogOpen('确认移除', '确定移除当前自定义解析源吗？', async flag => {
        if (!flag) return
        customSourceBusy.value = true
        try {
            applyCustomSourceState(await windowApi.removeCustomSource())
            noticeOpen('已移除自定义解析源', 2)
        } catch (error) {
            console.error('移除自定义解析源失败:', error)
            noticeOpen('移除失败', 3)
        } finally {
            customSourceBusy.value = false
        }
    })
}
const userLogout = async () => {
    if (!isLogin()) {
        noticeOpen('您已退出账号', 2)
        return
    }

    await logoutCurrentAccountSession()
    router.push('/')
    noticeOpen('已退出账号', 2)
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
</script>

<template>
    <div class="settings-page" @click="selectedShortcut = null">
        <div class="view-control">
            <svg t="1669039513804" @click="routerChange()" class="router-last" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1053" width="200" height="200">
                <path d="M716.608 1010.112L218.88 512.384 717.376 13.888l45.248 45.248-453.248 453.248 452.48 452.48z" p-id="1054"></path>
            </svg>
            <span class="setting-title">
                设置(离开页面以保存设置或
                <span class="save" @click="save()">点击</span>
                保存)
            </span>
        </div>
        <div class="settings-container">
            <h1 class="settings-title">设置</h1>
            <div class="settings-user-info" v-if="isLogin()">
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
                <div class="logout" @click="userLogout()">
                    <span>退出</span>
                </div>
            </div>
            <div class="settings">
                <div class="settings-item">
                    <h2 class="item-title">音乐</h2>
                    <div class="line"></div>
                    <div class="item-options">
                        <div class="option">
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
                        <div class="option">
                            <div class="option-name">自定义解析源</div>
                            <div class="select-download-folder custom-source-setting">
                                <div class="selected-folder" :title="customSourceState.source?.name || ''">
                                    {{ customSourceState.source?.name || '未导入' }}
                                </div>
                                <div class="select-option" @click="importCustomSource">{{ customSourceBusy ? '处理中' : '导入文件' }}</div>
                                <div class="select-option" :class="{ 'source-option-disabled': !customSourceState.hasSource || customSourceBusy || customSourceTesting }" @click="testCustomSource">
                                    {{ customSourceTesting ? '测试中' : '测试' }}
                                </div>
                                <div class="select-option" :class="{ 'source-option-disabled': !customSourceState.hasSource || customSourceBusy }" @click="removeCustomSource">移除</div>
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">解析源链接</div>
                            <div class="select-download-folder custom-source-link">
                                <input v-model="customSourceImportUrl" placeholder="https://.../source.js" @click.stop />
                                <div class="select-option" :class="{ 'source-option-disabled': customSourceBusy || !customSourceImportUrl.trim() }" @click="importCustomSourceFromUrl">
                                    {{ customSourceBusy ? '处理中' : '导入链接' }}
                                </div>
                            </div>
                        </div>
                        <div class="option" v-if="customSourceState.hasSource">
                            <div class="option-name">启用自定义解析源</div>
                            <div class="option-operation">
                                <div class="toggle" @click="setCustomSourceEnabled()">
                                    <div class="toggle-off" :class="{ 'toggle-on-in': customSourceState.enabled }">{{ customSourceState.enabled ? '已开启' : '已关闭' }}</div>
                                    <Transition name="toggle">
                                        <div class="toggle-on" v-show="customSourceState.enabled"></div>
                                    </Transition>
                                </div>
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">搜索下拉条目数量</div>
                            <div class="option-operation">
                                <input v-model="searchAssistLimit" name="searchAssistLimit" />
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">歌词字体大小</div>
                            <div class="option-operation">
                                <input v-model="lyricSize" name="lyricSize" />
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">歌词翻译字体大小</div>
                            <div class="option-operation">
                                <input v-model="tlyricSize" name="tlyricSize" />
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">罗马歌词字体大小</div>
                            <div class="option-operation">
                                <input v-model="rlyricSize" name="rlyricSize" />
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">歌词间奏等待时间(单位：秒)</div>
                            <div class="option-operation">
                                <input v-model="lyricInterlude" name="lyricInterlude" />
                            </div>
                        </div>
                        <div class="option">
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
                        <div class="option" v-if="playerStore.musicVideo">
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
                        <div class="option" v-if="playerStore.musicVideo">
                            <div class="option-name">音乐视频缓存</div>
                            <div class="select-download-folder">
                                <div class="selected-folder" :title="videoFolder">{{ videoFolder ? videoFolder : '待选择' }}</div>
                                <div class="select-option" @click="selectFolder('video')">选择</div>
                            </div>
                        </div>
                        <div class="option">
                            <div class="option-name">下载目录</div>
                            <div class="select-download-folder">
                                <div class="selected-folder" :title="downloadFolder">{{ downloadFolder ? downloadFolder : '待选择' }}</div>
                                <div class="select-option" @click="selectFolder('download')">选择</div>
                            </div>
                        </div>
                        <div class="option">
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
                        <div class="option">
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
                            <div class="local-folder">
                                <div class="selected-local-folder-item">
                                    <div class="selected-folder" :title="item" @contextmenu="deleteLocalFolder(index)" v-for="(item, index) in localFolder">{{ item ? item : '请添加' }}</div>
                                    <div class="tip">您可以同时添加多个目录,右键移除您不需要的目录。数据量过大时需要一定扫描时间,请稍等。</div>
                                </div>
                                <div class="add-option" @click="selectFolder('local')">添加</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="settings-item">
                    <h2 class="item-title">快捷键</h2>
                    <div class="line"></div>
                    <div class="item-options" tabindex="0" @keydown="inputShortcut($event)">
                        <div class="option">
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
                        <div class="shortcuts-title">
                            <div class="title-function">功能说明</div>
                            <div class="title-shortcuts">快捷键</div>
                            <div class="title-globalShortcuts" :class="{ 'forbid-shortcuts': !globalShortcuts }">全局快捷键</div>
                        </div>
                        <div class="shortcuts" v-for="(item, index) in shortcutsList">
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
                        <div class="default-shortcuts" @click="setDefaultShortcuts()">恢复默认快捷键</div>
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
                        <div class="option">
                            <div class="option-name">自定义字体</div>
                            <div class="option-operation">
                                <FontSelector
                                    v-model="customFont"
                                    :options="fontOptions"
                                    :loading="systemFontsLoading"
                                    @open="loadSystemFonts"
                                    @change="setCustomFont"
                                ></FontSelector>
                            </div>
                        </div>
                        <div class="option">
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
                        <div class="option">
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
                        <div class="option">
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
                        <div class="option">
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
                        <div class="option" v-if="userStore.personalFMPage">
                            <div class="option-name">清空漫游缓存</div>
                            <div class="option-operation">
                                <div class="button" @click="clearFmRecent">清空</div>
                            </div>
                        </div>
                        <div class="option">
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
                    <img src="../assets/icon/icon.ico" alt="" />
                </div>
                <div class="version">V0.6.0</div>
                <div class="update-check">
                    <button class="check-update-btn" @click="checkForUpdates">检查更新</button>
                </div>
                <div class="app-author" @click="toGithub()">Made by ldx123000 | Modified from Hydrogen Music</div>
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
            padding: 8px;
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
                            &.custom-source-setting {
                                .selected-folder {
                                    width: 34vw;
                                    text-align: left;
                                    padding: 0 10px;
                                }
                                .source-option-disabled {
                                    opacity: 0.45;
                                    pointer-events: none;
                                }
                            }
                            &.custom-source-link {
                                input {
                                    width: 34vw;
                                    text-align: left;
                                    padding: 0 10px;
                                    background-color: rgba(255, 255, 255, 0.35);
                                    &:hover {
                                        cursor: text;
                                    }
                                }
                                .source-option-disabled {
                                    opacity: 0.45;
                                    pointer-events: none;
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
                font: 14px Bender-Bold;
                color: black;
                &:hover {
                    cursor: pointer;
                    text-decoration: underline;
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
