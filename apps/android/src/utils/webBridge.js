/**
 * Web 桥接层（移动端 / 浏览器运行支持）
 *
 * 渲染层原本完全依赖 preload 注入的四个全局对象：
 *   windowApi / electronAPI / playerApi / process
 * 在手机浏览器里这些都不存在，任何一处裸调用都会让整个应用白屏。
 *
 * 本模块在非 Electron 环境下注入一套安全的降级实现：
 *   - 数据类能力（设置读写、上次播放）用 localStorage 落地，功能可用
 *   - 订阅类能力返回可调用的取消函数，避免 `?.()` 报错
 *   - 桌面专属能力（本地文件、桌面歌词、HiFi 输出、自动更新）返回安全空值
 *   - 不注入 requestNcmApi，让 axios 自动回退到真实 HTTP 请求（同源 /api）
 *
 * 该模块通过副作用导入生效，必须早于任何组件求值。
 */
import { getDefaultSettings, normalizeSettings } from '../shared/settingsSchema'

const SETTINGS_KEY = 'hm:web:settings'
const LAST_PLAYLIST_KEY = 'hm:web:last-playlist'
const LAST_PROGRESS_KEY = 'hm:web:last-progress'

export const isDesktopApp = typeof window !== 'undefined'
    && !!window.windowApi
    && typeof window.windowApi.requestNcmApi === 'function'

const noop = () => { }
const unsubscribeStub = () => noop
const resolved = value => Promise.resolve(value)

/* ==================================================================
   音乐下载（Android 原生插件 MusicDownload）
   ------------------------------------------------------------------
   桌面端下载由 Electron 主进程完成（download.js）。安卓上这里把原生插件的
   Capacitor 事件，转成分发到前端已有的 downloadNext / downloadProgress /
   downloadError 订阅上，downloadManager.js 的队列逻辑无需改动。
   ================================================================== */
function nativeMusicDownload() {
    try {
        const plugins = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins
        const plugin = plugins && plugins.MusicDownload
        return plugin && typeof plugin.download === 'function' ? plugin : null
    } catch (_) {
        return null
    }
}

const downloadSubscribers = { next: new Set(), progress: new Set(), error: new Set() }
let downloadNativeHooked = false

function ensureDownloadNativeHooks(plugin) {
    if (downloadNativeHooked || !plugin || typeof plugin.addListener !== 'function') return
    downloadNativeHooked = true
    try {
        plugin.addListener('downloadNext', () => emitDownload('next'))
        plugin.addListener('downloadProgress', payload => emitDownload('progress', payload))
        plugin.addListener('downloadError', payload => emitDownload('error', (payload && payload.code) || 'downloadFailed'))
    } catch (_) { }
}

function subscribeDownload(kind, callback) {
    if (typeof callback !== 'function') return unsubscribeStub
    ensureDownloadNativeHooks(nativeMusicDownload())
    const set = downloadSubscribers[kind]
    set.add(callback)
    return () => set.delete(callback)
}

function emitDownload(kind, payload) {
    downloadSubscribers[kind].forEach(callback => {
        try { callback(payload) } catch (_) { }
    })
}

/* ==================================================================
   本地音乐（Android 原生插件 LocalMusic）
   桌面端本地音乐靠 Electron 主进程直接读文件系统；安卓是分区存储，
   必须走 SAF。这里把原生插件的 Promise 接口，适配成前端已有的
   "事件订阅" 契约（scanLocalMusic 触发 → localMusicFiles / localMusicCount 回调），
   这样 locaMusic.js 的解析、分类、文件夹索引都能原样复用。
   ================================================================== */
function nativeLocalMusic() {
    try {
        const plugins = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins
        const plugin = plugins && plugins.LocalMusic
        return plugin && typeof plugin.scan === 'function' ? plugin : null
    } catch (_) {
        return null
    }
}

const localMusicSubscribers = { files: new Set(), count: new Set() }

/**
 * 组装前端 locaMusic.js 认识的本地产物载荷。
 *
 * 键名必须与桌面端 electron/localmusic.js 的 buildLocalPayload 一致：
 *   locaMusic.js 的 getPayloadMetadata 读的是 locaFilesMetadata / localFilesMetadata，
 *   所以只给一个 `metadata` 字段前端是拿不到数据的（踩过：插件能扫到 5 首，
 *   但"本地管理"界面空白）。
 */
