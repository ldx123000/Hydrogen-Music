import { get, getById, getWithPagination, operationRequest } from "./base";
import { buildAreaParams, buildPaginationParams, buildIdWithTimestamp, buildOperationParams } from "./params";

/**
 * 登录后调用此接口 ,可获取全部新碟
 * @param {object} options - 选项
 * @param {number} options.limit - 返回数量，默认30
 * @param {number} options.offset - 偏移数量，默认0
 * @param {string} options.area - ALL:全部,ZH:华语,EA:欧美,KR:韩国,JP:日本
 */
export function getNewAlbum({ limit, offset, area, ...params } = {}) {
    const paginationParams = buildPaginationParams(
        offset ? Math.floor(offset / (limit || 30)) + 1 : 1,
        limit
    );
    const areaParams = area ? buildAreaParams(area) : {};
    return get('/album/new', { ...paginationParams, ...areaParams, ...params });
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