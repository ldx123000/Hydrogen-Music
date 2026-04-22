export const SIREN_SOURCE = 'siren'
const SIREN_ID_PREFIX = `${SIREN_SOURCE}:`

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function normalizeStringId(value) {
    const text = normalizeText(value)
    return text ? text : ''
}

function normalizeArtistNames(values) {
    const list = Array.isArray(values) ? values : [values]
    const seen = new Set()
    const names = []

    list.forEach(value => {
        const name = normalizeText(value?.name ?? value)
        if (!name || seen.has(name)) return
        seen.add(name)
        names.push(name)
    })

    return names
}

export function createSirenSongId(sourceId) {
    const normalizedSourceId = normalizeStringId(sourceId)
    return normalizedSourceId ? `${SIREN_ID_PREFIX}${normalizedSourceId}` : ''
}

export function getSirenSourceId(input) {
    if (input && typeof input === 'object') {
        return normalizeStringId(input.sourceId || input.cid || input.id || input.songId || input.musicId)
    }

    const rawValue = normalizeStringId(input)
    if (!rawValue) return ''
    if (rawValue.startsWith(SIREN_ID_PREFIX)) return rawValue.slice(SIREN_ID_PREFIX.length)
    return rawValue
}

export function isSirenSong(song) {
    if (!song || typeof song !== 'object') return false
    if (song.source === SIREN_SOURCE) return true

    const songId = normalizeStringId(song.id)
    return songId.startsWith(SIREN_ID_PREFIX)
}

export function normalizeSirenAlbum(album = {}) {
    const id = normalizeStringId(album.cid || album.id)
    const artistNames = normalizeArtistNames(album.artistes || album.artists)
    const coverUrl = normalizeText(album.coverUrl || album.picUrl || album.coverDeUrl || album.blurPicUrl)
    const coverDeUrl = normalizeText(album.coverDeUrl || album.blurPicUrl)
    const blurPicUrl = coverDeUrl || coverUrl

    return {
        id,
        cid: id,
        name: normalizeText(album.name) || '未知专辑',
        coverUrl,
        coverDeUrl: blurPicUrl || null,
        blurPicUrl: blurPicUrl || null,
        artistNames: artistNames.join(' / '),
        artists: artistNames.map(name => ({ id: null, name })),
        artistes: artistNames,
    }
}

export function normalizeSirenSong(song = {}, albumMeta = {}) {
    const album = normalizeSirenAlbum(albumMeta)
    const sourceId = normalizeStringId(song.cid || song.id || song.sourceId)
    const albumId = normalizeStringId(song.albumCid || album.id)
    const artistNames = normalizeArtistNames(song.artists || song.artistes || album.artistes)
    const coverUrl = normalizeText(song.coverUrl || album.coverUrl || album.coverDeUrl || album.blurPicUrl)
    const coverDeUrl = normalizeText(song.coverDeUrl || song.blurPicUrl || album.coverDeUrl || album.blurPicUrl || coverUrl)
    const albumName = normalizeText(song.albumName || album.name)

    return {
        id: createSirenSongId(sourceId),
        source: SIREN_SOURCE,
        sourceId,
        name: normalizeText(song.name) || '未知歌曲',
        ar: artistNames.map(name => ({ id: null, name })),
        artists: artistNames,
        al: {
            id: albumId,
            name: albumName,
            picUrl: coverUrl || null,
        },
        album: {
            id: albumId,
            name: albumName,
        },
        albumCid: albumId,
        coverUrl: coverUrl || null,
        coverDeUrl: coverDeUrl || null,
        blurPicUrl: coverDeUrl || null,
        playable: true,
        vipOnly: false,
        duration: song.duration || null,
        dt: song.duration || null,
        streamUrl: normalizeText(song.streamUrl || song.sourceUrl) || null,
        lyricUrl: normalizeText(song.lyricUrl) || null,
        mvUrl: normalizeText(song.mvUrl) || null,
        mvCoverUrl: normalizeText(song.mvCoverUrl) || null,
        tns: [],
        transNames: [],
        fee: 0,
    }
}

export function normalizeSirenAlbumDetail(detail = {}) {
    const fallbackArtistNames = normalizeArtistNames(detail?.songs?.[0]?.artists || detail?.songs?.[0]?.artistes)
    const album = normalizeSirenAlbum({
        ...detail,
        artistes: Array.isArray(detail?.artistes) && detail.artistes.length > 0 ? detail.artistes : fallbackArtistNames,
        artists: Array.isArray(detail?.artists) && detail.artists.length > 0 ? detail.artists : fallbackArtistNames,
    })
    return {
        ...album,
        intro: normalizeText(detail.intro),
        belong: normalizeText(detail.belong),
        coverDeUrl: normalizeText(detail.coverDeUrl) || null,
        songs: Array.isArray(detail.songs)
            ? detail.songs.map(song => normalizeSirenSong(song, album))
            : [],
    }
}

export function getSirenAudioExtension(url) {
    const rawUrl = normalizeText(url)
    if (!rawUrl) return 'wav'

    try {
        const parsedUrl = new URL(rawUrl)
        const pathname = parsedUrl.pathname || ''
        const matchedExt = pathname.match(/\.([a-z0-9]+)$/i)
        if (matchedExt && matchedExt[1]) return matchedExt[1].toLowerCase()
    } catch (_) {
        const matchedExt = rawUrl.match(/\.([a-z0-9]+)(?:\?|#|$)/i)
        if (matchedExt && matchedExt[1]) return matchedExt[1].toLowerCase()
    }

    return 'wav'
}
