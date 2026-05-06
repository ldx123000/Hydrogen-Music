const { dialog } = require('electron')
const axios = require('axios')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { promisify } = require('util')
const vm = require('vm')
const zlib = require('zlib')
const Store = require('electron-store').default
const {
    isHttpUrl,
    normalizeHttpMethod,
    normalizePlainObject,
    normalizeResponseType,
    normalizeTimeout,
    parseUrlSafely,
} = require('./ipcHelpers')

const CUSTOM_SOURCE_STORE_NAME = 'customSource'
const CUSTOM_SOURCE_SCRIPT_MAX_BYTES = 512 * 1024
const CUSTOM_SOURCE_SCRIPT_TIMEOUT_MS = 1000
const CUSTOM_SOURCE_RESOLVE_TIMEOUT_MS = 12000
const CUSTOM_SOURCE_REQUEST_TIMEOUT_MS = 10000
const LX_SOURCE_INIT_TIMEOUT_MS = 3000
const CUSTOM_SOURCE_API_VERSION = '1.0.0'
const CUSTOM_SOURCE_ENV = 'desktop'
const customSourceBlockedHeaderNames = new Set([
    'connection',
    'content-length',
    'host',
    'proxy-authorization',
    'proxy-connection',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
])
const headerNamePattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const LX_EVENT_NAMES = Object.freeze({
    inited: 'inited',
    request: 'request',
    updateAlert: 'updateAlert',
})
const LX_SOURCE_CANDIDATES = ['wy', 'netease', 'ncm', '163']
const LX_QUALITY_CANDIDATES = Object.freeze({
    standard: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'master'],
    higher: ['320k', '128k', 'flac', 'flac24bit', 'hires', 'master'],
    exhigh: ['320k', 'flac', 'flac24bit', 'hires', 'master', '128k'],
    lossless: ['flac', 'ape', 'wav', '320k', '128k'],
    hires: ['hires', 'flac24bit', 'flac', '320k', '128k'],
    jyeffect: ['hires', 'flac24bit', 'flac', '320k', '128k'],
    sky: ['hires', 'flac24bit', 'flac', '320k', '128k'],
    dolby: ['atmos', 'flac24bit', 'hires', 'flac', '320k', '128k'],
    jymaster: ['master', 'flac24bit', 'hires', 'flac', '320k', '128k'],
})
const LX_QUALITY_LEVEL_MAP = Object.freeze({
    '128k': 'standard',
    '320k': 'exhigh',
    flac: 'lossless',
    ape: 'lossless',
    wav: 'lossless',
    flac24bit: 'hires',
    hires: 'hires',
    atmos: 'dolby',
    master: 'jymaster',
})
const CUSTOM_SOURCE_TEST_SONG = Object.freeze({
    id: 33894312,
    name: '演员',
    ar: [{ id: 5781, name: '薛之谦' }],
    al: { id: 3266020, name: '绅士', picUrl: '' },
    dt: 261000,
})

const customSourceStore = new Store({ name: CUSTOM_SOURCE_STORE_NAME })
let cachedSourceModule = null
const inflateAsync = promisify(zlib.inflate)
const deflateAsync = promisify(zlib.deflate)

function normalizeText(value, fallback = '') {
    if (typeof value !== 'string') return fallback
    return value.replace(/[\n\r\f]/g, ' ').trim().slice(0, 120) || fallback
}

function isPrivateNetworkHost(hostname) {
    const normalizedHost = String(hostname || '')
        .trim()
        .toLowerCase()
        .replace(/\.$/, '')
        .replace(/^\[|\]$/g, '')

    if (!normalizedHost) return true
    if (normalizedHost === 'localhost' || normalizedHost.endsWith('.localhost') || normalizedHost.endsWith('.local')) return true
    if (normalizedHost.includes(':')) return true
    if (!normalizedHost.includes('.')) return true
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalizedHost)) return false

    const octets = normalizedHost.split('.').map(part => Number.parseInt(part, 10))
    if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true

    const [first, second] = octets
    if (first === 0 || first === 10 || first === 127) return true
    if (first === 169 && second === 254) return true
    if (first === 172 && second >= 16 && second <= 31) return true
    if (first === 192 && second === 168) return true
    if (first === 100 && second >= 64 && second <= 127) return true
    if (first === 198 && (second === 18 || second === 19)) return true
    if (first >= 224) return true
    return false
}

