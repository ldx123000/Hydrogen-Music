const { Menu, Tray, ipcMain, nativeImage } = require('electron')
const path = require('path')

module.exports = function InitTray(win, app, iconPath) {
    let tray = null
    let winIsShow = false

    // 创建按钮图标，确保图标清晰可见
    const createButtonIcon = (iconName) => {
        const iconPath = path.resolve(__dirname, `../assets/icon/${iconName}.png`)
        const icon = nativeImage.createFromPath(iconPath)
        // 确保图标尺寸合适，Windows推荐16x16
        return icon.resize({ width: 16, height: 16 })
    }

    let Buttons = [
        {
            icon: createButtonIcon('last'),
            tooltip: '上一首',
            flags: ['enabled'], // 明确启用状态
            click() {
                win.webContents.send('music-song-control', 'last')
            }
        },
        {
            icon: createButtonIcon('play'),
            tooltip: '播放',
            flags: ['enabled'], // 明确启用状态
            click() {
                win.webContents.send('music-playing-control')
            }
        },
        {
            icon: createButtonIcon('pause'),
            tooltip: '暂停',
            flags: ['hidden'], // 初始隐藏
            click() {
                win.webContents.send('music-playing-control')
            }
        },
        {
            icon: createButtonIcon('next'),
            tooltip: '下一首',
            flags: ['enabled'], // 明确启用状态
            click() {
                win.webContents.send('music-song-control', 'next')
            }
        }
    ]
    win.on('show', () => {
        // Windows-only feature: Thumbnail toolbar buttons
        if (process.platform === 'win32') {
            win.setThumbarButtons(Buttons)
        }
        winIsShow = true
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
                // 播放状态：显示暂停按钮，隐藏播放按钮
                contextMenu.items[0].visible = false
                contextMenu.items[1].visible = true
                Buttons[1].flags = ['hidden']
                Buttons[2].flags = ['enabled'] // 暂停按钮启用
            }
            else {
                // 暂停状态：显示播放按钮，隐藏暂停按钮
                contextMenu.items[0].visible = true
                contextMenu.items[1].visible = false
                Buttons[1].flags = ['enabled'] // 播放按钮启用
                Buttons[2].flags = ['hidden']
            }

            // 确保上一首和下一首按钮始终启用
            Buttons[0].flags = ['enabled']
            Buttons[3].flags = ['enabled']

            // 更新Windows缩略图按钮
            if (winIsShow && process.platform === 'win32') {
                win.setThumbarButtons(Buttons)
            }
        })

        // 监听播放列表状态，动态启用/禁用按钮
        ipcMain.on('music-playlist-status', (e, { hasNext, hasPrevious, hasCurrentSong }) => {
            // 根据播放列表状态更新按钮
            Buttons[0].flags = hasPrevious ? ['enabled'] : ['disabled'] // 上一首
            Buttons[3].flags = hasNext ? ['enabled'] : ['disabled'] // 下一首

            // 如果没有当前歌曲，禁用播放/暂停按钮
            if (!hasCurrentSong) {
                Buttons[1].flags = ['disabled']
                Buttons[2].flags = ['disabled']
            }

            // 更新上下文菜单的启用状态
            contextMenu.items[2].enabled = hasPrevious // 上一首菜单项
            contextMenu.items[3].enabled = hasNext // 下一首菜单项

            // 更新Windows缩略图按钮
            if (winIsShow && process.platform === 'win32') {
                win.setThumbarButtons(Buttons)
            }
        })
    })
}