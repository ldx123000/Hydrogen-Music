const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const { parseFile } = require('music-metadata')
const { nanoid } = require('nanoid')
const { decodeLyricBuffer } = require('./localLyrics')

const MUSIC_TYPES = new Set([
    '.aiff', '.aac', '.ape', '.asf', '.bwf', '.dsdiff', '.dsf', '.flac',
    '.mp2', '.matroska', '.mp3', '.mpc', '.mpeg4', '.ogg', '.opus', '.speex',
    '.theora', '.vorbis', '.wav', '.webm', '.wv', '.wma', '.m4a',
])
const METADATA_PARSE_CONCURRENCY = 4
const PROGRESS_BATCH_SIZE = 25
const PROGRESS_BATCH_INTERVAL_MS = 100

function createLimiter(limit) {
    let activeCount = 0
    const queue = []

    const next = () => {
        if (activeCount >= limit || queue.length === 0) return
        activeCount += 1
        const task = queue.shift()
        task()
    }

    return (fn) => new Promise((resolve, reject) => {
        queue.push(async () => {
            try {
                resolve(await fn())
            } catch (error) {
                reject(error)
            } finally {
                activeCount -= 1
                next()
            }
        })
        next()
    })
}

function createFolderNode(name, dirPath) {
    return {
        name,
        children: [],
        type: 'folder',
        dirPath,
    }
}

function createProgressReporter(win) {
    let count = 0
    let lastEmittedCount = 0
    let lastEmitAt = 0
    let emitTimer = null

    const emitProgress = () => {
        if (emitTimer) {
            clearTimeout(emitTimer)
            emitTimer = null
        }
        if (count === lastEmittedCount) return
        if (!win || !win.webContents || win.webContents.isDestroyed()) return
        lastEmittedCount = count
        lastEmitAt = Date.now()
        win.webContents.send('local-music-count', count)
    }

    const scheduleEmit = () => {
        if (emitTimer) return
        const elapsed = Date.now() - lastEmitAt
        const delay = Math.max(0, PROGRESS_BATCH_INTERVAL_MS - elapsed)
        emitTimer = setTimeout(() => {
            emitTimer = null
            emitProgress()
        }, delay)
    }

    return {
        increment() {
            count += 1
            if (count - lastEmittedCount >= PROGRESS_BATCH_SIZE || Date.now() - lastEmitAt >= PROGRESS_BATCH_INTERVAL_MS) {
                emitProgress()
                return
            }
            scheduleEmit()
        },
        flush() {
            emitProgress()
        },
        getCount() {
            return count
        },
    }
}

async function pathExists(targetPath) {
    try {
        await fsp.access(targetPath, fs.constants.F_OK)
        return true
    } catch (_) {
        return false
    }
}

async function enrichMetadataFromSidecars(filePath, metadata) {
    const parsedPath = path.parse(filePath)
    const metaPath = path.join(parsedPath.dir, parsedPath.name + '.json')
    if (await pathExists(metaPath)) {
        try {
            const metaRaw = await fsp.readFile(metaPath, 'utf8')
            const meta = JSON.parse(metaRaw)
            if ((!metadata.common.title || metadata.common.title.trim() === '') && meta?.name) {
                metadata.common.title = meta.name
            }
            if ((!metadata.common.artists || metadata.common.artists.length === 0) && Array.isArray(meta?.artists)) {
                metadata.common.artists = meta.artists
            }
            if ((!metadata.common.album || metadata.common.album.trim() === '') && meta?.album) {
                metadata.common.album = meta.album
            }
        } catch (_) {}
    }

    const lrcPath = path.join(parsedPath.dir, parsedPath.name + '.lrc')
    if (!(await pathExists(lrcPath))) return

    try {
        const lrcBuffer = await fsp.readFile(lrcPath)
        const lrcText = decodeLyricBuffer(lrcBuffer)
        if (!lrcText) return
        const lines = lrcText.split(/\r?\n/)
        for (let i = 0; i < Math.min(lines.length, 50); i++) {
            const line = lines[i]
            const matched = line.match(/^\[(ar|ti|al):([^\]]*)\]/i)
            if (!matched) continue

            const key = matched[1].toLowerCase()
            const value = (matched[2] || '').trim()
            if (key === 'ar' && (!metadata.common.artists || metadata.common.artists.length === 0)) {
                const artists = value.split(/[，,\/|]/).map(item => item.trim()).filter(Boolean)
                if (artists.length > 0) metadata.common.artists = artists
            } else if (key === 'ti' && (!metadata.common.title || metadata.common.title.trim() === '')) {
                metadata.common.title = value
            } else if (key === 'al' && (!metadata.common.album || metadata.common.album.trim() === '')) {
                metadata.common.album = value
            }
        }
    } catch (_) {}
}