function parsePublicHttpUrl(value) {
    const parsedUrl = parseUrlSafely(value)
    if (!isHttpUrl(parsedUrl)) return null
    return isPrivateNetworkHost(parsedUrl.hostname) ? null : parsedUrl
}

function getStoredState() {
    const state = customSourceStore.get('state')
    if (!state || typeof state !== 'object') {
        return {
            enabled: false,
            source: null,
        }
    }

    return {
        enabled: state.enabled === true,
        source: state.source && typeof state.source === 'object' ? state.source : null,
    }
}

function setStoredState(state) {
    customSourceStore.set('state', {
        enabled: state?.enabled === true && !!state?.source,
        source: state?.source || null,
    })
    cachedSourceModule = null
    return getStoredState()
}

function getPublicState() {
    const state = getStoredState()
    const source = state.source
    return {
        enabled: state.enabled === true && !!source,
        hasSource: !!source,
        source: source
            ? {
                name: source.name,
                version: source.version,
                fileName: source.fileName,
                sourceUrl: source.sourceUrl || '',
                sourceType: source.sourceType || 'hydrogen',
                importedAt: source.importedAt,
            }
            : null,
    }
}

function normalizeHeaders(headers) {
    const result = {}
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return result

    Object.entries(headers).forEach(([name, value]) => {
        const normalizedName = String(name || '').trim().toLowerCase()
        if (!normalizedName || !headerNamePattern.test(normalizedName)) return
        if (customSourceBlockedHeaderNames.has(normalizedName)) return
        if (value === undefined || value === null) return
        if (Array.isArray(value)) {
            result[normalizedName] = value.map(item => String(item)).join(', ')
            return
        }
        result[normalizedName] = String(value)
    })

    return result
}

function hasHeader(headers, name) {
    const normalizedName = String(name || '').trim().toLowerCase()
    return Object.keys(headers || {}).some(headerName => headerName.toLowerCase() === normalizedName)
}

function setDefaultHeader(headers, name, value) {
    if (hasHeader(headers, name)) return
    headers[name.toLowerCase()] = value
}

function normalizeFormDataPayload(formData, headers) {
    if (!formData || typeof formData !== 'object' || Array.isArray(formData)) return formData
    const FormData = require('form-data')
    const payload = new FormData()
    Object.entries(formData).forEach(([name, value]) => {
        if (value === undefined || value === null) return
        payload.append(name, value)
    })
    Object.assign(headers, normalizeHeaders(payload.getHeaders()))
    return payload
}

function normalizeRequestData(option, method, headers) {
    if (method === 'get') return undefined
    if (option.formData !== undefined) return normalizeFormDataPayload(option.formData, headers)
    if (option.form !== undefined) {
        if (option.form && typeof option.form === 'object' && !Array.isArray(option.form)) {
            setDefaultHeader(headers, 'content-type', 'application/x-www-form-urlencoded')
            return new URLSearchParams(option.form).toString()
        }
        return option.form
    }
    if (option.body !== undefined) return option.body
    return option.data
}

async function requestCustomSourceHttp(url, options = {}) {
    const parsedUrl = parsePublicHttpUrl(url)
    if (!parsedUrl) throw new Error('unsupported-custom-source-request-url')

    const option = options && typeof options === 'object' ? options : {}
    const method = normalizeHttpMethod(option.method || 'get')
    if (!method) throw new Error('unsupported-custom-source-request-method')
    const headers = normalizeHeaders(option.headers)
    const data = normalizeRequestData(option, method, headers)

    const response = await axios({
        url: parsedUrl.toString(),
        method,
        params: normalizePlainObject(option.params || option.searchParams),
        data,
        headers,
        timeout: normalizeTimeout(option.timeout || CUSTOM_SOURCE_REQUEST_TIMEOUT_MS),
        responseType: normalizeResponseType(option.responseType),
        signal: option.signal,
        validateStatus: status => status >= 200 && status < 300,
    })

    return {
        data: response.data,
        response,
        url: parsedUrl.toString(),
    }
}

async function requestFromCustomSource(url, options = {}) {
    const { data } = await requestCustomSourceHttp(url, options)
    return data
}

