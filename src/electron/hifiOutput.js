const fs = require('fs')
const os = require('os')
const net = require('net')
const path = require('path')
const zlib = require('zlib')
const { spawn, spawnSync } = require('child_process')

const MPV_EXECUTABLE = process.platform === 'win32' ? 'mpv.exe' : 'mpv'
const BUILTIN_MPV_VERSION = 'mpv-win64-v3-20260517-git-059bc70'
const BUILTIN_MPV_ARCHIVE = `${BUILTIN_MPV_VERSION}.zip`
const CONNECT_TIMEOUT_MS = 5000
const COMMAND_TIMEOUT_MS = 3000
const DEVICE_LIST_TIMEOUT_MS = 8000
const MPV_MODES = new Set(['shared', 'exclusive'])
const LEGACY_MPV_MODE_MAP = Object.freeze({
    auto: 'shared',
    'wasapi-shared': 'shared',
    'wasapi-exclusive': 'exclusive',
})
const ZIP_EOCD_SIGNATURE = 0x06054b50
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50

const moduleState = {
    initialized: false,
    app: null,
    getWindow: null,
    normalizeAllowedMediaPath: null,
    currentSession: null,
    sessionSeed: 0,
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function normalizeMode(value) {
    const mode = normalizeText(value)
    const migratedMode = LEGACY_MPV_MODE_MAP[mode] || mode
    return MPV_MODES.has(migratedMode) ? migratedMode : 'shared'
}

function normalizeVolume(value) {
    const volume = Number(value)
    if (!Number.isFinite(volume)) return 30
    return Math.max(0, Math.min(100, Math.round(volume * 100)))
}

function executableExists(filePath) {
    if (!filePath) return false
    try {
        return fs.statSync(filePath).isFile()
    } catch (_) {
        return false
    }
}

function directoryExists(directoryPath) {
    if (!directoryPath) return false
    try {
        return fs.statSync(directoryPath).isDirectory()
    } catch (_) {
        return false
    }
}

function uniquePaths(paths) {
    const seen = new Set()
    return paths.filter(candidate => {
        if (!candidate || seen.has(candidate)) return false
        seen.add(candidate)
        return true
    })
}

function getMpvResourceKeys(platform = process.platform, arch = process.arch) {
    const keys = []
    if (platform && arch) keys.push(`${platform}-${arch}`)
    if (platform) keys.push(platform)
    return Array.from(new Set(keys))
}

function findMpvExecutableInDirectory(directoryPath) {
    if (!directoryExists(directoryPath)) return ''

    const stack = [directoryPath]
    while (stack.length > 0) {
        const currentDirectory = stack.pop()
        let entries = []
        try {
            entries = fs.readdirSync(currentDirectory, { withFileTypes: true })
        } catch (_) {
            continue
        }

        for (const entry of entries) {
            const entryPath = path.join(currentDirectory, entry.name)
            if (entry.isDirectory()) {
                stack.push(entryPath)
                continue
            }
            const isExecutableName = entry.name === MPV_EXECUTABLE
                || (process.platform === 'linux' && entry.name.toLowerCase().endsWith('.appimage'))
            if (entry.isFile() && isExecutableName && executableExists(entryPath)) {
                return entryPath
            }
        }
    }

    return ''
}

function isSupportedMpvArchive(fileName) {
    const normalizedName = String(fileName || '').toLowerCase()
    return normalizedName.endsWith('.zip')
        || normalizedName.endsWith('.tar.gz')
        || normalizedName.endsWith('.tgz')
}

function findArchivesInDirectory(directoryPath) {
    if (!directoryExists(directoryPath)) return []

    try {
        return fs.readdirSync(directoryPath, { withFileTypes: true })
            .filter(entry => entry.isFile() && isSupportedMpvArchive(entry.name))
            .map(entry => path.join(directoryPath, entry.name))
    } catch (_) {
        return []
    }
}

function ensureExecutablePermission(filePath) {
    if (process.platform === 'win32' || !filePath) return
    try { fs.chmodSync(filePath, 0o755) } catch (_) {}
}

function findExecutableOnPath(executableName) {
    const pathEnv = process.env.PATH || ''
    const separator = process.platform === 'win32' ? ';' : ':'
    const candidates = pathEnv
        .split(separator)
        .map(segment => segment.trim())
        .filter(Boolean)
        .map(segment => path.join(segment, executableName))

    return candidates.find(executableExists) || ''
}

function getPackagedMpvResourceDirectories() {
    const candidates = []
    const resourceKeys = getMpvResourceKeys()
    const resourcesPath = process.resourcesPath

    if (resourcesPath) {
        resourceKeys.forEach(key => candidates.push(path.join(resourcesPath, 'mpv', key)))
    }

    return candidates
}

function getDevMpvResourceDirectories(app) {
    const candidates = []
    const resourceKeys = getMpvResourceKeys()
    const appendPlatformDirectories = baseDirectory => {
        resourceKeys.forEach(key => candidates.push(path.join(baseDirectory, key)))
    }

    try {
        const appPath = app?.getAppPath?.()
        if (appPath) appendPlatformDirectories(path.join(appPath, 'resources', 'mpv'))
    } catch (_) {}

    appendPlatformDirectories(path.resolve(process.cwd(), 'resources', 'mpv'))
    appendPlatformDirectories(path.resolve(process.cwd(), 'vendor', 'mpv'))
    return candidates
}

function getLegacyMpvResourceDirectories(app = moduleState.app) {
    const candidates = []
    const resourcesPath = process.resourcesPath
    if (resourcesPath) candidates.push(path.join(resourcesPath, 'mpv'))

    try {
        const appPath = app?.getAppPath?.()
        if (appPath) candidates.push(path.join(appPath, 'resources', 'mpv'))
    } catch (_) {}

    candidates.push(path.resolve(process.cwd(), 'resources', 'mpv'))
    candidates.push(path.resolve(process.cwd(), 'vendor', 'mpv'))
    return uniquePaths(candidates)
}

function getMpvResourceDirectories(app = moduleState.app) {
    return uniquePaths([
        ...getPackagedMpvResourceDirectories(),
        ...getDevMpvResourceDirectories(app),
    ])
}

function getBuiltinMpvCandidates(app) {
    const candidates = []
    const extractedPath = getExtractedBuiltinMpvPath(app)
    if (extractedPath) candidates.push(extractedPath)

    getMpvResourceDirectories(app).forEach(directoryPath => {
        candidates.push(path.join(directoryPath, MPV_EXECUTABLE))
        const nestedExecutable = findMpvExecutableInDirectory(directoryPath)
        if (nestedExecutable) candidates.push(nestedExecutable)
    })
    getLegacyMpvResourceDirectories(app).forEach(directoryPath => {
        candidates.push(path.join(directoryPath, MPV_EXECUTABLE))
    })
    return uniquePaths(candidates)
}

function getBuiltinMpvArchiveCandidates(app) {
    const candidates = []
    getMpvResourceDirectories(app).forEach(directoryPath => {
        candidates.push(path.join(directoryPath, BUILTIN_MPV_ARCHIVE))
        candidates.push(...findArchivesInDirectory(directoryPath))
    })
    getLegacyMpvResourceDirectories(app).forEach(directoryPath => {
        candidates.push(path.join(directoryPath, BUILTIN_MPV_ARCHIVE))
    })
    return uniquePaths(candidates)
}

function getBuiltinMpvArchivePath(app = moduleState.app) {
    return getBuiltinMpvArchiveCandidates(app).find(executableExists) || ''
}

function getExtractedBuiltinMpvPath(app = moduleState.app) {
    try {
        const userData = app?.getPath?.('userData')
        if (!userData) return ''
        const extractedRoot = path.join(userData, 'mpv')
        const resourceKeys = getMpvResourceKeys()
        const candidates = resourceKeys.map(key => path.join(extractedRoot, key))

        if (process.platform === 'win32') {
            candidates.push(path.join(extractedRoot, BUILTIN_MPV_VERSION))
        }

        return candidates.map(findMpvExecutableInDirectory).find(Boolean) || ''
    } catch (_) {
        return ''
    }
}

function getExtractedBuiltinMpvDirectory(archivePath, app = moduleState.app) {
    try {
        const userData = app?.getPath?.('userData')
        if (!userData || !archivePath) return ''
        const resourceKey = getMpvResourceKeys()[0] || process.platform || 'unknown'
        const archiveName = path.basename(archivePath, path.extname(archivePath)) || 'mpv'
        return path.join(userData, 'mpv', resourceKey, archiveName)
    } catch (_) {
        return ''
    }
}

function isPathInside(basePath, targetPath) {
    const relativePath = path.relative(path.resolve(basePath), path.resolve(targetPath))
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function findZipEndOfCentralDirectory(buffer) {
    const searchStart = Math.max(0, buffer.length - 65557)
    for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
        if (buffer.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) return offset
    }
    return -1
}

function extractZipArchiveSync(archivePath, destinationPath) {
    const archive = fs.readFileSync(archivePath)
    const eocdOffset = findZipEndOfCentralDirectory(archive)
    if (eocdOffset < 0) throw new Error('zip-eocd-not-found')

    const entryCount = archive.readUInt16LE(eocdOffset + 10)
    const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16)
    let cursor = centralDirectoryOffset

    fs.mkdirSync(destinationPath, { recursive: true })

    for (let i = 0; i < entryCount; i += 1) {
        if (archive.readUInt32LE(cursor) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
            throw new Error('zip-central-directory-invalid')
        }

        const compressionMethod = archive.readUInt16LE(cursor + 10)
        const compressedSize = archive.readUInt32LE(cursor + 20)
        const fileNameLength = archive.readUInt16LE(cursor + 28)
        const extraLength = archive.readUInt16LE(cursor + 30)
        const commentLength = archive.readUInt16LE(cursor + 32)
        const localHeaderOffset = archive.readUInt32LE(cursor + 42)
        const fileName = archive.toString('utf8', cursor + 46, cursor + 46 + fileNameLength).replace(/\\/g, '/')

        cursor += 46 + fileNameLength + extraLength + commentLength

        if (!fileName || fileName.endsWith('/')) continue

        const targetPath = path.resolve(destinationPath, fileName)
        if (!isPathInside(destinationPath, targetPath)) {
            throw new Error('zip-entry-outside-target')
        }

        if (archive.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_SIGNATURE) {
            throw new Error('zip-local-file-invalid')
        }

        const localNameLength = archive.readUInt16LE(localHeaderOffset + 26)
        const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28)
        const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength
        const compressedData = archive.slice(dataOffset, dataOffset + compressedSize)
        let fileData = null

        if (compressionMethod === 0) fileData = compressedData
        else if (compressionMethod === 8) fileData = zlib.inflateRawSync(compressedData)
        else throw new Error(`zip-compression-unsupported:${compressionMethod}`)

        fs.mkdirSync(path.dirname(targetPath), { recursive: true })
        fs.writeFileSync(targetPath, fileData)
    }
}

