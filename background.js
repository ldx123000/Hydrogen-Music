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
            if (BrowserWindow.getAllWindows().length === 0) createWindow()
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
        event.preventDefault()
        const settings = await settingsStore.get('settings')
        if (settings.other.quitApp == 'minimize') {
            win.hide()
        } else if (settings.other.quitApp == 'quit') {
            win.webContents.send('player-save')
        }
    })
    //api初始化
    startNeteaseMusicApi()
    //ipcMain初始化
    IpcMainEvent(win, app)
    MusicDownload(win)
    LocalFiles(win, app)
    InitTray(win, app, path.resolve(__dirname, './src/assets/icon/' + (process.platform === 'win32' ? 'icon.ico' : 'icon.png')))
    registerShortcuts(win)
}

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';