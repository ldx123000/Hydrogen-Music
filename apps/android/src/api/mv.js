import request from "../utils/request";

/**
 * 收藏的 MV 列表
 * 说明 : 调用此接口,可获取收藏的 MV 列表
 * @returns 
 */
 export function getUserSubMV() {
    return request({
        url: '/mv/sublist',
        method: 'get',
        params: {
            // timestamp: new Date().getTime(),
        }
    })
}

/**
 * 说明 : 调用此接口 , 传入歌手 id, 可获得歌手 mv 信息 , 具体 mv 播放地址可调 用/mv传入此接口获得的 mvid 来拿到 , 
 * 如 : /artist/mv?id=6452,/mv?mvid=5461064
 * @returns 
 */
 export function getArtistMV(params) {
    return request({
        url: '/artist/mv',
        method: 'get',
        params,
    })
}

/**
 * 说明 : 调用此接口 , 传入 mvid ( 在搜索音乐的时候传 type=1004 获得 ) , 可获取对应 MV 数据 , 数据包含 mv 名字 , 歌手 , 发布时间 , mv 视频地址等数据 , 其中 mv 视频 网易做了防盗链处理 , 可能不能直接播放 , 需要播放的话需要调用 ' mv 地址' 接口
 * 必选参数 : mvid: mv 的 id
 * @param {*} mvid 
 * @returns 
 */
 export function getMVDetail(id) {
    return request({
        url: '/mv/detail',
        method: 'get',
        params: {
            mvid: id,
        }
    })
}
/**
 * 说明 : 调用此接口 , 传入 mv id,可获取 mv 播放地址
 * 必选参数 : id: mv id
 * 可选参数 : r: 分辨率,默认 1080,可从 /mv/detail 接口获取分辨率列表
 * 接口地址 : /mv/url
 * @param {*} id 
 * @returns 
 */
export function getMVUrl(id, r) {
    return request({
        url: '/mv/url',
        method: 'get',
        params: {
            id: id,
            r: r,
        }
    })
}