function extractTarArchiveSync(archivePath, destinationPath) {
    fs.mkdirSync(destinationPath, { recursive: true })
    const result = spawnSync('tar', ['-xzf', archivePath, '-C', destinationPath], {
        windowsHide: true,
        encoding: 'utf8',
    })
    if (result.error) throw result.error
    if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || 'tar-extract-failed').trim())
    }
}

function extractMpvArchiveSync(archivePath, destinationPath) {
    const normalizedArchivePath = String(archivePath || '').toLowerCase()
    if (normalizedArchivePath.endsWith('.zip')) {
        extractZipArchiveSync(archivePath, destinationPath)
        return
    }
    if (normalizedArchivePath.endsWith('.tar.gz') || normalizedArchivePath.endsWith('.tgz')) {
        extractTarArchiveSync(archivePath, destinationPath)
        return
    }
    throw new Error('mpv-archive-format-unsupported')
}

function ensureBuiltinMpvExtracted() {
    const extractedPath = getExtractedBuiltinMpvPath()
    if (executableExists(extractedPath)) {
        return { path: extractedPath, source: 'builtin' }
    }

    const archivePath = getBuiltinMpvArchivePath()
    const destinationPath = getExtractedBuiltinMpvDirectory(archivePath)
    if (!archivePath || !destinationPath) return null

    extractMpvArchiveSync(archivePath, destinationPath)
    const nextExtractedPath = findMpvExecutableInDirectory(destinationPath)
    if (!executableExists(nextExtractedPath)) throw new Error('builtin-mpv-extract-failed')
    ensureExecutablePermission(nextExtractedPath)
    return { path: nextExtractedPath, source: 'builtin' }
}

