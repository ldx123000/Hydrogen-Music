const { ipcMain, shell, dialog, globalShortcut, Menu, clipboard } = require('electron')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { parseFile } = require('music-metadata')
const { spawn } = require('child_process')
const { loadLocalLyricPayload } = require('./localLyrics')
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

module.exports = IpcMainEvent = (win, app, lyricFunctions = {}) => {
    const settingsStore = new Store({ name: 'settings' })
    const lastPlaylistStore = new Store({ name: 'lastPlaylist' })
    const musicVideoStore = new Store({ name: 'musicVideo' })
    const trustedShellProtocols = new Set(['https:', 'http:'])
    const trustedExternalFetchHosts = new Set([
        'passport.bilibili.com',
        'api.bilibili.com',
        'monster-siren.hypergryph.com',
        'web.hycdn.cn',
    ])
    const trustedBiliDownloadHostSuffixes = ['.bilivideo.com', '.bilivideo.cn']
    const allowedNcmApiHosts = new Set(['localhost', '127.0.0.1'])
    const ncmApiCookieUrls = Object.freeze(['http://localhost:36530', 'http://127.0.0.1:36530'])
    const disallowedForwardHeaders = new Set(['host', 'connection', 'content-length'])
    const trustedResourceHeaderNames = new Set(['accept', 'accept-language', 'content-type', 'referer', 'user-agent'])
    const trustedBiliResourceHeaderNames = new Set(['accept', 'accept-language', 'content-type', 'cookie', 'origin', 'referer', 'user-agent'])

    // 全局存储桌面歌词窗口引用
    let globalLyricWindow = null;
    let activeMusicVideoAbort = null
    let activeMusicVideoCancelListener = null

    const clearMusicVideoCancelListener = listener => {
        if (!listener) return
        try { ipcMain.removeListener('cancel-download-music-video', listener) } catch (_) {}
        if (activeMusicVideoCancelListener === listener) {
            activeMusicVideoCancelListener = null
        }
    }

    const setMusicVideoCancelListener = listener => {
        if (activeMusicVideoCancelListener && activeMusicVideoCancelListener !== listener) {
            clearMusicVideoCancelListener(activeMusicVideoCancelListener)
        }
        activeMusicVideoCancelListener = listener
        ipcMain.on('cancel-download-music-video', listener)
    }

    const clearActiveMusicVideoAbort = abortFn => {
        if (activeMusicVideoAbort === abortFn) activeMusicVideoAbort = null
    }

    const removeFileIfExists = targetPath => {
        try {
            if (!targetPath || !fs.existsSync(targetPath)) return
            const stat = fs.statSync(targetPath)
            if (stat.isFile()) fs.unlinkSync(targetPath)
        } catch (_) {}
    }

    const getManagedVideoFolder = baseFolder => {
        const normalizedBaseFolder = typeof baseFolder === 'string' ? baseFolder.trim() : ''
        if (!normalizedBaseFolder) return ''
        return path.join(normalizedBaseFolder, 'HydrogenMusicVideoCache')
    }

    const getLegacyVideoFolder = baseFolder => {
        const normalizedBaseFolder = typeof baseFolder === 'string' ? baseFolder.trim() : ''
        if (!normalizedBaseFolder) return ''
        return path.resolve(normalizedBaseFolder)
    }

    const getVideoStorageRoots = baseFolder => {
        const roots = []
        const legacyVideoFolder = getLegacyVideoFolder(baseFolder)
        const managedVideoFolder = getManagedVideoFolder(baseFolder)

        if (legacyVideoFolder) roots.push(legacyVideoFolder)
        if (managedVideoFolder) roots.push(path.resolve(managedVideoFolder))

        return Array.from(new Set(roots))
    }

    const getVideoCacheFileName = params => {
        const safeCid = sanitizePathToken(params?.cid, 'cid')
        const qualityText = typeof params?.quality === 'string' ? params.quality.trim() : ''
        const qualityToken = qualityText
            ? sanitizePathToken(qualityText.split(/\s+/).pop() || qualityText, 'quality')
            : sanitizePathToken(params?.qn, 'quality')
        return `${safeCid}_${qualityToken}.mp4`
    }

    const getPreferredVideoSavePath = (baseFolder, params) => {
        const legacyVideoFolder = getLegacyVideoFolder(baseFolder)
        const managedVideoFolder = getManagedVideoFolder(baseFolder)
        const targetFolder = legacyVideoFolder || managedVideoFolder
        if (!targetFolder) return ''
        return path.join(targetFolder, getVideoCacheFileName(params))
    }

    const getVideoCacheCandidatePaths = (baseFolder, params) => {
        const fileName = getVideoCacheFileName(params)
        if (!fileName) return []

        const candidates = []
        const preferredPath = getPreferredVideoSavePath(baseFolder, params)
        if (preferredPath) candidates.push(path.resolve(preferredPath))

        getVideoStorageRoots(baseFolder).forEach(root => {
            candidates.push(path.join(root, fileName))
        })

        return Array.from(new Set(candidates.map(candidate => path.resolve(candidate))))
    }

    const getStoredMusicVideos = async () => {
        const result = await musicVideoStore.get('musicVideo')
        return Array.isArray(result) ? result : []
    }

    const parseUrlSafely = value => {
        try {
            return new URL(String(value || '').trim())
        } catch (_) {
            return null
        }
    }

    const isHttpUrl = urlObj => !!(urlObj && (urlObj.protocol === 'https:' || urlObj.protocol === 'http:'))

    const isTrustedShellUrl = urlObj => !!(urlObj && trustedShellProtocols.has(urlObj.protocol))

    const isTrustedExternalFetchUrl = urlObj => !!(urlObj && urlObj.protocol === 'https:' && trustedExternalFetchHosts.has(urlObj.hostname))

    const isTrustedBiliDownloadUrl = urlObj => {
        if (!urlObj || urlObj.protocol !== 'https:') return false
        if (urlObj.hostname === 'upos-sz-mirrorali.bilivideo.com') return true
        return trustedBiliDownloadHostSuffixes.some(suffix => urlObj.hostname.endsWith(suffix))
    }

    const isAllowedNcmApiUrl = urlObj => {
        if (!isHttpUrl(urlObj)) return false
        if (!allowedNcmApiHosts.has(urlObj.hostname)) return false
        return String(urlObj.port || '') === '36530'
    }

    const normalizeHttpMethod = value => {
        const method = String(value || 'get').trim().toLowerCase()
        return ['get', 'post'].includes(method) ? method : null
    }

    const normalizeTimeout = value => {
        const timeout = Number(value)
        if (!Number.isFinite(timeout) || timeout <= 0) return 10000
        return Math.min(Math.round(timeout), 2147483647)
    }

    const normalizeRequestHeaders = (headers, allowedHeaderNames = null) => {
        const result = {}
        if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return result

        Object.entries(headers).forEach(([name, value]) => {
            const normalizedName = String(name || '').trim()
            if (!normalizedName) return
            const normalizedNameLower = normalizedName.toLowerCase()
            if (disallowedForwardHeaders.has(normalizedNameLower)) return
            if (allowedHeaderNames && !allowedHeaderNames.has(normalizedNameLower)) return

            if (Array.isArray(value)) {
                const joinedValue = value.map(item => String(item)).join(', ').trim()
                if (joinedValue) result[normalizedName] = joinedValue
                return
            }

            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                result[normalizedName] = String(value)
            }
        })

        return result
    }

    const normalizePlainObject = value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
        return value
    }

    const normalizeResponseType = value => {
        const normalized = String(value || '').trim().toLowerCase()
        return normalized === 'text' ? 'text' : 'json'
    }

    const isSerializedFormData = value => {
        return !!(value && typeof value === 'object' && value.__hmType === 'form-data' && Array.isArray(value.entries))
    }

    const rebuildSerializedRequestData = async (value, headers) => {
        if (!isSerializedFormData(value)) return value
        if (typeof FormData === 'undefined') {
            throw new Error('form-data-unavailable')
        }

        const formData = new FormData()
        for (const entry of value.entries) {
            const fieldName = typeof entry?.name === 'string' ? entry.name : ''
            if (!fieldName) continue

            if (entry?.kind === 'blob') {
                const blobValue = entry.value
                if (blobValue instanceof Blob) {
                    if (entry.filename) formData.append(fieldName, blobValue, entry.filename)
                    else formData.append(fieldName, blobValue)
                }
                continue
            }

            formData.append(fieldName, String(entry?.value ?? ''))
        }

        if (headers && typeof headers === 'object') {
            Object.keys(headers).forEach((headerName) => {
                if (String(headerName).toLowerCase() === 'content-type') {
                    delete headers[headerName]
                }
            })
        }

        return formData
    }

    const parseCookieString = cookieString => {
        const cookieMap = new Map()
        const cookieText = String(cookieString || '').trim()
        if (!cookieText) return cookieMap

        cookieText.split(';').forEach(segment => {
            const cookiePart = String(segment || '').trim()
            if (!cookiePart) return

            const separatorIndex = cookiePart.indexOf('=')
            if (separatorIndex <= 0) return

            const name = cookiePart.slice(0, separatorIndex).trim()
            const value = cookiePart.slice(separatorIndex + 1).trim()
            if (!name || !value) return
            cookieMap.set(name, value)
        })

        return cookieMap
    }

    const mergeCookieStrings = (...cookieStrings) => {
        const mergedCookieMap = new Map()

        cookieStrings.forEach(cookieString => {
            parseCookieString(cookieString).forEach((value, key) => {
                mergedCookieMap.set(key, value)
            })
        })

        if (mergedCookieMap.size === 0) return ''
        return Array.from(mergedCookieMap.entries()).map(([key, value]) => `${key}=${value}`).join('; ')
    }

    const getBrowserSession = () => {
        try {
            return win?.webContents?.session || null
        } catch (_) {
            return null
        }
    }

    const getNcmApiSessionCookieString = async () => {
        const browserSession = getBrowserSession()
        if (!browserSession?.cookies) return ''

        const cookieMap = new Map()
        for (const url of ncmApiCookieUrls) {
            try {
                const cookies = await browserSession.cookies.get({ url })
                cookies.forEach(({ name, value }) => {
                    if (!name || value === undefined || value === null) return
                    cookieMap.set(name, value)
                })
            } catch (_) {}
        }

        if (cookieMap.size === 0) return ''
        return Array.from(cookieMap.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
    }

    const parseSetCookieHeader = rawCookie => {
        const cookieText = String(rawCookie || '').trim()
        if (!cookieText) return null

        const segments = cookieText.split(';').map(segment => segment.trim()).filter(Boolean)
        if (segments.length === 0) return null

        const separatorIndex = segments[0].indexOf('=')
        if (separatorIndex <= 0) return null

        const parsedCookie = {
            name: segments[0].slice(0, separatorIndex).trim(),
            value: segments[0].slice(separatorIndex + 1),
            path: '/',
            domain: undefined,
            secure: false,
            httpOnly: false,
            sameSite: undefined,
            expirationDate: undefined,
            shouldRemove: false,
        }

        if (!parsedCookie.name) return null

        segments.slice(1).forEach(segment => {
            const attrIndex = segment.indexOf('=')
            const rawKey = attrIndex === -1 ? segment : segment.slice(0, attrIndex)
            const rawValue = attrIndex === -1 ? '' : segment.slice(attrIndex + 1)
            const key = rawKey.trim().toLowerCase()
            const value = rawValue.trim()

            if (key === 'path' && value) {
                parsedCookie.path = value
                return
            }
            if (key === 'domain' && value) {
                parsedCookie.domain = value
                return
            }
            if (key === 'secure') {
                parsedCookie.secure = true
                return
            }
            if (key === 'httponly') {
                parsedCookie.httpOnly = true
                return
            }
            if (key === 'samesite') {
                if (/^strict$/i.test(value)) parsedCookie.sameSite = 'strict'
                else if (/^lax$/i.test(value)) parsedCookie.sameSite = 'lax'
                else if (/^none$/i.test(value) && parsedCookie.secure) parsedCookie.sameSite = 'no_restriction'
                return
            }
            if (key === 'max-age') {
                const maxAge = Number.parseInt(value, 10)
                if (!Number.isFinite(maxAge)) return
                if (maxAge <= 0) {
                    parsedCookie.shouldRemove = true
                    return
                }
                parsedCookie.expirationDate = Math.floor(Date.now() / 1000) + maxAge
                return
            }
            if (key === 'expires') {
                const expiresAt = Date.parse(value)
                if (!Number.isFinite(expiresAt)) return
                if (expiresAt <= Date.now()) {
                    parsedCookie.shouldRemove = true
                    return
                }
                parsedCookie.expirationDate = Math.floor(expiresAt / 1000)
            }
        })

        return parsedCookie
    }

    const syncNcmApiResponseCookies = async (urlObj, headers = {}) => {
        const browserSession = getBrowserSession()
        if (!browserSession?.cookies || !urlObj) return

        const rawSetCookie = headers['set-cookie'] || headers['Set-Cookie']
        const cookieList = Array.isArray(rawSetCookie)
            ? rawSetCookie
            : rawSetCookie
                ? [rawSetCookie]
                : []

        for (const rawCookie of cookieList) {
            const parsedCookie = parseSetCookieHeader(rawCookie)
            if (!parsedCookie) continue

            try {
                if (parsedCookie.shouldRemove) {
                    await browserSession.cookies.remove(urlObj.toString(), parsedCookie.name)
                    continue
                }

                const cookieDetails = {
                    url: urlObj.toString(),
                    name: parsedCookie.name,
                    value: parsedCookie.value,
                    path: parsedCookie.path || '/',
                    secure: !!parsedCookie.secure,
                    httpOnly: !!parsedCookie.httpOnly,
                }
                if (parsedCookie.domain) cookieDetails.domain = parsedCookie.domain
                if (parsedCookie.sameSite) cookieDetails.sameSite = parsedCookie.sameSite
                if (Number.isFinite(parsedCookie.expirationDate)) cookieDetails.expirationDate = parsedCookie.expirationDate
                await browserSession.cookies.set(cookieDetails)
            } catch (_) {}
        }
    }

    const isPathInsideDirectory = (directoryPath, targetPath) => {
        if (!directoryPath || !targetPath) return false
        const basePath = path.resolve(directoryPath)
        const resolvedTargetPath = path.resolve(targetPath)
        const relativePath = path.relative(basePath, resolvedTargetPath)
        return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
    }

    const sanitizePathToken = (value, fallback = 'unknown') => {
        const normalized = String(value ?? '')
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80)
        if (!normalized || normalized === '.' || normalized === '..') return fallback
        return normalized
    }

    const getCurrentVideoStorageRoots = () => {
        const settings = settingsStore.get('settings')
        return getVideoStorageRoots(settings?.local?.videoFolder)
    }

    const normalizeStoredVideoPath = (targetPath, options = {}) => {
        const { allowExistingFileOutsideRoots = false } = options
        if (typeof targetPath !== 'string' || !targetPath.trim()) return ''

        const videoStorageRoots = getCurrentVideoStorageRoots()
        const resolvedTargetPath = path.resolve(targetPath)
        const isInsideCurrentVideoRoot = videoStorageRoots.some(root => isPathInsideDirectory(root, resolvedTargetPath))
        if (!isInsideCurrentVideoRoot && !allowExistingFileOutsideRoots) return ''

        try {
            const stat = fs.statSync(resolvedTargetPath)
            if (stat.isFile()) return resolvedTargetPath
        } catch (_) {}

        return ''
    }
    const getConfiguredMediaRoots = () => {
        const settings = settingsStore.get('settings') || {}
        const roots = []

        if (settings?.local?.downloadFolder) roots.push(settings.local.downloadFolder)
        if (Array.isArray(settings?.local?.localFolder)) roots.push(...settings.local.localFolder)
        roots.push(...getVideoStorageRoots(settings?.local?.videoFolder))

        return roots
            .filter(root => typeof root === 'string' && root.trim())
            .map(root => path.resolve(root))
    }
    const normalizeAllowedMediaPath = (targetPath, options = {}) => {
        const { allowDirectory = false } = options
        if (typeof targetPath !== 'string' || !targetPath.trim()) return ''

        const resolvedTargetPath = path.resolve(targetPath)
        const mediaRoots = getConfiguredMediaRoots()
        if (mediaRoots.length === 0) return ''
        if (!mediaRoots.some(root => isPathInsideDirectory(root, resolvedTargetPath))) return ''

        try {
            const stat = fs.statSync(resolvedTargetPath)
            if (stat.isFile()) return resolvedTargetPath
            if (allowDirectory && stat.isDirectory()) return resolvedTargetPath
        } catch (_) {}

        return ''
    }
    const getTrustedResourceHeaderAllowList = urlObj => {
        if (!urlObj) return trustedResourceHeaderNames
        if (urlObj.hostname === 'passport.bilibili.com' || urlObj.hostname === 'api.bilibili.com') {
            return trustedBiliResourceHeaderNames
        }
        return trustedResourceHeaderNames
    }
    // win.on('restore', () => {
    // win.webContents.send('lyric-control')
    // })
    ipcMain.on('window-min', () => {
        win.minimize()
    })
    const sendWindowMaximizedState = () => {
        if (win.isDestroyed() || win.webContents.isDestroyed()) return
        win.webContents.send('window-maximized-changed', win.isMaximized())
    }

    ipcMain.removeHandler('window-is-maximized')
    ipcMain.handle('window-is-maximized', () => win.isMaximized())

    ipcMain.on('window-max', () => {
        if (win.isMaximized()) {
            win.unmaximize()
        } else {
            win.maximize()
        }
    })

    win.on('maximize', () => {
        sendWindowMaximizedState()
    })

    win.on('unmaximize', () => {
        sendWindowMaximizedState()
    })

    win.on('restore', () => {
        sendWindowMaximizedState()
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
        const parsedUrl = parseUrlSafely(url)
        if (!isTrustedShellUrl(parsedUrl)) return
        shell.openExternal(parsedUrl.toString())
    })
    ipcMain.on('download-start', () => {
        win.webContents.send('download-next')
    })
    ipcMain.handle('get-image-base64', async (e, filePath) => {
        const normalizedFilePath = normalizeAllowedMediaPath(filePath)
        if (!normalizedFilePath) return null

        try {
            // 显式禁用跳过封面，避免新版库默认不读取封面
            const data = await parseFile(normalizedFilePath, { skipCovers: false }).catch(() => null)
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
            const parsed = path.parse(normalizedFilePath)
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
        try {
            const { canceled, filePaths } = await dialog.showOpenDialog(win, {
                properties: ['openDirectory', 'createDirectory', 'promptToCreate']
            })
            if (canceled) return null
            return Array.isArray(filePaths) && filePaths[0] ? filePaths[0] : null
        } catch (error) {
            console.error('打开目录选择器失败:', error)
            return null
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
    ipcMain.on('open-local-folder', (e, targetPath) => {
        const normalizedTargetPath = normalizeAllowedMediaPath(targetPath, { allowDirectory: true })
        if (!normalizedTargetPath) return

        shell.showItemInFolder(normalizedTargetPath)
    })
    ipcMain.removeHandler('ncm-api-request')
    ipcMain.handle('ncm-api-request', async (e, request = {}) => {
        const parsedUrl = parseUrlSafely(request.url)
        const method = normalizeHttpMethod(request.method)
        if (!isAllowedNcmApiUrl(parsedUrl) || !method) {
            throw new Error('unsupported-ncm-api-request')
        }

        const normalizedParams = normalizePlainObject(request.params)
        const normalizedHeaders = normalizeRequestHeaders(request.headers)
        const sessionCookieString = await getNcmApiSessionCookieString()
        const mergedParamCookie = mergeCookieStrings(sessionCookieString, normalizedParams.cookie)
        if (mergedParamCookie) normalizedParams.cookie = mergedParamCookie

        const headerCookieSource = normalizedHeaders.Cookie || normalizedHeaders.cookie
        const mergedHeaderCookie = mergeCookieStrings(sessionCookieString, headerCookieSource)
        if (mergedHeaderCookie) normalizedHeaders.Cookie = mergedHeaderCookie
        delete normalizedHeaders.cookie
        const requestData = await rebuildSerializedRequestData(request.data, normalizedHeaders)

        const response = await axios({
            url: parsedUrl.toString(),
            method,
            params: normalizedParams,
            data: requestData,
            headers: normalizedHeaders,
            timeout: normalizeTimeout(request.timeout),
            responseType: normalizeResponseType(request.responseType),
            validateStatus: () => true,
        })

        await syncNcmApiResponseCookies(parsedUrl, response.headers || {})

        return {
            status: response.status,
            statusText: response.statusText || '',
            data: response.data,
            headers: response.headers || {},
        }
    })
    ipcMain.removeHandler('trusted-resource-request')
    ipcMain.handle('trusted-resource-request', async (e, request = {}) => {
        const parsedUrl = parseUrlSafely(request.url)
        const option = request?.option && typeof request.option === 'object' ? request.option : request
        const method = normalizeHttpMethod(option?.method || request.method)
        if (!isTrustedExternalFetchUrl(parsedUrl) || method !== 'get') {
            throw new Error('unsupported-trusted-resource-request')
        }

        const response = await axios({
            url: parsedUrl.toString(),
            method: 'get',
            params: normalizePlainObject(option.params),
            headers: normalizeRequestHeaders(option.headers, getTrustedResourceHeaderAllowList(parsedUrl)),
            timeout: normalizeTimeout(option.timeout),
            responseType: normalizeResponseType(option.responseType),
        })

        return response.data
    })
    async function searchMusicVideo(id) {
        const result = await getStoredMusicVideos()
        const index = result.findIndex((music) => music.id == id)
        if (index != -1) {
            return { data: result[index], index: index }
        }
        return false
    }
    async function saveMusicVideo(data) {
        const normalizedPath = normalizeStoredVideoPath(data?.path)
        if (!normalizedPath) return
        const musicVideo = await getStoredMusicVideos()
        const result = await searchMusicVideo(data.id)
        if (result) musicVideo.splice(result.index, 1)
        musicVideo.push({ ...data, path: normalizedPath })
        musicVideoStore.set('musicVideo', musicVideo)
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
        const preferredVideoPath = getPreferredVideoSavePath(settings?.local?.videoFolder, request?.option?.params)
        if (!preferredVideoPath) return 'noSavePath'
        const parsedDownloadUrl = parseUrlSafely(request?.url)
        if (!isTrustedBiliDownloadUrl(parsedDownloadUrl)) return 'failed'

        try {
            fs.mkdirSync(path.dirname(preferredVideoPath), { recursive: true })
        } catch (error) {
            console.warn('创建视频缓存目录失败:', error)
            return 'failed'
        }

        const candidateVideoPaths = getVideoCacheCandidatePaths(settings?.local?.videoFolder, request?.option?.params)
        const videoPath = preferredVideoPath
        let finalVideoPath = videoPath
        let returnCode = 'success'
        let transcodeProc = null
        let requestCancel = null
        let writer = null
        let tmpOut = null
        let settled = false
        let cancelListener = null

        const cleanupMusicVideoTask = abortFn => {
            clearMusicVideoCancelListener(cancelListener)
            clearActiveMusicVideoAbort(abortFn)
            try { win.setProgressBar(-1) } catch (_) {}
        }

        const resolveOnce = (resolve, abortFn, value) => {
            if (settled) return
            settled = true
            cleanupMusicVideoTask(abortFn)
            resolve(value)
        }

        const rejectOnce = (reject, abortFn, value) => {
            if (settled) return
            settled = true
            cleanupMusicVideoTask(abortFn)
            reject(value)
        }

        const existingVideoPath = await (async () => {
            for (const candidatePath of candidateVideoPaths) {
                if (await fileIsExists(candidatePath)) return candidatePath
            }
            return ''
        })()
        if (existingVideoPath) {
            try {
                request.option.params.timing = JSON.parse(request.option.params.timing)
            } catch (_) {
                request.option.params.timing = null
            }
            finalVideoPath = existingVideoPath
            request.option.params.path = finalVideoPath
            saveMusicVideo(request.option.params)
            return returnCode
        } else {
            if (typeof activeMusicVideoAbort === 'function') {
                try { activeMusicVideoAbort('replaced-by-new-download') } catch (_) {}
            }
            const result = await axios({
                url: parsedDownloadUrl.toString(),
                method: 'get',
                headers: normalizeRequestHeaders(request?.option?.headers, trustedBiliResourceHeaderNames),
                responseType: 'stream',
                onDownloadProgress: (progressEvent) => {
                    let progress = progressEvent.total ? Math.round(progressEvent.loaded / progressEvent.total * 100) : 0
                    win.webContents.send('download-video-progress', progress)
                    if (returnCode == 'cancel') win.setProgressBar(-1)
                    else win.setProgressBar(progress / 100)
                },
                cancelToken: new CancelToken(function executor(c) {
                    requestCancel = c
                })
            })

            const abortCurrentDownload = (reason = 'user-cancelled') => {
                if (returnCode == 'cancel') return
                returnCode = 'cancel'
                try { requestCancel && requestCancel(reason) } catch (_) {}
                try { transcodeProc && transcodeProc.kill('SIGKILL') } catch (_) {}
                try { writer && !writer.destroyed && writer.destroy(new Error(reason)) } catch (_) {}
            }

            writer = fs.createWriteStream(videoPath)
            cancelListener = () => {
                abortCurrentDownload()
            }
            activeMusicVideoAbort = abortCurrentDownload
            setMusicVideoCancelListener(cancelListener)
            result.data.pipe(writer)
            return new Promise((resolve, reject) => {
                writer.once("finish", async () => {
                    if (returnCode == 'cancel') {
                        removeFileIfExists(videoPath)
                        resolveOnce(resolve, abortCurrentDownload, returnCode)
                        return
                    }

                    // 下载完成后，如编码为 HEVC，尝试自动转码为 H.264 提高兼容性
                    const codec = (request && request.option && request.option.params && request.option.params.codec) ? String(request.option.params.codec).toLowerCase() : ''
                    const isHevc = /hev1|hvc1|hevc/.test(codec)

                    const finalizeSave = () => {
                        try {
                            request.option.params.timing = JSON.parse(request.option.params.timing)
                        } catch (_) {
                            request.option.params.timing = null
                        }
                        request.option.params.path = finalVideoPath
                        saveMusicVideo(request.option.params)
                        resolveOnce(resolve, abortCurrentDownload, 'success')
                    }

                    if (isHevc && ffmpegPath) {
                        try {
                            tmpOut = videoPath.replace(/\.mp4$/i, '_avc.mp4')
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

                            transcodeProc.on('error', (err) => {
                                if (returnCode == 'cancel') {
                                    removeFileIfExists(videoPath)
                                    removeFileIfExists(tmpOut)
                                    resolveOnce(resolve, abortCurrentDownload, 'cancel')
                                    return
                                }
                                console.warn('转码进程启动失败，保留原始文件:', err && err.message ? err.message : err)
                                finalizeSave()
                            })
                            transcodeProc.on('exit', (code) => {
                                if (returnCode == 'cancel') {
                                    removeFileIfExists(videoPath)
                                    removeFileIfExists(tmpOut)
                                    resolveOnce(resolve, abortCurrentDownload, 'cancel')
                                    return
                                }
                                if (code === 0) {
                                    try {
                                        fs.unlinkSync(videoPath)
                                    } catch (_) {}
                                    try {
                                        fs.renameSync(tmpOut, videoPath)
                                    } catch (e) {
                                        console.warn('替换转码结果失败，使用转码文件路径:', e && e.message ? e.message : e)
                                        finalVideoPath = tmpOut
                                    }
                                } else {
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
                        finalizeSave()
                    }
                })
                writer.once("error", () => {
                    if (returnCode == 'cancel') {
                        removeFileIfExists(videoPath)
                        removeFileIfExists(tmpOut)
                        resolveOnce(resolve, abortCurrentDownload, 'cancel')
                        return
                    }
                    rejectOnce(reject, abortCurrentDownload, 'failed')
                })
                result.data.once('error', () => {
                    if (returnCode == 'cancel') {
                        removeFileIfExists(videoPath)
                        removeFileIfExists(tmpOut)
                        resolveOnce(resolve, abortCurrentDownload, 'cancel')
                        return
                    }
                    rejectOnce(reject, abortCurrentDownload, 'failed')
                })
            })
        }
    })
    ipcMain.handle('music-video-isexists', async (e, obj) => {
        console.log('检查视频是否存在 - 歌曲ID:', obj.id, '方法:', obj.method)
        const result = await searchMusicVideo(obj.id)
        console.log('searchMusicVideo 结果:', result)

        if (result) {
            const normalizedPath = normalizeStoredVideoPath(result.data?.path, { allowExistingFileOutsideRoots: true })
            if (!normalizedPath) return false
            result.data.path = normalizedPath
            if (obj.method == 'get') return result
            const file = await fileIsExists(normalizedPath)
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
        const folderPaths = getVideoStorageRoots(settings?.local?.videoFolder)
        if (folderPaths.length === 0) return 'noSavePath'
        const musicVideo = await getStoredMusicVideos()
        const trackedPaths = new Set(
            musicVideo
                .map(video => normalizeStoredVideoPath(video?.path))
                .filter(Boolean)
                .map(targetPath => path.normalize(targetPath))
        )
        folderPaths.forEach(folderPath => {
            if (!fs.existsSync(folderPath)) return
            const files = fs.readdirSync(folderPath, { withFileTypes: true })
            files.forEach(entry => {
                if (!entry.isFile()) return
                const filePath = path.join(folderPath, entry.name)
                if (!trackedPaths.has(path.normalize(filePath))) {
                    removeFileIfExists(filePath)
                }
            })
        })
        return true
    })
    ipcMain.handle('delete-music-video', async (e, id) => {
        const musicVideo = await getStoredMusicVideos()
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
        const normalizedFilePath = normalizeAllowedMediaPath(filePath)
        if (!normalizedFilePath) return null
        return loadLocalLyricPayload(normalizedFilePath)
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
