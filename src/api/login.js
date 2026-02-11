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
 * 必选参数 :
 * email: 163 网易邮箱
 * password: 密码
 * 可选参数 :
 * md5_password: md5 加密后的密码,传入后 password 将失效
 * @returns 
 */
 export function loginByEmail(params) {
    return request({
        url: '/login',
        method: 'post',
        params,
    });
}

/**
 * 必选参数 :
 * phone: 手机号码
 * password: 密码
 * 可选参数 :
 * countrycode: 国家码，用于国外手机号登录，例如美国传入：1
 * md5_password: md5 加密后的密码,传入后 password 参数将失效
 * captcha: 验证码,使用 /captcha/sent接口传入手机号获取验证码,调用此接口传入验证码,可使用验证码登录,传入后 password 参数将失效
 * @returns 
 */
export function loginByPhone(params) {
    return request({
        url: '/login/cellphone',
        method: 'post',
        params,
    });
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
