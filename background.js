const startNeteaseMusicApi = require('./src/electron/services')
// Avoid depending on src/utils in packaged build; compute inline
const isCreateMpris = process.platform === 'linux';
// Load MPRIS integration lazily only on Linux to avoid packaging issues on macOS/Windows
let createMpris;
if (isCreateMpris) {
  try {
    ({ createMpris } = require('./src/electron/mpris'));
  } catch (e) {
    console.warn('MPRIS module not available:', e);
  }
}


const { app, BrowserWindow, globalShortcut, Menu, ipcMain } = require('electron')
const path = require('path')

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

  // disable chromium mpris
  if (isCreateMpris) {
    app.commandLine.appendSwitch(
      'disable-features',
      'HardwareMediaKeyHandling,MediaSessionService'
    );
  }



  app.whenReady().then(async () => {
    // 尝试启用平台 HEVC 硬件解码（在支持的平台上）
    try {
      app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport')
      // 某些平台可能需要忽略 GPU 黑名单以启用硬件解码
      app.commandLine.appendSwitch('ignore-gpu-blocklist')
    } catch (_) {}

    process.on('uncaughtException', (err) => {
      console.error('捕获到未处理异常:', err)
    })
    //api初始化
    try {
      await startNeteaseMusicApi();  // 等待 API 启动
      console.log('Netease API 已就绪');
      createWindow();                 // API 启动后再创建窗口
    } catch (err) {
      console.error('Netease API 启动失败:', err);
      app.quit();                     // 启动失败退出
    }
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
    const Winstate = require('electron-win-state').default
    const winstate = new Winstate({
        //自定义默认窗口大小
        defaultWidth: 1024,
        defaultHeight: 672,
    })
    const isMac = process.platform === 'darwin'
    const win = new BrowserWindow({
        minWidth: 1024,
        minHeight: 672,
        // macOS 使用原生交通灯；其他平台仍用自定义无边框
        frame: isMac ? true : false,
        titleBarStyle: isMac ? 'hiddenInset' : undefined,
        titleBarOverlay: isMac ? { color: '#00000000', symbolColor: '#000000', height: 35 } : undefined,
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

    // 监听来自 ipcMain 的菜单更新事件（仅 macOS 生效，并加强负载校验）
    const { updateApplicationMenu } = require('./src/electron/shortcuts')
    win.on('update-dock-menu', async (songInfo) => {
        if (process.platform !== 'darwin') return;

        // 更新 Dock 菜单（仅在 macOS 上）
        createDockMenu(songInfo);

        // 更新应用菜单（macOS上仍然显示歌曲信息；songInfo 可为空）
        try {
            await updateApplicationMenu(win, app, songInfo);
        } catch (error) {
            console.error('更新应用菜单失败:', error);
        }

        // 仅在负载有效时更新窗口标题，避免无效负载导致标题回退
        if (songInfo && typeof songInfo === 'object' && songInfo.name) {
            const title = songInfo.artist ? `${songInfo.name} - ${songInfo.artist} - Hydrogen Music` : `${songInfo.name} - Hydrogen Music`;
            win.setTitle(title);
        }
    });

    if (process.resourcesPath.indexOf(path.join('node_modules')) != -1) {
        win.loadURL('http://localhost:5173/')
        win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
            console.warn('Dev server not available, fallback to dist:', errorCode, errorDescription)
            try { win.loadFile(indexHtml) } catch (e) { console.error('Fallback loadFile failed:', e) }
        })
    } else {
        win.loadFile(indexHtml)
    }
    win.once('ready-to-show', () => {
        win.show()
        // 微调 macOS 交通灯位置以匹配自定义布局高度
        try {
            if (isMac && typeof win.setTrafficLightPosition === 'function') {
                win.setTrafficLightPosition({ x: 12, y: 10 })
            }
        } catch (_) {}
        if (process.resourcesPath.indexOf(path.join('node_modules')) == -1) {
            // macOS: 禁用内置自动更新，改为手动检查（GitHub API）
            if (process.platform === 'darwin') {
                return
            }
            // 配置自动更新器
            const { autoUpdater } = require('electron-updater')
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

            // 自动检查更新（非 macOS）
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
            const Store = require('electron-store').default
            const settingsStore = new Store({ name: 'settings' })
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
            const Store = require('electron-store').default
            const settingsStore = new Store({ name: 'settings' })
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
    //ipcMain初始化（懒加载模块，减少主进程冷启动解析量）
    const IpcMainEvent = require('./src/electron/ipcMain')
    const MusicDownload = require('./src/electron/download')
    const LocalFiles = require('./src/electron/localmusic')
    const InitTray = require('./src/electron/tray')
    const registerShortcuts = require('./src/electron/shortcuts')

    IpcMainEvent(win, app, { createLyricWindow, closeLyricWindow, setLyricWindowMovable, getLyricWindow: () => lyricWindow })
    MusicDownload(win)
    LocalFiles(win, app)
    InitTray(win, app, path.resolve(__dirname, './src/assets/icon/' + (process.platform === 'win32' ? 'icon.ico' : 'icon.png')))
    registerShortcuts(win, app)

  // create mpris
  if (isCreateMpris && typeof createMpris === 'function') {
    createMpris(win);
  }
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
        // 保持可交互，但避免全屏干扰
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
        lyricWin.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
            console.warn('Dev server not available (desktop lyric), fallback to dist:', errorCode, errorDescription)
            try { lyricWin.loadFile(lyricHtml) } catch (e) { console.error('Fallback lyric loadFile failed:', e) }
        })
    } else {
        lyricWin.loadFile(lyricHtml)
    }

    // Windows/UWP: 提升置顶效果的工具方法（无需管理员权限）
    const bumpTopMost = () => {
        try {
            // 再次声明置顶，提高 Z 序
            lyricWin.setAlwaysOnTop(true)
            // 若可用，进一步将窗口移至最上层（Windows 支持）
            if (typeof lyricWin.moveTop === 'function') {
                lyricWin.moveTop()
            }
        } catch (_) { }
    }

    lyricWin.once('ready-to-show', () => {
        lyricWin.show()
        // macOS: 提高层级，覆盖全屏和 Space（忽略异常以兼容跨平台）
        try { lyricWin.setAlwaysOnTop(true, 'screen-saver') } catch (_) { }
        // 可见后小延时再次顶置，规避某些 UWP 抢焦点导致的抢占
        setTimeout(() => bumpTopMost(), 50)
    })

    // 添加备用显示逻辑，防止ready-to-show事件不触发
    setTimeout(() => {
        if (lyricWin && !lyricWin.isDestroyed() && !lyricWin.isVisible()) {
            lyricWin.show()
        }
        // 再次顶置，确保在慢速环境中仍能覆盖
        bumpTopMost()
    }, 2000)

    lyricWin.on('closed', () => {
        lyricWindow = null
    })

    lyricWin.setMenu(null)

    // 监听关键事件并在 Windows 上重新顶置
    if (process.platform === 'win32') {
        const reboundEvents = ['show', 'focus', 'blur', 'resize', 'move', 'restore']
        reboundEvents.forEach(evt => {
            lyricWin.on(evt, () => bumpTopMost())
        })
        // 当主窗口获得/失去焦点时也尝试顶置一次（减少被 UWP 挤压的概率）
        if (myWindow) {
            myWindow.on('focus', () => bumpTopMost())
            myWindow.on('blur', () => bumpTopMost())
        }
    }

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
