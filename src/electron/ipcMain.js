const { ipcMain, shell, dialog, globalShortcut, Menu, clipboard } = require('electron')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { parseFile, parseBuffer } = require('music-metadata')
const { spawn } = require('child_process')
const { loadLocalLyricPayload } = require('./localLyrics')
const { registerSettingsIpc } = require('./ipc/settingsIpc')
const { registerCustomSourceIpc } = require('./customSource')
const { listSystemFonts } = require('./systemFonts')
const {
    getBufferLength,
    getImageMime,
    getImageMimeByPath,
    isHttpUrl,
    isPathInsideDirectory,
    mergeCookieStrings,
    normalizeHttpMethod,
    normalizePlainObject,
    normalizeResponseType,
    normalizeTimeout,
    parseCookieString,
    parseUrlSafely,
    sanitizePathToken,
} = require('./ipcHelpers')
let ncmCrypto = null
try {
    ncmCrypto = require('@neteasecloudmusicapienhanced/api/util/crypto.js')
} catch (_) {
    ncmCrypto = null
}
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

const moduleState = {
    initialized: false,
    win: null,
    app: null,
    lyricFunctions: {},
    removeWindowStateListeners: null,
}

function createDynamicProxy(getTarget) {
    return new Proxy({}, {
        get(_target, property) {
            const currentTarget = getTarget()
            const value = currentTarget?.[property]
            return typeof value === 'function' ? value.bind(currentTarget) : value
        },
        set(_target, property, value) {
            const currentTarget = getTarget()
            if (!currentTarget) return true
            currentTarget[property] = value
            return true
        },
        has(_target, property) {
            const currentTarget = getTarget()
            return currentTarget ? property in currentTarget : false
        },
    })
}

function getActiveWindow() {
    return moduleState.win
}

function sendWindowMaximizedState() {
    const win = getActiveWindow()
    if (!win || win.isDestroyed?.()) return
    if (!win.webContents || win.webContents.isDestroyed?.()) return
    win.webContents.send('window-maximized-changed', win.isMaximized())
}

function attachWindowStateListeners(win) {
    moduleState.removeWindowStateListeners?.()

    if (!win || win.isDestroyed?.()) {
        moduleState.removeWindowStateListeners = null
        return
    }

    const onWindowStateChange = () => {
        sendWindowMaximizedState()
    }

    win.on('maximize', onWindowStateChange)
    win.on('unmaximize', onWindowStateChange)
    win.on('restore', onWindowStateChange)

    moduleState.removeWindowStateListeners = () => {
        try { win.removeListener('maximize', onWindowStateChange) } catch (_) {}
        try { win.removeListener('unmaximize', onWindowStateChange) } catch (_) {}
        try { win.removeListener('restore', onWindowStateChange) } catch (_) {}
    }
}

async function showOpenDirectoryDialog() {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled) return null
    return filePaths[0]
}