function getBuiltinMpvAvailability() {
    const extractedPath = getExtractedBuiltinMpvPath()
    if (executableExists(extractedPath)) {
        return { available: true, path: extractedPath, source: 'builtin' }
    }

    const archivePath = getBuiltinMpvArchivePath()
    if (archivePath) return { available: true, path: archivePath, source: 'builtin' }
    return { available: false, path: '', source: '' }
}

function resolveMpvExecutable(config = {}, options = {}) {
    const customPath = normalizeText(config.mpvPath)
    if (customPath && executableExists(customPath)) {
        return { path: path.resolve(customPath), source: 'custom' }
    }

    const envPath = normalizeText(process.env.HYDROGEN_MPV_PATH)
    if (envPath && executableExists(envPath)) {
        return { path: path.resolve(envPath), source: 'env' }
    }

    const builtinPath = getBuiltinMpvCandidates(moduleState.app).find(executableExists)
    if (builtinPath) {
        ensureExecutablePermission(builtinPath)
        return { path: path.resolve(builtinPath), source: 'builtin' }
    }

    if (options.extractBuiltin === true) {
        const extracted = ensureBuiltinMpvExtracted()
        if (extracted) return extracted
    } else {
        const builtinAvailability = getBuiltinMpvAvailability()
        if (builtinAvailability.available) {
            return {
                path: path.resolve(builtinAvailability.path),
                source: builtinAvailability.source,
                needsExtract: !builtinAvailability.path.endsWith(MPV_EXECUTABLE),
            }
        }
    }

    const pathMpv = findExecutableOnPath(MPV_EXECUTABLE)
    if (pathMpv) {
        return { path: path.resolve(pathMpv), source: 'path' }
    }

    return null
}