function createSourceConsole(sourceName) {
    const prefix = `[custom-source:${sourceName || 'unknown'}]`
    return {
        log: (...args) => console.log(prefix, ...args),
        info: (...args) => console.log(prefix, ...args),
        debug: (...args) => console.debug(prefix, ...args),
        warn: (...args) => console.warn(prefix, ...args),
        error: (...args) => console.error(prefix, ...args),
        group: (...args) => console.log(prefix, ...args),
        groupCollapsed: (...args) => console.log(prefix, ...args),
        groupEnd: () => {},
    }
}

function parseSourceMetadata(code) {
    const text = String(code || '')
    const matchedHeader = text.match(/\/\*![\s\S]*?\*\//) || text.match(/\/\*[\s\S]*?\*\//)
    const metadata = {}
    if (!matchedHeader) return metadata

    matchedHeader[0].replace(/^\s*\*\s*@([a-zA-Z0-9_-]+)\s+(.+)$/gm, (_matched, key, value) => {
        metadata[String(key).trim()] = normalizeText(value, '')
        return ''
    })
    return metadata
}

function isLxSourceCode(code) {
    const text = String(code || '')
    return /\bglobalThis\.lx\b/.test(text)
        || /\bEVENT_NAMES\.(?:request|inited)\b/.test(text)
        || (/\bEVENT_NAMES\b/.test(text) && /\bcurrentScriptInfo\b/.test(text))
}

function toBuffer(value, encoding = 'utf8') {
    if (Buffer.isBuffer(value)) return value
    if (value instanceof ArrayBuffer) return Buffer.from(value)
    if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    return Buffer.from(String(value ?? ''), encoding)
}

function createAesCipher(method, mode, data, key, iv) {
    const keyBuffer = toBuffer(key)
    const normalizedMode = String(mode || 'aes-128-cbc').trim().toLowerCase()
    const algorithm = normalizedMode.startsWith('aes-') ? normalizedMode : `aes-${keyBuffer.length * 8 || 128}-${normalizedMode}`
    const ivBuffer = algorithm.includes('ecb') ? null : toBuffer(iv || '')
    const cipher = crypto[method](algorithm, keyBuffer, ivBuffer)
    return Buffer.concat([cipher.update(toBuffer(data)), cipher.final()])
}

function createLxUtils() {
    return {
        buffer: {
            from: (...args) => Buffer.from(...args),
            alloc: (...args) => Buffer.alloc(...args),
            concat: (...args) => Buffer.concat(...args),
            bufToString: (buffer, encoding = 'utf8') => toBuffer(buffer).toString(encoding),
            stringToBuf: (text, encoding = 'utf8') => Buffer.from(String(text ?? ''), encoding),
        },
        crypto: {
            md5: value => crypto.createHash('md5').update(toBuffer(value)).digest('hex'),
            sha256: value => crypto.createHash('sha256').update(toBuffer(value)).digest('hex'),
            randomBytes: size => crypto.randomBytes(Math.max(0, Number.parseInt(size, 10) || 0)),
            aesEncrypt: (data, mode, key, iv) => createAesCipher('createCipheriv', mode, data, key, iv),
            aesDecrypt: (data, mode, key, iv) => createAesCipher('createDecipheriv', mode, data, key, iv),
            rsaEncrypt: (data, key) => crypto.publicEncrypt({
                key,
                padding: crypto.constants.RSA_PKCS1_PADDING,
            }, toBuffer(data)),
        },
        zlib: {
            inflate: data => inflateAsync(toBuffer(data)),
            deflate: data => deflateAsync(toBuffer(data)),
        },
    }
}

function requestFromLxSource(url, options = {}, callback) {
    const controller = new AbortController()
    const requestPromise = requestCustomSourceHttp(url, {
        ...(options && typeof options === 'object' ? options : {}),
        signal: controller.signal,
    }).then(({ data, response, url: finalUrl }) => ({
        statusCode: response.status,
        status: response.status,
        headers: response.headers || {},
        body: data,
        rawBody: data,
        url: finalUrl,
    }))
    requestPromise.catch(() => {})

    if (typeof callback === 'function') {
        requestPromise
            .then(response => callback(null, response, response.body))
            .catch(error => callback(error))
        return () => controller.abort()
    }

    return requestPromise
}

function reportLxAsyncError(error) {
    console.warn('LX 自定义解析源异步任务失败:', error?.message || error)
}

function runLxAsyncTask(handler, args) {
    try {
        const result = handler(...args)
        if (result && typeof result.then === 'function') {
            result.catch(reportLxAsyncError)
        }
        return result
    } catch (error) {
        reportLxAsyncError(error)
        return undefined
    }
}

function createSafeTimer(timer) {
    return (handler, timeout, ...args) => {
        if (typeof handler !== 'function') return timer(handler, timeout, ...args)
        const wrappedHandler = () => runLxAsyncTask(handler, args)
        return timer(wrappedHandler, timeout)
    }
}

function createLxRuntime(metadata) {
    let markReady = null
    const runtime = {
        handlers: new Map(),
        initedData: null,
        readyPromise: new Promise(resolve => {
            markReady = resolve
        }),
    }

    runtime.lx = {
        EVENT_NAMES: LX_EVENT_NAMES,
        env: CUSTOM_SOURCE_ENV,
        version: CUSTOM_SOURCE_API_VERSION,
        currentScriptInfo: metadata,
        utils: createLxUtils(),
        request: requestFromLxSource,
        on(eventName, handler) {
            if (typeof eventName !== 'string' || typeof handler !== 'function') return
            runtime.handlers.set(eventName, handler)
            if (eventName === LX_EVENT_NAMES.request && markReady) markReady()
        },
        send(eventName, data) {
            if (eventName === LX_EVENT_NAMES.inited) {
                runtime.initedData = data && typeof data === 'object' ? data : null
            }
        },
    }

    return runtime
}

function getArtistNames(song) {
    const artists = Array.isArray(song?.ar) ? song.ar : (Array.isArray(song?.artists) ? song.artists : [])
    return artists.map(artist => {
        if (typeof artist === 'string') return artist
        return normalizeText(artist?.name, '')
    }).filter(Boolean)
}

function getAlbumInfo(song) {
    const album = song?.al && typeof song.al === 'object' ? song.al : (song?.album && typeof song.album === 'object' ? song.album : null)
    return {
        id: album?.id || song?.albumId || '',
        name: normalizeText(album?.name || song?.albumName, ''),
        cover: album?.picUrl || album?.cover || song?.picUrl || '',
    }
}

function createLxMusicInfo(song, sourceId) {
    const id = song?.id ?? song?.songmid ?? song?.mid ?? ''
    const artistNames = getArtistNames(song)
    const album = getAlbumInfo(song)
    const duration = Number(song?.dt || song?.duration || song?.interval || 0) || 0
    const musicInfo = {
        id,
        songmid: String(id || ''),
        name: normalizeText(song?.name || song?.songName, ''),
        singer: artistNames.join('、'),
        singerName: artistNames.join('、'),
        albumId: album.id,
        albumName: album.name,
        img: album.cover,
        interval: duration > 10000 ? Math.round(duration / 1000) : duration,
        source: sourceId,
    }

    if (song?.hash) musicInfo.hash = song.hash
    return musicInfo
}

function getLxSources(initedData) {
    const sources = initedData?.sources
    return sources && typeof sources === 'object' && !Array.isArray(sources) ? sources : {}
}

function selectLxSourceId(sources) {
    const sourceKeys = Object.keys(sources)
    for (const sourceId of LX_SOURCE_CANDIDATES) {
        const sourceInfo = sources[sourceId]
        if (!sourceInfo) continue
        const actions = Array.isArray(sourceInfo.actions) ? sourceInfo.actions : []
        if (!actions.length || actions.includes('musicUrl')) return sourceId
    }
    if (!sourceKeys.length) return 'wy'
    throw new Error('lx-source-wy-not-supported')
}

function uniqueList(items) {
    const result = []
    for (const item of items) {
        const value = String(item || '').trim()
        if (!value || result.includes(value)) continue
        result.push(value)
    }
    return result
}

function getLxQualityCandidates(preferredLevel, sourceInfo) {
    const qualitys = Array.isArray(sourceInfo?.qualitys) ? sourceInfo.qualitys.map(item => String(item)) : []
    const supportedQualitys = new Set(qualitys)
    const candidates = LX_QUALITY_CANDIDATES[preferredLevel] || [preferredLevel, '320k', '128k', 'flac']
    if (!supportedQualitys.size) return uniqueList(candidates)
    return uniqueList([
        ...candidates.filter(quality => supportedQualitys.has(quality)),
        ...qualitys,
    ])
}

function normalizeLxMusicUrlResult(result, requestedLevel, lxQuality) {
    const actualLevel = LX_QUALITY_LEVEL_MAP[lxQuality] || requestedLevel || lxQuality
    if (typeof result === 'string') {
        return {
            url: result,
            level: actualLevel,
            type: '',
        }
    }
    if (!result || typeof result !== 'object') return null
    return {
        ...result,
        level: normalizeText(result.level, actualLevel),
        type: normalizeText(result.type, lxQuality),
    }
}

async function resolveLxMusicUrl(runtime, request = {}) {
    await withTimeout(runtime.readyPromise, LX_SOURCE_INIT_TIMEOUT_MS, 'lx-source-init-timeout')
    const handler = runtime.handlers.get(LX_EVENT_NAMES.request)
    if (typeof handler !== 'function') throw new Error('lx-source-missing-request-handler')

    const sources = getLxSources(runtime.initedData)
    const sourceId = selectLxSourceId(sources)
    const sourceInfo = sources[sourceId]
    const requestedLevel = normalizeText(request.quality, '')
    const musicInfo = createLxMusicInfo(request.song, sourceId)
    let lastResult = null
    let lastError = null

    for (const lxQuality of getLxQualityCandidates(requestedLevel, sourceInfo)) {
        try {
            const result = await handler({
                action: 'musicUrl',
                source: sourceId,
                info: {
                    type: lxQuality,
                    musicInfo,
                },
            })
            const normalizedResult = normalizeLxMusicUrlResult(result, requestedLevel, lxQuality)
            if (normalizedResult?.url) return normalizedResult
            lastResult = normalizedResult
        } catch (error) {
            lastError = error
        }
    }

    if (lastError) throw lastError
    return lastResult
}

function loadNativeSourceModule(source) {
    if (!source?.code) throw new Error('custom-source-empty')

    const module = { exports: {} }
    const sandbox = {
        module,
        exports: module.exports,
        console: createSourceConsole(source.name),
        URL,
        URLSearchParams,
        setTimeout,
        clearTimeout,
    }
    const context = vm.createContext(sandbox, {
        codeGeneration: {
            strings: false,
            wasm: false,
        },
    })
    const script = new vm.Script(source.code, {
        filename: source.fileName || 'custom-source.js',
        displayErrors: true,
    })

    script.runInContext(context, { timeout: CUSTOM_SOURCE_SCRIPT_TIMEOUT_MS })

    const exported = module.exports?.default || module.exports
    if (!exported || typeof exported !== 'object') throw new Error('custom-source-invalid-export')
    if (typeof exported.resolve !== 'function') throw new Error('custom-source-missing-resolve')

    return {
        ...exported,
        sourceType: 'hydrogen',
    }
}

function loadLxSourceModule(source) {
    if (!source?.code) throw new Error('custom-source-empty')
    const metadata = parseSourceMetadata(source.code)
    const runtime = createLxRuntime({
        name: normalizeText(metadata.name, source.name || source.fileName || 'LX Source'),
        description: normalizeText(metadata.description, ''),
        version: normalizeText(metadata.version, ''),
        author: normalizeText(metadata.author, ''),
        homepage: normalizeText(metadata.homepage, ''),
        rawScript: source.code,
    })
    const sandbox = {
        lx: runtime.lx,
        console: createSourceConsole(runtime.lx.currentScriptInfo.name),
        URL,
        URLSearchParams,
        Buffer,
        setTimeout: createSafeTimer(setTimeout),
        clearTimeout,
        setInterval: createSafeTimer(setInterval),
        clearInterval,
    }
    sandbox.window = sandbox
    sandbox.self = sandbox
    sandbox.global = sandbox
    sandbox.globalThis = sandbox

    const context = vm.createContext(sandbox, {
        codeGeneration: {
            strings: false,
            wasm: false,
        },
    })
    const script = new vm.Script(source.code, {
        filename: source.fileName || 'lx-custom-source.js',
        displayErrors: true,
    })

    script.runInContext(context, { timeout: CUSTOM_SOURCE_SCRIPT_TIMEOUT_MS })

    return {
        name: runtime.lx.currentScriptInfo.name,
        version: runtime.lx.currentScriptInfo.version,
        sourceType: 'lx',
        resolve: request => resolveLxMusicUrl(runtime, request),
    }
}

function shouldTryLxSourceFallback(error) {
    const message = String(error?.message || '')
    return /\b(?:EVENT_NAMES|globalThis|lx)\b/i.test(message)
}

function loadSourceModule(source) {
    if (!source?.code) throw new Error('custom-source-empty')
    const sourceType = source.sourceType || (isLxSourceCode(source.code) ? 'lx' : 'hydrogen')
    const cacheKey = `${sourceType}:${source.importedAt || ''}:${source.code.length}`
    if (cachedSourceModule?.cacheKey === cacheKey) return cachedSourceModule.module

    let sourceModule
    if (sourceType === 'lx') {
        sourceModule = loadLxSourceModule(source)
    } else {
        try {
            sourceModule = loadNativeSourceModule(source)
        } catch (error) {
            if (!shouldTryLxSourceFallback(error)) throw error
            sourceModule = loadLxSourceModule(source)
        }
    }
    cachedSourceModule = {
        cacheKey,
        module: sourceModule,
    }
    return sourceModule
}

function normalizeImportedSource(filePath, code) {
    const sourceModule = loadSourceModule({
        code,
        fileName: path.basename(filePath),
        name: path.basename(filePath),
    })

    return {
        name: normalizeText(sourceModule.name, path.basename(filePath)),
        version: normalizeText(sourceModule.version, ''),
        fileName: path.basename(filePath),
        sourceType: sourceModule.sourceType || 'hydrogen',
        importedAt: Date.now(),
        code,
    }
}

function getImportUrlFileName(urlObj) {
    const baseName = path.basename(urlObj.pathname || '')
    return baseName && baseName !== '/' ? baseName : `${urlObj.hostname || 'custom-source'}.js`
}

async function importCustomSourceFromUrl(rawUrl) {
    const parsedUrl = parsePublicHttpUrl(rawUrl)
    if (!parsedUrl) throw new Error('custom-source-invalid-url')

    const response = await axios({
        url: parsedUrl.toString(),
        method: 'get',
        timeout: normalizeTimeout(CUSTOM_SOURCE_REQUEST_TIMEOUT_MS),
        responseType: 'text',
        maxContentLength: CUSTOM_SOURCE_SCRIPT_MAX_BYTES,
        validateStatus: status => status >= 200 && status < 300,
    })

    const code = typeof response.data === 'string' ? response.data : String(response.data || '')
    if (!code.trim()) throw new Error('custom-source-empty')
    if (Buffer.byteLength(code, 'utf8') > CUSTOM_SOURCE_SCRIPT_MAX_BYTES) throw new Error('custom-source-too-large')

    const fileName = getImportUrlFileName(parsedUrl)
    const source = {
        ...normalizeImportedSource(fileName, code),
        sourceUrl: parsedUrl.toString(),
    }
    setStoredState({
        enabled: false,
        source,
    })

    return { ok: true, state: getPublicState() }
}

async function importCustomSource() {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'JavaScript', extensions: ['js'] },
        ],
    })
    if (canceled || !filePaths?.[0]) return { ok: false, canceled: true, state: getPublicState() }

    const filePath = filePaths[0]
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) throw new Error('custom-source-not-file')
    if (stat.size > CUSTOM_SOURCE_SCRIPT_MAX_BYTES) throw new Error('custom-source-too-large')

    const code = fs.readFileSync(filePath, 'utf8')
    const source = normalizeImportedSource(filePath, code)
    setStoredState({
        enabled: false,
        source,
    })

    return { ok: true, state: getPublicState() }
}

