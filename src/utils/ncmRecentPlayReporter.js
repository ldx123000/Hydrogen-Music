import { getCookie, isLogin } from './authority'
import { isSirenSong } from './siren'

const AUTH_COOKIE_KEYS = ['MUSIC_U', 'MUSIC_A_T', 'MUSIC_R_T', '__csrf']
const MIN_REPORT_SECONDS = 3
const IMMEDIATE_PLAY_LOG_DELAY_MS = 400
const SOURCE_BY_LIST_TYPE = Object.freeze({
    playlist: 'list',
    album: 'album',
    artist: 'artist',
    personalfm: 'dailySongRecommend',
    rec: 'dailySongRecommend',
    search: 'search',
})

let activeSession = null

function normalizeSongId(value) {
    const text = String(value ?? '').trim()
    if (!/^[1-9]\d*$/.test(text)) return ''
    return text
}

function isReportableNcmSong(song) {
    if (!song || typeof song !== 'object') return false
    if (song.type === 'local') return false
    if (isSirenSong(song)) return false
    return !!normalizeSongId(song.id)
}

function buildAuthCookieString() {
    return AUTH_COOKIE_KEYS.map(key => {
        const value = getCookie(key)
        return value ? `${key}=${value}` : ''
    }).filter(Boolean).join('; ')
}

function resolveSourceContext(listInfo = {}) {
    const type = String(listInfo?.type || '').trim()
    const id = listInfo?.id == null ? '' : String(listInfo.id).trim()
    if (!type || !id || id === 'none') return {}

    return {
        source: SOURCE_BY_LIST_TYPE[type] || 'list',
        sourceId: id,
    }
}

function buildSourceFields(listInfo) {
    const context = resolveSourceContext(listInfo)
    if (!context.source) return {}

    return {
        source: context.source,
        ...(context.sourceId ? { sourceId: context.sourceId, sourceid: context.sourceId } : {}),
    }
}

function buildOfficialContent(songId) {
    return `id=${songId}&play=true`
}

function withOfficialFields(action, json) {
    return {
        action,
        json: {
            ...json,
            mainsite: '1',
            mainsiteWeb: '1',
        },
    }
}

async function submitLogs(logs) {
    if (!Array.isArray(logs) || logs.length === 0) return null
    if (!isLogin()) return null
    if (typeof windowApi === 'undefined' || typeof windowApi.submitNcmClientLog !== 'function') return null

    const cookie = buildAuthCookieString()
    if (!cookie) return null

    try {
        const response = await windowApi.submitNcmClientLog({
            logs,
            cookie,
            timeout: 8000,
        })

        if (response?.status && (response.status < 200 || response.status >= 300)) {
            console.warn('[NCM recent play] submit failed:', response.status, response.data)
        }
        return response
    } catch (error) {
        console.warn('[NCM recent play] submit failed:', error)
        return null
    }
}

export function reportNcmPlaybackStart(song, { listInfo } = {}) {
    if (!isReportableNcmSong(song)) return

    const songId = normalizeSongId(song.id)
    if (activeSession && activeSession.songId === songId) return

    const startedAt = Date.now()
    activeSession = {
        songId,
        startedAt,
        listInfo: listInfo ? { ...listInfo } : {},
    }

    const content = buildOfficialContent(songId)
    const sourceFields = buildSourceFields(listInfo)
    const logs = [
        withOfficialFields('startplay', {
            id: songId,
            type: 'song',
            content,
        }),
        withOfficialFields('play', {
            id: songId,
            type: 'song',
            content,
            ...sourceFields,
        }),
    ]

    window.setTimeout(() => {
        if (!activeSession || activeSession.songId !== songId || activeSession.startedAt !== startedAt) return
        void submitLogs(logs)
    }, IMMEDIATE_PLAY_LOG_DELAY_MS)
}

export function reportNcmPlaybackEnd(song, { elapsedSeconds = 0, end = 'interrupt', listInfo } = {}) {
    if (!isReportableNcmSong(song)) return

    const songId = normalizeSongId(song.id)
    const session = activeSession
    if (!session || session.songId !== songId) return

    const elapsed = Math.round(Math.max(Number(elapsedSeconds) || 0, (Date.now() - session.startedAt) / 1000))
    activeSession = null

    if (elapsed < MIN_REPORT_SECONDS) return

    const sourceFields = buildSourceFields(listInfo || session.listInfo)
    const log = withOfficialFields('play', {
        id: songId,
        type: 'song',
        time: elapsed,
        end: end || 'interrupt',
        wifi: 0,
        download: 0,
        content: buildOfficialContent(songId),
        ...sourceFields,
    })

    void submitLogs([log])
}
