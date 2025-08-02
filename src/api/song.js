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