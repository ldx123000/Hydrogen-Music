import request from "../utils/request";

/**
 * 登录后调用此接口 ,可获取全部新碟
 *可选参数 :
 *limit : 返回数量 , 默认为 30
 *offset : 偏移数量，用于分页 , 如 :( 页数 -1)*30, 其中 30 为 limit 的值 , 默认为 0
 *area : ALL:全部,ZH:华语,EA:欧美,KR:韩国,JP:日本
 */
 export function getNewAlbum(params) {
    return request({
        url: '/album/new',
        method: 'get',
        params,
    })
}

/**
 * 调用此接口 ，获取云音乐首页新碟上架数据
 */
 export function getNewestAlbum(params) {
    return request({
        url: '/album/newest',
        method: 'get',
        params
    })
}

/**
 * 说明 : 调用此接口 , 可获得已收藏专辑列表
 * 可选参数 :
 * limit: 取出数量 , 默认为 25
 * offset: 偏移数量 , 用于分页 , 如 :( 页数 -1)*25, 其中 25 为 limit 的值 , 默认 为 0
 * @param {*} params 
 * @returns 
 */
 export function getUserSubAlbum(params) {
    return request({
        url: '/album/sublist',
        method: 'get',
        params,
    })
}

/**
 * 说明 : 调用此接口 , 传入专辑 id, 可获得专辑内容
 * 必选参数 : id: 专辑 id
 * @param {*} params 
 * @returns 
 */
 export function getAlbumDetail(params) {
    return request({
        url: '/album',
        method: 'get',
        params,
    })
}

/**
 * 说明 : 调用此接口,可收藏/取消收藏专辑
 * 必选参数 :
 * id : 专辑 id
 * t : 1 为收藏,其他为取消收藏
 * @param {*} params 
 * @returns 
 */
 export function subAlbum(params) {
    return request({
        url: '/album/sub',
        method: 'get',
        params,
    })
}

/**
 * 说明 : 调用此接口 , 传入专辑 id, 可获得专辑动态信息,如是否收藏,收藏数,评论数,分享数
 * 必选参数 : id: 专辑 id
 * @param {*} params 
 * @returns 
 */
 export function albumDynamic(id) {
    return request({
        url: '/album/detail/dynamic',
        method: 'get',
        params: {
            id: id,
            timestamp: new Date().getTime(),
        }
    })
}