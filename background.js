const startNeteaseMusicApi = require('./src/electron/services')
const IpcMainEvent = require('./src/electron/ipcMain')
const MusicDownload = require('./src/electron/download')
const LocalFiles = require('./src/electron/localmusic')
const InitTray = require('./src/electron/tray')
const registerShortcuts = require('./src/electron/shortcuts')

const { app, BrowserWindow, globalShortcut } = require('electron')
const Winstate = require('electron-win-state').default
const { autoUpdater } = require("electron-updater");
const path = require('path')
const Store = require('electron-store');
const settingsStore = new Store({ name: 'settings' });

let myWindow = null
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

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit()
    })

    app.on('will-quit', () => {
        // 注销所有快捷键
        globalShortcut.unregisterAll()
    })
}
const createWindow = () => {
    // 设置应用名称（在开发模式下也生效）
    app.setName('Hydrogen Music')
    
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
    if (process.resourcesPath.indexOf(path.join('node_modules')) != -1)
        win.loadURL('http://localhost:5173/')
    else
        win.loadFile(indexHtml)
    win.once('ready-to-show', () => {
        win.show()
        if (process.resourcesPath.indexOf(path.join('node_modules')) == -1) {
            autoUpdater.autoDownload = false
            autoUpdater.on('update-available', info => {
                win.webContents.send('check-update', info.version)
            });
            autoUpdater.checkForUpdatesAndNotify()
        }
    })
    winstate.manage(win)
    win.on('close', async (event) => {
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
                // 在发送保存指令后，需要一个机制来真正退出，例如监听一个'player-saved'事件
                app.quit(); // 暂时直接退出
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
    IpcMainEvent(win, app)
    MusicDownload(win)
    LocalFiles(win, app)
    InitTray(win, app, path.resolve(__dirname, './src/assets/icon/' + (process.platform === 'win32' ? 'icon.ico' : 'icon.png')))
    registerShortcuts(win, app)
}

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';