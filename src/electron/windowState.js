const { getDefaultSettings } = require('../shared/settingsSchema.cjs')

const MIN_WIDTH = 1080
const MIN_HEIGHT = 672
const SAVE_DELAY_MS = 200

function restoreDimension(value, minimum, available) {
    const size = Number(value)
    if (!Number.isFinite(size)) return minimum
    return Math.max(minimum, Math.min(Math.round(size), available))
}

function createMainWindowState(settingsStore, windowStateStore, workAreaSize) {
    const defaultRemember = getDefaultSettings().other.rememberWindowSize
    const isEnabled = () => settingsStore.get('settings.other.rememberWindowSize', defaultRemember) === true
    const storedState = isEnabled() ? windowStateStore.store : {}
    if (!isEnabled()) windowStateStore.clear()
    const windowOptions = {
        width: restoreDimension(storedState.width, MIN_WIDTH, workAreaSize.width),
        height: restoreDimension(storedState.height, MIN_HEIGHT, workAreaSize.height),
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
    }

    return {
        windowOptions,
        manage(win) {
            let saveTimer = null
            let isMaximized = storedState.isMaximized === true
            let isFullScreen = storedState.isFullScreen === true
            let normalSize = { width: windowOptions.width, height: windowOptions.height }

            const updateNormalSize = () => {
                // 某些平台在最小化最大化窗口后，getNormalBounds 会返回最大化尺寸。
                if (win.isMinimized()) return
                const { width, height } = win.getNormalBounds()
                normalSize = { width, height }
            }
            const clearSaveTimer = () => {
                clearTimeout(saveTimer)
                saveTimer = null
            }
            const save = () => {
                clearSaveTimer()
                updateNormalSize()
                if (!isEnabled()) {
                    windowStateStore.clear()
                    return
                }

                windowStateStore.store = { ...normalSize, isMaximized, isFullScreen }
            }
            const scheduleSave = () => {
                clearSaveTimer()
                updateNormalSize()
                saveTimer = setTimeout(save, SAVE_DELAY_MS)
            }

            win.on('resize', scheduleSave)
            win.on('maximize', () => {
                isMaximized = true
                scheduleSave()
            })
            win.on('unmaximize', () => {
                if (!win.isMinimized() && !win.isFullScreen()) isMaximized = false
                scheduleSave()
            })
            win.on('enter-full-screen', () => {
                isFullScreen = true
                scheduleSave()
            })
            win.on('leave-full-screen', () => {
                isFullScreen = false
                scheduleSave()
            })
            win.on('hide', save)
            win.on('close', save)
            win.on('save-window-state', save)
            win.on('closed', clearSaveTimer)

            return () => {
                if (storedState.isMaximized === true) win.maximize()
                if (storedState.isFullScreen === true) win.setFullScreen(true)
            }
        },
    }
}

module.exports = { createMainWindowState }
