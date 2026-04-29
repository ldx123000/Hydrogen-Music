import { get, getById, getWithPagination, operationRequest } from "./base";
import { buildIdWithTimestamp, buildOperationParams, buildPaginationParams } from "./params";

/**
 * 获取推荐新音乐
 * @param {number} limit - 取出数量，默认10
 */
export function getNewestSong(limit = 10) {
    return get('/top/song', { pagesize: limit });
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
    return Promise.resolve({ success: true, message: 'ok' });
}

/**
 * 获取音乐播放URL
 * @param {string|number} id - 音乐ID
 * @param {string} level - 播放音质等级：standard/higher/exhigh/lossless/hires/jyeffect/sky/dolby/jymaster
 * @param {object} requestParams - 额外透传给 /song/url/v1 的请求参数（如 ua、cookie）
 */
function extractPlayableUrl(value) {
    if (!value) return ''
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
        for (const item of value) {
            const url = extractPlayableUrl(item)
            if (url) return url
        }
        return ''
    }
    if (typeof value !== 'object') return ''
    const direct = value.url || value.play_url || value.playurl || value.music_url || value.downurl
    if (direct) return extractPlayableUrl(direct)
    if (Array.isArray(value.backupdownurl) && value.backupdownurl[0]) return value.backupdownurl[0]
    if (Array.isArray(value.tracker_url) && value.tracker_url[0]) return value.tracker_url[0]
    return ''
}