function getPlatformAudioBackend(platform = process.platform) {
    if (platform === 'win32') {
        return { id: 'wasapi', label: 'WASAPI', ao: 'wasapi', supportsExclusive: true }
    }
    if (platform === 'darwin') {
        return { id: 'coreaudio', label: 'CoreAudio', ao: 'coreaudio', supportsExclusive: true }
    }
    if (platform === 'linux') {
        return { id: 'pipewire', label: 'PipeWire', ao: 'pipewire', supportsExclusive: true }
    }
    return { id: 'default', label: '系统默认', ao: '', supportsExclusive: false }
}

function buildPlatformAudioArgs(mode, options = {}) {
    const normalizedMode = normalizeMode(mode)
    const backend = getPlatformAudioBackend()
    const args = []

    if (backend.ao) args.push(`--ao=${backend.ao}`)
    if (backend.supportsExclusive) {
        args.push(`--audio-exclusive=${normalizedMode === 'exclusive' ? 'yes' : 'no'}`)
    }
    if (options.includeBuffer !== false) {
        args.push(`--audio-buffer=${normalizedMode === 'exclusive' ? '0.5' : '0.1'}`)
    }

    return args
}

function isAppImagePath(filePath) {
    return process.platform === 'linux' && String(filePath || '').toLowerCase().endsWith('.appimage')
}

function buildMpvSpawnOptions(resolvedMpv, options = {}) {
    const spawnOptions = {
        windowsHide: true,
        stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    }

    if (isAppImagePath(resolvedMpv?.path)) {
        spawnOptions.env = {
            ...process.env,
            APPIMAGE_EXTRACT_AND_RUN: '1',
        }
    }

    return spawnOptions
}

function getPublicState(config = {}) {
    const resolved = resolveMpvExecutable(config)
    const audioBackend = getPlatformAudioBackend()
    return {
        backend: 'mpv',
        available: !!resolved,
        mpvPath: resolved?.path || '',
        source: resolved?.source || '',
        platform: process.platform,
        audioBackend: audioBackend.id,
        audioBackendLabel: audioBackend.label,
        supportsExclusive: audioBackend.supportsExclusive,
        supportsWasapiExclusive: process.platform === 'win32',
    }
}

function createIpcPath(sessionId) {
    const token = `${process.pid}-${sessionId}-${Date.now()}`
    if (process.platform === 'win32') return `\\\\.\\pipe\\hydrogen-music-mpv-${token}`
    return path.join(os.tmpdir(), `hydrogen-music-mpv-${token}.sock`)
}

