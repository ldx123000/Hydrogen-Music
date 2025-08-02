const { Menu, Tray, ipcMain, nativeImage } = require('electron')
const path = require('path')

module.exports = function InitTray(win, app, iconPath) {
    let tray = null
    let winIsShow = false
    let Buttons = [
        {
            icon: nativeImage.createFromPath(path.resolve(__dirname, '../assets/icon/last.png')),
            tooltip: '上一首',
            click() {
                win.webContents.send('music-song-control', 'last')
            }
        },
        {
            icon: nativeImage.createFromPath(path.resolve(__dirname, '../assets/icon/play.png')),
            tooltip: '播放',
            click() {
                win.webContents.send('music-playing-control')
            }
        },
        {
            icon: nativeImage.createFromPath(path.resolve(__dirname, '../assets/icon/pause.png')),
            tooltip: '暂停',
            flags: ['hidden'],
            click() {
                win.webContents.send('music-playing-control')
            }
        },
        {
            icon: nativeImage.createFromPath(path.resolve(__dirname, '../assets/icon/next.png')),
            tooltip: '下一首',
            click() {
                win.webContents.send('music-song-control', 'next')
            }
        }

    ]
    win.on('show', () => {
        win.setThumbarButtons(Buttons)
        winIsShow = true
    })
    app.whenReady().then(() => {
        tray = new Tray(iconPath)
        const contextMenu = Menu.buildFromTemplate([
            {
                label: '播放',
                click: () => {
                    win.webContents.send('music-playing-control')
                }
            },
            {
                label: '暂停',
                visible: false,
                click: () => {
                    win.webContents.send('music-playing-control')
                }
            },
            {
                label: '上一首',
                click: () => {
                    win.webContents.send('music-song-control', 'last')
                }
            },
            {
                label: '下一首',
                click: () => {
                    win.webContents.send('music-song-control', 'next')
                }
            },
            {
                label: '播放模式',
                submenu: [
                    {
                        label: '顺序播放',
                        type: 'radio',
                        click: () => {
                            win.webContents.send('music-playmode-control', 0)
                        },
                    },
                    {
                        label: '列表循环',
                        type: 'radio',
                        click: () => {
                            win.webContents.send('music-playmode-control', 1)
                        },
                    },
                    {
                        label: '单曲循环',
                        type: 'radio',
                        click: () => {
                            win.webContents.send('music-playmode-control', 2)
                        },
                    },
                    {
                        label: '随机播放',
                        type: 'radio',
                        click: () => {
                            win.webContents.send('music-playmode-control', 3)
                        }
                    },
                ]
            },
            {
                label: '退出',
                click: () => {
                    win.webContents.send('player-save')
                }
            }
        ])
        tray.setToolTip('Hydrogen Music')
        tray.setContextMenu(contextMenu)
        tray.on('double-click', function () {
            win.show();
        });
        ipcMain.on('music-playmode-tray-change', (e, mode) => {
            contextMenu.items[4].submenu.items[0].checked = false
            contextMenu.items[4].submenu.items[1].checked = false
            contextMenu.items[4].submenu.items[2].checked = false
            contextMenu.items[4].submenu.items[3].checked = false
            contextMenu.items[4].submenu.items[mode].checked = true
        })
        ipcMain.on('music-playing-check', (e, playing) => {
            if (playing) {
                contextMenu.items[0].visible = false
                contextMenu.items[1].visible = true
                Buttons[1].flags = ['hidden']
                Buttons[2].flags = []
            }
            else {
                contextMenu.items[0].visible = true
                contextMenu.items[1].visible = false
                Buttons[1].flags = []
                Buttons[2].flags = ['hidden']
            }
            if (winIsShow)
                win.setThumbarButtons(Buttons)
        })
    })
}