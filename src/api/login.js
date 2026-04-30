import request from "../utils/request";

/**
 * 调用此接口可生成一个 key
 * @returns 
 */
export function getQRcodeKey() {
    return request({
        url: '/login/qr/key',
        method: 'get',
        params: {
            timestamp: new Date().getTime()
        }
    })
}

/**
 * 生成二维码（官方推荐：先取 key 再 create）
 * @param {string} key
 * @returns
 */
export function createQRcode(key) {
    return request({
        url: '/login/qr/create',
        method: 'get',
        params: {
            key,
            qrimg: true,
            timestamp: new Date().getTime(),
        },
    })
}

// 兼容旧调用：原 getQRcode 仅取 key
export function getQRcode() {
    return getQRcodeKey()
}
/**
 * 轮询此接口可获取二维码扫码状态,800 为二维码过期,801 为等待扫码,802 为待确认,803 为授权登录成功(803 状态码下会返回 cookies)
 * 必选参数: key,由第一个接口生成
 * @param {String} key 
 * @returns 
 */
export function checkQRcodeStatus(key) {
    return request({
        url: '/login/qr/check',
        method: 'get',
        params: {
            key: key,
            timestamp: new Date().getTime(),
        }
    })
}

/**
 * 刷新登录 Cookie。
 */
export function refreshLogin() {
    return request({
        url: '/login/refresh',
        method: 'post',
        params: {
            timestamp: new Date().getTime(),
        },
    })
}

/**
 * 必选参数 :
 * phone: 手机号码
 * 可选参数 :
 * countrycode: 国家码，用于国外手机号登录，例如美国传入：1
 * captcha: 验证码,使用 /captcha/sent 接口传入手机号获取验证码
 * @returns 
 */
export function loginByPhone(data) {
    return request({
        url: '/login/cellphone',
        method: 'post',
        params: {
            timestamp: new Date().getTime(),
        },
        data,
    });
}

/**
 * 发送手机验证码。
 */
export function sendPhoneCaptcha(data) {
    return request({
        url: '/captcha/sent',
        method: 'post',
        params: {
            timestamp: new Date().getTime(),
        },
        data,
    })
}

/**
 * 调用此接口 , 可退出登录
 * @returns 
 */
export function logout() {
    return request({
        url: '/logout',
        method: 'post',
        params: {
        
        },
    });
}