function buildMpvArgs(filePath, ipcPath, config = {}) {
    const mode = normalizeMode(config.mode)
    const device = normalizeText(config.audioDevice)
    const args = [
        '--no-config',
        '--idle=no',
        '--terminal=no',
        '--force-window=no',
        '--vid=no',
        '--audio-display=no',
        '--keep-open=no',
        '--gapless-audio=no',
        '--resume-playback=no',
        '--save-position-on-quit=no',
        '--speed=1',
        '--audio-pitch-correction=yes',
        '--video-sync=audio',
        '--autosync=0',
        '--audio-delay=0',
        '--hr-seek=yes',
        `--input-ipc-server=${ipcPath}`,
        `--volume=${normalizeVolume(config.volume)}`,
        '--pause=yes',
    ]

    args.push(...buildPlatformAudioArgs(mode))

    if (device && device !== 'auto') args.push(`--audio-device=${device}`)
    args.push(filePath)
    return args
}

function sendToRenderer(payload) {
    const win = moduleState.getWindow?.()
    if (!win || win.isDestroyed?.()) return
    if (!win.webContents || win.webContents.isDestroyed?.()) return
    win.webContents.send('hifi-output:event', payload)
}

function emitSessionEvent(session, payload) {
    if (!session) return
    sendToRenderer({
        sessionId: session.id,
        backend: 'mpv',
        ...payload,
        state: {
            ...session.state,
            ...(payload.state && typeof payload.state === 'object' ? payload.state : {}),
        },
    })
}

function appendLog(session, text) {
    const value = normalizeText(text)
    if (!value) return
    session.logs.push(value)
    if (session.logs.length > 20) session.logs.shift()
}

function rejectPendingCommands(session, error) {
    session.pendingCommands.forEach(pending => {
        clearTimeout(pending.timer)
        pending.reject(error)
    })
    session.pendingCommands.clear()
}

function cleanupSession(session, options = {}) {
    if (!session) return
    if (session.cleanupStarted) return
    session.cleanupStarted = true

    rejectPendingCommands(session, new Error('mpv-session-closed'))

    if (session.socket) {
        try { session.socket.destroy() } catch (_) {}
        session.socket = null
    }

    if (process.platform !== 'win32' && session.ipcPath) {
        try { fs.unlinkSync(session.ipcPath) } catch (_) {}
    }

    const shouldKill = options.kill !== false
    if (shouldKill && session.process && !session.process.killed && !session.exited) {
        try { session.process.kill() } catch (_) {}
    }
}

function stopActiveSession(options = {}) {
    const session = moduleState.currentSession
    if (!session) return Promise.resolve({ ok: true })
    moduleState.currentSession = null

    const quitPromise = session.socket && !session.socket.destroyed
        ? sendMpvCommand(session, ['quit']).catch(() => null)
        : Promise.resolve(null)

    return quitPromise.finally(() => {
        setTimeout(() => cleanupSession(session, options), 120)
    }).then(() => ({ ok: true }))
}

function sendMpvCommand(session, command) {
    if (!session || !session.socket || session.socket.destroyed) {
        return Promise.reject(new Error('mpv-ipc-not-connected'))
    }

    session.requestId += 1
    const requestId = session.requestId
    const payload = `${JSON.stringify({ command, request_id: requestId })}\n`

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            session.pendingCommands.delete(requestId)
            reject(new Error('mpv-command-timeout'))
        }, COMMAND_TIMEOUT_MS)

        session.pendingCommands.set(requestId, { resolve, reject, timer })
        session.socket.write(payload, error => {
            if (!error) return
            clearTimeout(timer)
            session.pendingCommands.delete(requestId)
            reject(error)
        })
    })
}

function handleCommandResponse(session, message) {
    if (!message || !message.request_id) return false
    const pending = session.pendingCommands.get(message.request_id)
    if (!pending) return true

    clearTimeout(pending.timer)
    session.pendingCommands.delete(message.request_id)
    if (message.error && message.error !== 'success') {
        const error = new Error(message.error)
        error.response = message
        pending.reject(error)
        return true
    }

    pending.resolve(message)
    return true
}

function setSessionPosition(session, value) {
    const position = Number(value)
    if (!Number.isFinite(position) || position < 0) return
    session.state.position = position
    emitSessionEvent(session, { type: 'state' })
}

function setSessionDuration(session, value) {
    const duration = Number(value)
    if (!Number.isFinite(duration) || duration <= 0) return
    session.state.duration = duration
    emitSessionEvent(session, { type: 'duration' })
}

