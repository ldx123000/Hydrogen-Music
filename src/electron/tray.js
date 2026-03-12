const { Menu, Tray, ipcMain, nativeImage } = require('electron')
const path = require('path')

module.exports = function InitTray(win, app, iconPath) {
    let tray = null
    let contextMenu = null
    const canUseWindowsThumbar = process.platform === 'win32'
    let winIsShow = false
    let hasLoggedWindowsThumbarFailure = false
    let hasCurrentSong = false
    let hasPrevious = false
    let hasNext = false
    let isPlaying = false

    const sendPlayerCommand = (channel, payload) => {
        if (!win || win.isDestroyed()) return
        if (!win.webContents || win.webContents.isDestroyed()) return
        if (typeof payload === 'undefined') win.webContents.send(channel)
        else win.webContents.send(channel, payload)
    }

    const createButtonIcon = (iconName) => {
        const buttonIconPath = path.resolve(__dirname, `../assets/icon/${iconName}.png`)
        const icon = nativeImage.createFromPath(buttonIconPath)
        return icon.resize({ width: 16, height: 16 })
    }

    const windowsThumbarIcons = canUseWindowsThumbar
        ? {
            last: createButtonIcon('last'),
            play: createButtonIcon('play'),
            pause: createButtonIcon('pause'),
            next: createButtonIcon('next'),
        }
        : null

    const createWindowsThumbarButton = ({ icon, tooltip, channel, payload, disabled = false, hidden = false }) => {
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

    const buildWindowsThumbarButtons = () => {
        if (!canUseWindowsThumbar) return []

        return [
            createWindowsThumbarButton({
                icon: windowsThumbarIcons.last,
                tooltip: '上一首',
                channel: 'music-song-control',
                payload: 'last',
                disabled: !hasCurrentSong,
            }),
            createWindowsThumbarButton({
                icon: windowsThumbarIcons.play,
                tooltip: '播放',
                channel: 'music-playing-control',
                disabled: !hasCurrentSong,
                hidden: isPlaying,
            }),
            createWindowsThumbarButton({
                icon: windowsThumbarIcons.pause,
                tooltip: '暂停',
                channel: 'music-playing-control',
                disabled: !hasCurrentSong,
                hidden: !isPlaying,
            }),
            createWindowsThumbarButton({
                icon: windowsThumbarIcons.next,
                tooltip: '下一首',
                channel: 'music-song-control',
                payload: 'next',
                disabled: !hasCurrentSong,
            })
        ]
    }

    const refreshWindowsThumbar = () => {
        if (!canUseWindowsThumbar || !winIsShow) return
        const updatedButtons = buildWindowsThumbarButtons()
        const applied = win.setThumbarButtons(updatedButtons)
        if (applied === false && !hasLoggedWindowsThumbarFailure) {
            hasLoggedWindowsThumbarFailure = true
            console.warn('Windows thumbar update rejected by Electron/Windows')
        }
    }

    win.on('show', () => {
        winIsShow = true
        refreshWindowsThumbar()
    })
    win.on('hide', () => {
        winIsShow = false
    })
    win.on('closed', () => {
        winIsShow = false
    })

    const syncTrayMenuPlaybackState = () => {
        if (!contextMenu) return

        const playItem = contextMenu.getMenuItemById('tray-play')
        const pauseItem = contextMenu.getMenuItemById('tray-pause')
        const lastItem = contextMenu.getMenuItemById('tray-last')
        const nextItem = contextMenu.getMenuItemById('tray-next')

        if (playItem) {
            playItem.visible = !isPlaying
            playItem.enabled = hasCurrentSong
        }
        if (pauseItem) {
            pauseItem.visible = isPlaying
            pauseItem.enabled = hasCurrentSong
        }
        if (lastItem) lastItem.enabled = hasPrevious
        if (nextItem) nextItem.enabled = hasNext
    }

    ipcMain.on('music-playing-check', (e, playing) => {
        isPlaying = Boolean(playing)
        syncTrayMenuPlaybackState()
        refreshWindowsThumbar()
    })

    ipcMain.on('music-playlist-status', (e, payload = {}) => {
        hasCurrentSong = Boolean(payload.hasCurrentSong)
        hasPrevious = Boolean(payload.hasPrevious)
        hasNext = Boolean(payload.hasNext)
        syncTrayMenuPlaybackState()
        refreshWindowsThumbar()
    })

    ipcMain.on('music-playmode-tray-change', (e, mode) => {
        if (!contextMenu) return
        for (let i = 0; i <= 3; i += 1) {
            const item = contextMenu.getMenuItemById(`tray-playmode-${i}`)
            if (item) item.checked = i === mode
        }
    })

    app.whenReady().then(() => {
        // 根据平台选择不同的托盘图标
        let trayIconPath;
        if (process.platform === 'darwin') {
            // 在macOS上，使用专门的模板图标
            trayIconPath = path.resolve(__dirname, '../assets/icon/tray-icon-template.png');
        } else {
            // 在其他平台上，使用原始图标
            trayIconPath = iconPath;
        }

        const image = nativeImage.createFromPath(trayIconPath);
        // 在macOS上，将图片设置为模板图像，系统会自动处理颜色
        if (process.platform === 'darwin') {
            image.setTemplateImage(true);
        }

        tray = new Tray(image);
        contextMenu = Menu.buildFromTemplate([
            {
                id: 'tray-play',
                label: '播放',
                click: () => {
                    sendPlayerCommand('music-playing-control')
                }
            },
            {
                id: 'tray-pause',
                label: '暂停',
                visible: false,
                click: () => {
                    sendPlayerCommand('music-playing-control')
                }
            },
            {
                id: 'tray-last',
                label: '上一首',
                click: () => {
                    sendPlayerCommand('music-song-control', 'last')
                }
            },
            {
                id: 'tray-next',
                label: '下一首',
                click: () => {
                    sendPlayerCommand('music-song-control', 'next')
                }
            },
            {
                label: '播放模式',
                submenu: [
                    {
                        id: 'tray-playmode-0',
                        label: '顺序播放',
                        type: 'radio',
                        click: () => {
                            sendPlayerCommand('music-playmode-control', 0)
                        },
                    },
                    {
                        id: 'tray-playmode-1',
                        label: '列表循环',
                        type: 'radio',
                        click: () => {
                            sendPlayerCommand('music-playmode-control', 1)
                        },
                    },
                    {
                        id: 'tray-playmode-2',
                        label: '单曲循环',
                        type: 'radio',
                        click: () => {
                            sendPlayerCommand('music-playmode-control', 2)
                        },
                    },
                    {
                        id: 'tray-playmode-3',
                        label: '随机播放',
                        type: 'radio',
                        click: () => {
                            sendPlayerCommand('music-playmode-control', 3)
                        }
                    },
                ]
            },
            {
                label: '退出',
                click: () => {
                    sendPlayerCommand('player-save')
                }
            }
        ])
        tray.setToolTip('Hydrogen Music')
        tray.setContextMenu(contextMenu)
        tray.on('double-click', function () {
            win.show();
        });
        syncTrayMenuPlaybackState()
        refreshWindowsThumbar()
    })
}