function setCustomSourceEnabled(enabled) {
    const state = getStoredState()
    if (!state.source) {
        setStoredState({ enabled: false, source: null })
        return getPublicState()
    }

    setStoredState({
        ...state,
        enabled: enabled === true,
    })
    return getPublicState()
}

function removeCustomSource() {
    setStoredState({ enabled: false, source: null })
    return getPublicState()
}

function withTimeout(promise, timeoutMs, message) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(message))
        }, timeoutMs)

        Promise.resolve(promise)
            .then(value => {
                clearTimeout(timer)
                resolve(value)
            })
            .catch(error => {
                clearTimeout(timer)
                reject(error)
            })
    })
}

function normalizeNumber(value) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? number : 0
}

function normalizeCustomSourceTestSong(song) {
    if (!song || typeof song !== 'object' || song.type === 'local') return CUSTOM_SOURCE_TEST_SONG
    const songId = song.id ?? song.songmid ?? song.mid
    if (!songId) return CUSTOM_SOURCE_TEST_SONG
    return song
}

function normalizeCustomSourceResult(result, source) {
    const payload = typeof result === 'string' ? { url: result } : result
    if (!payload || typeof payload !== 'object') return null

    const parsedUrl = parsePublicHttpUrl(payload.url)
    if (!parsedUrl) return null

    return {
        url: parsedUrl.toString(),
        level: normalizeText(payload.level || payload.quality, ''),
        type: normalizeText(payload.type, ''),
        br: normalizeNumber(payload.br || payload.bitrate),
        sr: normalizeNumber(payload.sr),
        size: normalizeNumber(payload.size),
        source: 'custom-source',
        sourceName: source.name,
    }
}