async function createMusicFileNode(filePath, fileName, progressReporter, parseWithLimit) {
    const ext = path.extname(filePath).toLowerCase()
    if (!MUSIC_TYPES.has(ext)) return null

    const baseNode = {
        id: nanoid(),
        name: fileName,
        dirPath: filePath,
    }

    try {
        const metadata = await parseWithLimit(() => parseFile(filePath))
        await enrichMetadataFromSidecars(filePath, metadata)

        baseNode.common = {
            localTitle: path.basename(filePath, ext),
            fileUrl: filePath,
            title: metadata.common.title,
            artists: metadata.common.artists,
            album: metadata.common.album,
            albumartist: metadata.common.albumartist,
            date: metadata.common.date,
            genre: metadata.common.genre,
            year: metadata.common.year,
        }
        baseNode.format = {
            bitrate: metadata.format.bitrate,
            bitsPerSample: metadata.format.bitsPerSample,
            container: metadata.format.container,
            duration: metadata.format.duration,
            sampleRate: metadata.format.sampleRate,
        }
    } catch (parseError) {
        console.warn('解析音乐文件失败:', filePath, parseError)
        baseNode.common = {
            localTitle: path.basename(filePath, ext),
            fileUrl: filePath,
            title: path.basename(filePath, ext),
            artists: [],
            album: '',
            albumartist: '',
            date: '',
            genre: '',
            year: '',
        }
        baseNode.format = {
            bitrate: 0,
            bitsPerSample: 0,
            container: ext.substring(1),
            duration: 0,
            sampleRate: 0,
        }
    }

    progressReporter.increment()
    return baseNode
}

async function scanDirectory(dirPath, displayName, progressReporter, parseWithLimit) {
    const dirTreeNode = createFolderNode(displayName, dirPath)
    const metadataNode = createFolderNode(displayName, dirPath)

    let entries = []
    try {
        entries = await fsp.readdir(dirPath, { withFileTypes: true })
    } catch (error) {
        console.error('读取目录失败:', dirPath, error)
        return { dirTree: dirTreeNode, metadata: metadataNode }
    }

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const targetPath = path.join(dirPath, entry.name)

        try {
            if (entry.isDirectory()) {
                const childResult = await scanDirectory(targetPath, entry.name, progressReporter, parseWithLimit)
                dirTreeNode.children.push(childResult.dirTree)
                metadataNode.children.push(childResult.metadata)
                continue
            }

            if (!entry.isFile()) continue
            const musicNode = await createMusicFileNode(targetPath, entry.name, progressReporter, parseWithLimit)
            if (musicNode) metadataNode.children.push(musicNode)
        } catch (error) {
            console.warn('处理文件失败:', targetPath, error)
        }
    }

    return {
        dirTree: dirTreeNode,
        metadata: metadataNode,
    }
}

module.exports = async function scanLocalMusicTree(baseDir, win) {
    const resolvedPath = path.isAbsolute(baseDir) ? path.normalize(baseDir) : path.resolve(__dirname, baseDir)
    if (!(await pathExists(resolvedPath))) {
        console.error('路径不存在:', resolvedPath)
        return {
            dirTree: createFolderNode(baseDir, resolvedPath),
            metadata: createFolderNode(baseDir, resolvedPath),
            count: 0,
        }
    }

    const progressReporter = createProgressReporter(win)
    const parseWithLimit = createLimiter(METADATA_PARSE_CONCURRENCY)
    const result = await scanDirectory(resolvedPath, baseDir, progressReporter, parseWithLimit)
    progressReporter.flush()

    return {
        dirTree: result.dirTree,
        metadata: result.metadata,
        count: progressReporter.getCount(),
    }
}