function buildLocalMusicPayload(type, metadata, count, error) {
    const payload = {
        type,
        count,
        dirTree: metadata,
        locaFilesMetadata: metadata,
        localFilesMetadata: metadata,
        derived: null,
    }
    if (error) payload.error = error
    return payload
}

function subscribeLocalMusic(kind, callback) {
    if (typeof callback !== 'function') return unsubscribeStub
    const set = localMusicSubscribers[kind]
    set.add(callback)
    return () => set.delete(callback)
}

function emitLocalMusicCount(count) {
    localMusicSubscribers.count.forEach(callback => {
        // 与 preload 的事件签名保持一致：(event, count)
        try { callback({}, count) } catch (_) { }
    })
}

function emitLocalMusicFiles(payload) {
    localMusicSubscribers.files.forEach(callback => {
        try { callback({}, payload) } catch (_) { }
    })
}

/** 读取当前已授权的目录信息（设置页显示"本地目录"用）。 */
export function getNativeLocalMusicFolder() {
    const plugins = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins
    const plugin = plugins && plugins.LocalMusic
    if (!plugin || typeof plugin.getFolder !== 'function') return Promise.resolve(null)
    return plugin.getFolder()
        .then(result => (result && result.uri ? result : null))
        .catch(() => null)
}

/** 清除已授权的目录。 */
export function clearNativeLocalMusicFolder() {
    const plugins = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins
    const plugin = plugins && plugins.LocalMusic
    if (!plugin || typeof plugin.clearFolder !== 'function') return Promise.resolve(false)
    return plugin.clearFolder().then(() => true).catch(() => false)
}

/* ==================================================================
   本地音频的播放地址
   ------------------------------------------------------------------
   安卓上媒体是 content:// URI，而页面跑在 https://localhost（安全上下文），
   WebView **禁止从 https 页面加载 content:// 和 file://**：
       "Not allowed to load local resource: content://media/..."
   所以直接把 URI 交给 <audio>/Howler 会报
       MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check

   正确做法是用 Capacitor 内置的 content 代理（Bridge.CAPACITOR_CONTENT_START）：
       content://media/external/audio/media/123
         → https://localhost/_capacitor_content_/media/external/audio/media/123
   它是同源 https，WebView 放行；真正的字节由 AndroidProtocolHandler
   用 ContentResolver 流式打开（AndroidProtocolHandler:openContentUrl）。

   期间试过两条弯路，都不可行，记在这里避免重蹈：
     · WebViewClient.shouldInterceptRequest 自建代理 —— 媒体请求会绕过它，根本不被调用
     · 原生读成 base64 再转 blob —— 无损文件太大，48MB 的 flac 直接 OOM
   ================================================================== */
export function resolveLocalAudioUrl(path) {
    const value = path == null ? '' : String(path)
    if (!value) return Promise.resolve('')

    if (value.startsWith('content://')) {
        // content://<authority>/<path...>  →  /_capacitor_content_/<authority>/<path...>
        const rest = value.substring('content://'.length)
        return Promise.resolve('https://localhost/_capacitor_content_/' + rest)
    }
    if (value.startsWith('file://') || value.startsWith('http://') || value.startsWith('https://') || value.startsWith('blob:')) {
        return Promise.resolve(value)
    }
    return Promise.resolve('file://' + value)
}



/**
 * 浏览器/手机端的第三方资源请求实现，对应 preload 的 windowApi.requestTrustedResource。
 *
 * 与 Electron 侧保持同样的调用契约：
 *   入参 { url, option: { method, params, headers, timeout, responseType } }
 *   responseType === 'text' 时返回字符串，否则返回解析后的对象/JSON
 *   非 2xx 一律抛错（错误信息沿用主进程的 'trusted-resource-request-failed ...' 格式）
 *
 * 塞壬唱片页面的全部接口（/albums、/album/:cid/detail、/song/:cid、歌词）都靠它。
 *
 * ⚠️ 为什么不能直接用 fetch：
 *   WebView 页面运行在 https://localhost，而塞壬接口在 monster-siren.hypergryph.com，
 *   是跨域请求。真机实测直接 fetch 报 "Failed to fetch"（该域名不带 CORS 头）。
 *   所以优先走 Capacitor 的 CapacitorHttp 插件（原生层发请求，不受同源策略限制），
 *   实测能正常拿到数据；只有在原生插件不可用时（例如手机浏览器形态）才退回 fetch。
 */
