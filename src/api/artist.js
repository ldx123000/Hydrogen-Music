import { get, getById, getWithPagination, operationRequest } from "./base";
import { buildTypeParams, buildIdWithTimestamp, buildOperationParams, buildPaginationParams } from "./params";
import { normalizePlaylistSong } from "./playlist";

function resolveCoverUrl(url) {
    if (typeof url != 'string' || url === '') return ''
    return url.replace('{size}', '480')
}

function normalizeArtistProfile(raw = {}, fallbackId = '') {
    const cover = resolveCoverUrl(raw.imgurl || raw.sizable_avatar || raw.avatar || raw.pic || raw.Image || '')
    const artistId = raw.singerid || raw.author_id || raw.AuthorId || raw.id || fallbackId || ''
    const fansCount = Number(raw.fansnums ?? raw.fanscount ?? raw.follow ?? 0) || 0

    return {
        ...raw,
        id: String(artistId),
        name: raw.singername || raw.author_name || raw.AuthorName || raw.name || '未知歌手',
        img1v1Url: cover,
        picUrl: cover,
        musicSize: Number(raw.songcount ?? raw.song_count ?? raw.AudioCount ?? 0) || 0,
        albumSize: Number(raw.album_count ?? raw.albumcount ?? raw.AlbumCount ?? 0) || 0,
        mvSize: Number(raw.mv_count ?? raw.mvcount ?? raw.VideoCount ?? 0) || 0,
        briefDesc: raw.intro || raw.long_intro || raw.Auxiliary || '',
        follow: { fansCnt: fansCount },
        followed: false,
        source: 'kugou',
    }
}

function normalizeArtistSong(raw = {}) {
    const cover = resolveCoverUrl(raw.trans_param?.union_cover || raw.sizable_cover || raw.imgurl || raw.cover || raw.picUrl || '')
    const albumId = raw.album_id || raw.albumid || raw.albumId || raw.AlbumID || raw.albuminfo?.id || raw.album_info?.album_id || ''
    const albumName = raw.album_name || raw.albumname || raw.album || raw.albuminfo?.name || raw.album_info?.album_name || '未知专辑'
    const songName = raw.audio_name || raw.songname || raw.filename || raw.name || ''
    const authors = Array.isArray(raw.singerinfo)
        ? raw.singerinfo
        : Array.isArray(raw.authors)
            ? raw.authors
            : raw.author_name
                ? [{ name: raw.author_name }]
                : []

    const normalized = normalizePlaylistSong({
        ...raw,
        name: songName,
        songName,
        authors,
        cover,
        sizable_cover: cover,
        album_sizable_cover: cover,
        albuminfo: raw.albuminfo || raw.album_info || {
            id: albumId,
            name: albumName,
            picUrl: cover,
            sizable_cover: cover,
        },
        album: raw.album || {
            id: albumId,
            name: albumName,
            picUrl: cover,
        },
        dt: raw.timelength || raw.timelength_320 || raw.duration || raw.dt || 0,
        duration: raw.timelength || raw.timelength_320 || raw.duration || raw.dt || 0,
        source: 'artist',
        type: 'artist',
    })

    return {
        ...normalized,
        source: 'artist',
        type: 'artist',
    }
}

function normalizeArtistAlbum(raw = {}) {
    // 酷狗专辑列表里的 cover 往往只是文件名，优先取 sizable_cover 这类完整 URL，避免歌手页专辑封面裂图。
    const cover = resolveCoverUrl(raw.sizable_cover || raw.imgurl || raw.album_img || raw.pic || raw.img || raw.cover || '')
    const publishTime = raw.publish_date || raw.publishDate || raw.publish_time || raw.public_time || 0
    const albumSize = Number(raw.total ?? raw.size ?? raw.songcount ?? raw.song_count ?? raw.count)

    return {
        ...raw,
        id: String(raw.album_id || raw.albumid || raw.AlbumID || raw.id || ''),
        name: raw.album_name || raw.albumname || raw.name || '未知专辑',
        picUrl: cover,
        blurPicUrl: cover,
        publishTime,
        artists: Array.isArray(raw.authors)
            ? raw.authors
            : raw.author_name
                ? [{ name: raw.author_name }]
                : [],
        // 歌手专辑接口通常不返回曲目数，缺省时保留为空，避免界面误显示成“0首”。
        size: Number.isFinite(albumSize) && albumSize > 0 ? albumSize : null,
    }
}

