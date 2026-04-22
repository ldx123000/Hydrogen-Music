const { Menu, Tray, ipcMain, nativeImage } = require('electron')
const path = require('path')

const trayState = {
    initialized: false,
    trayReady: false,
    win: null,
    app: null,
    tray: null,
    contextMenu: null,
    removeWindowListeners: null,
    winIsShow: false,
    hasLoggedWindowsThumbarFailure: false,
    hasCurrentSong: false,
    hasPrevious: false,
    hasNext: false,
    isPlaying: false,
}

const canUseWindowsThumbar = process.platform === 'win32'
const windowsThumbarIcons = canUseWindowsThumbar
    ? {
        last: createButtonIcon('last'),
        play: createButtonIcon('play'),
        pause: createButtonIcon('pause'),
        next: createButtonIcon('next'),
    }
    : null

function getActiveWindow() {
    return trayState.win
}

function createButtonIcon(iconName) {
    const buttonIconPath = path.resolve(__dirname, `../assets/icon/${iconName}.png`)
    const icon = nativeImage.createFromPath(buttonIconPath)
    return icon.resize({ width: 16, height: 16 })
}

function sendPlayerCommand(channel, payload) {
    const win = getActiveWindow()
    if (!win || win.isDestroyed?.()) return
    if (!win.webContents || win.webContents.isDestroyed?.()) return
    if (typeof payload === 'undefined') win.webContents.send(channel)
    else win.webContents.send(channel, payload)
}

function createWindowsThumbarButton({ icon, tooltip, channel, payload, disabled = false, hidden = false }) {
    const button = {
        icon,
        tooltip,
        click() {
            sendPlayerCommand(channel, payload)
        }
    }
    if (hidden) button.flags = ['hidden']
    else if (disabled) button.flags = ['disabled']
    return button
}

function buildWindowsThumbarButtons() {
    if (!canUseWindowsThumbar) return []

    return [
        createWindowsThumbarButton({
            icon: windowsThumbarIcons.last,
            tooltip: '上一首',
            channel: 'music-song-control',
            payload: 'last',
            disabled: !trayState.hasCurrentSong,
        }),
        createWindowsThumbarButton({
            icon: windowsThumbarIcons.play,
            tooltip: '播放',
            channel: 'music-playing-control',
            disabled: !trayState.hasCurrentSong,
            hidden: trayState.isPlaying,
        }),
        createWindowsThumbarButton({
            icon: windowsThumbarIcons.pause,
            tooltip: '暂停',
            channel: 'music-playing-control',
            disabled: !trayState.hasCurrentSong,
            hidden: !trayState.isPlaying,
        }),
        createWindowsThumbarButton({
            icon: windowsThumbarIcons.next,
            tooltip: '下一首',
            channel: 'music-song-control',
            payload: 'next',
            disabled: !trayState.hasCurrentSong,
        })
    ]
}

function refreshWindowsThumbar() {
    const win = getActiveWindow()
    if (!canUseWindowsThumbar || !trayState.winIsShow || !win || win.isDestroyed?.()) return
    const applied = win.setThumbarButtons(buildWindowsThumbarButtons())
    if (applied === false && !trayState.hasLoggedWindowsThumbarFailure) {
        trayState.hasLoggedWindowsThumbarFailure = true
        console.warn('Windows thumbar update rejected by Electron/Windows')
    }
}

function syncTrayMenuPlaybackState() {
    const { contextMenu } = trayState
    if (!contextMenu) return

    const playItem = contextMenu.getMenuItemById('tray-play')
    const pauseItem = contextMenu.getMenuItemById('tray-pause')
    const lastItem = contextMenu.getMenuItemById('tray-last')
    const nextItem = contextMenu.getMenuItemById('tray-next')

    if (playItem) {
        playItem.visible = !trayState.isPlaying
        playItem.enabled = trayState.hasCurrentSong
    }
    if (pauseItem) {
        pauseItem.visible = trayState.isPlaying
        pauseItem.enabled = trayState.hasCurrentSong
    }
    if (lastItem) lastItem.enabled = trayState.hasPrevious
    if (nextItem) nextItem.enabled = trayState.hasNext
}