export async function getMusicUrl(hash, quality = 'flac', requestParams = {}) {
    const raw = await get('/song/url', { ...requestParams, hash, quality })
    const body = raw?.body || raw?.data || raw || {}
    const url = extractPlayableUrl(body)
    const type = body?.extName || body?.ext || 'mp3'
    return { data: [{ url: url || null, level: quality, type }] }
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
export async function getLyric(hash) {
    const searchRes = await get('/search/lyric', { hash });
    const info = searchRes?.candidates?.[0];
    if (!info) return { lrc: { lyric: '' } };
    const lyric = await get('/lyric', { id: info.id, accesskey: info.accesskey, fmt: 'lrc', decode: true });
    const lyricText = lyric?.decodeContent || lyric?.lrc?.lyric || '';
    return { lrc: { lyric: lyricText } };
}

/**
 * 获取私人FM
 */
export function getPersonalFM() {
    return get('/personal/fm', {});
}

/**
 * 按模式获取私人FM（用于救援补充）
 * @param {object} options - 选项
 * @param {string} options.mode - 模式：aidj/DEFAULT/FAMILIAR/EXPLORE/SCENE_RCMD
 * @param {string} options.submode - 子模式（SCENE_RCMD 时可选）
 * @param {number} options.limit - 取回数量
 */
export function getPersonalFMByMode({ mode = 'DEFAULT', submode, limit = 3 } = {}) {
    return get('/personal/fm/mode', {
        mode,
        ...(submode ? { submode } : {}),
        ...(limit !== undefined && limit !== null ? { limit } : {}),
        timestamp: new Date().getTime(),
    });
}

/**
 * 将歌曲移至垃圾桶（从私人FM中移除）
 * @param {string|number} id - 歌曲ID
 */
export function fmTrash(id) {
    return getById('/fm_trash', id, {}, false);
}

function toPositiveNumber(value, fallback = 0) {
    const num = Number(value)
    return Number.isFinite(num) && num >= 0 ? num : fallback
}

function resolveMixsongId(input) {
    if (input && typeof input === 'object') {
        return input.mixsongid || input.mixsong_id || input.album_audio_id || input.id || input.songId || input.musicId || null
    }
    return input || null
}

function normalizeCommentTimestamp(value) {
    if (!value) return Date.now()
    const num = Number(value)
    if (Number.isFinite(num) && num > 0) {
        return num < 1e12 ? num * 1000 : num
    }
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? Date.now() : parsed
}

function normalizeCommentUser(item = {}) {
    return {
        userId: item.user_id || item.userid || item.userId || 0,
        nickname: item.user_name || item.nickname || '酷狗用户',
        avatarUrl: item.user_pic || item.avatarUrl || item.avatar || '',
    }
}

function normalizeCommentItem(item = {}) {
    const commentId = Number(item.id || item.commentId || item.tid || 0)
    const likedCount = toPositiveNumber(item?.like?.count ?? item?.like?.likenum ?? item?.likedCount, 0)
    const replyCount = toPositiveNumber(item.reply_num ?? item.comments_num ?? item.replyCount, 0)
    const specialChildId = item.special_child_id || item.special_id || item.specialChildId || ''
    const mixsongid = item.album_audio_id || item.mixsongid || item.mixsong_id || ''

    return {
        commentId,
        content: item.content || '',
        time: normalizeCommentTimestamp(item.addtime || item.time || item.createTime || item.timestamp),
        liked: !!(item?.like?.haslike ?? item?.liked),
        likedCount,
        parentCommentId: Number(item.puser_id || item.parentCommentId || item.pid || 0),
        replyCount,
        showFloorComment: {
            replyCount,
        },
        special_child_id: specialChildId,
        special_id: item.special_id || '',
        specialId: item.special_id || '',
        special_child_name: item.special_child_name || '',
        specialChildId: specialChildId,
        specialChildName: item.special_child_name || '',
        mixsongid,
        album_audio_id: mixsongid,
        user: normalizeCommentUser(item),
        ipLocation: { location: item.location || '' },
        likedUsers: [],
        beReplied: [],
        raw: item,
    }
}

function normalizeMusicCommentsResponse(response, pageSize = 20) {
    const rawList = Array.isArray(response?.list) ? response.list : Array.isArray(response?.data?.list) ? response.data.list : []
    const comments = rawList.map(item => normalizeCommentItem(item))
    const total = toPositiveNumber(response?.count ?? response?.combine_count ?? response?.data?.count, comments.length)
    const currentPage = toPositiveNumber(response?.page ?? response?.p, 1)
    const normalizedPageSize = toPositiveNumber(pageSize, 20) || 20
    const hasMore = currentPage * normalizedPageSize < total

    return {
        ...(response || {}),
        code: 200,
        comments,
        total,
        hasMore,
        cursor: String(currentPage + 1),
    }
}

function normalizeMusicCommentFloorResponse(response, pageSize = 20) {
    const rawList = Array.isArray(response?.list) ? response.list : Array.isArray(response?.data?.list) ? response.data.list : []
    const comments = rawList.map(item => normalizeCommentItem(item))
    const normalizedPageSize = toPositiveNumber(pageSize, 20) || 20
    const lastItem = rawList[rawList.length - 1] || {}
    const nextTime = toPositiveNumber(lastItem.loadoffset ?? response?.time ?? response?.data?.time, -1)

    return {
        code: 200,
        data: {
            comments,
            totalCount: comments.length,
            hasMore: rawList.length >= normalizedPageSize,
            time: nextTime,
        },
    }
}

function buildUnsupportedCommentActionResponse(action = '操作') {
    return Promise.resolve({
        code: 501,
        unsupported: true,
        message: `当前酷狗后端暂不支持歌曲评论${action}`,
    })
}

/**
 * 获取音乐评论
 * @param {string|number} id - 音乐ID
 * @param {object} options - 选项
 * @param {number} options.limit - 取出评论数量，默认20
 * @param {number} options.offset - 偏移数量，默认0
 * @param {number} options.before - 分页参数，用于获取超过5000条评论
 */
export function getMusicComments(id, { limit = 20, offset = 0, ...extraParams } = {}) {
    const source = typeof id === 'object' ? id : { id, limit, offset, ...extraParams }
    const mixsongid = resolveMixsongId(source)
    const requestLimit = toPositiveNumber(source.limit ?? limit, 20) || 20
    const requestOffset = toPositiveNumber(source.offset ?? offset, 0)
    const page = Math.floor(requestOffset / requestLimit) + 1

    return get('/comment/music', {
        mixsongid,
        page,
        pagesize: requestLimit,
        show_classify: source.show_classify ?? 1,
        show_hotword_list: source.show_hotword_list ?? 1,
    }).then(response => normalizeMusicCommentsResponse(response, requestLimit))
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
    const mixsongid = resolveMixsongId(id)
    const response = await get('/comment/music', {
        mixsongid,
        page: pageNo,
        pagesize: pageSize,
        show_classify: sortType === 2 ? 0 : 1,
        show_hotword_list: sortType === 2 ? 0 : 1,
    })

    const normalized = normalizeMusicCommentsResponse(response, pageSize)
    if (sortType === 2) {
        return {
            ...normalized,
            comments: [],
            total: normalized.total,
            hasMore: false,
            cursor: '',
        }
    }
    return normalized
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
    const mixsongid = resolveMixsongId(id)
    const commentTid = Number(parentCommentId)
    const specialId = id && typeof id === 'object'
        ? (id.special_id || id.special_child_id || id.specialId || id.specialChildId || '')
        : ''

    return get('/comment/floor', {
        mixsongid,
        special_id: specialId,
        tid: commentTid,
        page: 1,
        pagesize: limit,
    }).then(response => normalizeMusicCommentFloorResponse(response, limit))
}

/**
 * 发送音乐评论
 * @param {string|number} id - 音乐ID
 * @param {string} content - 评论内容
 * @param {string|number} commentId - 回复的评论ID（可选）
 * @param {object} extraParams - 额外参数
 */
export function postMusicComment(id, content, commentId = null, extraParams = {}) {
    return buildUnsupportedCommentActionResponse(commentId ? '回复' : '发送')
}

/**
 * 给音乐评论点赞/取消点赞
 * @param {string|number} id - 音乐ID
 * @param {string|number} cid - 评论ID
 * @param {boolean} isLike - true为点赞，false为取消点赞
 * @param {object} extraParams - 额外参数
 */
export function likeMusicComment(id, cid, isLike = true, extraParams = {}) {
    return buildUnsupportedCommentActionResponse(isLike ? '点赞' : '取消点赞')
}
