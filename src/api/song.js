import request from "../utils/request";

/**
 * 调用此接口 , 可获取推荐新音乐
 * 可选参数 : limit: 取出数量 , 默认为 10 (不支持 offset)
 * @param {number} limit 
 */
export function getNewestSong() {
    return request({
        url: '/personalized/newsong',
        method: 'get',
        params: {
            limit: 10
        }
    })
}

/**
 * 说明: 调用此接口,传入歌曲 id, 可获取音乐是否可用,返回 { success: true, message: 'ok' } 
 * 或者 { success: false, message: '亲爱的,暂无版权' }
 * @param {number} id 
 * @returns 
 */
export function checkMusic(id) {
    return request({
        url: '/check/music',
        method: 'get',
        params: {
            id: id
        }
    })
}

/**
 * 必选参数 : id : 音乐 id level: 播放音质等级, 
 * 分为 standard => 标准,higher => 较高, exhigh=>极高, lossless=>无损, hires=>Hi-Res
 * @param {number} id 
 * @returns 
 */
export function getMusicUrl(id,level) {
    return request({
        url: '/song/url/v1',
        method: 'get',
        params: {
            id: id,
            level: level
        }
    })
}

/**
 * 说明 : 调用此接口 , 传入音乐 id, 可喜欢该音乐
 * 必选参数 : id: 歌曲 id
 * 可选参数 : like: 布尔值 , 默认为 true 即喜欢 , 若传 false, 则取消喜欢
 * @param {*} id 
 * @returns 
 */
 export function likeMusic(id,like) {
    return request({
        url: '/like',
        method: 'get',
        params: {
            id: id,
            like: like,
            timestamp: new Date().getTime()
        }
    })
}

/**
 * 说明 : 调用此接口 , 传入音乐 id 可获得对应音乐的歌词 ( 不需要登录 )
 * 必选参数 : id: 音乐 id
 * @param {*} id 
 * @returns 
 */
 export function getLyric(id) {
    return request({
        url: '/lyric',
        method: 'get',
        params: {
            id: id,
        }
    })
}

/**
 * 说明 : 私人FM( 需要登录 )
 * @returns 
 */
export function getPersonalFM() {
    return request({
        url: '/personal_fm',
        method: 'get',
        params: {
            timestamp: new Date().getTime()
        }
    })
}

/**
 * 说明 : 垃圾桶( 将该音乐从私人FM中移除 , 需要登录 )
 * 必选参数 : id: 歌曲 id
 * @param {*} id 
 * @returns 
 */
export function fmTrash(id) {
    return request({
        url: '/fm_trash',
        method: 'get',
        params: {
            id: id,
        }
    })
}

/**
 * 说明 : 调用此接口 , 传入音乐 id, 可获得该音乐的所有评论 ( 不需要登录 )
 * 必选参数 : id: 音乐 id
 * 可选参数 : limit: 取出评论数量 , 默认为 20
 * offset: 偏移数量 , 用于分页 , 如 :( 评论页数 -1)*20, 其中 20 为 limit 的值
 * before: 分页参数,取上一页最后一项的 time 获取下一页数据(获取超过5000条评论的时候需要用到)
 * @param {*} params 
 * @returns 
 */
export function getMusicComments(params) {
    return request({
        url: '/comment/music',
        method: 'get',
        params: {
            ...params,
            timestamp: new Date().getTime()
        }
    })
}

/**
 * 说明 : 调用此接口 , 传入音乐 id 和评论内容 , 可发送评论 ( 需要登录 )
 * 必选参数 : id: 音乐 id, content: 评论内容
 * 可选参数 : commentId: 回复的评论id (回复评论时必填)
 * @param {*} params 
 * @returns 
 */
export function postMusicComment(params) {
    return request({
        url: '/comment',
        method: 'get',
        params: {
            t: 1, // 1: 发送, 0: 删除
            type: 0, // 0: 歌曲, 1: mv, 2: 歌单, 3: 专辑, 4: 电台, 5: 视频, 6: 动态
            ...params,
            timestamp: new Date().getTime()
        }
    })
}

/**
 * 说明 : 调用此接口 , 传入评论 id , 可给评论点赞 ( 需要登录 )
 * 必选参数 : id: 音乐 id, cid: 评论 id, t: 是否点赞 , 1 为点赞 ,0 为取消点赞
 * @param {*} params 
 * @returns 
 */
export function likeMusicComment(params) {
    return request({
        url: '/comment/like',
        method: 'get',
        params: {
            type: 0, // 0: 歌曲
            ...params,
            timestamp: new Date().getTime()
        }
    })
}