module.exports = IpcMainEvent = (win, app, lyricFunctions = {}) => {
    moduleState.win = win
    moduleState.app = app
    moduleState.lyricFunctions = lyricFunctions
    attachWindowStateListeners(win)

    if (moduleState.initialized) {
        return {
            setWindow(nextWin) {
                moduleState.win = nextWin
                attachWindowStateListeners(nextWin)
            },
            setApp(nextApp) {
                moduleState.app = nextApp
            },
            setLyricFunctions(nextLyricFunctions = {}) {
                moduleState.lyricFunctions = nextLyricFunctions
            },
        }
    }

    moduleState.initialized = true
    win = createDynamicProxy(() => moduleState.win)
    app = createDynamicProxy(() => moduleState.app)
    lyricFunctions = createDynamicProxy(() => moduleState.lyricFunctions)

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
    const transientNetworkErrorCodes = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND'])
    const timeoutNetworkErrorCodes = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'])
    const ncmApiRetryDelays = Object.freeze([300, 900])
    const trustedResourceRetryDelays = Object.freeze([500])
    const trustedResourceErrorMarker = '__hydrogenMusicTrustedResourceError'
    const ncmClientLogEndpoint = 'https://clientlogusf.music.163.com/weapi/feedback/weblog'
    const ncmOfficialReferer = 'https://music.163.com/'
    const ncmWebUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0'
    const allowedNcmClientLogActions = new Set(['startplay', 'play'])

    // 全局存储桌面歌词窗口引用
    let globalLyricWindow = null;
    let activeMusicVideoAbort = null
    let activeMusicVideoCancelListener = null

    const parseStoredPlaylistPayload = playlist => {
        if (playlist && typeof playlist === 'object') return playlist
        if (typeof playlist !== 'string') return null
        try {
            return JSON.parse(playlist)
        } catch (_) {
            return null
        }
    }

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
        return path.resolve(normalizedBaseFolder, 'HydrogenMusicVideoCache')
    }

    const getLegacyVideoFolder = baseFolder => {
        const normalizedBaseFolder = typeof baseFolder === 'string' ? baseFolder.trim() : ''
        if (!normalizedBaseFolder) return ''
        return path.resolve(normalizedBaseFolder)
    }

    const getVideoStorageRoots = baseFolder => {
        // 读取时兼容历史版本直接写在用户目录根下的视频缓存，但新写入/清理只使用受管子目录。
        const roots = []
        const managedVideoFolder = getManagedVideoFolder(baseFolder)
        const legacyVideoFolder = getLegacyVideoFolder(baseFolder)

        if (managedVideoFolder) roots.push(path.resolve(managedVideoFolder))
        if (legacyVideoFolder) roots.push(legacyVideoFolder)

        return Array.from(new Set(roots))
    }

    const getVideoCleanupRoots = baseFolder => {
        const managedVideoFolder = getManagedVideoFolder(baseFolder)
        if (!managedVideoFolder) return []
        return [path.resolve(managedVideoFolder)]
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
        const managedVideoFolder = getManagedVideoFolder(baseFolder)
        if (!managedVideoFolder) return ''
        return path.join(managedVideoFolder, getVideoCacheFileName(params))
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

    const isTrustedShellUrl = urlObj => !!(urlObj && trustedShellProtocols.has(urlObj.protocol))

    const isTrustedExternalFetchUrl = urlObj => !!(urlObj && urlObj.protocol === 'https:' && trustedExternalFetchHosts.has(urlObj.hostname))
    const isTrustedAudioFetchUrl = urlObj => {
        if (!isHttpUrl(urlObj)) return false
        const hostname = urlObj.hostname || ''
        if (trustedExternalFetchHosts.has(hostname)) return true
        return hostname === 'music.126.net'
            || hostname.endsWith('.music.126.net')
            || hostname === 'vod.126.net'
            || hostname.endsWith('.vod.126.net')
    }

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

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

    const getResponseBodyMessage = data => {
        if (typeof data === 'string') return data
        if (!data || typeof data !== 'object') return ''
        return String(data.msg || data.message || data.error || '')
    }

    const getAxiosErrorMessage = error => {
        return getResponseBodyMessage(error?.response?.data) || String(error?.message || '')
    }

    const isTransientNetworkMessage = message => {
        return /timeout|timed\s*out|etimedout|econnaborted|econnreset|eai_again|enotfound|getaddrinfo|socket hang up|network/i.test(String(message || ''))
    }

    const isRetryableAxiosError = error => {
        if (!error) return false
        if (transientNetworkErrorCodes.has(error.code)) return true
        const status = Number(error?.response?.status)
        if (status === 408 || status === 429 || status >= 500) return true
        return isTransientNetworkMessage(getAxiosErrorMessage(error))
    }

    const isRetryableHttpResponse = response => {
        const status = Number(response?.status)
        if (status === 408 || status === 429 || status >= 500) return true
        return false
    }

    const requestWithTransientRetry = async (axiosConfig, retryDelays = []) => {
        let lastError = null
        let lastResponse = null

        for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
            try {
                const response = await axios(axiosConfig)
                if (attempt < retryDelays.length && isRetryableHttpResponse(response)) {
                    lastResponse = response
                    await delay(retryDelays[attempt])
                    continue
                }
                return response
            } catch (error) {
                lastError = error
                if (attempt >= retryDelays.length || !isRetryableAxiosError(error)) throw error
                await delay(retryDelays[attempt])
            }
        }

        if (lastResponse) return lastResponse
        throw lastError || new Error('request-failed')
    }

    const buildNcmApiErrorResponse = error => {
        const statusFromResponse = Number(error?.response?.status)
        if (statusFromResponse) {
            return {
                status: statusFromResponse,
                statusText: error?.response?.statusText || '',
                data: error?.response?.data || { code: statusFromResponse, msg: getAxiosErrorMessage(error) || 'ncm-api-request-failed' },
                headers: error?.response?.headers || {},
            }
        }

        const message = getAxiosErrorMessage(error) || 'ncm-api-request-failed'
        const isTimeout = timeoutNetworkErrorCodes.has(error?.code) || /timeout|timed\s*out|etimedout|econnaborted/i.test(message)
        const status = isTimeout ? 504 : 502

        return {
            status,
            statusText: isTimeout ? 'Gateway Timeout' : 'Bad Gateway',
            data: {
                code: status,
                msg: message,
                ...(error?.code ? { errorCode: error.code } : {}),
            },
            headers: {},
        }
    }

    const buildTrustedResourceError = (error, url) => {
        const status = error?.response?.status
        const statusText = error?.response?.statusText
        const code = error?.code
        const messageParts = ['trusted-resource-request-failed']

        if (status) messageParts.push(`status=${status}`)
        if (statusText) messageParts.push(`statusText=${statusText}`)
        if (code) messageParts.push(`code=${code}`)
        if (url) messageParts.push(`url=${url}`)

        return new Error(messageParts.join(' '))
    }

    const buildTrustedResourceErrorPayload = (error, url) => {
        const status = error?.response?.status
        const statusText = error?.response?.statusText
        const code = error?.code
        const message = buildTrustedResourceError(error, url).message

        return {
            [trustedResourceErrorMarker]: true,
            message,
            ...(status ? { status } : {}),
            ...(statusText ? { statusText } : {}),
            ...(code ? { code } : {}),
        }
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

    const normalizeNcmClientLogs = logs => {
        if (!Array.isArray(logs)) return []

        return logs.slice(0, 8).map(log => {
            const action = typeof log?.action === 'string' ? log.action.trim() : ''
            const json = log?.json && typeof log.json === 'object' && !Array.isArray(log.json) ? log.json : null
            if (!allowedNcmClientLogActions.has(action) || !json) return null
            return { action, json }
        }).filter(Boolean)
    }

    const buildNcmClientLogPayload = (logs, csrfToken = '') => {
        if (!ncmCrypto || typeof ncmCrypto.weapi !== 'function') {
            throw new Error('ncm-weapi-encrypt-unavailable')
        }

        return ncmCrypto.weapi({
            logs: JSON.stringify(logs),
            csrf_token: csrfToken || '',
        })
    }

    const buildNcmClientLogUrl = csrfToken => {
        const suffix = csrfToken ? `?csrf_token=${encodeURIComponent(csrfToken)}` : ''
        return `${ncmClientLogEndpoint}${suffix}`
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

    ipcMain.removeHandler('window-is-maximized')
    ipcMain.handle('window-is-maximized', () => win?.isMaximized?.() || false)

    ipcMain.on('window-max', () => {
        if (win.isMaximized()) {
            win.unmaximize()
        } else {
            win.maximize()
        }
    })
    ipcMain.on('window-close', async () => {
        const settings = await settingsStore.get('settings')
        const quitAppPreference = settings?.other?.quitApp === 'quit' ? 'quit' : 'minimize'
        if (quitAppPreference == 'minimize') {
            win.hide()
        } else if (quitAppPreference == 'quit') {
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

    const getPictureScore = pic => {
        if (!pic || !pic.data) return -1
        const type = `${pic.type || ''} ${pic.description || ''}`.toLowerCase()
        const isFrontCover = type.includes('front') || type.includes('cover')
        return getBufferLength(pic.data) + (isFrontCover ? 2 * 1024 * 1024 : 0)
    }
    const getBestPictureDataUrl = metadata => {
        const picArr = metadata && metadata.common && Array.isArray(metadata.common.picture) ? metadata.common.picture : null
        const pic = picArr && picArr.length > 0
            ? picArr.slice().sort((a, b) => getPictureScore(b) - getPictureScore(a))[0]
            : null
        if (!pic || !pic.data) return null

        const mime = getImageMime(pic.format, pic.data)
        return `data:${mime};base64,${Buffer.from(pic.data).toString('base64')}`
    }

    ipcMain.handle('get-image-base64', async (e, filePath) => {
        const normalizedFilePath = normalizeAllowedMediaPath(filePath)
        if (!normalizedFilePath) return null

        try {
            // 显式禁用跳过封面，避免新版库默认不读取封面
            const data = await parseFile(normalizedFilePath, { skipCovers: false }).catch(() => null)
            const embeddedCover = getBestPictureDataUrl(data)
            if (embeddedCover) return embeddedCover

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
            let sidecarCover = null
            for (const p of candidates) {
                try {
                    if (fs.existsSync(p)) {
                        const stat = fs.statSync(p)
                        if (stat.isFile() && (!sidecarCover || stat.size > sidecarCover.size)) {
                            sidecarCover = { path: p, size: stat.size }
                        }
                    }
                } catch (_) { /* ignore */ }
            }
            if (sidecarCover) {
                const b64 = fs.readFileSync(sidecarCover.path).toString('base64')
                return `data:${getImageMimeByPath(sidecarCover.path)};base64,${b64}`
            }
        } catch (e) {
            // ignore
        }
        return null
    })

    ipcMain.handle('get-audio-cover-base64-buffer', async (e, fileBuffer, mimeType) => {
        try {
            if (!fileBuffer) return null
            const buffer = Buffer.isBuffer(fileBuffer)
                ? fileBuffer
                : Buffer.from(fileBuffer)
            if (!buffer.length) return null

            const data = await parseBuffer(buffer, mimeType || undefined, { skipCovers: false }).catch(() => null)
            return getBestPictureDataUrl(data)
        } catch (_) {
            return null
        }
    })
    registerSettingsIpc({ ipcMain, settingsStore, win, registerShortcuts })
    registerCustomSourceIpc({ ipcMain })
    ipcMain.handle('system-fonts:list', () => listSystemFonts())
    const handleOpenDirectoryDialog = async () => {
        try {
            return await showOpenDirectoryDialog()
        } catch (error) {
            console.error('打开目录选择器失败:', error)
            return null
        }
    }
    ipcMain.handle('dialog:openDirectory', handleOpenDirectoryDialog)
    ipcMain.handle('dialog:openFile', handleOpenDirectoryDialog)
    ipcMain.on('register-shortcuts', () => {
        registerShortcuts(win, app)
    })
    ipcMain.on('unregister-shortcuts', () => {
        Menu.setApplicationMenu(null)
        globalShortcut.unregisterAll()
    })
    ipcMain.on('save-last-playlist', (e, playlist) => {
        const parsedPlaylist = parseStoredPlaylistPayload(playlist)
        if (parsedPlaylist) lastPlaylistStore.set('playlist', parsedPlaylist)
    })
    ipcMain.on('exit-app', (e, playlist) => {
        const parsedPlaylist = parseStoredPlaylistPayload(playlist)
        if (parsedPlaylist) lastPlaylistStore.set('playlist', parsedPlaylist)
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

        try {
            const stat = fs.statSync(normalizedTargetPath)
            if (stat.isDirectory()) {
                shell.openPath(normalizedTargetPath)
                return
            }
        } catch (_) {}

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

        try {
            const response = await requestWithTransientRetry({
                url: parsedUrl.toString(),
                method,
                params: normalizedParams,
                data: requestData,
                headers: normalizedHeaders,
                timeout: normalizeTimeout(request.timeout),
                responseType: normalizeResponseType(request.responseType),
                validateStatus: () => true,
            }, method === 'get' ? ncmApiRetryDelays : [])

            await syncNcmApiResponseCookies(parsedUrl, response.headers || {})

            return {
                status: response.status,
                statusText: response.statusText || '',
                data: response.data,
                headers: response.headers || {},
            }
        } catch (error) {
            return buildNcmApiErrorResponse(error)
        }
    })
    ipcMain.removeHandler('ncm-client-log-submit')
    ipcMain.handle('ncm-client-log-submit', async (_event, request = {}) => {
        const logs = normalizeNcmClientLogs(request?.logs)
        if (logs.length === 0) {
            return {
                status: 400,
                statusText: 'Bad Request',
                data: { code: 400, msg: 'empty-ncm-client-log' },
                headers: {},
            }
        }

        const sessionCookieString = await getNcmApiSessionCookieString()
        const requestCookieString = typeof request?.cookie === 'string' ? request.cookie : ''
        const cookieString = mergeCookieStrings(sessionCookieString, requestCookieString)
        const cookieMap = parseCookieString(cookieString)
        if (!cookieString || !cookieMap.has('MUSIC_U')) {
            return {
                status: 401,
                statusText: 'Unauthorized',
                data: { code: 401, msg: 'ncm-login-cookie-required' },
                headers: {},
            }
        }

        const csrfToken = cookieMap.get('__csrf') || ''
        const timeout = normalizeTimeout(request?.timeout || 8000)

        try {
            const encryptedPayload = buildNcmClientLogPayload(logs, csrfToken)
            const response = await requestWithTransientRetry({
                url: buildNcmClientLogUrl(csrfToken),
                method: 'post',
                data: new URLSearchParams(encryptedPayload).toString(),
                headers: {
                    Cookie: cookieString,
                    Origin: ncmOfficialReferer.replace(/\/$/, ''),
                    Referer: ncmOfficialReferer,
                    'User-Agent': ncmWebUserAgent,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                timeout,
                responseType: normalizeResponseType(request?.responseType),
                validateStatus: () => true,
            }, trustedResourceRetryDelays)

            return {
                status: response.status,
                statusText: response.statusText || '',
                data: response.data,
                headers: response.headers || {},
            }
        } catch (error) {
            return buildNcmApiErrorResponse(error)
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

        const requestUrl = parsedUrl.toString()

        try {
            const response = await requestWithTransientRetry({
                url: requestUrl,
                method: 'get',
                params: normalizePlainObject(option.params),
                headers: normalizeRequestHeaders(option.headers, getTrustedResourceHeaderAllowList(parsedUrl)),
                timeout: normalizeTimeout(option.timeout),
                responseType: normalizeResponseType(option.responseType),
                validateStatus: () => true,
            }, trustedResourceRetryDelays)

            if (response.status < 200 || response.status >= 300) {
                return buildTrustedResourceErrorPayload({ response }, requestUrl)
            }

            return response.data
        } catch (error) {
            return buildTrustedResourceErrorPayload(error, requestUrl)
        }
    })
    ipcMain.removeHandler('audio-buffer-request')
    ipcMain.handle('audio-buffer-request', async (e, request = {}) => {
        const parsedUrl = parseUrlSafely(request.url)
        const option = request?.option && typeof request.option === 'object' ? request.option : request
        if (!isTrustedAudioFetchUrl(parsedUrl)) {
            throw new Error('unsupported-audio-buffer-request')
        }

        const response = await requestWithTransientRetry({
            url: parsedUrl.toString(),
            method: 'get',
            params: normalizePlainObject(option.params),
            headers: normalizeRequestHeaders(option.headers, trustedResourceHeaderNames),
            timeout: normalizeTimeout(option.timeout || 45000),
            responseType: 'arraybuffer',
            validateStatus: () => true,
        }, trustedResourceRetryDelays)

        if (response.status < 200 || response.status >= 300) {
            throw buildTrustedResourceError({ response }, parsedUrl.toString())
        }

        return Buffer.from(response.data)
    })
    ipcMain.removeHandler('read-local-audio-buffer')
    ipcMain.handle('read-local-audio-buffer', async (e, filePath) => {
        const audioPath = normalizeAllowedMediaPath(filePath)
        if (!audioPath) throw new Error('unsupported-local-audio-buffer-request')
        return fs.promises.readFile(audioPath)
    })
    async function searchMusicVideo(id) {
        const result = await getStoredMusicVideos()
        const index = result.findIndex((music) => music.id == id)
        if (index != -1) {
            return { data: result[index], index: index }
        }
        return false
    }
    const inflightMusicVideoExistenceChecks = new Map()
    async function saveMusicVideo(data) {
        const normalizedPath = normalizeStoredVideoPath(data?.path)
        if (!normalizedPath) return
        const musicVideo = await getStoredMusicVideos()
        const result = await searchMusicVideo(data.id)
        if (result) musicVideo.splice(result.index, 1)
        musicVideo.push({ ...data, path: normalizedPath })
        musicVideoStore.set('musicVideo', musicVideo)
    }
    function parseMusicVideoTimingPayload(timing) {
        try {
            return JSON.parse(timing)
        } catch (_) {
            return null
        }
    }
    function saveMusicVideoRequestParams(params, videoPath) {
        if (!params || typeof params !== 'object') return
        params.timing = parseMusicVideoTimingPayload(params.timing)
        params.path = videoPath
        saveMusicVideo(params)
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
            finalVideoPath = existingVideoPath
            saveMusicVideoRequestParams(request?.option?.params, finalVideoPath)
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
                try { transcodeProc && transcodeProc.kill() } catch (_) {}
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
                        saveMusicVideoRequestParams(request?.option?.params, finalVideoPath)
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
        const lookupMethod = typeof obj?.method === 'string' ? obj.method : 'verify'
        const lookupId = obj?.id
        if (lookupId === null || lookupId === undefined || lookupId === '') return false

        const lookupKey = `${lookupMethod}:${lookupId}`
        if (inflightMusicVideoExistenceChecks.has(lookupKey)) {
            return inflightMusicVideoExistenceChecks.get(lookupKey)
        }

        const lookupTask = (async () => {
            const result = await searchMusicVideo(lookupId)

            if (!result) {
                return false
            }

            const normalizedPath = normalizeStoredVideoPath(result.data?.path, { allowExistingFileOutsideRoots: true })
            if (!normalizedPath) return false
            result.data.path = normalizedPath
            if (lookupMethod == 'get') return result
            const file = await fileIsExists(normalizedPath)
            if (!file) return '404'
            return result
        })().finally(() => {
            if (inflightMusicVideoExistenceChecks.get(lookupKey) === lookupTask) {
                inflightMusicVideoExistenceChecks.delete(lookupKey)
            }
        })

        inflightMusicVideoExistenceChecks.set(lookupKey, lookupTask)
        return lookupTask
    })
    ipcMain.handle('clear-unused-video', async (e) => {
        const settings = await settingsStore.get('settings')
        const folderPaths = getVideoCleanupRoots(settings?.local?.videoFolder)
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
    const isLyricWindowDestroyed = lyricWindow => {
        try {
            return !lyricWindow || lyricWindow.isDestroyed?.()
        } catch (_) {
            return true
        }
    }
    const getSafeLyricWindow = () => {
        let lyricWindow = globalLyricWindow
        if (isLyricWindowDestroyed(lyricWindow)) {
            globalLyricWindow = null
            try {
                lyricWindow = getLyricWindow && getLyricWindow()
            } catch (_) {
                lyricWindow = null
            }
        }
        if (isLyricWindowDestroyed(lyricWindow)) return null
        globalLyricWindow = lyricWindow
        return lyricWindow
    }
    const withLyricWindow = (operation, missingFallback = null, errorFallback = missingFallback) => {
        const lyricWindow = getSafeLyricWindow()
        if (!lyricWindow) return missingFallback
        try {
            return operation(lyricWindow)
        } catch (error) {
            return typeof errorFallback === 'function' ? errorFallback(error) : errorFallback
        }
    }
    const sendLyricWindowUpdate = data => {
        return withLyricWindow(lyricWindow => {
            if (!lyricWindow.webContents || lyricWindow.webContents.isDestroyed?.()) return false
            lyricWindow.webContents.send('lyric-update', data)
            return true
        }, false)
    }

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
        sendLyricWindowUpdate(data)
    })

    ipcMain.on('request-lyric-data', (event) => {
        win.webContents.send('get-current-lyric-data')
    })

    ipcMain.on('current-lyric-data', (event, data) => {
        sendLyricWindowUpdate(data)
    })

    ipcMain.handle('is-lyric-window-visible', () => {
        return withLyricWindow(lyricWindow => lyricWindow.isVisible(), false)
    });

    // 调整桌面歌词窗口大小
    ipcMain.handle('resize-lyric-window', (event, { width, height } = {}) => {
        return withLyricWindow(
            lyricWindow => {
                lyricWindow.setSize(width, height)
                return { success: true }
            },
            { success: false, error: '窗口不存在' },
            error => ({ success: false, error: error.message })
        )
    });

    // 获取桌面歌词窗口位置与尺寸
    ipcMain.handle('get-lyric-window-bounds', () => {
        return withLyricWindow(lyricWindow => lyricWindow.getBounds(), null)
    });

    // 移动桌面歌词窗口到指定坐标（基于屏幕坐标）
    ipcMain.on('move-lyric-window', (event, { x, y } = {}) => {
        if (typeof x !== 'number' || typeof y !== 'number') return
        withLyricWindow(lyricWindow => {
            lyricWindow.setPosition(Math.round(x), Math.round(y))
        })
    });

    // 按增量移动桌面歌词窗口（无需预先获取窗口位置）
    ipcMain.on('move-lyric-window-by', (event, { dx, dy } = {}) => {
        if (process.platform === 'darwin') return; // macOS 保持原生
        if (typeof dx !== 'number' || typeof dy !== 'number') return
        withLyricWindow(lyricWindow => {
            const { x, y } = lyricWindow.getBounds()
            lyricWindow.setPosition(Math.round(x + dx), Math.round(y + dy))
        })
    });

    // 将窗口移动到指定位置，并强制保持给定宽高
    ipcMain.on('move-lyric-window-to', (event, { x, y, width, height } = {}) => {
        if (process.platform === 'darwin') return; // macOS 保持原生
        if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') return
        withLyricWindow(lyricWindow => {
            lyricWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) })
        })
    });

    // 读取窗口最小/最大尺寸（Windows专用）
    ipcMain.handle('get-lyric-window-min-max', () => {
        if (process.platform === 'darwin') return null;
        return withLyricWindow(lyricWindow => {
            const [minWidth, minHeight] = lyricWindow.getMinimumSize()
            const [maxWidth, maxHeight] = lyricWindow.getMaximumSize()
            return { minWidth, minHeight, maxWidth, maxHeight }
        }, null)
    });

    // 设置窗口最小/最大尺寸（Windows专用）
    ipcMain.on('set-lyric-window-min-max', (event, { minWidth, minHeight, maxWidth, maxHeight } = {}) => {
        if (process.platform === 'darwin') return;
        withLyricWindow(lyricWindow => {
            if (typeof minWidth === 'number' && typeof minHeight === 'number') {
                lyricWindow.setMinimumSize(Math.max(0, Math.round(minWidth)), Math.max(0, Math.round(minHeight)))
            }
            if (typeof maxWidth === 'number' && typeof maxHeight === 'number') {
                lyricWindow.setMaximumSize(Math.max(0, Math.round(maxWidth)), Math.max(0, Math.round(maxHeight)))
            }
        })
    });

    // 设置窗口宽高比（Windows专用）
    ipcMain.on('set-lyric-window-aspect-ratio', (event, { aspectRatio } = {}) => {
        if (process.platform === 'darwin') return;
        withLyricWindow(lyricWindow => {
            const ratio = typeof aspectRatio === 'number' ? aspectRatio : 0
            lyricWindow.setAspectRatio(ratio > 0 ? ratio : 0)
        })
    });

    // 读取内容区域的bounds（Windows专用）
    ipcMain.handle('get-lyric-window-content-bounds', () => {
        if (process.platform === 'darwin') return null;
        return withLyricWindow(lyricWindow => lyricWindow.getContentBounds(), null)
    });

    // 设置内容区域的bounds（Windows专用）
    ipcMain.on('move-lyric-window-content-to', (event, { x, y, width, height } = {}) => {
        if (process.platform === 'darwin') return;
        if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') return
        withLyricWindow(lyricWindow => {
            lyricWindow.setContentBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) })
        })
    });

    // 设置桌面歌词窗口的可调整大小状态（用于拖拽期间临时禁用）
    ipcMain.on('set-lyric-window-resizable', (event, { resizable } = {}) => {
        if (process.platform !== 'win32') return; // 仅Windows需要
        withLyricWindow(lyricWindow => {
            lyricWindow.setResizable(!!resizable)
        })
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

    return {
        setWindow(nextWin) {
            moduleState.win = nextWin
            attachWindowStateListeners(nextWin)
        },
        setApp(nextApp) {
            moduleState.app = nextApp
        },
        setLyricFunctions(nextLyricFunctions = {}) {
            moduleState.lyricFunctions = nextLyricFunctions
        },
    }
}
