const SIREN_SOURCE = 'siren'
const SIREN_ID_PREFIX = `${SIREN_SOURCE}:`
const QUALITY_FIELDS = ['l', 'm', 'h', 'sq', 'hr']

function isBlankValue(value) {
    return value === undefined || value === null || value === ''
}

function cloneArray(value, mapper = item => item) {
    return Array.isArray(value) ? value.map(mapper).filter(item => item !== null && item !== undefined) : []
}

function pickDefined(source, keys) {
    const target = {}
    keys.forEach(key => {
        if (!isBlankValue(source?.[key])) target[key] = source[key]
    })
    return target
}

function assignIfMissing(target, key, value) {
    if (!isBlankValue(target[key]) || isBlankValue(value)) return
    target[key] = value
}

function mergeDefined(target, source) {
    if (!target && !source) return null
    const merged = { ...(target || {}) }
    Object.keys(source || {}).forEach(key => assignIfMissing(merged, key, source[key]))
    return Object.keys(merged).length > 0 ? merged : null
}

function normalizeArtist(artist) {
    if (typeof artist === 'string') return artist ? { name: artist } : null
    if (!artist || typeof artist !== 'object') return null

    const normalized = pickDefined(artist, ['id', 'name'])
    return normalized.name || !isBlankValue(normalized.id) ? normalized : null
}

function normalizeAlbum(album) {
    if (!album || typeof album !== 'object') return null

    const normalized = pickDefined(album, ['id', 'name', 'picUrl', 'blurPicUrl', 'cover', 'coverUrl'])
    if (!normalized.picUrl && normalized.coverUrl) normalized.picUrl = normalized.coverUrl
    return Object.keys(normalized).length > 0 ? normalized : null
}

function normalizeNoCopyrightRcmd(value) {
    if (!value || typeof value !== 'object') return null
    const songId = value.songId ?? value.id
    const normalized = pickDefined(value, ['type', 'typeDesc', 'thirdPartySong', 'expInfo'])
    if (!isBlankValue(songId)) normalized.songId = songId
    return Object.keys(normalized).length > 0 ? normalized : null
}

function normalizePrivilege(privilege) {
    if (!privilege || typeof privilege !== 'object') return null
    const normalized = pickDefined(privilege, ['id', 'fee', 'pl', 'dl', 'st', 'cs'])
    return Object.keys(normalized).length > 0 ? normalized : null
}

function isSirenQueueSong(song) {
    if (!song || typeof song !== 'object') return false
    if (song.source === SIREN_SOURCE) return true
    return String(song.id || '').startsWith(SIREN_ID_PREFIX)
}

function getNestedSong(song) {
    return song?.song && typeof song.song === 'object' ? song.song : null
}

function firstTextArray(...values) {
    for (const value of values) {
        const list = cloneArray(value, item => String(item || '').trim()).filter(Boolean)
        if (list.length > 0) return list
    }
    return []
}

export function normalizeQueueSong(song) {
    if (!song || typeof song !== 'object') return null
    if (song.type === 'local') return song

    const nestedSong = getNestedSong(song)
    const normalized = pickDefined(song, [
        'id',
        'songId',
        'musicId',
        'source',
        'sourceId',
        'cid',
        'name',
        'localName',
        'dt',
        'duration',
        'time',
        'type',
        'playable',
        'vipOnly',
        'reason',
        'fee',
        'url',
        'path',
        'dirPath',
        'coverUrl',
        'coverDeUrl',
        'blurPicUrl',
        'img1v1Url',
        'streamUrl',
        'sourceUrl',
        'lyricUrl',
        'mvUrl',
        'mvCoverUrl',
        'albumCid',
        'albumId',
        'albumName',
        'artist',
        'artistsName',
        'programId',
        'programID',
        'programid',
        'programName',
        'programDesc',
        'hmCloudDisk',
        'hmCloudId',
        'hmCloudFileName',
        'hmCloudSongName',
        'actualLevel',
        'quality',
        'level',
    ])

    assignIfMissing(normalized, 'dt', nestedSong?.dt ?? nestedSong?.duration)
    assignIfMissing(normalized, 'duration', nestedSong?.duration ?? nestedSong?.dt)
    assignIfMissing(normalized, 'fee', nestedSong?.fee)

    const artists = cloneArray(song.ar, normalizeArtist)
    const fallbackArtists = cloneArray(song.artists || nestedSong?.ar || nestedSong?.artists, normalizeArtist)
    if (artists.length > 0) normalized.ar = artists
    else if (fallbackArtists.length > 0) normalized.ar = fallbackArtists

    const alternateArtists = cloneArray(song.artists, normalizeArtist)
    if (alternateArtists.length > 0) {
        normalized.artists = isSirenQueueSong(song)
            ? alternateArtists.map(artist => artist.name).filter(Boolean)
            : alternateArtists
    }

    const nestedAlbum = normalizeAlbum(nestedSong?.al || nestedSong?.album)
    const album = mergeDefined(normalizeAlbum(song.al), nestedAlbum)
    if (album) normalized.al = album

    const alternateAlbum = mergeDefined(normalizeAlbum(song.album), nestedAlbum || album)
    if (alternateAlbum) normalized.album = alternateAlbum

    const tns = firstTextArray(song.tns, nestedSong?.tns)
    if (tns.length > 0) normalized.tns = tns

    const transNames = firstTextArray(song.transNames, nestedSong?.transNames)
    if (transNames.length > 0) normalized.transNames = transNames

    QUALITY_FIELDS.forEach(key => {
        if (song[key]) normalized[key] = song[key]
        else if (nestedSong?.[key]) normalized[key] = nestedSong[key]
    })

    const privilege = normalizePrivilege(song.privilege || nestedSong?.privilege)
    if (privilege) normalized.privilege = privilege

    const noCopyrightRcmd = normalizeNoCopyrightRcmd(song.noCopyrightRcmd || nestedSong?.noCopyrightRcmd)
    if (noCopyrightRcmd) normalized.noCopyrightRcmd = noCopyrightRcmd
    if ((song.pc || nestedSong?.pc) && normalized.hmCloudDisk !== true) normalized.hmCloudDisk = true

    return normalized
}

export function normalizeQueueSongs(songs) {
    return Array.isArray(songs) ? songs.map(normalizeQueueSong).filter(Boolean) : []
}
