import request from '../utils/request'
/**
 * 登录后调用此接口 ,可获取用户账号信息
 * @returns 
 */
 export function getUserProfile() {
    return request({
      url: '/user/detail',
      method: 'get',
      params: {
        timestamp: new Date().getTime(),
      },
    });
  }

/**
 * 登录后调用此接口，可以获取用户的所有创建以及收藏的歌单
 * 可选参数 : page 页数, pagesize 每页数量(默认30)
 * @returns
 */
  export function getUserPlaylist(params) {
    return request({
      url: '/user/playlist',
      method: 'get',
      params,
    });
  }

/**
 * 获取用户信息 , 歌单，收藏，mv, dj 数量
 * 说明 : 登录后调用此接口 , 可以获取用户信息
 * @param {*} params 
 * @returns 
 */
  export function getUserPlaylistCount() {
    return request({
      url: '/user/detail',
      method: 'get',
      params: {
        timestamp: new Date().getTime(),
      }
    });
  }

/**
 * 说明 : 调用此接口 , 可退出登录
 * @returns 
 */
  export function logout() {
      return Promise.resolve({ status: 1 });
  }

/**
 * 说明 : 调用此接口 , 传入用户 id, 可获取已喜欢音乐 id 列表(id 数组)
 * @param {*} id 
 * @returns 
 */
 export function getLikelist(id) {
    return request({
      url: '/likelist',
      method: 'get',
      params: {
        id: id,
        timestamp: new Date().getTime(),
      }
    });
  }

/**
 * 说明: 登录后调用此接口，可获取当前 VIP 信息。
 * @param {*} id 
 * @returns 
 */
  export function getVipInfo() {
    return request({
      url: '/user/vip/detail',
      method: 'get',
      params: {
        timestamp: new Date().getTime(),
      }
    });
  }