async function resolveCustomMusicUrl(request = {}) {
    const state = getStoredState()
    if (!state.source) return null
    if (!state.enabled && request.allowDisabled !== true) return null

    const sourceModule = loadSourceModule(state.source)
    const result = await withTimeout(
        sourceModule.resolve({
            song: request.song && typeof request.song === 'object' ? request.song : {},
            quality: normalizeText(request.quality, ''),
            request: requestFromCustomSource,
        }),
        CUSTOM_SOURCE_RESOLVE_TIMEOUT_MS,
        'custom-source-resolve-timeout'
    )

    return normalizeCustomSourceResult(result, state.source)
}

async function testCustomSource(request = {}) {
    const state = getStoredState()
    if (!state.source) return { ok: false, message: '未导入自定义解析源', state: getPublicState() }

    try {
        const sourceModule = loadSourceModule(state.source)
        const testSong = normalizeCustomSourceTestSong(request.song)

        const result = await withTimeout(
            sourceModule.resolve({
                song: testSong,
                quality: normalizeText(request.quality, ''),
                request: requestFromCustomSource,
            }),
            CUSTOM_SOURCE_RESOLVE_TIMEOUT_MS,
            'custom-source-resolve-timeout'
        )
        const normalizedResult = normalizeCustomSourceResult(result, state.source)
        if (!normalizedResult?.url) {
            return { ok: false, message: '解析源未返回可用播放地址', state: getPublicState() }
        }

        return {
            ok: true,
            message: '解析源可用',
            result: normalizedResult,
            state: getPublicState(),
        }
    } catch (error) {
        return {
            ok: false,
            message: error?.message || '自定义解析源测试失败',
            state: getPublicState(),
        }
    }
}