function setSessionPaused(session, value) {
    const paused = value === true
    if (paused && session.suppressNextSeekPauseEvent) {
        session.suppressNextSeekPauseEvent = false
        return
    }
    if (session.state.paused === paused && session.state.loaded) return
    session.state.paused = paused
    emitSessionEvent(session, { type: paused ? 'pause' : 'play' })
}

function handlePropertyChange(session, message) {
    if (!message || message.event !== 'property-change') return false
    if (message.name === 'time-pos') setSessionPosition(session, message.data)
    else if (message.name === 'duration') setSessionDuration(session, message.data)
    else if (message.name === 'pause') setSessionPaused(session, message.data)
    else if (message.name === 'volume') {
        const volume = Number(message.data)
        if (Number.isFinite(volume)) session.state.volume = Math.max(0, Math.min(100, volume))
        emitSessionEvent(session, { type: 'state' })
    }
    return true
}

function handleMpvEvent(session, message) {
    if (handleCommandResponse(session, message)) return
    if (handlePropertyChange(session, message)) return

    if (message.event === 'file-loaded') {
        session.state.loaded = true
        session.state.paused = true
        emitSessionEvent(session, { type: 'load' })
        return
    }

    if (message.event === 'end-file') {
        if (message.reason === 'eof') {
            session.state.position = session.state.duration || session.state.position || 0
            emitSessionEvent(session, { type: 'end' })
        } else if (message.reason === 'error') {
            emitSessionEvent(session, { type: 'error', message: 'mpv-playback-error' })
        }
    }
}

function attachSocket(session, socket) {
    session.socket = socket
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
        session.buffer += chunk
        let newlineIndex = session.buffer.indexOf('\n')
        while (newlineIndex >= 0) {
            const line = session.buffer.slice(0, newlineIndex).trim()
            session.buffer = session.buffer.slice(newlineIndex + 1)
            newlineIndex = session.buffer.indexOf('\n')
            if (!line) continue
            try {
                handleMpvEvent(session, JSON.parse(line))
            } catch (error) {
                appendLog(session, error.message)
            }
        }
    })
    socket.on('error', error => {
        appendLog(session, error.message)
        emitSessionEvent(session, { type: 'error', message: error.message })
    })
    socket.on('close', () => {
        if (moduleState.currentSession === session) {
            emitSessionEvent(session, { type: 'exit' })
        }
    })
}

function connectToMpv(session) {
    const startedAt = Date.now()

    return new Promise((resolve, reject) => {
        const tryConnect = () => {
            if (session.exited) {
                reject(new Error(session.logs.slice(-1)[0] || 'mpv-exited-before-ipc-ready'))
                return
            }
            if (Date.now() - startedAt > CONNECT_TIMEOUT_MS) {
                reject(new Error(session.logs.slice(-1)[0] || 'mpv-ipc-timeout'))
                return
            }

            const socket = net.createConnection(session.ipcPath)
            socket.once('connect', () => {
                attachSocket(session, socket)
                resolve(socket)
            })
            socket.once('error', () => {
                try { socket.destroy() } catch (_) {}
                setTimeout(tryConnect, 80)
            })
        }

        tryConnect()
    })
}

async function observePlaybackProperties(session) {
    await sendMpvCommand(session, ['observe_property', 1, 'time-pos']).catch(() => null)
    await sendMpvCommand(session, ['observe_property', 2, 'duration']).catch(() => null)
    await sendMpvCommand(session, ['observe_property', 3, 'pause']).catch(() => null)
    await sendMpvCommand(session, ['observe_property', 4, 'volume']).catch(() => null)

    const duration = await sendMpvCommand(session, ['get_property', 'duration']).catch(() => null)
    if (duration && Number.isFinite(Number(duration.data))) {
        session.state.duration = Number(duration.data)
    }
    session.state.loaded = true
}

