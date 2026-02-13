import { get, getById, getWithPagination, operationRequest } from "./base";
import { buildIdWithTimestamp, buildOperationParams, buildPaginationParams } from "./params";

/**
 * 获取推荐新音乐
 * @param {number} limit - 取出数量，默认10
 */
export function getNewestSong(limit = 10) {
    return get('/personalized/newsong', { limit });
}

/**
 * 获取歌曲详情
 * @param {string|array} ids - 歌曲ID，可以是单个ID或ID数组
 */
export function getSongDetail(ids) {
    const idsParam = Array.isArray(ids) ? ids.join(',') : ids;
    return get('/song/detail', { ids: idsParam });
}

/**
 * 检查音乐是否可用
 * @param {string|number} id - 音乐ID
 */
export function checkMusic(id) {
    return getById('/check/music', id, {}, false);
}

/**
 * 获取音乐播放URL
 * @param {string|number} id - 音乐ID
 * @param {string} level - 播放音质等级：standard/higher/exhigh/lossless/hires/jyeffect/sky/dolby/jymaster
 */
export function getMusicUrl(id, level = 'lossless') {
    return get('/song/url/v1', { id, level });
}

/**
 * 喜欢/取消喜欢音乐
 * @param {string|number} id - 歌曲ID
 * @param {boolean} like - true为喜欢，false为取消喜欢
 */
export function likeMusic(id, like = true) {
    const params = buildIdWithTimestamp(id, { like });
    return get('/like', params);
}

/**
 * 获取音乐歌词
 * @param {string|number} id - 音乐ID
 */
export function getLyric(id) {
    return getById('/lyric', id, {}, false);
}

/**
 * 获取私人FM
 */
export function getPersonalFM() {
    return get('/personal_fm', buildIdWithTimestamp(''));
}

/**
 * 将歌曲移至垃圾桶（从私人FM中移除）
 * @param {string|number} id - 歌曲ID
 */
export function fmTrash(id) {
    return getById('/fm_trash', id, {}, false);
}

/**
 * 获取音乐评论
 * @param {string|number} id - 音乐ID
 * @param {object} options - 选项
 * @param {number} options.limit - 取出评论数量，默认20
 * @param {number} options.offset - 偏移数量，默认0
 * @param {number} options.before - 分页参数，用于获取超过5000条评论
 */
export function getMusicComments(id, { limit = 20, offset = 0, before, ...extraParams } = {}) {
    // 支持旧的调用方式（传入params对象）
    if (typeof id === 'object') {
        return get('/comment/music', { ...id, timestamp: new Date().getTime() });
    }
    
    const params = {
        id,
        limit,
        offset,
        ...(before && { before }),
        ...extraParams,
        timestamp: new Date().getTime()
    };
    
    return get('/comment/music', params);
}

/**
 * 归一化 comment/new 返回结构，避免上层关心 data 字段层级
 * @param {object} response - 原始接口响应
 * @returns {object}
 */
function normalizeCommentNewResponse(response) {
    const data = response && typeof response === 'object' ? response.data || {} : {};
    return {
        ...(response || {}),
        comments: Array.isArray(data.comments) ? data.comments : [],
        total: Number.isFinite(Number(data.totalCount)) ? Number(data.totalCount) : 0,
        hasMore: !!data.hasMore,
        cursor: data.cursor ?? '',
    };
}

/**
 * 获取新版音乐评论（comment/new）
 * @param {object} params
 * @param {string|number} params.id - 音乐ID
 * @param {number|string} params.sortType - 1推荐/2热度/3时间
 * @param {number|string} params.pageSize - 每页数量
 * @param {number|string} params.pageNo - 页码
 * @param {number|string} params.cursor - 时间排序游标
 */
export async function getMusicCommentsNew({ id, sortType = 3, pageSize = 20, pageNo = 1, cursor } = {}) {
    const response = await get('/comment/new', {
        id,
        type: 0, // 0 = 歌曲
        sortType,
        pageSize,
        pageNo,
        ...(cursor !== undefined && cursor !== null && cursor !== '' ? { cursor } : {}),
        timestamp: new Date().getTime(),
    });
    return normalizeCommentNewResponse(response);
}

/**
 * 获取音乐评论楼层回复（comment/floor）
 * @param {object} params
 * @param {string|number} params.id - 音乐ID
 * @param {string|number} params.parentCommentId - 父评论ID
 * @param {number|string} params.limit - 分页数量
 * @param {number|string} params.time - 分页游标时间
 */
export function getMusicCommentFloor({ id, parentCommentId, limit = 20, time = -1 } = {}) {
    return get('/comment/floor', {
        id,
        type: 0, // 0 = 歌曲
        parentCommentId,
        limit,
        time,
        timestamp: new Date().getTime(),
    });
}

/**
 * 发送音乐评论
 * @param {string|number} id - 音乐ID
 * @param {string} content - 评论内容
 * @param {string|number} commentId - 回复的评论ID（可选）
 * @param {object} extraParams - 额外参数
 */
export function postMusicComment(id, content, commentId = null, extraParams = {}) {
    // 支持旧的调用方式（传入params对象）
    if (typeof id === 'object') {
        return get('/comment', {
            t: 1,
            type: 0,
            ...id,
            timestamp: new Date().getTime()
        });
    }
    
    const params = {
        id,
        content,
        t: 1, // 1: 发送, 0: 删除
        type: 0, // 0: 歌曲
        ...(commentId && { commentId }),
        ...extraParams,
        timestamp: new Date().getTime()
    };
    
    return get('/comment', params);
}

/**
 * 给音乐评论点赞/取消点赞
 * @param {string|number} id - 音乐ID
 * @param {string|number} cid - 评论ID
 * @param {boolean} isLike - true为点赞，false为取消点赞
 * @param {object} extraParams - 额外参数
 */
export function likeMusicComment(id, cid, isLike = true, extraParams = {}) {
    // 支持旧的调用方式（传入params对象）
    if (typeof id === 'object') {
        return get('/comment/like', {
            type: 0,
            ...id,
            timestamp: new Date().getTime()
        });
    }
    
    const params = {
        id,
        cid,
        t: isLike ? 1 : 0,
        type: 0, // 0: 歌曲
        ...extraParams,
        timestamp: new Date().getTime()
    };
    
    return get('/comment/like', params);
}
