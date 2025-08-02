import request from "../utils/request";

/**
 * 调用此接口获取排行榜中的歌手榜
 * type : 1:华语 2:欧美 3:韩国 4:日本
 * @param {number} type
 * @returns 
 */
 export function getRecommendedArtists(type) {
    return request({
        url: '/top/artists',
        method: 'get',
        params: {
            type: type,
        }
    })
}

/**
 * 收藏的歌手列表
 * 说明 : 调用此接口,可获取收藏的歌手列表
 * @param {*} type 
 * @returns 
 */
 export function getUserSubArtists() {
    return request({
        url: '/artist/sublist',
        method: 'get',
        params: {
            // timestamp: new Date().getTime(),
        }
    })
}

/**
 * 说明 : 调用此接口 , 传入歌手 id, 可获得获取歌手详情
 * @returns 
 */
//  export function getArtistDetail(params) {
//     return request({
//         url: '/artist/detail',
//         method: 'get',
//         params,
//     })
// }

/**
 * 说明 : 调用此接口 , 传入歌手 id, 可获得歌手部分信息和热门歌曲
 * 必选参数 : id: 歌手 id, 可由搜索接口获得
 * @param {*} params 
 * @returns 
 */
 export function getArtistDetail(params) {
    return request({
        url: '/artists',
        method: 'get',
        params,
    })
}

/**
 * 说明 : 调用此接口,可获取歌手热门 50 首歌曲
 * @param {*} params 
 * @returns 
 */
export function getArtistTopSong(params) {
    return request({
        url: '/artist/top/song',
        method: 'get',
        params,
    })
}

/**
 * 说明 : 调用此接口 , 传入歌手 id, 可获得歌手专辑内容
 * 必选参数 : id: 歌手 id
 * 可选参数 : limit: 取出数量 , 默认为 30
 * offset: 偏移数量 , 用于分页 , 如 :( 页数 -1)*30, 其中 30 为 limit 的值 , 默认 为 0
 * @param {*} params 
 * @returns 
 */
export function getArtistAlbum(params) {
    return request({
        url: '/artist/album',
        method: 'get',
        params,
    })
}

/**
 * 说明 : 调用此接口 , 传入歌手 id, 可获取歌手粉丝数量
 * @param {*} params 
 * @returns 
 */
export function getArtistFansCount(id) {
    return request({
        url: '/artist/follow/count',
        method: 'get',
        params: {
            id: id,
            timestamp: new Date().getTime(),
        }
    })
}

/**
 * 说明 : 调用此接口,可收藏歌手
 * 必选参数 :
 * id : 歌手 id
 * t:操作,1 为收藏,其他为取消收藏
 * @param {*} params 
 * @returns 
 */
export function subArtist(params) {
    return request({
        url: '/artist/sub',
        method: 'get',
        params,
    })
}