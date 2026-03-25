const fs = require('fs')
const path = require('path')
const iconv = require('iconv-lite')
const { parseFile } = require('music-metadata')

const regTimeTag = /\[\d{1,3}\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*\d{1,2}(?:\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*\d{1,3})?\]/m
const sidecarExtPriority = Object.freeze({
    '.lrc': 0,
    '.txt': 1,
})
const wantedLyricTagIds = new Set([
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
    '----:com.apple.itunes:lyrics',
])

function hasTimedLyricText(text) {
    return typeof text === 'string' && regTimeTag.test(text)
}

function normalizeLyricText(text) {
    if (typeof text !== 'string') return ''

    const normalizedLines = text
        .replace(/\r\n?/g, '\n')
        .replace(/^\uFEFF/, '')
        .split('\n')
        .map(line => line.replace(/\u0000/g, '').trim())
        .filter(Boolean)

    return normalizedLines.join('\n').trim()
}

function formatLrcTimestamp(timeMs) {
    const normalized = Math.max(0, Math.round(Number(timeMs) || 0))
    const minutes = Math.floor(normalized / 60000)
    const seconds = Math.floor((normalized % 60000) / 1000)
    const milliseconds = normalized % 1000

    return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}]`
}

function decodeUtf16BeBuffer(buffer) {
    const source = Buffer.from(buffer)
    const evenLength = source.length - (source.length % 2)
    const swapped = Buffer.allocUnsafe(evenLength)

    for (let index = 0; index < evenLength; index += 2) {
        swapped[index] = source[index + 1]
        swapped[index + 1] = source[index]
    }

    return swapped.toString('utf16le')
}

function detectUtf16WithoutBom(buffer) {
    const evenLength = Math.min(buffer.length - (buffer.length % 2), 256)
    if (evenLength < 4) return null

    let evenNulls = 0
    let oddNulls = 0
    const pairs = evenLength / 2

    for (let index = 0; index < evenLength; index += 2) {
        if (buffer[index] === 0x00) evenNulls += 1
        if (buffer[index + 1] === 0x00) oddNulls += 1
    }

    const evenRatio = evenNulls / pairs
    const oddRatio = oddNulls / pairs

    if (oddRatio >= 0.35 && evenRatio <= 0.1) return 'utf16le'
    if (evenRatio >= 0.35 && oddRatio <= 0.1) return 'utf16be'

    return null
}

function isValidUtf8Buffer(buffer) {
    try {
        return Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer)
    } catch (_) {
        return false
    }
}

function decodeLyricBuffer(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return ''

    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        return normalizeLyricText(buffer.subarray(3).toString('utf8'))
    }

    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
        return normalizeLyricText(buffer.subarray(2).toString('utf16le'))
    }

    if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
        return normalizeLyricText(decodeUtf16BeBuffer(buffer.subarray(2)))
    }

    const guessedUtf16 = detectUtf16WithoutBom(buffer)
    if (guessedUtf16 === 'utf16le') return normalizeLyricText(buffer.toString('utf16le'))
    if (guessedUtf16 === 'utf16be') return normalizeLyricText(decodeUtf16BeBuffer(buffer))

    if (isValidUtf8Buffer(buffer)) {
        return normalizeLyricText(buffer.toString('utf8'))
    }

    return normalizeLyricText(iconv.decode(buffer, 'gb18030'))
}

function convertSyncTextToLrc(syncLyric) {
    if (!syncLyric || !Array.isArray(syncLyric.syncText)) return ''

    const lines = syncLyric.syncText
        .map(entry => {
            if (!entry || typeof entry !== 'object') return null

            const lyricText = normalizeLyricText(String(entry.text || ''))
            const rawTime = entry.timestamp ?? entry.timeStamp
            const timeMs = Number(rawTime)

            if (!lyricText || !Number.isFinite(timeMs)) return null
            return {
                text: lyricText,
                timeMs,
            }
        })
        .filter(Boolean)
        .sort((left, right) => left.timeMs - right.timeMs)
        .map(entry => `${formatLrcTimestamp(entry.timeMs)}${entry.text}`)

    return normalizeLyricText(lines.join('\n'))
}

function normalizeLyricCandidates(rawValue) {
    const normalized = []

    const visit = value => {
        if (!value) return

        if (Array.isArray(value)) {
            value.forEach(visit)
            return
        }

        if (Buffer.isBuffer(value)) {
            const text = decodeLyricBuffer(value)
            if (text) normalized.push(text)
            return
        }

        if (typeof value === 'string') {
            const text = normalizeLyricText(value)
            if (text) normalized.push(text)
            return
        }

        if (typeof value !== 'object') return

        if (value.lrc && typeof value.lrc === 'object' && typeof value.lrc.lyric === 'string') {
            const text = normalizeLyricText(value.lrc.lyric)
            if (text) normalized.push(text)
        }

        if (typeof value.lyric === 'string') {
            const text = normalizeLyricText(value.lyric)
            if (text) normalized.push(text)
        }

        if (typeof value.text === 'string') {
            const text = normalizeLyricText(value.text)
            if (text) normalized.push(text)
        }

        if (Array.isArray(value.syncText)) {
            const lrcText = convertSyncTextToLrc(value)
            if (lrcText) normalized.push(lrcText)
        }
    }

    visit(rawValue)
    return normalized
}

function getCandidatePriority(candidate) {
    const sourcePriority = candidate.sourceKind === 'sidecar'
        ? (candidate.timed ? 0 : 2)
        : (candidate.timed ? 1 : 3)

    const extPriority = candidate.sourceKind === 'sidecar'
        ? (sidecarExtPriority[candidate.extension] ?? 9)
        : 0

    return [sourcePriority, extPriority, candidate.order]
}

function compareCandidatePriority(left, right) {
    const leftPriority = getCandidatePriority(left)
    const rightPriority = getCandidatePriority(right)

    for (let index = 0; index < leftPriority.length; index++) {
        if (leftPriority[index] === rightPriority[index]) continue
        return leftPriority[index] - rightPriority[index]
    }

    return 0
}

function selectBestLyricCandidate(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null
    return [...candidates].sort(compareCandidatePriority)[0] || null
}

function shouldReadLyricTag(tagId) {
    if (!tagId) return false
    return tagId.includes('lyric') || tagId.includes('lrc') || wantedLyricTagIds.has(tagId)
}

async function findSidecarLyricFiles(filePath, options = {}) {
    const readdir = typeof options.readdir === 'function'
        ? options.readdir
        : fs.promises.readdir.bind(fs.promises)
    const parsedPath = path.parse(filePath)
    const baseName = parsedPath.name.toLowerCase()

    let entries = []
    try {
        entries = await readdir(parsedPath.dir, { withFileTypes: true })
    } catch (_) {
        try {
            entries = await readdir(parsedPath.dir)
        } catch (_) {
            return []
        }
    }

    return entries
        .map(entry => {
            if (typeof entry === 'string') return { name: entry, isFile: () => true }
            return entry
        })
        .filter(entry => entry && typeof entry.name === 'string' && typeof entry.isFile === 'function' && entry.isFile())
        .map(entry => {
            const sidecarPath = path.join(parsedPath.dir, entry.name)
            const parsedEntry = path.parse(entry.name)
            return {
                name: entry.name,
                path: sidecarPath,
                extension: parsedEntry.ext.toLowerCase(),
                basename: parsedEntry.name.toLowerCase(),
            }
        })
        .filter(entry => entry.basename === baseName && Object.prototype.hasOwnProperty.call(sidecarExtPriority, entry.extension))
        .sort((left, right) => {
            const leftPriority = sidecarExtPriority[left.extension] ?? 9
            const rightPriority = sidecarExtPriority[right.extension] ?? 9
            if (leftPriority !== rightPriority) return leftPriority - rightPriority
            return left.name.localeCompare(right.name)
        })
}

async function collectSidecarLyricCandidates(filePath, options = {}) {
    const readFile = typeof options.readFile === 'function'
        ? options.readFile
        : fs.promises.readFile.bind(fs.promises)
    const sidecarFiles = await findSidecarLyricFiles(filePath, options)
    const candidates = []

    for (const sidecar of sidecarFiles) {
        try {
            const buffer = await readFile(sidecar.path)
            const text = decodeLyricBuffer(buffer)
            if (!text) continue

            candidates.push({
                text,
                timed: hasTimedLyricText(text),
                sourceKind: 'sidecar',
                extension: sidecar.extension,
                order: candidates.length,
            })
        } catch (_) {
            // ignore unreadable sidecar lyrics
        }
    }

    return candidates
}

async function collectEmbeddedLyricCandidates(filePath, options = {}) {
    const parseMetadata = typeof options.parseMetadata === 'function'
        ? options.parseMetadata
        : (targetPath => parseFile(targetPath, { duration: false, skipCovers: true }))
    const candidates = []

    let metadata = null
    try {
        metadata = await parseMetadata(filePath)
    } catch (_) {
        metadata = null
    }

    if (!metadata || typeof metadata !== 'object') return candidates

    const pushCandidate = rawValue => {
        const normalizedTexts = normalizeLyricCandidates(rawValue)
        normalizedTexts.forEach(text => {
            candidates.push({
                text,
                timed: hasTimedLyricText(text),
                sourceKind: 'embedded',
                extension: '',
                order: candidates.length,
            })
        })
    }

    pushCandidate(metadata.common && metadata.common.lyrics)

    const nativeTags = metadata.native || {}
    for (const type of Object.keys(nativeTags)) {
        const entries = nativeTags[type] || []
        for (const tag of entries) {
            const tagId = String(tag && tag.id || '').toLowerCase()
            if (!shouldReadLyricTag(tagId)) continue
            pushCandidate(tag && tag.value)
        }
    }

    return candidates
}

async function loadLocalLyricPayload(filePath, options = {}) {
    if (!filePath || typeof filePath !== 'string') return false

    const sidecarCandidates = await collectSidecarLyricCandidates(filePath, options)
    const embeddedCandidates = await collectEmbeddedLyricCandidates(filePath, options)
    const selected = selectBestLyricCandidate([...sidecarCandidates, ...embeddedCandidates])

    if (!selected || !selected.text) return false

    return {
        lrc: {
            lyric: selected.text,
        },
    }
}

module.exports = {
    collectEmbeddedLyricCandidates,
    collectSidecarLyricCandidates,
    convertSyncTextToLrc,
    decodeLyricBuffer,
    findSidecarLyricFiles,
    hasTimedLyricText,
    loadLocalLyricPayload,
    normalizeLyricCandidates,
    normalizeLyricText,
    selectBestLyricCandidate,
}
