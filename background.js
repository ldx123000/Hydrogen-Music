const startNeteaseMusicApi = require('./src/electron/services')
const IpcMainEvent = require('./src/electron/ipcMain')
const MusicDownload = require('./src/electron/download')
const LocalFiles = require('./src/electron/localmusic')
const InitTray = require('./src/electron/tray')
const registerShortcuts = require('./src/electron/shortcuts')
const { updateApplicationMenu } = require('./src/electron/shortcuts')

const { app, BrowserWindow, globalShortcut, Menu, ipcMain } = require('electron')
const Winstate = require('electron-win-state').default
const { autoUpdater } = require("electron-updater");
const path = require('path')
const Store = require('electron-store');
const settingsStore = new Store({ name: 'settings' });

let myWindow = null
let lyricWindow = null
let forceQuit = false;
// 标记是否为“设置里手动检查更新”流程，以避免弹出大窗
let manualUpdateCheckInProgress = false;

//electron单例
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (myWindow) {
            if (myWindow.isMinimized()) myWindow.restore()
            if (!myWindow.isVisible()) myWindow.show()
            myWindow.focus()
        }
    })

    app.whenReady().then(() => {
        createWindow()
        app.on('activate', () => {
            // 在macOS上，当点击dock图标并且没有其他窗口打开时，
            // 应该重新创建一个窗口。
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow()
            } else if (myWindow) {
                // 如果窗口只是被隐藏了，则显示它
                if (!myWindow.isVisible()) {
                    myWindow.show();
                }
                myWindow.focus();
            }
        })
    })

    // 监听渲染进程触发的手动检查更新事件
    // 与 src/electron/ipcMain.js 中的处理并存，仅用于设置标记
    ipcMain.on('check-for-update', () => {
        manualUpdateCheckInProgress = true
    })

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit()
    })

    app.on('will-quit', () => {
        // 注销所有快捷键
        globalShortcut.unregisterAll()
    })

    app.on('before-quit', () => {
        forceQuit = true;
    });
}
const createWindow = () => {
    // 设置应用名称（在开发模式下也生效）
    app.setName('Hydrogen Music')


    // 用于存储当前Dock菜单的引用
    let currentDockMenu = null;

    // 为macOS创建Dock菜单的函数
    function createDockMenu(songInfo) {
        if (process.platform === 'darwin') {
            const menuTemplate = [];

            // 如果有歌曲信息，添加歌曲信息条目
            if (songInfo && songInfo.name && songInfo.artist) {
                menuTemplate.push({
                    label: `${songInfo.name} - ${songInfo.artist}`,
                    enabled: false // 仅显示信息，不可点击
                });
                menuTemplate.push({ type: 'separator' });
            }

            // 添加控制按钮
            menuTemplate.push(
                {
                    label: '播放/暂停',
                    click: () => {
                        if (myWindow) {
                            myWindow.webContents.send('music-playing-control');
                        }
                    }
                },
                {
                    label: '上一首',
                    click: () => {
                        if (myWindow) {
                            myWindow.webContents.send('music-song-control', 'last');
                        }
                    }
                },
                {
                    label: '下一首',
                    click: () => {
                        if (myWindow) {
                            myWindow.webContents.send('music-song-control', 'next');
                        }
                    }
                }
            );

            currentDockMenu = Menu.buildFromTemplate(menuTemplate);
            app.dock.setMenu(currentDockMenu);
        }
    }

    // 初始创建Dock菜单
    createDockMenu();

    process.env.DIST = path.join(__dirname, './')
    const indexHtml = path.join(process.env.DIST, 'dist/index.html')
    const winstate = new Winstate({
        //自定义默认窗口大小
        defaultWidth: 1024,
        defaultHeight: 672,
    })
    const win = new BrowserWindow({
        minWidth: 1024,
        minHeight: 672,
        frame: false,
        title: "Hydrogen Music",
        icon: path.resolve(__dirname, './src/assets/icon/' + (process.platform === 'win32' ? 'icon.ico' : 'icon.png')),
        backgroundColor: '#fff',
        //记录窗口大小
        ...winstate.winOptions,
        show: false,
        webPreferences: {
            //预加载脚本
            preload: path.resolve(__dirname, './src/electron/preload.js'),
            webSecurity: false,
        }
    })
    myWindow = win

    // 监听来自 ipcMain 的菜单更新事件
    win.on('update-dock-menu', async (songInfo) => {
        // 更新 Dock 菜单（仅在 macOS 上）
        createDockMenu(songInfo);

        // 更新应用菜单（在所有平台上）
        try {
            await updateApplicationMenu(win, app, songInfo);
        } catch (error) {
            console.error('更新应用菜单失败:', error);
        }

        // 更新窗口标题以显示歌曲信息（作为额外的信息显示方式）
        if (songInfo && songInfo.name && songInfo.artist) {
            win.setTitle(`${songInfo.name} - ${songInfo.artist} - Hydrogen Music`);
        } else {
            win.setTitle('Hydrogen Music');
        }

        // Windows系统：更新任务栏缩略图按钮（如果需要）
        if (process.platform === 'win32' && songInfo) {
            // 可以在这里添加Windows特定的任务栏功能
            // 例如：更新任务栏进度、缩略图工具栏等
        }

        // Linux系统：更新桌面通知或系统集成（如果需要）
        if (process.platform === 'linux' && songInfo) {
            // 可以在这里添加Linux特定的系统集成功能
        }
    });

    if (process.resourcesPath.indexOf(path.join('node_modules')) != -1)
        win.loadURL('http://localhost:5173/')
    else
        win.loadFile(indexHtml)
    win.once('ready-to-show', () => {
        win.show()
        if (process.resourcesPath.indexOf(path.join('node_modules')) == -1) {
            // 配置自动更新器
            autoUpdater.autoDownload = false
            autoUpdater.autoInstallOnAppQuit = false

            // 监听更新可用事件
            autoUpdater.on('update-available', info => {
                console.log('发现新版本:', info.version)
                // 若是设置页手动检查的结果，则不弹出大窗，仅交由手动流程处理
                if (manualUpdateCheckInProgress) {
                    manualUpdateCheckInProgress = false
                    return
                }
                win.webContents.send('check-update', info.version)
            })

            // 监听更新不可用事件
            autoUpdater.on('update-not-available', info => {
                console.log('当前版本已是最新:', info.version)
                // 手动检查时，由手动流程通知渲染层，这里避免重复发送
                if (manualUpdateCheckInProgress) {
                    manualUpdateCheckInProgress = false
                    return
                }
                win.webContents.send('update-not-available', info.version)
            })

            // 监听更新下载进度
            autoUpdater.on('download-progress', progressObj => {
                const percent = Math.round(progressObj.percent)
                console.log(`更新下载进度: ${percent}%`)
                win.webContents.send('update-download-progress', percent)
                win.setProgressBar(percent / 100)
            })

            // 监听更新下载完成
            autoUpdater.on('update-downloaded', info => {
                console.log('更新下载完成:', info.version)
                win.setProgressBar(-1) // 隐藏进度条
                win.webContents.send('update-downloaded', info.version)
            })

            // 监听更新错误
            autoUpdater.on('error', error => {
                console.error('更新错误:', error)
                win.setProgressBar(-1) // 隐藏进度条
                // 手动检查阶段的错误由手动流程通知，这里避免重复
                if (manualUpdateCheckInProgress) {
                    manualUpdateCheckInProgress = false
                } else {
                    win.webContents.send('update-error', error.message)
                }
            })

            // 自动检查更新
            autoUpdater.checkForUpdatesAndNotify()
        }
    })
    winstate.manage(win)
    win.on('close', async (event) => {
        if (forceQuit) {
            // 如果是强制退出 (Cmd+Q)，则不阻止默认行为
            myWindow = null;
            return;
        }

        // 在macOS上，'close'事件通常意味着窗口将被销毁，而不是隐藏
        if (process.platform === 'darwin') {
            // 如果用户设置为“最小化”，则阻止关闭并隐藏窗口
            const settings = await settingsStore.get('settings');
            if (settings && settings.other && settings.other.quitApp === 'minimize') {
                event.preventDefault();
                win.hide();
            } else {
                // 否则，允许窗口关闭，但不退出应用
                // `window-all-closed`事件会处理后续逻辑
                myWindow = null;
            }
        } else {
            // 在非macOS平台上，保留您原有的逻辑
            event.preventDefault();
            const settings = await settingsStore.get('settings');
            if (settings && settings.other && settings.other.quitApp === 'minimize') {
                win.hide();
            } else if (settings && settings.other && settings.other.quitApp === 'quit') {
                win.webContents.send('player-save');
                // 在发送保存指令后，需要一个机制来真正退出
                // 监听 'player-saved' 是一个好方法，但为了简单起见，我们设置一个超时
                setTimeout(() => {
                    app.quit();
                }, 500);
            } else {
                app.quit(); // 默认行为
            }
        }
    });

    // 监听 'player-save' 完成后的事件，以便安全退出
    // (需要在渲染器进程中添加 ipcRenderer.send('player-saved'))
    // ipcMain.on('player-saved', () => {
    //     app.quit();
    // });
    //api初始化
    startNeteaseMusicApi()
    //ipcMain初始化
    IpcMainEvent(win, app, { createLyricWindow, closeLyricWindow, setLyricWindowMovable, getLyricWindow: () => lyricWindow })
    MusicDownload(win)
    LocalFiles(win, app)
    InitTray(win, app, path.resolve(__dirname, './src/assets/icon/' + (process.platform === 'win32' ? 'icon.ico' : 'icon.png')))
    registerShortcuts(win, app)
}