function extractArtistArray(result = {}) {
    return Array.isArray(result?.data)
        ? result.data
        : Array.isArray(result?.songs)
            ? result.songs
            : Array.isArray(result?.data?.list)
                ? result.data.list
                : Array.isArray(result?.list)
                    ? result.list
                    : []
}

function resolveArtistTotal(result = {}) {
    const rawTotal = result?.total ?? result?.data?.total ?? result?.extra?.page_total ?? result?.extra?.total
    const normalizedTotal = Number(rawTotal)
    return Number.isFinite(normalizedTotal) && normalizedTotal > 0 ? normalizedTotal : 0
}

/**
 * 获取排行榜中的歌手榜
 * @param {number} type - 1:华语 2:欧美 3:韩国 4:日本
 */
export function getRecommendedArtists(type) {
    return get('/artist/lists', { type, hotsize: 50 }).then(result => {
        const sections = Array.isArray(result?.data?.info) ? result.data.info : Array.isArray(result?.info) ? result.info : []
        const rawArtists = sections.flatMap(section => (Array.isArray(section?.singer) ? section.singer : []))

        return {
            ...result,
            artists: rawArtists.map(item => {
                const rawCover = item?.imgurl || item?.sizable_avatar || item?.dycover?.first_frame_image || ''
                const picUrl = typeof rawCover === 'string' ? rawCover.replace('{size}', '480') : rawCover

                return {
                    ...item,
                    id: item?.singerid ?? item?.id ?? null,
                    name: item?.singername || item?.name || '',
                    picUrl,
                    img1v1Url: picUrl,
                    fansCount: Number(item?.fanscount ?? item?.follow ?? 0) || 0,
                }
            }),
        }
    });
}

/**
 * 获取收藏的歌手列表
 */
export function getUserSubArtists() {
    return get('/artist/sublist', {});
}

/**
 * 获取歌手详情和热门歌曲
 * @param {string|number} id - 歌手ID
 * @param {object} extraParams - 额外参数
 */
export function getArtistDetail(id, extraParams = {}) {
    const params = typeof id === 'object' ? id : { id, ...extraParams }
    return get('/artist/detail', params).then(result => {
        const rawArtist = result?.data || result || {}
        return {
            ...result,
            artist: normalizeArtistProfile(rawArtist, params?.id),
        }
    })
}

/**
 * 获取歌手热门50首歌曲
 * @param {string|number} id - 歌手ID
 * @param {object} extraParams - 额外参数
 */
export function getArtistTopSong(id, extraParams = {}) {
    const params = typeof id === 'object' ? id : { id, ...extraParams }
    return get('/artist/audios', params).then(result => {
        const rawSongs = extractArtistArray(result)
        return {
            ...result,
            total: resolveArtistTotal(result),
            songs: rawSongs.map(item => normalizeArtistSong(item)),
        }
    })
}

/**
 * 获取歌手专辑列表
 * @param {string|number} id - 歌手ID
 * @param {object} options - 选项
 * @param {number} options.limit - 取出数量，默认30
 * @param {number} options.offset - 偏移数量，默认0
 */
export function getArtistAlbum(id, { limit = 30, offset = 0, ...extraParams } = {}) {
    const params = typeof id === 'object'
        ? id
        : {
            id,
            page: offset ? Math.floor(offset / limit) + 1 : 1,
            pagesize: limit,
            ...extraParams,
        }
    return get('/artist/albums', params).then(result => {
        const rawAlbums = extractArtistArray(result)
        return {
            ...result,
            total: resolveArtistTotal(result),
            hotAlbums: rawAlbums.map(item => normalizeArtistAlbum(item)),
        }
    })
}

/**
 * 获取歌手粉丝数量
 * @param {string|number} id - 歌手ID
 * @param {object} extraParams - 额外参数
 */
export function getArtistFansCount(id, extraParams = {}) {
    const params = buildIdWithTimestamp(id, extraParams);
    return get('/artist/follow/count', params);
}

/**
 * 收藏/取消收藏歌手
 * @param {string|number} id - 歌手ID
 * @param {boolean} isSubscribe - true为收藏，false为取消收藏
 * @param {object} extraParams - 额外参数
 */
export function subArtist(id, isSubscribe = true, extraParams = {}) {
    // 支持旧的调用方式（传入params对象）
    if (typeof id === 'object') {
        return get('/artist/sub', id);
    }
    const params = buildOperationParams(id, isSubscribe, extraParams);
    return get('/artist/sub', params);
}
