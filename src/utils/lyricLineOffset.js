import { getSirenSourceId, isSirenSong } from './siren'

export const LYRIC_LINE_OFFSET_STEP_SEC = 0.5

const OFFSET_PRECISION = 1000

function normalizeText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ')
}

function normalizeId(value) {
    if (value === null || value === undefined) return ''
    return String(value).trim()
}

function roundSeconds(value) {
    const numberValue = Number(value)
    if (!Number.isFinite(numberValue)) return 0
    return Math.round(numberValue * OFFSET_PRECISION) / OFFSET_PRECISION
}

export function normalizeLyricLineOffset(value) {
    const normalized = roundSeconds(value)
    return Math.abs(normalized) < 0.001 ? 0 : normalized
}

export function getLyricOffsetSongKey(song) {
    if (!song || typeof song !== 'object') return ''

    if (song.type === 'local') {
        const localId = normalizeId(song.url || song.path || song.dirPath || song.id)
        return localId ? `local:${localId}` : ''
    }

    if (isSirenSong(song)) {
        const sirenId = normalizeId(getSirenSourceId(song) || song.id)
        return sirenId ? `siren:${sirenId}` : ''
    }

    const songId = normalizeId(song.id || song.songId || song.musicId || song.hmCloudId)
    return songId ? `song:${songId}` : ''
}

function getBaseLyricLineKey(row) {
    const originalTime = Number(row?.lyricLineOriginalTime ?? row?.time ?? 0)
    const timeMs = Math.max(0, Math.round((Number.isFinite(originalTime) ? originalTime : 0) * 1000))

    return JSON.stringify([
        timeMs,
        normalizeText(row?.lyric),
        normalizeText(row?.tlyric),
        normalizeText(row?.rlyric),
    ])
}

function getLineKey(row, seenKeys) {
    const baseKey = getBaseLyricLineKey(row)
    const count = seenKeys.get(baseKey) || 0
    seenKeys.set(baseKey, count + 1)
    return count === 0 ? baseKey : `${baseKey}#${count}`
}

function getSongOffsets(offsetStore, songKey) {
    if (!offsetStore || typeof offsetStore !== 'object' || !songKey) return {}
    const songOffsets = offsetStore[songKey]
    return songOffsets && typeof songOffsets === 'object' ? songOffsets : {}
}

export function getDisplayedLyricLineOffset(row) {
    const originalTime = Number(row?.lyricLineOriginalTime ?? row?.time)
    const currentTime = Number(row?.time)
    if (!Number.isFinite(originalTime) || !Number.isFinite(currentTime)) return 0
    return normalizeLyricLineOffset(originalTime - currentTime)
}

export function formatLyricLineOffset(offsetSec) {
    const offset = normalizeLyricLineOffset(offsetSec)
    if (offset === 0) return '无偏移'

    const absValue = Math.abs(offset).toFixed(1)
    return offset > 0 ? `提前 ${absValue} 秒` : `延后 ${absValue} 秒`
}

export function buildNextLyricLineOffsetStore(offsetStore, songKey, lineKey, offsetSec) {
    if (!songKey || !lineKey) return offsetStore || {}

    const nextStore = { ...(offsetStore && typeof offsetStore === 'object' ? offsetStore : {}) }
    const nextSongOffsets = { ...(nextStore[songKey] && typeof nextStore[songKey] === 'object' ? nextStore[songKey] : {}) }
    const normalizedOffset = normalizeLyricLineOffset(offsetSec)

    if (normalizedOffset === 0) {
        delete nextSongOffsets[lineKey]
    } else {
        nextSongOffsets[lineKey] = normalizedOffset
    }

    if (Object.keys(nextSongOffsets).length === 0) {
        delete nextStore[songKey]
    } else {
        nextStore[songKey] = nextSongOffsets
    }

    return nextStore
}

export function applyLyricLineOffsets(timeline, offsetStore, songKey) {
    if (!Array.isArray(timeline)) return timeline

    const songOffsets = getSongOffsets(offsetStore, songKey)
    const seenKeys = new Map()
    const rows = timeline.map(row => {
        const originalTime = roundSeconds(row?.lyricLineOriginalTime ?? row?.time ?? 0)
        const keySource = { ...row, time: originalTime, lyricLineOriginalTime: originalTime }
        const lyricLineKey = getLineKey(keySource, seenKeys)
        const lyricLineOffsetSec = normalizeLyricLineOffset(songOffsets[lyricLineKey])

        return {
            ...row,
            lyricLineOriginalTime: originalTime,
            lyricLineKey,
            lyricLineOffsetSec,
        }
    })

    const adjustedTimes = rows.map(row => {
        if (row?.untimed) return row.lyricLineOriginalTime
        return Math.max(0, roundSeconds(row.lyricLineOriginalTime - row.lyricLineOffsetSec))
    })

    for (let index = 1; index < adjustedTimes.length; index++) {
        if (adjustedTimes[index] < adjustedTimes[index - 1]) {
            adjustedTimes[index] = adjustedTimes[index - 1]
        }
    }

    return rows.map((row, index) => ({
        ...row,
        time: roundSeconds(adjustedTimes[index]),
    }))
}