async function requestTrustedResourceViaFetch(request = {}) {
    const option = request && typeof request.option === 'object' && request.option !== null
        ? request.option
        : request
    const rawUrl = typeof request.url === 'string' ? request.url : ''

    if (!rawUrl) throw new Error('trusted-resource-request-failed url is empty')

    const method = String(option.method || 'GET').toUpperCase()
    const wantText = option.responseType === 'text'
    const timeout = Number(option.timeout)
    const headers = option.headers && typeof option.headers === 'object' ? option.headers : undefined

    // 拼 query（params 里值为 null/undefined 的跳过）
    const target = new URL(rawUrl, window.location.href)
    const params = option.params && typeof option.params === 'object' ? option.params : null
    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === null) return
            target.searchParams.set(key, String(value))
        })
    }
    const url = target.toString()

    const nativeHttp = typeof window !== 'undefined'
        && window.Capacitor
        && window.Capacitor.Plugins
        && window.Capacitor.Plugins.CapacitorHttp

    // ---------- 首选：原生 HTTP（无同源限制） ----------
    if (nativeHttp) {
        let response
        try {
            response = await window.Capacitor.Plugins.CapacitorHttp.request({
                url,
                method,
                headers,
                // CapacitorHttp 自己按 dataType 处理；这里统一拿原始 body 再按需解析
                responseType: wantText ? 'text' : 'json',
                connectTimeout: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
                readTimeout: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
            })
        } catch (error) {
            throw new Error(
                `trusted-resource-request-failed code=${(error && error.code) || 'NATIVE'}`
                + ` message=${(error && error.message) || error} url=${url}`,
            )
        }

        const status = Number(response && response.status) || 0
        if (status < 200 || status >= 300) {
            throw new Error(
                `trusted-resource-request-failed status=${status}`
                + ` statusText=${(response && response.statusText) || ''} url=${url}`,
            )
        }

        const data = response ? response.data : null
        if (wantText) return typeof data === 'string' ? data : JSON.stringify(data ?? '')
        if (typeof data === 'string') {
            // 原生层偶尔会把 JSON 以字符串返回，这里兜一层解析
            try { return JSON.parse(data) } catch (_) { return data }
        }
        return data
    }

    // ---------- 兜底：浏览器 fetch（仅在原生插件缺失时走到这里） ----------
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    let timer = null
    if (controller && Number.isFinite(timeout) && timeout > 0) {
        timer = setTimeout(() => controller.abort(), timeout)
    }

    let response
    try {
        response = await fetch(url, {
            method,
            headers,
            credentials: 'omit',
            signal: controller ? controller.signal : undefined,
        })
    } catch (error) {
        const message = error && error.name === 'AbortError'
            ? `trusted-resource-request-failed timeout code=ECONNABORTED url=${url}`
            : `trusted-resource-request-failed code=${(error && error.code) || 'NETWORK'} url=${url}`
        throw new Error(message)
    } finally {
        if (timer) clearTimeout(timer)
    }

    if (!response.ok) {
        throw new Error(
            `trusted-resource-request-failed status=${response.status}`
            + ` statusText=${response.statusText || ''} url=${url}`,
        )
    }

    return wantText ? response.text() : response.json()
}

function readJSON(key) {
    try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return null
        return JSON.parse(raw)
    } catch (_) {
        return null
    }
}

function writeJSON(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value))
        return true
    } catch (_) {
        return false
    }
}

function readWebSettings() {
    const stored = readJSON(SETTINGS_KEY)
    if (!stored || typeof stored !== 'object') return getDefaultSettings()
    try {
        return normalizeSettings(stored)
    } catch (_) {
        return getDefaultSettings()
    }
}

function writeWebSettings(payload) {
    let parsed = payload
    if (typeof payload === 'string') {
        try {
            parsed = JSON.parse(payload)
        } catch (_) {
            return false
        }
    }
    if (!parsed || typeof parsed !== 'object') return false
    return writeJSON(SETTINGS_KEY, parsed)
}

function copyTextToClipboard(text) {
    const value = String(text ?? '')
    if (!value) return
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            void navigator.clipboard.writeText(value).catch(() => { })
            return
        }
    } catch (_) { }
    try {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
    } catch (_) { }
}