async function startMpvSession(request = {}) {
    const normalizeAllowedMediaPath = moduleState.normalizeAllowedMediaPath
    const localPath = normalizeAllowedMediaPath?.(request.filePath)
    const playbackSource = localPath
    if (!playbackSource) {
        return { ok: false, code: 'invalid-local-playback-source', message: 'HiFi 输出仅支持本地音乐文件' }
    }

    let resolvedMpv = null
    try {
        resolvedMpv = resolveMpvExecutable(request, { extractBuiltin: true })
    } catch (error) {
        return { ok: false, code: 'mpv-extract-failed', message: error?.message || '内置 MPV 解压失败' }
    }
    if (!resolvedMpv) {
        return { ok: false, code: 'mpv-not-found', message: '未找到 MPV 后端' }
    }

    await stopActiveSession()

    const sessionId = ++moduleState.sessionSeed
    const ipcPath = createIpcPath(sessionId)
    const args = buildMpvArgs(playbackSource, ipcPath, request)
    const child = spawn(resolvedMpv.path, args, buildMpvSpawnOptions(resolvedMpv))

    const session = {
        id: sessionId,
        process: child,
        ipcPath,
        socket: null,
        requestId: 0,
        pendingCommands: new Map(),
        buffer: '',
        logs: [],
        exited: false,
        cleanupStarted: false,
        outputMode: normalizeMode(request.mode),
        sourceType: 'local',
        suppressNextSeekPauseEvent: false,
        state: {
            loaded: false,
            paused: true,
            position: 0,
            duration: 0,
            volume: normalizeVolume(request.volume),
        },
    }
    moduleState.currentSession = session

    child.stdout?.on('data', data => appendLog(session, data.toString()))
    child.stderr?.on('data', data => appendLog(session, data.toString()))
    child.on('error', error => {
        appendLog(session, error.message)
        emitSessionEvent(session, { type: 'error', message: error.message })
    })
    child.on('exit', (code, signal) => {
        session.exited = true
        cleanupSession(session, { kill: false })
        if (moduleState.currentSession === session) {
            moduleState.currentSession = null
            emitSessionEvent(session, { type: 'exit', code, signal })
        }
    })

    try {
        await connectToMpv(session)
        await observePlaybackProperties(session)
        return {
            ok: true,
            sessionId,
            backend: 'mpv',
            mpvPath: resolvedMpv.path,
            source: resolvedMpv.source,
            state: session.state,
        }
    } catch (error) {
        if (moduleState.currentSession === session) moduleState.currentSession = null
        cleanupSession(session)
        return {
            ok: false,
            code: 'mpv-start-failed',
            message: error?.message || 'MPV 启动失败',
            logs: session.logs.slice(-5),
        }
    }
}

function getActiveSession(sessionId) {
    const session = moduleState.currentSession
    if (!session) return null
    if (sessionId && session.id !== sessionId) return null
    return session
}

async function controlActiveSession(sessionId, command) {
    const session = getActiveSession(sessionId)
    if (!session) return { ok: false, code: 'session-not-found' }
    await sendMpvCommand(session, command)
    return { ok: true, state: session.state }
}

async function seekActiveSession(sessionId, position) {
    const session = getActiveSession(sessionId)
    if (!session) return { ok: false, code: 'session-not-found' }

    if (session.outputMode !== 'exclusive') {
        await sendMpvCommand(session, ['seek', position, 'absolute+exact'])
        return { ok: true, state: session.state }
    }

    const shouldResume = session.state.paused !== true
    try {
        if (shouldResume) {
            session.suppressNextSeekPauseEvent = true
            await sendMpvCommand(session, ['set_property', 'pause', true])
        }

        await sendMpvCommand(session, ['drop-buffers']).catch(() => null)
        await sendMpvCommand(session, ['seek', position, 'absolute'])
        session.state.position = position
        emitSessionEvent(session, { type: 'state' })
        await sendMpvCommand(session, ['drop-buffers']).catch(() => null)
        await sendMpvCommand(session, ['ao-reload']).catch(() => null)
    } finally {
        if (shouldResume && !session.exited) {
            await sendMpvCommand(session, ['set_property', 'pause', false]).catch(() => null)
            setTimeout(() => {
                if (session.suppressNextSeekPauseEvent) session.suppressNextSeekPauseEvent = false
            }, 300)
        }
    }

    return { ok: true, state: session.state }
}

function parseAudioDevices(output) {
    const devices = []
    const seen = new Set()
    String(output || '').split(/\r?\n/).forEach(line => {
        const match = line.match(/^\s*'([^']+)'\s+\((.+)\)\s*$/)
        if (!match) return
        const value = match[1]
        if (!value || seen.has(value)) return
        seen.add(value)
        devices.push({
            value,
            label: match[2] || value,
        })
    })
    return devices
}

