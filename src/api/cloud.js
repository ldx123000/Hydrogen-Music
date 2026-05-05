import request from "../utils/request";

/**
 * 说明 : 登录后调用此接口 , 可获取云盘数据 , 获取的数据没有对应 url, 需要再调用一 次 /song/url 获取 url
 * 可选参数 :
 * limit : 返回数量 , 默认为 30
 * offset : 偏移数量，用于分页 , 如 :( 页数 -1)*200, 其中 200 为 limit 的值 , 默认为 0
 * @param {*} params 
 * @returns 
 */
 export function getCloudDiskData(params) {
    return request({
        url: '/user/cloud',
        method: 'get',
        params,
    })
}

/**
 * 说明 : 登录后调用此接口 , 传入云盘歌曲 id，可获取云盘数据详情
 * 必选参数 : id: 歌曲 id,可多个,用逗号隔开
 * @param {*} params 
 * @returns 
 */
 export function getCloudDiskDrtail(params) {
    return request({
        url: '/user/cloud/detail',
        method: 'get',
        params,
    })
}

/**
 * 说明 : 登录后调用此接口 , 可删除云盘歌曲
 * 必选参数 : id: 歌曲 id,可多个,用逗号隔开
 * @param {*} params 
 * @returns 
 */
export function deleteCloudSong(params) {
    return request({
        url: '/user/cloud/del',
        method: 'get',
        params,
    })
}

/**
 * 说明 : 登录后调用此接口, 获取云盘歌曲歌词，歌词来自文件元数据的 LYRICS 标签
 * 可选参数 :
 * uid : 用户 id
 * sid : 云盘歌曲 id
 * @param {*} params
 * @returns
 */
export function getCloudLyric(params) {
    return request({
        url: '/cloud/lyric/get',
        method: 'get',
        params,
    })
}

/**
 * 说明 : 登录后调用此接口,使用'Content-Type': 'multipart/form-data'上传 mp3 formData(name 为'songFile'),可上传歌曲到云盘
 * @param {*} params 
 * @returns 
 */
export function uploadCloudSong(formData) {
    return request({
        url: '/cloud',
        method: 'post',
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        data: formData,
        params: {
            timestamp: new Date().getTime(),
        },
        timeout: 99999999,
    })
}
