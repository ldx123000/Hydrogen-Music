const { ipcMain, shell, dialog, globalShortcut, Menu, clipboard } = require('electron')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { parseFile } = require('music-metadata')
const { spawn } = require('child_process')
let ffmpegPath = null
try {
    ffmpegPath = require('ffmpeg-static')
} catch (_) {
    ffmpegPath = null
}
// const jsmediatags = require("jsmediatags");
const registerShortcuts = require('./shortcuts')
const Store = require('electron-store').default;
const CancelToken = axios.CancelToken
let cancel = null

module.exports = IpcMainEvent = (win, app, lyricFunctions = {}) => {
    const settingsStore = new Store({ name: 'settings' })
    const lastPlaylistStore = new Store({ name: 'lastPlaylist' })
    const musicVideoStore = new Store({ name: 'musicVideo' })

    // 全局存储桌面歌词窗口引用
    let globalLyricWindow = null;
    // win.on('restore', () => {
    // win.webContents.send('lyric-control')
    // })
    ipcMain.on('window-min', () => {
        win.minimize()
    })
    // 保存窗口的原始状态
    let savedBounds = null
    let isWindowMaximized = false

    ipcMain.on('window-max', () => {
        if (isWindowMaximized) {
            // macOS 上 restore() 可能不可靠，手动设置窗口大小和位置
            if (savedBounds) {
                win.setBounds(savedBounds)
            } else {
                // 如果没有保存的边界，使用默认大小
                win.setBounds({
                    x: 170,
                    y: 162,
                    width: 1024,
                    height: 672
                })
            }
            isWindowMaximized = false
        } else {
            // 保存当前窗口状态
            savedBounds = win.getBounds()
            win.maximize()
            isWindowMaximized = true
        }
    })

    // 监听窗口状态变化事件
    win.on('maximize', () => {
        if (!isWindowMaximized) {
            isWindowMaximized = true
        }
    })

    win.on('unmaximize', () => {
        if (isWindowMaximized) {
            isWindowMaximized = false
        }
    })

    win.on('restore', () => {
        isWindowMaximized = false
    })
    ipcMain.on('window-close', async () => {
        const settings = await settingsStore.get('settings')
        if (settings.other.quitApp == 'minimize') {
            win.hide()
        } else if (settings.other.quitApp == 'quit') {
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
        try {
            // 显式禁用跳过封面，避免新版库默认不读取封面
            const data = await parseFile(filePath, { skipCovers: false }).catch(() => null)
            const picArr = data && data.common && Array.isArray(data.common.picture) ? data.common.picture : null
            const pic = picArr && picArr.length > 0 ? picArr[0] : null
            if (pic && pic.data) {
                let mime = (pic.format && String(pic.format).startsWith('image/')) ? pic.format : null
                if (!mime) {
                    // 简单的文件头嗅探，兜底 MIME
                    const buf = Buffer.from(pic.data)
                    if (buf.length > 12 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) mime = 'image/png'
                    else if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) mime = 'image/jpeg'
                    else mime = 'image/jpeg'
                }
                return `data:${mime};base64,${Buffer.from(pic.data).toString('base64')}`
            }

            // 若无内嵌封面，尝试同名图片或常见封面文件
            const parsed = path.parse(filePath)
            const candidates = [
                path.join(parsed.dir, parsed.name + '.jpg'),
                path.join(parsed.dir, parsed.name + '.jpeg'),
                path.join(parsed.dir, parsed.name + '.png'),
                path.join(parsed.dir, parsed.name + '.webp'),
                path.join(parsed.dir, 'cover.jpg'),
                path.join(parsed.dir, 'folder.jpg'),
                path.join(parsed.dir, 'cover.png'),
                path.join(parsed.dir, 'folder.png'),
            ]
            const mapMime = (p) => {
                const ext = (p.split('.').pop() || '').toLowerCase()
                if (ext === 'png') return 'image/png'
                if (ext === 'webp') return 'image/webp'
                return 'image/jpeg'
            }
            for (const p of candidates) {
                try {
                    if (fs.existsSync(p)) {
                        const b64 = fs.readFileSync(p).toString('base64')
                        return `data:${mapMime(p)};base64,${b64}`
                    }
                } catch (_) { /* ignore */ }
            }
        } catch (e) {
            // ignore
        }
        return null
    })
    const normalizeSearchAssistLimit = value => {
        const num = Number.parseInt(value, 10)
        if (!Number.isFinite(num)) return 8
        return Math.max(1, num)
    }
    const defaultMusicLevel = 'lossless'
    const availableMusicLevel = new Set([
        'standard',
        'higher',
        'exhigh',
        'lossless',
        'hires',
        'jyeffect',
        'sky',
        'dolby',
        'jymaster',
    ])

    const normalizeMusicLevel = level => availableMusicLevel.has(level) ? level : defaultMusicLevel

    const normalizeMusicSettings = (music = {}) => {
        const normalized = { ...music }
        normalized.searchAssistLimit = normalizeSearchAssistLimit(normalized.searchAssistLimit)
        normalized.level = normalizeMusicLevel(normalized.level)
        normalized.showSongTranslation = normalized.showSongTranslation !== false
        // 兼容历史版本：读取后清理旧迁移标记字段。
        delete normalized.levelMigratedToLosslessV1
        return normalized
    }

    ipcMain.on('set-settings', (e, settings) => {
        const parsedSettings = JSON.parse(settings)
        if (!parsedSettings.music) parsedSettings.music = {}
        // 保存时仅做合法值归一化，并清理历史迁移字段。
        parsedSettings.music = normalizeMusicSettings(parsedSettings.music)
        settingsStore.set('settings', parsedSettings)
        registerShortcuts(win)
    })
    ipcMain.handle('get-settings', async () => {
        const settings = await settingsStore.get('settings')
        if (settings) {
            if (!settings.music) settings.music = {}
            // 读取时仅做归一化（保留旧版本合法音质选择，并清理历史迁移字段）。
            settings.music = normalizeMusicSettings(settings.music)
            settingsStore.set('settings', settings)
            return settings
        } else {
            let initSettings = {
                music: {
                    level: defaultMusicLevel,
                    lyricSize: '20',
                    tlyricSize: '14',
                    rlyricSize: '12',
                    lyricInterlude: 13,
                    searchAssistLimit: 8,
                    showSongTranslation: true,
                },
                local: {
                    videoFolder: null,
                    downloadFolder: null,
                    downloadCreateSongFolder: false,
                    downloadSaveLyricFile: false,
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
                    quitApp: 'minimize'
                }
            }
            settingsStore.set('settings', initSettings)
            registerShortcuts(win)
            return initSettings
        }
    })
    ipcMain.handle('dialog:openFile', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
        if (canceled) {
            return null
        } else {
            return filePaths[0]
        }
    })
    ipcMain.on('register-shortcuts', () => {
        registerShortcuts(win, app)
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
        const lastPlaylist = await lastPlaylistStore.get('playlist')
        if (lastPlaylist) return lastPlaylist
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
        if (musicVideoStore.has('musicVideo')) {
            const result = await musicVideoStore.get('musicVideo')
            const index = (result || []).findIndex((music) => music.id == id)
            if (index != -1) {
                return { data: result[index], index: index }
            } else return false
        } else return false
    }
    async function saveMusicVideo(data) {
        if (musicVideoStore.has('musicVideo')) {
            const musicVideo = await musicVideoStore.get('musicVideo')
            searchMusicVideo(data.id).then(result => {
                if (result) musicVideo.splice(result.index, 1)
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
        if (!settings.local.videoFolder) return 'noSavePath'
        const videoPath = path.join(settings.local.videoFolder, request.option.params.cid + '_' + request.option.params.quality.substring(3) + '.mp4')
        let returnCode = 'success'
        let transcodeProc = null
        if (await fileIsExists(videoPath)) {
            request.option.params.timing = JSON.parse(request.option.params.timing)
            request.option.params.path = videoPath
            saveMusicVideo(request.option.params)
            return returnCode
        } else {
            if (cancel != null) cancel()
            const result = await axios({
                url: request.url,
                method: 'get',
                headers: request.option.headers,
                responseType: 'stream',
                onDownloadProgress: (progressEvent) => {
                    let progress = Math.round(progressEvent.loaded / progressEvent.total * 100)
                    win.webContents.send('download-video-progress', progress)
                    if (returnCode == 'cancel') win.setProgressBar(-1)
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
                writer.on("finish", async () => {
                    if (returnCode == 'cancel') {
                        win.setProgressBar(-1)
                        resolve(returnCode)
                        return
                    }

                    // 下载完成后，如编码为 HEVC，尝试自动转码为 H.264 提高兼容性
                    const codec = (request && request.option && request.option.params && request.option.params.codec) ? String(request.option.params.codec).toLowerCase() : ''
                    const isHevc = /hev1|hvc1|hevc/.test(codec)

                    const finalizeSave = () => {
                        try { win.setProgressBar(-1) } catch (_) {}
                        try {
                            request.option.params.timing = JSON.parse(request.option.params.timing)
                        } catch (_) {}
                        request.option.params.path = videoPath
                        saveMusicVideo(request.option.params)
                        resolve('success')
                    }

                    if (isHevc && ffmpegPath) {
                        try {
                            const tmpOut = videoPath.replace(/\.mp4$/i, '_avc.mp4')
                            // 开始转码，视频转 H.264，移除音频(-an)（B站 dash 为纯视频流）
                            const args = [
                                '-y',
                                '-i', videoPath,
                                '-c:v', 'libx264',
                                '-preset', 'veryfast',
                                '-crf', '23',
                                '-pix_fmt', 'yuv420p',
                                '-movflags', 'faststart',
                                '-an',
                                tmpOut
                            ]
                            transcodeProc = spawn(ffmpegPath, args, { windowsHide: true })

                            // 若用户取消，则同时终止转码
                            const cancelListener = () => {
                                try { transcodeProc && transcodeProc.kill('SIGKILL') } catch (_) {}
                            }
                            ipcMain.once('cancel-download-music-video', cancelListener)

                            transcodeProc.on('error', (err) => {
                                console.warn('转码进程启动失败，保留原始文件:', err && err.message ? err.message : err)
                                finalizeSave()
                            })
                            transcodeProc.on('exit', (code) => {
                                // 移除取消监听
                                try { ipcMain.removeListener('cancel-download-music-video', cancelListener) } catch (_) {}
                                if (code === 0) {
                                    try {
                                        fs.unlinkSync(videoPath)
                                    } catch (_) {}
                                    try {
                                        fs.renameSync(tmpOut, videoPath)
                                    } catch (e) {
                                        console.warn('替换转码结果失败，使用转码文件路径:', e && e.message ? e.message : e)
                                        request.option.params.path = tmpOut
                                    }
                                } else {
                                    // 转码失败，保留原始文件
                                    try { fs.existsSync(tmpOut) && fs.unlinkSync(tmpOut) } catch (_) {}
                                    console.warn('转码失败，保留原始 HEVC 文件，可能无法播放')
                                }
                                finalizeSave()
                            })
                        } catch (err) {
                            console.warn('执行转码异常，保留原始文件:', err && err.message ? err.message : err)
                            finalizeSave()
                        }
                    } else {
                        // 非 HEVC 或无 ffmpeg，直接保存
                        finalizeSave()
                    }
                })
                writer.on("error", () => {
                    try { win.setProgressBar(-1) } catch (_) {}
                    reject('failed')
                })
            })
        }
    })
    ipcMain.handle('music-video-isexists', async (e, obj) => {
        console.log('检查视频是否存在 - 歌曲ID:', obj.id, '方法:', obj.method)
        const result = await searchMusicVideo(obj.id)
        console.log('searchMusicVideo 结果:', result)

        if (result) {
            if (obj.method == 'get') return result
            const file = await fileIsExists(result.data.path)
            console.log('文件是否存在:', file, '路径:', result.data.path)
            if (!file) return '404'
            else return result
        } else {
            console.log('没有找到该歌曲的视频数据')
            return false
        }
    })
    ipcMain.handle('clear-unused-video', async (e) => {
        const settings = await settingsStore.get('settings')
        const folderPath = settings.local.videoFolder
        if (!folderPath) return 'noSavePath'
        const musicVideo = await musicVideoStore.get('musicVideo')
        const files = fs.readdirSync(folderPath)
        files.forEach(filename => {
            const filePath = path.join(folderPath, filename)
            if (!musicVideo.some(video => video.path == filePath)) {
                fs.unlinkSync(filePath)
            }
        })
        return true
    })
    ipcMain.handle('delete-music-video', async (e, id) => {
        const musicVideo = await musicVideoStore.get('musicVideo')
        return new Promise((resolve, reject) => {
            searchMusicVideo(id).then(result => {
                if (result) {
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
        //                 
        //                 reject(error)
        //             }
        //         });
        //     })
        // }
	        // return await getLyricByFile(filePath)
	        const str = filePath.split(path.sep)
	        const folderPath = filePath.substring(0, filePath.length - str[str.length - 1].length - 1)
	        const fileName = path.basename(filePath, path.extname(filePath))
	        async function readLyric(file) {
	            try {
	                return fs.readFileSync(file, 'utf8')
	            } catch (_) {
	                return false
	            }
	        }
	        function lyricHandle(data) {
	            const lines = data.split(/\r?\n/)
	            let lyricArr = ''
	            lines.forEach((line) => {
	                if (line) lyricArr += line + '\n'
	            })
	            return lyricArr
	        }

	        // 同时收集“内嵌歌词”和“同名 .lrc/.txt”作为候选，优先返回带时间标的歌词（保证滚动同步）
	        const candidates = []
	        const pushCandidate = (val) => {
	            if (!val) return
	            if (Array.isArray(val)) {
	                val.forEach(v => pushCandidate(v))
	                return
	            }
	            if (typeof val === 'string') {
	                const s = val.trim()
	                if (s) candidates.push(s)
	                return
	            }
	            if (Buffer.isBuffer(val)) {
	                const s = val.toString('utf8').trim()
	                if (s) candidates.push(s)
	                return
	            }
	            if (typeof val === 'object' && typeof val.text === 'string') {
	                const s = val.text.trim()
	                if (s) candidates.push(s)
	            }
	        }
	        const timeTag = /\[\d{1,3}\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*\d{1,2}(?:\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*\d{1,3})?\]/m

	        // 1) 尝试从音频内嵌标签读取歌词（可能是无时间标 USLT/LYRICS，也可能是带时间标的 LRC）
	        try {
	            const metadata = await parseFile(filePath, { duration: false, skipCovers: true }).catch(() => null)
	            if (metadata) {
	                if (metadata.common && Array.isArray(metadata.common.lyrics)) pushCandidate(metadata.common.lyrics)

	                const natives = metadata.native || {}
	                const wantIds = new Set([
	                    'lyrics',
	                    'unsyncedlyrics',
	                    'unsynchronisedlyrics',
	                    'uslt',
	                    'sylt',
	                    'lrc',
	                    'lyrics_lrc',
	                    'syncedlyrics',
	                    'lyric',
	                    'lyricstext',
	                    '©lyr',
	                    '----:com.apple.itunes:lyrics'
	                ])
	                for (const type of Object.keys(natives)) {
	                    const entries = natives[type] || []
	                    for (const tag of entries) {
	                        const id = String(tag && tag.id || '').toLowerCase()
	                        if (id.includes('lyric') || id.includes('lrc') || wantIds.has(id)) pushCandidate(tag && tag.value)
	                    }
	                }
	            }
	        } catch (_) { /* ignore parse errors */ }

	        // 2) 加入同名侧车歌词文件（很多本地歌曲只有 .lrc 才有时间标）
	        try {
	            const lrcPath = path.join(folderPath, fileName + '.lrc')
	            if (await fileIsExists(lrcPath)) {
	                const res = await readLyric(lrcPath)
	                if (res) pushCandidate(res)
	            }
	            const txtPath = path.join(folderPath, fileName + '.txt')
	            if (await fileIsExists(txtPath)) {
	                const res = await readLyric(txtPath)
	                if (res) pushCandidate(res)
	            }
	        } catch (_) { /* ignore */ }

	        const timed = candidates.find(s => timeTag.test(s))
	        const chosen = (timed || candidates[0] || '').trim()
	        if (chosen) return lyricHandle(chosen)
               

        return false
    })
    ipcMain.on('copy-txt', (e, txt) => {
        clipboard.writeText(txt)
    })
    ipcMain.on('set-window-title', (e, title) => {
        win.setTitle(title)
    })

    // 处理更新 Dock 菜单的事件（仅限 macOS，有效负载保护）
    ipcMain.on('update-dock-menu', (e, songInfo) => {
        // 非 macOS 直接忽略，防止误调用引发标题回退等副作用
        if (process.platform !== 'darwin') return

        // 基本负载校验：需要包含 name 与 artist 字段
        if (!songInfo || typeof songInfo !== 'object' || !songInfo.name) return

        // 通知主进程窗口处理 Dock 菜单与菜单栏
        win.emit('update-dock-menu', songInfo)
    })

    // 桌面歌词相关 IPC 处理
    const { createLyricWindow, closeLyricWindow, setLyricWindowMovable, getLyricWindow } = lyricFunctions

    ipcMain.handle('create-lyric-window', async () => {
        try {
            if (createLyricWindow) {
                const lyricWin = createLyricWindow()
                if (lyricWin) {
                    globalLyricWindow = lyricWin

                    // 监听窗口关闭事件
                    lyricWin.on('closed', () => {
                        globalLyricWindow = null
                    })


                    return { success: true, message: '桌面歌词窗口已创建' }
                } else {
                    return { success: false, message: '创建窗口失败' }
                }
            }
            return { success: false, message: '桌面歌词功能不可用' }
        } catch (error) {

            return { success: false, message: '创建失败' }
        }
    })

    ipcMain.handle('close-lyric-window', async () => {
        try {
            if (closeLyricWindow) {
                closeLyricWindow()
                return { success: true, message: '桌面歌词窗口已关闭' }
            }
            return { success: false, message: '桌面歌词功能不可用' }
        } catch (error) {

            return { success: false, message: '关闭失败' }
        }
    })

    ipcMain.handle('set-lyric-window-movable', async (event, movable) => {
        try {
            if (setLyricWindowMovable) {
                setLyricWindowMovable(movable)
                return { success: true, message: '窗口移动状态已更新' }
            }
            return { success: false, message: '桌面歌词功能不可用' }
        } catch (error) {

            return { success: false, message: '设置失败' }
        }
    })

    ipcMain.on('lyric-window-ready', () => {

    })

    ipcMain.on('update-lyric-data', (event, data) => {
        let lyricWindow = globalLyricWindow
        if (!lyricWindow && getLyricWindow) {
            lyricWindow = getLyricWindow()
        }

        if (lyricWindow && !lyricWindow.isDestroyed()) {
            lyricWindow.webContents.send('lyric-update', data)
        }
    })

    ipcMain.on('request-lyric-data', (event) => {
        win.webContents.send('get-current-lyric-data')
    })

    ipcMain.on('current-lyric-data', (event, data) => {
        const lyricWindow = getLyricWindow && getLyricWindow()
        if (lyricWindow && !lyricWindow.isDestroyed()) {
            lyricWindow.webContents.send('lyric-update', data)
        }
    })

    ipcMain.handle('is-lyric-window-visible', () => {
        const lyricWindow = getLyricWindow && getLyricWindow();
        return lyricWindow && !lyricWindow.isDestroyed() && lyricWindow.isVisible();
    });

    // 调整桌面歌词窗口大小
    ipcMain.handle('resize-lyric-window', (event, { width, height }) => {
        const lyricWindow = getLyricWindow && getLyricWindow();
        if (lyricWindow && !lyricWindow.isDestroyed()) {
            try {
                lyricWindow.setSize(width, height);
                return { success: true };
            } catch (error) {

                return { success: false, error: error.message };
            }
        }
        return { success: false, error: '窗口不存在' };
    });

    // 获取桌面歌词窗口位置与尺寸
    ipcMain.handle('get-lyric-window-bounds', () => {
        const lyricWindow = getLyricWindow && getLyricWindow();
        if (lyricWindow && !lyricWindow.isDestroyed()) {
            try {
                return lyricWindow.getBounds();
            } catch (error) {
                return null;
            }
        }
        return null;
    });

    // 移动桌面歌词窗口到指定坐标（基于屏幕坐标）
    ipcMain.on('move-lyric-window', (event, { x, y }) => {
        const lyricWindow = getLyricWindow && getLyricWindow();
        if (lyricWindow && !lyricWindow.isDestroyed() && typeof x === 'number' && typeof y === 'number') {
            try {
                lyricWindow.setPosition(Math.round(x), Math.round(y));
            } catch (error) {
                // 忽略移动错误
            }
        }
    });

    // 按增量移动桌面歌词窗口（无需预先获取窗口位置）
    ipcMain.on('move-lyric-window-by', (event, { dx, dy }) => {
        if (process.platform === 'darwin') return; // macOS 保持原生
        const lyricWindow = getLyricWindow && getLyricWindow();
        if (lyricWindow && !lyricWindow.isDestroyed() && typeof dx === 'number' && typeof dy === 'number') {
            try {
                const { x, y } = lyricWindow.getBounds();
                lyricWindow.setPosition(Math.round(x + dx), Math.round(y + dy));
            } catch (error) {
                // 忽略移动错误
            }
        }
    });

    // 将窗口移动到指定位置，并强制保持给定宽高
    ipcMain.on('move-lyric-window-to', (event, { x, y, width, height }) => {
        if (process.platform === 'darwin') return; // macOS 保持原生
        const lyricWindow = getLyricWindow && getLyricWindow();
        if (
            lyricWindow &&
            !lyricWindow.isDestroyed() &&
            typeof x === 'number' && typeof y === 'number' &&
            typeof width === 'number' && typeof height === 'number'
        ) {
            try {
                lyricWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
            } catch (error) {
                // 忽略移动错误
            }
        }
    });

    // 读取窗口最小/最大尺寸（Windows专用）
    ipcMain.handle('get-lyric-window-min-max', () => {
        if (process.platform === 'darwin') return null;
        const lyricWindow = getLyricWindow && getLyricWindow();
        if (lyricWindow && !lyricWindow.isDestroyed()) {
            try {
                const [minWidth, minHeight] = lyricWindow.getMinimumSize();
                const [maxWidth, maxHeight] = lyricWindow.getMaximumSize();
                return { minWidth, minHeight, maxWidth, maxHeight };
            } catch (error) {
                return null;
            }
        }
        return null;
    });

    // 设置窗口最小/最大尺寸（Windows专用）
    ipcMain.on('set-lyric-window-min-max', (event, { minWidth, minHeight, maxWidth, maxHeight }) => {
        if (process.platform === 'darwin') return;
        const lyricWindow = getLyricWindow && getLyricWindow();
        if (lyricWindow && !lyricWindow.isDestroyed()) {
            try {
                if (typeof minWidth === 'number' && typeof minHeight === 'number') {
                    lyricWindow.setMinimumSize(Math.max(0, Math.round(minWidth)), Math.max(0, Math.round(minHeight)));
                }
                if (typeof maxWidth === 'number' && typeof maxHeight === 'number') {
                    lyricWindow.setMaximumSize(Math.max(0, Math.round(maxWidth)), Math.max(0, Math.round(maxHeight)));
                }
            } catch (error) {
                // 忽略错误
            }
        }
    });

    // 设置窗口宽高比（Windows专用）
    ipcMain.on('set-lyric-window-aspect-ratio', (event, { aspectRatio }) => {
        if (process.platform === 'darwin') return;
        const lyricWindow = getLyricWindow && getLyricWindow();
        if (lyricWindow && !lyricWindow.isDestroyed()) {
            try {
                const ratio = typeof aspectRatio === 'number' ? aspectRatio : 0;
                lyricWindow.setAspectRatio(ratio > 0 ? ratio : 0);
            } catch (error) {
                // 忽略错误
            }
        }
    });

    // 读取内容区域的bounds（Windows专用）
    ipcMain.handle('get-lyric-window-content-bounds', () => {
        if (process.platform === 'darwin') return null;
        const lyricWindow = getLyricWindow && getLyricWindow();
        if (lyricWindow && !lyricWindow.isDestroyed()) {
            try {
                return lyricWindow.getContentBounds();
            } catch (error) {
                return null;
            }
        }
        return null;
    });

    // 设置内容区域的bounds（Windows专用）
    ipcMain.on('move-lyric-window-content-to', (event, { x, y, width, height }) => {
        if (process.platform === 'darwin') return;
        const lyricWindow = getLyricWindow && getLyricWindow();
        if (
            lyricWindow &&
            !lyricWindow.isDestroyed() &&
            typeof x === 'number' && typeof y === 'number' &&
            typeof width === 'number' && typeof height === 'number'
        ) {
            try {
                lyricWindow.setContentBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
            } catch (error) {
                // 忽略错误
            }
        }
    });

    // 设置桌面歌词窗口的可调整大小状态（用于拖拽期间临时禁用）
    ipcMain.on('set-lyric-window-resizable', (event, { resizable }) => {
        if (process.platform !== 'win32') return; // 仅Windows需要
        const lyricWindow = getLyricWindow && getLyricWindow();
        if (lyricWindow && !lyricWindow.isDestroyed()) {
            try {
                lyricWindow.setResizable(!!resizable);
            } catch (error) {
                // 忽略错误
            }
        }
    });

    // 处理桌面歌词窗口关闭通知
    ipcMain.on('lyric-window-closed', () => {
        // 通知主窗口桌面歌词已关闭
        win.webContents.send('desktop-lyric-closed');
    });

    // 处理应用更新相关的 IPC 事件
    ipcMain.on('check-for-update', async () => {
        // 在 macOS 上，改为使用 GitHub API 手动检查
        if (process.platform === 'darwin') {
            try {
                const current = app.getVersion();
                const api = 'https://api.github.com/repos/ldx123000/Hydrogen-Music/releases/latest';
                const { data } = await axios.get(api, { headers: { 'User-Agent': 'HydrogenMusic-Updater' } });
                let latest = data.tag_name || data.name || '';
                if (typeof latest === 'string' && latest.startsWith('v')) latest = latest.slice(1);

                const isNewer = (a, b) => {
                    const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
                    const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
                    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                        const da = pa[i] || 0, db = pb[i] || 0;
                        if (da > db) return true;
                        if (da < db) return false;
                    }
                    return false;
                };

                if (latest && isNewer(latest, current)) {
                    const pageUrl = data.html_url || `https://github.com/ldx123000/Hydrogen-Music/releases/tag/v${latest}`;
                    console.log('手动检查更新完成（macOS），发现新版本:', latest, pageUrl);
                    win.webContents.send('manual-update-available', latest, pageUrl);
                } else {
                    console.log('手动检查更新完成（macOS），当前已是最新版本');
                    win.webContents.send('update-not-available');
                }
            } catch (error) {
                console.error('手动检查更新失败（macOS）:', error);
                win.webContents.send('update-error', error.message || '检查更新失败');
            }
            return;
        }

        // 其他平台走 electron-updater
        const { autoUpdater } = require("electron-updater");
        // 为手动检查设置一次性事件监听器
        const handleUpdateAvailable = (info) => {
            console.log('手动检查更新完成，发现新版本:', info.version);
            win.webContents.send('manual-update-available', info.version);
            autoUpdater.removeListener('update-available', handleUpdateAvailable);
            autoUpdater.removeListener('update-not-available', handleUpdateNotAvailable);
            autoUpdater.removeListener('error', handleUpdateError);
        };
        const handleUpdateNotAvailable = () => {
            console.log('手动检查更新完成，当前已是最新版本');
            win.webContents.send('update-not-available');
            autoUpdater.removeListener('update-available', handleUpdateAvailable);
            autoUpdater.removeListener('update-not-available', handleUpdateNotAvailable);
            autoUpdater.removeListener('error', handleUpdateError);
        };
        const handleUpdateError = (error) => {
            console.error('手动检查更新失败:', error);
            win.webContents.send('update-error', error.message);
            autoUpdater.removeListener('update-available', handleUpdateAvailable);
            autoUpdater.removeListener('update-not-available', handleUpdateNotAvailable);
            autoUpdater.removeListener('error', handleUpdateError);
        };
        autoUpdater.once('update-available', handleUpdateAvailable);
        autoUpdater.once('update-not-available', handleUpdateNotAvailable);
        autoUpdater.once('error', handleUpdateError);
        autoUpdater.checkForUpdates().catch(error => {
            console.error('检查更新失败:', error);
            win.webContents.send('update-error', error.message);
        });
    });

    ipcMain.on('download-update', () => {
        const { autoUpdater } = require("electron-updater");
        console.log('开始下载更新...');
        autoUpdater.downloadUpdate()
            .catch(error => {
                console.error('下载更新失败:', error);
                win.webContents.send('update-error', error.message);
            });
    });

    ipcMain.on('install-update', () => {
        const { autoUpdater } = require("electron-updater");
        console.log('开始安装更新并重启应用...');
        autoUpdater.quitAndInstall();
    });

    ipcMain.on('cancel-update', () => {
        console.log('用户取消了更新');
        // 可以在这里添加取消更新的逻辑，例如停止下载等
        win.setProgressBar(-1); // 隐藏进度条
    });
}