function listMpvAudioDevices(config = {}) {
    let resolvedMpv = null
    try {
        resolvedMpv = resolveMpvExecutable(config, { extractBuiltin: true })
    } catch (error) {
        return Promise.resolve({ ok: false, code: 'mpv-extract-failed', message: error?.message || '内置 MPV 解压失败', devices: [] })
    }
    if (!resolvedMpv) {
        return Promise.resolve({ ok: false, code: 'mpv-not-found', devices: [] })
    }

    return new Promise(resolve => {
        const child = spawn(resolvedMpv.path, [
            '--no-config',
            ...buildPlatformAudioArgs(config.mode, { includeBuffer: false }),
            '--audio-device=help',
        ], buildMpvSpawnOptions(resolvedMpv))
        let output = ''
        let finished = false
        const finish = result => {
            if (finished) return
            finished = true
            clearTimeout(timer)
            resolve(result)
        }
        const timer = setTimeout(() => {
            try { child.kill() } catch (_) {}
            finish({ ok: false, code: 'device-list-timeout', devices: parseAudioDevices(output) })
        }, DEVICE_LIST_TIMEOUT_MS)

        child.stdout?.on('data', data => { output += data.toString() })
        child.stderr?.on('data', data => { output += data.toString() })
        child.on('error', error => {
            finish({ ok: false, code: 'mpv-device-list-failed', message: error.message, devices: [] })
        })
        child.on('exit', () => {
            finish({
                ok: true,
                backend: 'mpv',
                mpvPath: resolvedMpv.path,
                source: resolvedMpv.source,
                devices: parseAudioDevices(output),
            })
        })
    })
}

function registerHifiOutputIpc(options = {}) {
    if (moduleState.initialized) return
    moduleState.initialized = true
    moduleState.app = options.app || null
    moduleState.getWindow = typeof options.getWindow === 'function' ? options.getWindow : () => options.win
    moduleState.normalizeAllowedMediaPath = options.normalizeAllowedMediaPath

    const ipcMain = options.ipcMain
    const dialog = options.dialog
    if (!ipcMain) return

    ipcMain.removeHandler('hifi-output:get-state')
    ipcMain.handle('hifi-output:get-state', async (_event, config = {}) => getPublicState(config))

    ipcMain.removeHandler('hifi-output:list-devices')
    ipcMain.handle('hifi-output:list-devices', async (_event, config = {}) => listMpvAudioDevices(config))

    ipcMain.removeHandler('hifi-output:start')
    ipcMain.handle('hifi-output:start', async (_event, request = {}) => startMpvSession(request))

    ipcMain.removeHandler('hifi-output:set-paused')
    ipcMain.handle('hifi-output:set-paused', async (_event, request = {}) => {
        return controlActiveSession(request.sessionId, ['set_property', 'pause', request.paused === true])
    })

    ipcMain.removeHandler('hifi-output:seek')
    ipcMain.handle('hifi-output:seek', async (_event, request = {}) => {
        const position = Math.max(0, Number(request.position) || 0)
        return seekActiveSession(request.sessionId, position)
    })

    ipcMain.removeHandler('hifi-output:set-volume')
    ipcMain.handle('hifi-output:set-volume', async (_event, request = {}) => {
        return controlActiveSession(request.sessionId, ['set_property', 'volume', normalizeVolume(request.volume)])
    })

    ipcMain.removeHandler('hifi-output:set-loop')
    ipcMain.handle('hifi-output:set-loop', async (_event, request = {}) => {
        return controlActiveSession(request.sessionId, ['set_property', 'loop-file', request.loop ? 'inf' : 'no'])
    })

    ipcMain.removeHandler('hifi-output:stop')
    ipcMain.handle('hifi-output:stop', async (_event, request = {}) => {
        const session = getActiveSession(request.sessionId)
        if (!session) return { ok: true }
        return stopActiveSession()
    })

    ipcMain.removeHandler('hifi-output:select-mpv')
    ipcMain.handle('hifi-output:select-mpv', async () => {
        if (!dialog) return null
        const filters = process.platform === 'win32'
            ? [{ name: 'MPV', extensions: ['exe'] }]
            : [{ name: 'MPV', extensions: ['*'] }]
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters,
        })
        if (canceled) return null
        return filePaths?.[0] || null
    })

    options.app?.on?.('before-quit', () => {
        void stopActiveSession()
    })
}

module.exports = {
    registerHifiOutputIpc,
}