function createWindowApiStub() {
    return {
        // ---- 窗口控制：浏览器里没有原生窗口，直接忽略 ----
        windowMin: noop,
        windowMax: noop,
        windowClose: noop,
        getWindowMaximizedState: () => resolved(false),
        onWindowMaximizedChange: unsubscribeStub,

        // ---- 外链与剪贴板 ----
        toRegister: url => {
            try {
                if (url) window.open(url, '_blank', 'noopener,noreferrer')
            } catch (_) { }
        },
        copyTxt: copyTextToClipboard,
        openLocalFolder: noop,

        // ---- 退出流程 ----
        beforeQuit: unsubscribeStub,
        exitApp: noop,

        // ---- 下载 ----
        // Android 走原生 MusicDownload 插件（真实下载器 + 写到用户授权目录 + ID3 标签）。
        // 事件契约与桌面端 preload 一致：downloadNext / downloadProgress / downloadError，
        // 由下载队列 downloadManager.js 消费。
        startDownload: () => {
            // 安卓没有主进程来推下载队列，改为通知 downloadManager 立即开工
            // （它监听 hm:download-start；桌面端这条路不会被用到）
            try {
                window.dispatchEvent(new CustomEvent('hm:download-start'))
            } catch (_) { }
        },
        download: fileObj => {
            const plugin = nativeMusicDownload()
            if (!plugin) return
            try {
                plugin.download({
                    url: fileObj && fileObj.url,
                    name: fileObj && fileObj.name,
                    type: fileObj && fileObj.type,
                    id: String((fileObj && fileObj.id) || ''),
                    source: fileObj && fileObj.source,
                    lyrics: (fileObj && fileObj.lyrics) || null,
                    coverUrl: fileObj && fileObj.coverUrl,
                    artists: (fileObj && fileObj.artists) || [],
                    album: fileObj && fileObj.album,
                    saveLyricFile: readWebSettings()?.local?.downloadSaveLyricFile === true,
                }).catch(error => {
                    // 插件内部失败也会通过 downloadError 事件上报；这里只兜住调用本身失败
                    const code = /noSavePath/.test(String(error && error.message)) ? 'noSavePath' : 'downloadFailed'
                    emitDownload('error', code)
                })
            } catch (_) {
                emitDownload('error', 'downloadFailed')
            }
        },
        downloadNext: callback => subscribeDownload('next', callback),
        downloadProgress: callback => subscribeDownload('progress', callback),
        downloadError: callback => subscribeDownload('error', callback),
        downloadPause: () => { const p = nativeMusicDownload(); if (p) p.pause().catch(() => {}) },
        downloadResume: () => { const p = nativeMusicDownload(); if (p) p.resume().catch(() => {}) },
        downloadCancel: () => { const p = nativeMusicDownload(); if (p) p.cancel().catch(() => {}) },
        downloadVideoProgress: unsubscribeStub,
        cancelDownloadMusicVideo: noop,

        // ---- 本地音乐 ----
        // Android 上没有文件系统直读权限，改为通过原生插件 LocalMusic（SAF）扫描：
        //   选目录 → 持久化授权 → DocumentsContract 递归 → MediaMetadataRetriever 读元数据
        // 事件接口（localMusicFiles / localMusicCount）保持同样的"订阅返回取消函数"契约，
        // 由下面的 emit 驱动，前端 locaMusic.js 不需要为安卓改写。
        scanLocalMusic: params => {
            const plugin = nativeLocalMusic()
            if (!plugin) return
            const type = (params && params.type) || 'local'
            plugin.scan({ type })
                .then(result => {
                    const metadata = (result && result.metadata) || null
                    emitLocalMusicCount(result && result.count ? result.count : 0)
                    emitLocalMusicFiles(buildLocalMusicPayload(type, metadata, (result && result.count) || 0))
                })
                .catch(error => {
                    // 没选目录 / 授权失效：给出可读提示，前端不会一直等
                    emitLocalMusicCount(0)
                    emitLocalMusicFiles(buildLocalMusicPayload(type, null, 0, String(error && error.message || error)))
                })
        },
        localMusicFiles: callback => subscribeLocalMusic('files', callback),
        localMusicCount: callback => subscribeLocalMusic('count', callback),
        // 打开目录选择器（设置页「本地目录 → 添加」走这里）
        openDirectory: () => {
            const plugin = nativeLocalMusic()
            if (!plugin) return resolved(null)
            return plugin.pickFolder().then(result => (result && result.uri) || null).catch(() => null)
        },
        // 本地封面：原生读内嵌图片转 data URL（content:// 在 WebView 里读不了）
        getLocalMusicImage: path => {
            const value = path == null ? '' : String(path)
            const plugins = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins
            const plugin = plugins && plugins.LocalMusic
            if (!value || !plugin || typeof plugin.getMusicImage !== 'function') return resolved('')
            return plugin.getMusicImage({ uri: value })
                .then(result => (result && result.dataUrl) || '')
                .catch(() => '')
        },
        // 本地歌词：优先内嵌，其次同目录同名 .lrc。
        // 返回结构与桌面端 loadLocalLyricPayload 一致：{ lrc: { lyric: '...' } }，
        // 播放器按这个形状解析，给别的形状会解析不出来。
        getLocalMusicLyric: path => {
            const value = path == null ? '' : String(path)
            const plugins = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins
            const plugin = plugins && plugins.LocalMusic
            if (!value || !plugin || typeof plugin.getMusicLyric !== 'function') return resolved(null)
            return plugin.getMusicLyric({ uri: value })
                .then(result => {
                    const text = result && result.lyric
                    if (!text) return null
                    return { lrc: { lyric: text } }
                })
                .catch(() => null)
        },
        readLocalAudioBuffer: () => resolved(null),
        clearLocalMusicData: noop,
        persistLocalMusicDerived: noop,
        getPathForFile: file => (file && typeof file.name === 'string' ? file.name : ''),
        // 本地歌曲的播放地址。
        // 桌面端这里把文件路径转成 file://；安卓上媒体是 content://，
        // WebView 里的 <audio>/Howler 读不了，必须交给原生代理
        // （MainActivity 装了 LocalAudioProxy，会把 /__hm_audio 转成真实文件流，
        //  并支持 Range，所以能边下边播、也能拖动进度）。
        toFileUrl: path => {
            const value = path == null ? '' : String(path)
            if (!value) return ''
            if (value.startsWith('content://')) {
                return 'https://localhost/__hm_audio/?u=' + encodeURIComponent(value)
            }
            if (value.startsWith('file://') || value.startsWith('http://') || value.startsWith('https://')) {
                return value
            }
            return 'file://' + value
        },
        getAudioCoverFromBuffer: () => resolved(''),

        // ---- 系统级控制（托盘 / 快捷键 / 媒体键）----
        playOrPauseMusic: unsubscribeStub,
        playOrPauseMusicCheck: noop,
        lastOrNextMusic: unsubscribeStub,
        changeMusicPlaymode: unsubscribeStub,
        changeTrayMusicPlaymode: noop,
        volumeUp: unsubscribeStub,
        volumeDown: unsubscribeStub,
        musicProcessControl: unsubscribeStub,
        hidePlayer: unsubscribeStub,
        registerShortcuts: noop,
        unregisterShortcuts: noop,
        setWindowTile: title => {
            try {
                if (title) document.title = String(title)
            } catch (_) { }
        },
        updatePlaylistStatus: noop,
        updateDockMenu: noop,
        lyricControl: unsubscribeStub,

        // ---- 设置：用 localStorage 持久化，保证设置页可用 ----
        getSettings: () => readWebSettings(),
        setSettings: payload => writeWebSettings(payload),
        getSystemFonts: () => resolved([]),
        openDirectory: () => resolved(null),
        openFile: () => resolved(null),

        // ---- 播放记录恢复：让手机端也能接着上次听 ----
        getLastPlaylist: () => readJSON(LAST_PLAYLIST_KEY),
        saveLastPlaylist: playlist => writeJSON(LAST_PLAYLIST_KEY, playlist),
        saveLastPlaybackProgress: progressState => writeJSON(LAST_PROGRESS_KEY, progressState),

        // ---- 音乐视频 / 第三方资源 ----
        // requestTrustedResource 在 Electron 里走主进程 IPC（绕开跨域/UA 限制）。
        // 手机端没有主进程，这里用 fetch 直连实现，让"塞壬唱片"这类第三方接口能用
        // （monster-siren.hypergryph.com 带 CORS 头，可以直接取）。
        // 注意：Electron 侧还有一层 host 白名单（ipcMain 的 trustedExternalFetchHosts），
        // 浏览器端没有等价的强制手段；调用方都是本工程自己的 api 模块，风险可控。
        requestTrustedResource: requestTrustedResourceViaFetch,
        getBiliVideo: () => resolved(null),
        musicVideoIsExists: () => resolved(false),
        clearUnusedVideo: () => resolved(false),
        deleteMusicVideo: () => resolved(false),
        getRemoteAudioMetadata: () => resolved(null),
        requestAudioArrayBuffer: () => resolved(null),
        submitNcmClientLog: () => resolved(null),

        // ---- HiFi 输出：桌面独占能力 ----
        getHifiOutputState: () => resolved({ available: false, running: false, sessionId: null, position: 0, paused: false }),
        selectHifiOutputMpv: () => resolved(null),
        listHifiOutputDevices: () => resolved([]),
        startHifiOutput: () => resolved({ ok: false, error: 'unsupported-in-web' }),
        setHifiOutputPaused: () => resolved(false),
        seekHifiOutput: () => resolved(false),
        setHifiOutputVolume: () => resolved(false),
        setHifiOutputLoop: () => resolved(false),
        stopHifiOutput: () => resolved(false),
        onHifiOutputEvent: unsubscribeStub,

        // ---- 自动更新：浏览器里由用户手动刷新 ----
        checkUpdate: unsubscribeStub,
        manualUpdateAvailable: unsubscribeStub,
        updateNotAvailable: unsubscribeStub,
        updateDownloadProgress: unsubscribeStub,
        updateDownloaded: unsubscribeStub,
        updateError: unsubscribeStub,
        checkForUpdate: noop,
        downloadUpdate: noop,
        installUpdate: noop,
        cancelUpdate: noop,

        // ---- NCM API 就绪：由同源服务直接提供，无需等待 ----
        whenNcmApiReady: () => resolved({ ready: true, skipped: true }),
        clearNcmApiCookies: () => {
            try {
                document.cookie = 'MUSIC_U=; Max-Age=0; path=/'
            } catch (_) { }
            return resolved(true)
        },
    }
}

