import { get, getById, getWithPagination, operationRequest } from "./base";
import { buildIdWithTimestamp, buildOperationParams, buildPaginationParams } from "./params";

/**
 * 获取推荐新音乐
 * @param {number} limit - 取出数量，默认10
 */
function normalizeNewestSongArtists(song = {}) {
    const authors = Array.isArray(song?.authors) ? song.authors : []
    if (authors.length > 0) {
        return authors
            .map(item => {
                const name = item?.author_name || item?.name || ''
                if (!name) return null
                return {
                    id: item?.author_id ?? item?.id ?? null,
                    name,
                }
            })
            .filter(Boolean)
    }

    const fallbackName = song?.author_name || ''
    if (!fallbackName) return []

    return fallbackName
        .split(/、|\/|,|，/)
        .map(name => name.trim())
        .filter(Boolean)
        .map(name => ({ id: null, name }))
}

function normalizeNewestSongItem(song = {}) {
    const artists = normalizeNewestSongArtists(song)
    const cover = song?.album_sizable_cover || song?.trans_param?.union_cover || song?.sizable_cover || song?.picUrl || song?.blurPicUrl || ''
    const coverUrl = typeof cover === 'string' ? cover.replace('{size}', '480') : cover
    const duration = Number(song?.timelength ?? song?.duration ?? song?.dt ?? 0) || 0

    return {
        ...song,
        id: song?.audio_id ?? song?.album_audio_id ?? song?.id ?? null,
        hash: song?.hash || '',
        name: song?.songname || song?.name || song?.filename || '',
        ar: artists,
        artists,
        al: {
            id: song?.album_id ?? null,
            name: song?.album_name || '',
            picUrl: coverUrl,
        },
        album: {
            id: song?.album_id ?? null,
            name: song?.album_name || '',
            picUrl: coverUrl,
        },
        picUrl: coverUrl,
        blurPicUrl: coverUrl,
        coverUrl,
        dt: duration,
        duration,
        source: 'top-song',
        type: 'song',
    }
}

export function getNewestSong(limit = 10) {
    return get('/top/song', { pagesize: limit }).then(result => {
        const rawList = Array.isArray(result?.data) ? result.data : Array.isArray(result?.result) ? result.result : []
        return {
            ...result,
            result: rawList.map(item => normalizeNewestSongItem(item)).filter(item => item.id && item.name),
        }
    });
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
    // 部分响应结构将有效地址嵌套在 data 字段内，递归兜底
    if (value.data) return extractPlayableUrl(value.data)
    return ''
}

function isHashLike(value) {
    return typeof value === 'string' && /^[A-Fa-f0-9]{32}$/.test(value.trim())
}

function buildSongUrlParams(input, quality, requestParams = {}) {
    const source = input && typeof input === 'object' ? input : {}
    const primitiveValue = input && typeof input !== 'object' ? String(input) : ''
    const hash = String(
        source?.hash ||
        source?.FileHash ||
        source?.file_hash ||
        source?.deprecated?.hash ||
        source?.audio_info?.hash_128 ||
        source?.audio_info?.hash_320 ||
        (isHashLike(primitiveValue) ? primitiveValue : '')
    ).trim()
    const albumAudioId = source?.album_audio_id || source?.mixsongid || source?.mixsong_id || (!isHashLike(primitiveValue) ? primitiveValue : '')

    const params = { ...requestParams, quality }
    if (hash) params.hash = hash
    if (albumAudioId) params.album_audio_id = albumAudioId
    return params
}

export async function getMusicUrl(input, quality = 'flac', requestParams = {}) {
    const raw = await get('/song/url', buildSongUrlParams(input, quality, requestParams))
    const body = raw?.body || raw?.data || raw || {}
    const url = extractPlayableUrl(body)
    const type = body?.extName || body?.ext || 'mp3'
    return { data: [{ url: url || null, level: quality, type }] }
}

