import { get, getById, getWithPagination, operationRequest } from "./base";
import { buildTypeParams, buildIdWithTimestamp, buildOperationParams, buildPaginationParams } from "./params";

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
    if (typeof id === 'object') {
        return get('/artist/detail', id);
    }
    return get('/artist/detail', { id, ...extraParams });
}

/**
 * 获取歌手热门50首歌曲
 * @param {string|number} id - 歌手ID
 * @param {object} extraParams - 额外参数
 */
export function getArtistTopSong(id, extraParams = {}) {
    if (typeof id === 'object') {
        return get('/artist/audios', id);
    }
    return get('/artist/audios', { id, ...extraParams });
}

/**
 * 获取歌手专辑列表
 * @param {string|number} id - 歌手ID
 * @param {object} options - 选项
 * @param {number} options.limit - 取出数量，默认30
 * @param {number} options.offset - 偏移数量，默认0
 */
export function getArtistAlbum(id, { limit = 30, offset = 0, ...extraParams } = {}) {
    if (typeof id === 'object') {
        return get('/artist/albums', id);
    }
    const page = offset ? Math.floor(offset / limit) + 1 : 1;
    return get('/artist/albums', { id, page, pagesize: limit, ...extraParams });
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
