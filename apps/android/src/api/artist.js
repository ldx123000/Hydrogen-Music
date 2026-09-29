import { get, getById, getWithPagination, operationRequest } from "./base";
import { buildTypeParams, buildIdWithTimestamp, buildOperationParams, buildPaginationParams } from "./params";

/**
 * 获取排行榜中的歌手榜
 * @param {number} type - 1:华语 2:欧美 3:韩国 4:日本
 */
export function getRecommendedArtists(type) {
    return get('/top/artists', buildTypeParams(type));
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
    // 支持旧的调用方式（传入params对象）
    if (typeof id === 'object') {
        return get('/artists', id);
    }
    return getById('/artists', id, extraParams, false);
}

/**
 * 获取歌手热门50首歌曲
 * @param {string|number} id - 歌手ID
 * @param {object} extraParams - 额外参数
 */
export function getArtistTopSong(id, extraParams = {}) {
    // 支持旧的调用方式（传入params对象）
    if (typeof id === 'object') {
        return get('/artist/top/song', id);
    }
    return getById('/artist/top/song', id, extraParams, false);
}

/**
 * 获取歌手专辑列表
 * @param {string|number} id - 歌手ID
 * @param {object} options - 选项
 * @param {number} options.limit - 取出数量，默认30
 * @param {number} options.offset - 偏移数量，默认0
 */
export function getArtistAlbum(id, { limit = 30, offset = 0, ...extraParams } = {}) {
    // 支持旧的调用方式（传入params对象）
    if (typeof id === 'object') {
        return get('/artist/album', id);
    }
    const paginationParams = buildPaginationParams(
        offset ? Math.floor(offset / limit) + 1 : 1,
        limit
    );
    return get('/artist/album', { id, ...paginationParams, ...extraParams });
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