function registerCustomSourceIpc({ ipcMain }) {
    ipcMain.removeHandler('custom-source:get-state')
    ipcMain.handle('custom-source:get-state', async () => getPublicState())

    ipcMain.removeHandler('custom-source:import')
    ipcMain.handle('custom-source:import', async () => {
        try {
            return await importCustomSource()
        } catch (error) {
            return { ok: false, message: error?.message || '导入自定义解析源失败', state: getPublicState() }
        }
    })

    ipcMain.removeHandler('custom-source:import-url')
    ipcMain.handle('custom-source:import-url', async (_event, url) => {
        try {
            return await importCustomSourceFromUrl(url)
        } catch (error) {
            return { ok: false, message: error?.message || '从链接导入自定义解析源失败', state: getPublicState() }
        }
    })

    ipcMain.removeHandler('custom-source:set-enabled')
    ipcMain.handle('custom-source:set-enabled', async (_event, enabled) => setCustomSourceEnabled(enabled === true))

    ipcMain.removeHandler('custom-source:remove')
    ipcMain.handle('custom-source:remove', async () => removeCustomSource())

    ipcMain.removeHandler('custom-source:test')
    ipcMain.handle('custom-source:test', async (_event, request) => testCustomSource(request))

    ipcMain.removeHandler('custom-source:resolve-music-url')
    ipcMain.handle('custom-source:resolve-music-url', async (_event, request) => {
        try {
            return await resolveCustomMusicUrl(request)
        } catch (error) {
            console.warn('自定义解析源解析失败:', error?.message || error)
            return null
        }
    })
}

module.exports = {
    registerCustomSourceIpc,
}
