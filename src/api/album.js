import { get, getById, getWithPagination, operationRequest } from "./base";
import { buildIdWithTimestamp, buildOperationParams } from "./params";
import { getNewestSong } from "./song";

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
    return getWithPagination('/album/sublist', { limit, offset, ...params });
}

/**
 * 获取专辑详情
 * @param {string|number} id - 专辑ID
 * @param {object} extraParams - 额外参数
 */
export function getAlbumDetail(id, extraParams = {}) {
    // 支持旧的调用方式（传入params对象）
    if (typeof id === 'object') {
        return get('/album', id);
    }
    return getById('/album', id, extraParams, false);
}

/**
 * 收藏/取消收藏专辑
 * @param {string|number} id - 专辑ID
 * @param {boolean} isSubscribe - true为收藏，false为取消收藏
 * @param {object} extraParams - 额外参数
 */
export function subAlbum(id, isSubscribe = true, extraParams = {}) {
    // 支持旧的调用方式（传入params对象）
    if (typeof id === 'object') {
        return get('/album/sub', id);
    }
    const params = buildOperationParams(id, isSubscribe, extraParams);
    return get('/album/sub', params);
}

/**
 * 获取专辑动态信息（是否收藏，收藏数，评论数，分享数）
 * @param {string|number} id - 专辑ID
 * @param {object} extraParams - 额外参数
 */
export function albumDynamic(id, extraParams = {}) {
    const params = buildIdWithTimestamp(id, extraParams);
    return get('/album/detail/dynamic', params);
}