// 创建桌面歌词窗口
const createLyricWindow = () => {
    if (lyricWindow) {
        lyricWindow.focus()
        return lyricWindow
    }

    const lyricWin = new BrowserWindow({
        width: 500,
        height: 350,
        minWidth: 500,
        minHeight: 250,
        maxWidth: 900,
        maxHeight: 500,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        movable: true,
        minimizable: false,
        maximizable: false,
        closable: true,
        focusable: true,
        show: false,
        backgroundColor: 'transparent',
        webPreferences: {
            preload: path.resolve(__dirname, './src/electron/preload.js'),
            webSecurity: false,
            nodeIntegration: false,
            contextIsolation: true
        }
    })

    lyricWindow = lyricWin

    const lyricHtml = path.join(process.env.DIST, 'dist/desktop-lyric.html')
    if (process.resourcesPath.indexOf(path.join('node_modules')) != -1) {
        lyricWin.loadURL('http://localhost:5173/desktop-lyric.html')
    } else {
        lyricWin.loadFile(lyricHtml)
    }

    lyricWin.once('ready-to-show', () => {
        lyricWin.show()
    })

    // 添加备用显示逻辑，防止ready-to-show事件不触发
    setTimeout(() => {
        if (lyricWin && !lyricWin.isDestroyed() && !lyricWin.isVisible()) {
            lyricWin.show()
        }
    }, 2000)

    lyricWin.on('closed', () => {
        lyricWindow = null
    })

    lyricWin.setMenu(null)
    return lyricWin
}

const closeLyricWindow = () => {
    if (lyricWindow) {
        lyricWindow.close()
        lyricWindow = null
    }
}

const setLyricWindowMovable = (movable) => {
    if (lyricWindow) {
        lyricWindow.setMovable(movable)
    }
}

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
