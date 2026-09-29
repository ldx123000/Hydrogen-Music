export function createEmptyLyric() {
    return { lrc: { lyric: '' } }
}

export function createUnavailableLyric(text = '暂无歌词') {
    const content = String(text || '暂无歌词').trim() || '暂无歌词'
    return {
        lrc: { lyric: `[00:00.00]${content}` },
        hmLyricSource: 'placeholder',
        hmLyricPlaceholder: true,
    }
}

const regNewLine = /\r?\n/
const timeTag = /\[(\d{1,3})\s*[:：\.\uFF0E\u3002,，;；/\-_\s]\s*(\d{1,2})(?:\s*[:：\.\uFF0E\u3002,，;；/\-_\s]\s*(\d{1,3}))?\]/g
const timeTagSingle = /\[(\d{1,3})\s*[:：\.\uFF0E\u3002,，;；/\-_\s]\s*(\d{1,2})(?:\s*[:：\.\uFF0E\u3002,，;；/\-_\s]\s*(\d{1,3}))?\]/

function parseTimeTag(tag) {
    const match = typeof tag === 'string' ? tag.match(timeTagSingle) : null
    if (!match) return 0

    const mm = parseInt(match[1] || '0', 10)
    const ss = parseInt(match[2] || '0', 10)
    const ms = match[3] ? parseInt((match[3] + '00').slice(0, 3), 10) : 0

    return mm * 60 + ss + ms / 1000
}

function formatTimeTag(seconds) {
    const safeSeconds = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0
    const mm = String(Math.floor(safeSeconds / 60)).padStart(2, '0')
    const ss = String(Math.floor(safeSeconds % 60)).padStart(2, '0')
    const mmm = String(Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000)).padStart(3, '0')
    return `[${mm}:${ss}.${mmm}]`
}

function looksRomanizedLyric(text) {
    const normalized = String(text || '').trim()
    if (!normalized) return false
    if (!/[A-Za-z]/.test(normalized)) return false
    if (/[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u30FF\u31F0-\u31FF\uFF66-\uFF9D\uAC00-\uD7AF]/.test(normalized)) return false
    return true
}

function buildTimedLyricText(preludeLines, rows, field) {
    const output = []
    if (field === 'lyric' && Array.isArray(preludeLines)) {
        preludeLines.forEach(line => {
            const text = String(line || '').trim()
            if (text) output.push(text)
        })
    }

    rows.forEach(row => {
        const text = String(row?.[field] || '').trim()
        if (!text) return
        output.push(`${formatTimeTag(row.time)}${text}`)
    })

    return output.join('\n')
}

export function normalizeLyricPayload(lyric) {
    if (!lyric || typeof lyric !== 'object') return createEmptyLyric()

    const normalized = { ...lyric }
    for (const field of ['lrc', 'tlyric', 'romalrc', 'yrc', 'klyric']) {
        const value = normalized[field]
        if (typeof value === 'string') {
            normalized[field] = { lyric: value }
        }
    }
    return normalized
}

export function getLyricText(value) {
    if (typeof value === 'string') return value
    if (!value || typeof value !== 'object') return ''
    if (typeof value.lyric === 'string') return value.lyric
    return ''
}

export function splitCombinedCloudLyricPayload(lyric) {
    const normalized = normalizeLyricPayload(lyric)
    if (getLyricText(normalized.tlyric).trim() || getLyricText(normalized.romalrc).trim()) return normalized

    const originalLyricText = getLyricText(normalized.lrc).trim()
    if (!originalLyricText) return normalized

    const preludeLines = []
    const groupedRows = new Map()
    let duplicatedGroupCount = 0
    let romanizedGroupCount = 0
    let seenTimedLine = false

    for (const [index, rawLine] of originalLyricText.split(regNewLine).entries()) {
        if (typeof rawLine !== 'string') continue

        const normalizedLine = index === 0 ? rawLine.replace(/^\uFEFF/, '') : rawLine
        if (!seenTimedLine && !timeTagSingle.test(normalizedLine)) {
            const text = normalizedLine.trim()
            if (text) preludeLines.push(text)
            continue
        }

        seenTimedLine = true
        const tags = Array.from(normalizedLine.matchAll(timeTag))
        if (!tags.length) continue

        const lyricText = normalizedLine.replace(timeTag, '').trim()
        if (!lyricText) continue

        for (const tag of tags) {
            const key = parseTimeTag(tag[0]).toFixed(3)
            const bucket = groupedRows.get(key) || { time: Number(key), texts: [] }
            bucket.texts.push(lyricText)
            groupedRows.set(key, bucket)
        }
    }

    if (!groupedRows.size) return normalized

    const rows = Array.from(groupedRows.values())
        .sort((left, right) => left.time - right.time)
        .map(row => {
            const texts = row.texts.filter(Boolean)
            const nextRow = { time: row.time, lyric: '', tlyric: '', rlyric: '' }
            if (!texts.length) return nextRow

            if (texts.length > 1) duplicatedGroupCount += 1
            if (texts.some(looksRomanizedLyric)) romanizedGroupCount += 1

            nextRow.lyric = texts[0] || ''
            if (texts.length === 2) {
                if (looksRomanizedLyric(texts[1])) nextRow.rlyric = texts[1]
                else nextRow.tlyric = texts[1]
                return nextRow
            }

            if (texts.length >= 3) {
                const secondaryTexts = texts.slice(1)
                const romaIndex = secondaryTexts.findIndex(looksRomanizedLyric)
                if (romaIndex >= 0) {
                    nextRow.rlyric = secondaryTexts[romaIndex] || ''
                    nextRow.tlyric = secondaryTexts.find((_, index) => index !== romaIndex) || ''
                } else {
                    nextRow.tlyric = secondaryTexts[0] || ''
                    nextRow.rlyric = secondaryTexts[1] || ''
                }
            }

            return nextRow
        })

    if (duplicatedGroupCount === 0) return normalized
    if (romanizedGroupCount === 0 && duplicatedGroupCount < 3) return normalized

    const lyricText = buildTimedLyricText(preludeLines, rows, 'lyric')
    const translatedLyricText = buildTimedLyricText([], rows, 'tlyric')
    const romanizedLyricText = buildTimedLyricText([], rows, 'rlyric')

    return {
        ...normalized,
        lrc: { lyric: lyricText },
        tlyric: { lyric: translatedLyricText },
        romalrc: { lyric: romanizedLyricText },
        hmLyricAutoSplit: true,
    }
}

function stripLyricTimeTags(text) {
    return String(text || '')
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function isPlaceholderLyricText(text) {
    const normalized = stripLyricTimeTags(text)
    if (!normalized) return true
    return /^(?:暂无歌词|暂时没有歌词|未找到歌词|歌词未上传|纯音乐无歌词)$/i.test(normalized)
}

export function isPlaceholderLyricPayload(lyric) {
    if (!lyric || typeof lyric !== 'object') return true
    if (lyric.uncollected === true || lyric.nolyric === true) return true

    const texts = [lyric.lrc, lyric.tlyric, lyric.romalrc, lyric.yrc, lyric.klyric]
        .map(item => getLyricText(item).trim())
        .filter(Boolean)

    if (texts.length === 0) return true
    return texts.every(isPlaceholderLyricText)
}

export function hasUsableLyricPayload(lyric) {
    if (!lyric || typeof lyric !== 'object') return false
    if (isPlaceholderLyricPayload(lyric)) return false
    return [lyric.lrc, lyric.tlyric, lyric.romalrc, lyric.yrc, lyric.klyric].some(item => {
        const text = getLyricText(item).trim()
        return text.length > 0
    })
}