function createElectronApiStub() {
    return {
        createLyricWindow: () => resolved(false),
        closeLyricWindow: () => resolved(false),
        setLyricWindowMovable: () => resolved(false),
        lyricWindowReady: noop,
        onLyricUpdate: unsubscribeStub,
        requestLyricData: noop,
        updateLyricData: noop,
        getCurrentLyricData: unsubscribeStub,
        sendCurrentLyricData: noop,
        isLyricWindowVisible: () => resolved(false),
        resizeWindow: () => resolved(false),
        notifyLyricWindowClosed: noop,
        onDesktopLyricClosed: unsubscribeStub,
        getLyricWindowBounds: () => resolved(null),
        moveLyricWindow: noop,
        moveLyricWindowBy: noop,
        moveLyricWindowTo: noop,
        setLyricWindowResizable: noop,
        getLyricWindowMinMax: () => resolved(null),
        setLyricWindowMinMax: noop,
        setLyricWindowAspectRatio: noop,
        getLyricWindowContentBounds: () => resolved(null),
        moveLyricWindowContentTo: noop,
    }
}

function createPlayerApiStub() {
    return {
        switchRepeatMode: noop,
        switchShuffle: noop,
        sendMetaData: noop,
        sendPlayerCurrentTrackTime: noop,
        onSetPosition: unsubscribeStub,
        onNext: unsubscribeStub,
        onPrevious: unsubscribeStub,
        onPlayM: unsubscribeStub,
        onPlayPause: unsubscribeStub,
        onPauseM: unsubscribeStub,
        onRepeat: unsubscribeStub,
        onShuffle: unsubscribeStub,
        setVolume: noop,
        onVolumeChanged: unsubscribeStub,
    }
}

function installWebBridge() {
    if (typeof window.windowApi === 'undefined') {
        window.windowApi = createWindowApiStub()
    }
    if (typeof window.electronAPI === 'undefined') {
        window.electronAPI = createElectronApiStub()
    }
    if (typeof window.playerApi === 'undefined') {
        window.playerApi = createPlayerApiStub()
    }
    // WindowControl 等组件会读取 window.process.platform
    if (typeof window.process === 'undefined') {
        window.process = { platform: 'web' }
    }

    // 供样式层区分「浏览器/手机」与「Electron 桌面端」
    try {
        document.documentElement.dataset.hmWeb = 'true'
    } catch (_) { }

    window.__hmWebBridgeInstalled = true
}

if (typeof window !== 'undefined' && !isDesktopApp) {
    installWebBridge()
}