/**
 * 获取音乐播放URL（新接口，支持 VIP 凭证）
 * 当 /song/url 无法返回有效地址时降级使用此接口。
 * @param {object|string} input - 歌曲对象或 ID
 * @param {string} quality - 音质
 * @param {object} requestParams - 额外参数
 */
export async function getMusicUrlNew(input, quality = 'flac', requestParams = {}) {
    const raw = await get('/song/url/new', buildSongUrlParams(input, quality, requestParams))
    const body = raw?.body || raw?.data || raw || {}
    const url = extractPlayableUrl(body)
    const type = body?.extName || body?.ext || 'mp3'
    return { data: [{ url: url || null, level: quality, type }] }
}

function resolveSongHash(input) {
    if (input && typeof input === 'object') {
        return String(
            input?.hash
            || input?.FileHash
            || input?.file_hash
            || input?.deprecated?.hash
            || input?.audio_info?.hash_128
            || input?.audio_info?.hash_320
            || input?.hash_128
            || input?.hash_high
            || input?.hash_flac
            || ''
        ).trim()
    }

    return String(input || '').trim()
}

/**
 * 获取歌曲副歌时间段
 * @param {object|string} input - 歌曲对象或歌曲 hash
 * @returns {Promise<object>} 酷狗高潮接口原始响应
 */
export function getSongClimax(input) {
    const hash = resolveSongHash(input)
    return get('/song/climax', { hash })
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
 * 统一整理酷狗私人漫游接口的返回结构。
 * 酷狗接口真实歌曲列表位于 data.song_list，旧前端仍按网易云 data 数组读取，
 * 这里做一层兼容，避免页面端重复判断返回结构。
 * @param {object} response - 原始接口响应
 * @returns {object} 兼容后的响应对象，data 恒为歌曲数组
 */
function normalizePersonalFMResponse(response) {
    const songList = Array.isArray(response?.data?.song_list)
        ? response.data.song_list
        : Array.isArray(response?.song_list)
            ? response.song_list
            : Array.isArray(response?.data)
                ? response.data
                : []

    return {
        ...response,
        data: songList,
        fmMeta: response?.data && typeof response.data === 'object' && !Array.isArray(response.data)
            ? response.data
            : {},
    }
}

/**
 * 获取私人漫游歌曲列表。
 * 文档地址：/personal/fm
 * @param {object} params - 酷狗私人漫游接口参数
 * @returns {Promise<object>} 兼容后的响应对象，data 为歌曲数组
 */
export function getPersonalFM(params = {}) {
    return get('/personal/fm', {
        timestamp: new Date().getTime(),
        ...params,
    }).then(normalizePersonalFMResponse)
}

/**
 * 按模式获取私人漫游。
 * 旧前端沿用了网易云的 /personal/fm/mode，这里改为对接酷狗文档中的 /personal/fm。
 * @param {object} options - 选项
 * @param {string} options.mode - 漫游模式：normal/small/peak
 * @param {number|string} options.song_pool_id - AI 推荐池：0/1/2
 * @param {string} options.hash - 当前歌曲 hash
 * @param {string|number} options.songid - 当前歌曲 songid
 * @param {string|number} options.playtime - 当前歌曲已播放秒数
 * @param {string} options.action - play 或 garbage
 * @param {boolean|number} options.is_overplay - 是否完整播放
 * @param {number} options.remain_songcnt - 剩余未播放歌曲数
 */
export function getPersonalFMByMode(options = {}) {
    return getPersonalFM(options)
}

/**
 * 将私人漫游中的当前歌曲标记为“不喜欢”。
 * 酷狗文档使用 /personal/fm?action=garbage，而不是网易云的 /fm_trash。
 * @param {object|string|number} song - 当前歌曲对象或歌曲ID
 * @param {object} extraParams - 额外的上下文参数，用于提升下一批推荐的准确度
 */
export function fmTrash(song, extraParams = {}) {
    const source = song && typeof song === 'object' ? song : { id: song }
    return getPersonalFM({
        action: 'garbage',
        hash: source?.hash || '',
        songid: source?.songid || source?.songId || source?.id || '',
        ...extraParams,
    });
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