function attachWindowListeners(win) {
    trayState.removeWindowListeners?.()
    if (!win || win.isDestroyed?.()) {
        trayState.removeWindowListeners = null
        return
    }

    const onShow = () => {
        trayState.winIsShow = true
        refreshWindowsThumbar()
    }
    const onHide = () => {
        trayState.winIsShow = false
    }
    const onClosed = () => {
        trayState.winIsShow = false
    }

    win.on('show', onShow)
    win.on('hide', onHide)
    win.on('closed', onClosed)

    trayState.removeWindowListeners = () => {
        try { win.removeListener('show', onShow) } catch (_) {}
        try { win.removeListener('hide', onHide) } catch (_) {}
        try { win.removeListener('closed', onClosed) } catch (_) {}
    }
}

function ensureTrayCreated(iconPath) {
    if (trayState.trayReady) return
    trayState.trayReady = true

    const trayIconPath = process.platform === 'darwin'
        ? path.resolve(__dirname, '../assets/icon/tray-icon-template.png')
        : iconPath
    const image = nativeImage.createFromPath(trayIconPath)
    if (process.platform === 'darwin') image.setTemplateImage(true)

    trayState.tray = new Tray(image)
    trayState.contextMenu = Menu.buildFromTemplate([
        {
            id: 'tray-play',
            label: '播放',
            click: () => sendPlayerCommand('music-playing-control')
        },
        {
            id: 'tray-pause',
            label: '暂停',
            visible: false,
            click: () => sendPlayerCommand('music-playing-control')
        },
        {
            id: 'tray-last',
            label: '上一首',
            click: () => sendPlayerCommand('music-song-control', 'last')
        },
        {
            id: 'tray-next',
            label: '下一首',
            click: () => sendPlayerCommand('music-song-control', 'next')
        },
        {
            label: '播放模式',
            submenu: [
                { id: 'tray-playmode-0', label: '顺序播放', type: 'radio', click: () => sendPlayerCommand('music-playmode-control', 0) },
                { id: 'tray-playmode-1', label: '列表循环', type: 'radio', click: () => sendPlayerCommand('music-playmode-control', 1) },
                { id: 'tray-playmode-2', label: '单曲循环', type: 'radio', click: () => sendPlayerCommand('music-playmode-control', 2) },
                { id: 'tray-playmode-3', label: '随机播放', type: 'radio', click: () => sendPlayerCommand('music-playmode-control', 3) },
            ]
        },
        {
            label: '退出',
            click: () => sendPlayerCommand('player-save')
        }
    ])
    trayState.tray.setToolTip('Hydrogen Music')
    trayState.tray.setContextMenu(trayState.contextMenu)
    trayState.tray.on('double-click', () => {
        const win = getActiveWindow()
        if (win && !win.isDestroyed?.()) win.show()
    })

    syncTrayMenuPlaybackState()
    refreshWindowsThumbar()
}

module.exports = function InitTray(win, app, iconPath) {
    trayState.win = win
    trayState.app = app
    attachWindowListeners(win)

    if (trayState.initialized) {
        if (app && typeof app.whenReady === 'function') {
            app.whenReady().then(() => ensureTrayCreated(iconPath))
        }
        return {
            setWindow(nextWin) {
                trayState.win = nextWin
                attachWindowListeners(nextWin)
                refreshWindowsThumbar()
            },
        }
    }

    trayState.initialized = true

    ipcMain.on('music-playing-check', (_event, playing) => {
        trayState.isPlaying = Boolean(playing)
        syncTrayMenuPlaybackState()
        refreshWindowsThumbar()
    })

    ipcMain.on('music-playlist-status', (_event, payload = {}) => {
        trayState.hasCurrentSong = Boolean(payload.hasCurrentSong)
        trayState.hasPrevious = Boolean(payload.hasPrevious)
        trayState.hasNext = Boolean(payload.hasNext)
        syncTrayMenuPlaybackState()
        refreshWindowsThumbar()
    })

    ipcMain.on('music-playmode-tray-change', (_event, mode) => {
        const { contextMenu } = trayState
        if (!contextMenu) return
        for (let i = 0; i <= 3; i += 1) {
            const item = contextMenu.getMenuItemById(`tray-playmode-${i}`)
            if (item) item.checked = i === mode
        }
    })

    app.whenReady().then(() => ensureTrayCreated(iconPath))

    return {
        setWindow(nextWin) {
            trayState.win = nextWin
            attachWindowListeners(nextWin)
            refreshWindowsThumbar()
        },
    }
}
