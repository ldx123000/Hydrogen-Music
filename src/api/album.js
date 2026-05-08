import { get } from "./base";
import { getNewestSong } from "./song";
import { normalizePlaylistSong } from "./playlist";
import request from "../utils/request";

// /album/songs 对 pagesize 比较敏感，部分专辑传 100 会直接返回 invalid param，这里回退到文档默认值 30。
const ALBUM_SONG_PAGE_SIZE = 30

function normalizeAlbumCover(value) {
    if (typeof value !== 'string') return value || ''
    return value.replace('{size}', '480')
}

function normalizeRecommendedAlbum(item = {}) {
    const rawCover =
        item?.album_sizable_cover ||
        item?.sizable_cover ||
        item?.cover ||
        item?.album_cover ||
        item?.blurPicUrl ||
        item?.picUrl ||
        item?.imgurl ||
        ''
    const cover = normalizeAlbumCover(rawCover)
    const author = Array.isArray(item?.authors) ? item.authors[0] : item?.artist || null
    const artistId = author?.author_id ?? author?.id ?? item?.author_id ?? item?.artist_id ?? null
    const artistName = author?.author_name ?? author?.name ?? item?.author_name ?? item?.artist_name ?? ''
    const publishTimeSource = item?.publish_date || item?.publishTime || item?.publishtime || ''
    const publishTime = publishTimeSource ? new Date(publishTimeSource).getTime() || Date.parse(publishTimeSource) || 0 : 0

    return {
        ...item,
        id: item?.album_id ?? item?.id ?? null,
        name: item?.album_name || item?.name || '',
        blurPicUrl: cover,
        picUrl: cover,
        size: Number(item?.songcount ?? item?.size ?? 0) || 0,
        publishTime,
        artist: artistId || artistName ? { id: artistId, name: artistName } : null,
    }
}

function toFirstArrayItem(payload) {
    if (Array.isArray(payload)) return payload[0] || {}
    if (Array.isArray(payload?.data)) return payload.data[0] || {}
    return payload?.data || payload || {}
}

function normalizeAlbumDetail(raw = {}, fallbackId = '') {
    const normalized = normalizeRecommendedAlbum(raw)

    return {
        ...normalized,
        id: String(normalized.id || fallbackId || ''),
        name: normalized.name || '未知专辑',
        picUrl: normalized.picUrl || normalized.blurPicUrl || '',
        blurPicUrl: normalized.blurPicUrl || normalized.picUrl || '',
        size: Number.isFinite(Number(normalized.size)) && Number(normalized.size) > 0 ? Number(normalized.size) : null,
        description: raw?.intro || raw?.description || '',
        company: raw?.publish_company || '',
        type: raw?.type || '',
        artists: Array.isArray(raw?.authors)
            ? raw.authors
            : raw?.author_name
                ? [{ name: raw.author_name }]
                : [],
    }
}

async function fetchAllAlbumSongs(requestParams = {}, mergedAlbumRaw = {}) {
    const albumId = requestParams?.id
    const albumCover = mergedAlbumRaw?.sizable_cover || mergedAlbumRaw?.cover || ''
    const albumName = mergedAlbumRaw?.album_name || ''
    const allSongs = []
    let page = 1
    let total = 0

    while (true) {
        const songsResult = await request({
            url: '/album/songs',
            method: 'get',
            params: {
                ...requestParams,
                page,
                pagesize: ALBUM_SONG_PAGE_SIZE,
            },
        })
        const rawSongs = Array.isArray(songsResult?.data?.songs) ? songsResult.data.songs : []
        const pageTotal = Number(songsResult?.data?.total ?? songsResult?.total ?? total)
        if (Number.isFinite(pageTotal) && pageTotal > 0) total = pageTotal

        const normalizedSongs = rawSongs.map(item =>
            normalizePlaylistSong({
                ...item,
                // 酷狗专辑歌曲结果里大量关键字段藏在 base/audio_info，需要在这里补齐给通用适配层。
                id: item?.id || item?.base?.album_audio_id || item?.base?.audio_id || item?.audio_info?.hash || item?.hash,
                name: item?.name || item?.audio_name || item?.base?.audio_name || item?.filename || '',
                album_id: item?.album_id || item?.base?.album_id || albumId,
                album_name: item?.album_name || item?.base?.album_name || item?.album_info?.album_name || albumName,
                hash: item?.hash || item?.audio_info?.hash || item?.audio_info?.hash_128 || '',
                audio_id: item?.audio_id || item?.base?.audio_id || '',
                album_audio_id: item?.album_audio_id || item?.base?.album_audio_id || '',
                timelength: item?.timelength || item?.audio_info?.duration || item?.audio_info?.duration_128 || 0,
                cover: item?.cover || item?.album_info?.cover || albumCover,
                sizable_cover: item?.sizable_cover || item?.album_info?.cover || albumCover,
                authors: Array.isArray(item?.authors) && item.authors.length ? item.authors : mergedAlbumRaw?.authors || [],
                albuminfo: item?.albuminfo || {
                    id: item?.base?.album_id || albumId,
                    name: item?.album_info?.album_name || albumName,
                    picUrl: normalizeAlbumCover(item?.album_info?.cover || albumCover),
                    cover: normalizeAlbumCover(item?.album_info?.cover || albumCover),
                    sizable_cover: normalizeAlbumCover(item?.album_info?.cover || albumCover),
                },
            })
        )

        allSongs.push(...normalizedSongs)

        if (rawSongs.length == 0) break
        if (total > 0 && allSongs.length >= total) break
        if (rawSongs.length < ALBUM_SONG_PAGE_SIZE) break
        page += 1
    }

    return {
        songs: allSongs,
        total,
    }
}

