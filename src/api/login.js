import request from "../utils/request";

function buildLoginPayload(params = {}) {
    return {
        username: params?.username || params?.email || params?.account || '',
        email: params?.email || params?.username || '',
        phone: params?.phone || params?.mobile || '',
        mobile: params?.mobile || params?.phone || '',
        password: params?.password || '',
        md5_password: params?.md5_password || params?.md5Password || '',
        countrycode: params?.countrycode,
        userid: params?.userid,
        code: params?.code || params?.captcha || '',
    }
}

/**
 * 调用此接口可生成一个 key。
 * @returns
 */
export function getQRcodeKey() {
    return request({
        url: '/login/qr/key',
        method: 'get',
        params: {
            timestamp: new Date().getTime(),
        },
    })
}

/**
 * 兼容旧调用：原 getQRcode 仅取 key。
 * @returns
 */
export function getQRcode() {
    return getQRcodeKey()
}

/**
 * 生成二维码（官方推荐：先取 key 再 create）。
 * @param {string} key
 * @returns
 */
export function createQRcode(key) {
    return request({
        url: '/login/qr/create',
        method: 'get',
        params: {
            key,
            qrimg: 1,
            timestamp: new Date().getTime(),
        },
    })
}

/**
 * 轮询此接口可获取二维码扫码状态。
 * @param {string} key
 * @returns
 */
export function checkQRcodeStatus(key) {
    return request({
        url: '/login/qr/check',
        method: 'get',
        params: {
            key,
            timestamp: new Date().getTime(),
        },
    })
}

/**
 * 账号登录。
 * 兼容 email / username / account 等字段写法。
 * @returns
 */
export function loginByEmail(params) {
    const payload = buildLoginPayload(params)

    return request({
        url: '/login',
        method: 'post',
        params: payload,
    })
}

/**
 * 手机登录。
 * 兼容 phone / mobile / code / captcha 等字段写法。
 * @returns
 */
export function loginByPhone(params) {
    const payload = buildLoginPayload(params)

    return request({
        url: '/login/cellphone',
        method: 'post',
        params: payload,
    })
}

/**
 * 调用此接口，可退出登录。
 * @returns
 */
export function logout() {
    return request({
        url: '/logout',
        method: 'post',
        params: {},
    })
}
