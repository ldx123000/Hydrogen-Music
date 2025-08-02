const { ipcMain, shell, dialog, globalShortcut, Menu, clipboard, BrowserWindow, session } =  require('electron')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { parseFile } = require('music-metadata')
// const jsmediatags = require("jsmediatags");
const registerShortcuts = require('./shortcuts')
const Store = require('electron-store')
const CancelToken = axios.CancelToken
let cancel = null

module.exports = IpcMainEvent = (win, app) => {
    const settingsStore = new Store({name: 'settings'})
    const lastPlaylistStore = new Store({name: 'lastPlaylist'})
    const musicVideoStore = new Store({name: 'musicVideo'})
    // win.on('restore', () => {
        // win.webContents.send('lyric-control')
    // })
    ipcMain.on('window-min', () => {
        win.minimize()
    })
    ipcMain.on('window-max', () => {
        if(win.isMaximized()){
            win.restore()
        }else{
            win.maximize()
        }
    })
    ipcMain.on('window-close', async () => {
        const settings = await settingsStore.get('settings')
        if(settings.other.quitApp == 'minimize') {
            win.hide()
        } else if(settings.other.quitApp == 'quit') {
            win.close()
        }
    })
    ipcMain.on('to-register', (e, url) => {
        shell.openExternal(url)
    })
    ipcMain.on('download-start', () => {
        win.webContents.send('download-next')
    })
    ipcMain.handle('get-image-base64', async (e, filePath) => {
        const data = await parseFile(filePath)
        if(data.common.picture) 
            return `data:${data.common.picture[0].format};base64,${data.common.picture[0].data.toString('base64')}`
        else
            return null
    })
    ipcMain.on('set-settings', (e, settings) => {
        settingsStore.set('settings', JSON.parse(settings))
        registerShortcuts(win)
    })
    ipcMain.handle('get-settings', async () => {
        const settings =  await settingsStore.get('settings')
        if(settings) return settings
        else {
            let initSettings = {
                music: {
                    level: 'standard',
                    lyricSize: '20',
                    tlyricSize: '14',
                    rlyricSize: '12',
                    lyricInterlude: 13
                },
                local: {
                    videoFolder: null,
                    downloadFolder: null,
                    localFolder: []
                },
                shortcuts: [
                    {
                        id: 'play',
                        name: '播放/暂停',
                        shortcut: 'CommandOrControl+P',
                        globalShortcut: 'CommandOrControl+Alt+P',
                    },
                    {
                        id: 'last',
                        name: '上一首',
                        shortcut: 'CommandOrControl+Left',
                        globalShortcut: 'CommandOrControl+Alt+Left',
                    },
                    {
                        id: 'next',
                        name: '下一首',
                        shortcut: 'CommandOrControl+Right',
                        globalShortcut: 'CommandOrControl+Alt+Right',
                    },
                    {
                        id: 'volumeUp',
                        name: '增加音量',
                        shortcut: 'CommandOrControl+Up',
                        globalShortcut: 'CommandOrControl+Alt+Up',
                    },
                    {
                        id: 'volumeDown',
                        name: '减少音量',
                        shortcut: 'CommandOrControl+Down',
                        globalShortcut: 'CommandOrControl+Alt+Down',
                    },
                    {
                        id: 'processForward',
                        name: '快进(3s)',
                        shortcut: 'CommandOrControl+]',
                        globalShortcut: 'CommandOrControl+Alt+]',
                    },
                    {
                        id: 'processBack',
                        name: '后退(3s)',
                        shortcut: 'CommandOrControl+[',
                        globalShortcut: 'CommandOrControl+Alt+[',
                    },
                ],
                other: {
                    globalShortcuts: true,
                    quitApp:'minimize'
                }
            }
            settingsStore.set('settings', initSettings)
            registerShortcuts(win)
            return initSettings
        }
    })
    ipcMain.handle('dialog:openFile', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({properties: ['openDirectory']})
        if (canceled) {
            return null
        } else {
            return filePaths[0]
        }
    })
    ipcMain.on('register-shortcuts', () => {
        registerShortcuts(win)
    })
    ipcMain.on('unregister-shortcuts', () => {
        Menu.setApplicationMenu(null)
        globalShortcut.unregisterAll()
    })
    ipcMain.on('save-last-playlist', (e, playlist) => {
        lastPlaylistStore.set('playlist', JSON.parse(playlist))
    })
    ipcMain.on('exit-app', (e, playlist) => {
        lastPlaylistStore.set('playlist', JSON.parse(playlist))
        app.exit()
    })
    ipcMain.handle('get-last-playlist', async () => {
        const lastPlaylist =  await lastPlaylistStore.get('playlist')
        if(lastPlaylist) return lastPlaylist
        else return null
    })
    ipcMain.on('open-local-folder', (e, path) => {
        shell.showItemInFolder(path)
    })
    ipcMain.handle('get-request-data', async (e, request) => {
        const result = await axios.get(request.url, request.option)
        return result.data
    })
    async function searchMusicVideo(id) {
        if(musicVideoStore.has('musicVideo')) {
            const result = await musicVideoStore.get('musicVideo')
            const index = (result || []).findIndex((music) => music.id == id)
            if(index != -1) {
                return {data: result[index], index: index}
            } else return false
        } else return false
    }
    async function saveMusicVideo(data) {
        if(musicVideoStore.has('musicVideo')) {
            const musicVideo = await musicVideoStore.get('musicVideo')
            searchMusicVideo(data.id).then(result => {
                if(result) musicVideo.splice(result.index, 1)
                musicVideo.push(data)
                musicVideoStore.set('musicVideo', musicVideo)
            })
        } else {
            musicVideoStore.set('musicVideo', [data])
        }
    }
    function fileIsExists(path) { 
        return new Promise((resolve, reject) => {
            fs.access(path, fs.constants.F_OK, (err) => {
                if (!err) resolve(true)
                else return resolve(false)
            })
        })
    }
    ipcMain.handle('get-bili-video', async (e, request) => {
        const settings = await settingsStore.get('settings')
        if(!settings.local.videoFolder) return 'noSavePath'
        const videoPath = path.join(settings.local.videoFolder, request.option.params.cid + '_'+ request.option.params.quality.substring(3) + '.mp4')
        let returnCode = 'success'
        if(await fileIsExists(videoPath)) {
            request.option.params.timing = JSON.parse(request.option.params.timing)
            request.option.params.path = videoPath
            saveMusicVideo(request.option.params)
            return returnCode
        } else {
            if(cancel != null) cancel()
            const result = await axios({
                url: request.url,
                method: 'get',
                headers: request.option.headers,
                responseType: 'stream',
                onDownloadProgress:(progressEvent)=>{
                    let progress = Math.round( progressEvent.loaded / progressEvent.total*100)
                    win.webContents.send('download-video-progress', progress)
                    if(returnCode == 'cancel') win.setProgressBar(-1)
                    else win.setProgressBar(progress / 100)
                },
                cancelToken: new CancelToken(function executor(c) {
                    cancel = c
                })
            })
            const writer = fs.createWriteStream(videoPath)
            await result.data.pipe(writer)
            ipcMain.on('cancel-download-music-video', () => {
                returnCode = 'cancel'
                writer.close()
                writer.once('close', () => {
                    cancel()
                    win.setProgressBar(-1)
                    fs.unlinkSync(videoPath)
                })
            })
            return new Promise((resolve, reject) => {
                writer.on("finish", () => {
                    win.setProgressBar(-1)
                    if(returnCode == 'cancel') {
                        resolve(returnCode)
                        return returnCode
                    }
                    request.option.params.timing = JSON.parse(request.option.params.timing)
                    request.option.params.path = videoPath
                    saveMusicVideo(request.option.params)
                    resolve(returnCode)
                })
                writer.on("error", () => {
                    win.setProgressBar(-1)
                    reject('failed')
                })
            })
        }
    })
    ipcMain.handle('music-video-isexists', async (e, obj) => {
        const result = await searchMusicVideo(obj.id)
        if(result) {
            if(obj.method == 'get') return result
            const file = await fileIsExists(result.data.path)
            if(!file) return '404'
            else return result
        } else return false
    })
    ipcMain.handle('clear-unused-video', async (e) => {
        const settings = await settingsStore.get('settings')
        const folderPath = settings.local.videoFolder
        if(!folderPath) return 'noSavePath'
        const musicVideo = await musicVideoStore.get('musicVideo')
        const files = fs.readdirSync(folderPath)
        files.forEach(filename => {
            const filePath = path.join(folderPath, filename)
            if(!musicVideo.some(video => video.path == filePath)) {
              console.log(filePath)
                fs.unlinkSync(filePath)
            }
        })
        return true
    })
    ipcMain.handle('delete-music-video', async (e, id) => {
        const musicVideo = await musicVideoStore.get('musicVideo')
        return new Promise((resolve, reject) => {
            searchMusicVideo(id).then(result => {
                if(result) {
                    musicVideo.splice(result.index, 1)
                    musicVideoStore.set('musicVideo', musicVideo)
                    resolve(true)
                } else resolve(false)
            })
        })
    })
    //获取本地歌词
    ipcMain.handle('get-local-music-lyric', async (e, filePath) => {
        // async function getLyricByFile(filePath) {
        //     return new Promise((resolve, reject) => {
        //         jsmediatags.read(filePath, {
        //             onSuccess: (tag) => {
        //                 resolve(tag)
        //             },
        //             onError: (error) => {
        //                 console.log(':(', error.type, error.info);
        //                 reject(error)
        //             }
        //         });
        //     })
        // }
        // return await getLyricByFile(filePath)
        const str = filePath.split(path.sep)
        const folderPath = filePath.substring(0, filePath.length - str[str.length - 1].length - 1)
        const fileName = path.basename(filePath, path.extname(filePath))
        async function readLyric(path) {
            return fs.readFileSync(path, 'utf8', (err, data) => {
                if (err) return false
                else return data
            })
        }
        function lyricHandle(data) {
            const lines = data.split(/\r?\n/)
            let lyricArr = ''
            lines.forEach((line) => {
                if(line) lyricArr += line + '\n'
            })
            return lyricArr
        }
        if(await fileIsExists(path.join(folderPath, fileName + '.lrc'))) {
            const res = await readLyric(path.join(folderPath, fileName + '.lrc'))
            if(res) return lyricHandle(res)
        }
        if(await fileIsExists(path.join(folderPath, fileName + '.txt'))) {
            const res = await readLyric(path.join(folderPath, fileName + '.txt'))
            if(res) return lyricHandle(res)
        }
        const metedata = await parseFile(filePath)
        if(metedata.common.lyrics) return metedata.common.lyrics[0]
        
        return false
    })
    ipcMain.on('copy-txt', (e, txt) => {
        clipboard.writeText(txt)
    })
    ipcMain.on('set-window-title', (e, title) => {
        win.setTitle(title)
    })

    // 网易云内嵌登录功能
    ipcMain.handle('open-netease-login', async () => {
        return new Promise((resolve, reject) => {
            // 创建独立的session，确保每次都是全新的登录环境
            const loginSession = session.fromPartition('login-session-' + Date.now(), {
                cache: false
            })

            const loginWindow = new BrowserWindow({
                width: 900,
                height: 700,
                title: '网易云音乐登录',
                autoHideMenuBar: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: true,
                    session: loginSession // 使用独立session
                }
            })

            // 清理可能存在的相关缓存
            loginSession.clearCache()
            loginSession.clearStorageData({
                storages: ['cookies', 'localstorage', 'sessionstorage', 'indexdb', 'websql']
            })

            // 先加载一个空页面，然后跳转到登录页面
            loginWindow.loadURL('about:blank')

            // 检查登录状态的函数
            const checkLoginStatus = async () => {
                try {
                    // 从登录窗口的session获取cookies
                    const cookies = await loginSession.cookies.get({
                        domain: '.music.163.com'
                    })
                    
                    console.log('当前获取到的cookies:', cookies.map(c => `${c.name}=${c.value.substring(0, 10)}...`))
                    
                    // 检查是否包含登录必需的cookie
                    const musicUCookie = cookies.find(cookie => cookie.name === 'MUSIC_U')
                    
                    if (musicUCookie && musicUCookie.value && musicUCookie.value.length > 10) {
                        // 将cookies转换为字符串格式
                        const cookieString = cookies.map(cookie => 
                            `${cookie.name}=${cookie.value}`
                        ).join('; ')
                        
                        console.log('登录成功，获取到cookie:', musicUCookie.value.substring(0, 20) + '...')
                        
                        loginWindow.close()
                        resolve({
                            success: true,
                            cookies: cookieString,
                            message: '登录成功'
                        })
                        return true
                    }
                    return false
                } catch (error) {
                    console.error('检查登录状态失败:', error)
                    return false
                }
            }

            // 强制加载登录页面的函数
            const forceLoadLoginPage = async () => {
                try {
                    console.log('强制加载登录页面')
                    // 加载登录页面并注入脚本确保显示登录界面
                    await loginWindow.loadURL('https://music.163.com/#/login')
                    
                    // 延迟一下确保页面加载完成
                    setTimeout(async () => {
                        try {
                            await loginWindow.webContents.executeJavaScript(`
                                // 强制清理所有本地存储
                                localStorage.clear();
                                sessionStorage.clear();
                                
                                // 删除所有cookie
                                document.cookie.split(";").forEach(function(c) { 
                                    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
                                });
                                
                                // 强制跳转到登录页面
                                if (!window.location.href.includes('/login')) {
                                    window.location.href = 'https://music.163.com/#/login';
                                }
                                
                                // 如果页面已经显示登录状态，尝试触发退出
                                setTimeout(() => {
                                    const logoutButtons = document.querySelectorAll('[class*="logout"], [class*="exit"], [data-action="logout"]');
                                    if (logoutButtons.length > 0) {
                                        logoutButtons[0].click();
                                    }
                                    
                                    // 再次确保跳转到登录页面
                                    setTimeout(() => {
                                        if (!window.location.href.includes('/login')) {
                                            window.location.href = 'https://music.163.com/#/login';
                                        }
                                    }, 1000);
                                }, 1000);
                            `)
                        } catch (error) {
                            console.error('注入脚本失败:', error)
                        }
                    }, 2000)
                } catch (error) {
                    console.error('强制加载登录页面失败:', error)
                }
            }

            // 初始加载完成后，开始加载登录页面
            loginWindow.webContents.once('did-finish-load', () => {
                console.log('空白页面加载完成，开始加载登录页面')
                forceLoadLoginPage()
            })

            // 监听页面加载完成
            loginWindow.webContents.on('did-finish-load', async () => {
                const currentURL = loginWindow.webContents.getURL()
                console.log('页面加载完成:', currentURL)
                
                // 如果不是登录页面，强制跳转
                if (currentURL.includes('music.163.com') && !currentURL.includes('/login')) {
                    console.log('检测到非登录页面，强制跳转')
                    setTimeout(() => forceLoadLoginPage(), 1000)
                }
                
                // 延迟检查登录状态
                setTimeout(async () => {
                    await checkLoginStatus()
                }, 3000)
            })

            // 监听URL变化
            loginWindow.webContents.on('did-navigate', async (event, navigationUrl) => {
                console.log('页面导航到:', navigationUrl)
                
                // 延迟检查登录状态
                setTimeout(async () => {
                    await checkLoginStatus()
                }, 2000)
            })

            // 监听页面内导航（适用于SPA应用）
            loginWindow.webContents.on('did-navigate-in-page', async (event, navigationUrl) => {
                console.log('页面内导航到:', navigationUrl)
                
                // 检查是否跳转到了登录后的页面
                if (navigationUrl.includes('music.163.com') && 
                    (navigationUrl.includes('#/my') || 
                     navigationUrl.includes('#/discover') || 
                     navigationUrl.includes('#/friend'))) {
                    
                    // 延迟检查，确保cookie已设置
                    setTimeout(async () => {
                        const success = await checkLoginStatus()
                        if (!success) {
                            console.log('登录检测失败，继续监听...')
                        }
                    }, 3000)
                }
            })

            // 定期强制检查并刷新登录页面
            let forceRefreshCount = 0
            const forceRefreshInterval = setInterval(() => {
                forceRefreshCount++
                if (forceRefreshCount > 10) { // 最多尝试10次
                    clearInterval(forceRefreshInterval)
                    return
                }
                
                try {
                    const currentURL = loginWindow.webContents.getURL()
                    console.log(`第${forceRefreshCount}次检查URL:`, currentURL)
                    
                    if (currentURL.includes('music.163.com') && !currentURL.includes('/login')) {
                        console.log(`第${forceRefreshCount}次强制刷新登录页面`)
                        forceLoadLoginPage()
                    }
                } catch (error) {
                    console.error('定期检查失败:', error)
                }
            }, 5000)

            // 定期检查登录状态（作为备用机制）
            const loginCheckInterval = setInterval(async () => {
                const success = await checkLoginStatus()
                if (success) {
                    clearInterval(loginCheckInterval)
                    clearInterval(forceRefreshInterval)
                }
            }, 5000)

            // 窗口关闭事件
            loginWindow.on('closed', () => {
                clearInterval(loginCheckInterval)
                clearInterval(forceRefreshInterval)
                // 清理session
                loginSession.clearCache()
                loginSession.clearStorageData()
                resolve({
                    success: false,
                    message: '用户取消登录'
                })
            })

            // 处理登录错误
            loginWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
                console.error('页面加载失败:', errorDescription)
                clearInterval(loginCheckInterval)
                clearInterval(forceRefreshInterval)
                // 清理session
                loginSession.clearCache()
                loginSession.clearStorageData()
                reject({
                    success: false,
                    message: `页面加载失败: ${errorDescription}`
                })
            })
        })
    })

    // 清理登录session的辅助方法
    ipcMain.handle('clear-login-session', async () => {
        try {
            // 清理默认session中的网易云相关数据
            await session.defaultSession.clearStorageData({
                storages: ['cookies', 'localstorage', 'sessionstorage'],
                quotas: ['temporary', 'persistent', 'syncable'],
                origin: 'https://music.163.com'
            })
            
            // 清理网易云相关的cookies
            const cookies = await session.defaultSession.cookies.get({
                domain: '.music.163.com'
            })
            
            for (const cookie of cookies) {
                await session.defaultSession.cookies.remove(
                    `https://${cookie.domain}${cookie.path}`, 
                    cookie.name
                )
            }
            
            console.log('登录session已清理')
            return { success: true, message: '登录session已清理' }
        } catch (error) {
            console.error('清理登录session失败:', error)
            return { success: false, message: '清理失败' }
        }
    })
}