function buildNewestAlbumsFromSongs(songs = [], limit = 30) {
    const albums = []
    const seen = new Set()

    for (const song of songs) {
        const albumId = song?.album_id ?? song?.album_audio_id ?? song?.album?.id
        if (!albumId || seen.has(String(albumId))) continue
        seen.add(String(albumId))
        albums.push(normalizeRecommendedAlbum(song))
        if (albums.length >= limit) break
    }

    return albums
}

async function buildNewestAlbumFallback(limit = 30) {
    const fallbackSongs = await getNewestSong(limit)
    const fallbackList = Array.isArray(fallbackSongs?.data) ? fallbackSongs.data : Array.isArray(fallbackSongs?.result) ? fallbackSongs.result : []

    return {
        status: 1,
        error_code: 0,
        albums: buildNewestAlbumsFromSongs(fallbackList, limit),
    }
}

/**
 * 登录后调用此接口 ,可获取全部新碟
 * @param {object} options - 选项
 * @param {number} options.limit - 返回数量，默认30
 * @param {number} options.offset - 偏移数量，默认0
 * @param {string} options.area - ALL:全部,ZH:华语,EA:欧美,KR:韩国,JP:日本
 */
export function getNewAlbum({ limit, offset, area, ...params } = {}) {
    const pageSize = limit || 30
    return buildNewestAlbumFallback(pageSize)
}

/**
 * 获取云音乐首页新碟上架数据
 */
export function getNewestAlbum(params = {}) {
    return get('/album/newest', params);
}

/**
 * 获取已收藏专辑列表
 * @param {object} options - 选项
 * @param {number} options.limit - 取出数量，默认25
 * @param {number} options.offset - 偏移数量，默认0
 */
export function getUserSubAlbum({ limit = 25, offset = 0, ...params } = {}) {
    // KuGouMusicApi 当前没有“用户收藏专辑列表”的公开接口，先返回空列表，
    // 同时显式标记 unsupported，避免页面误以为是“没有触发请求”的普通空数据。
    void limit
    void offset
    void params
    return Promise.resolve({
        code: 200,
        count: 0,
        unsupported: true,
        data: [],
    });
}

/**
 * 获取专辑详情
 * @param {string|number} id - 专辑ID
 * @param {object} extraParams - 额外参数
 */
export function getAlbumDetail(id, extraParams = {}) {
    const requestParams = typeof id === 'object' ? { ...(id || {}) } : { id, ...extraParams }

    return Promise.all([
        request({
            url: '/album',
            method: 'get',
            params: {
                album_id: requestParams.id,
                fields: 'trans_param,special_tag,authors,album_name,publish_date,cover,intro,publish_company,type,album_id,language_id,is_publish,heat,grade,quality,exclusive,grade_count,author_name,sizable_cover,language,category',
            },
        }),
        request({
            url: '/album/detail',
            method: 'get',
            params: requestParams,
        }),
    ]).then(async ([albumInfoResult, detailResult]) => {
        const albumInfoRaw = toFirstArrayItem(albumInfoResult)
        const detailRaw = toFirstArrayItem(detailResult)
        const mergedAlbumRaw = {
            ...detailRaw,
            ...albumInfoRaw,
            album_id: albumInfoRaw?.album_id || detailRaw?.album_id || requestParams.id,
        }
        const album = normalizeAlbumDetail(mergedAlbumRaw, requestParams.id)
        const { songs, total } = await fetchAllAlbumSongs(requestParams, mergedAlbumRaw)

        if (!album.size) album.size = total > 0 ? total : (songs.length > 0 ? songs.length : null)

        return { album, songs }
    });
}

/**
 * 收藏/取消收藏专辑
 * @param {string|number} id - 专辑ID
 * @param {boolean} isSubscribe - true为收藏，false为取消收藏
 * @param {object} extraParams - 额外参数
 */
export function subAlbum(id, isSubscribe = true, extraParams = {}) {
    void id
    void isSubscribe
    void extraParams
    return Promise.resolve({
        code: 501,
        message: 'KuGou API 暂不支持专辑收藏',
    });
}

/**
 * 获取专辑动态信息（是否收藏，收藏数，评论数，分享数）
 * @param {string|number} id - 专辑ID
 * @param {object} extraParams - 额外参数
 */
export function albumDynamic(id, extraParams = {}) {
    void id
    void extraParams
    return Promise.resolve({
        isSub: false,
        subCount: 0,
        commentCount: 0,
        shareCount: 0,
    });
}
