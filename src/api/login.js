import request from "../utils/request";

function withTimestamp(params = {}) {
    return {
        ...params,
        timestamp: Date.now(),
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
        params: withTimestamp(),
    }).then((result) => {
        const key = result?.data?.unikey || result?.data?.qrcode || ''
        return {
            ...result,
            data: {
                ...(result?.data || {}),
                unikey: key,
            },
        }
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
        params: withTimestamp({
            key,
            qrimg: 1,
        }),
    }).then((result) => {
        const qrimg = result?.data?.qrimg || result?.data?.base64 || ''
        return {
            ...result,
            data: {
                ...(result?.data || {}),
                qrimg,
            },
        }
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
        params: withTimestamp({
            key,
        }),
    })
}

/**
 * 微信二维码创建
 * @returns
 */
export function createWeChatQRcode() {
    return request({
        url: '/login/wx/create',
        method: 'get',
        params: withTimestamp(),
    })
}

/**
 * 微信二维码状态检测
 * @param {string} uuid
 * @returns
 */
export function checkWeChatStatus(uuid) {
    return request({
        url: '/login/wx/check',
        method: 'get',
        params: withTimestamp({
            uuid,
        }),
    })
}

/**
 * 使用微信授权 code 登录
 * @param {string} code
 * @returns
 */
export function loginByOpenPlatform(code) {
    return request({
        url: '/login/openplat',
        method: 'get',
        params: withTimestamp({
            code,
        }),
    })
}

/**
 * 发送手机验证码
 * @param {string} mobile
 * @returns
 */
export function sendCaptcha(mobile) {
    return request({
        url: '/captcha/sent',
        method: 'post',
        params: withTimestamp({
            mobile,
        }),
    })
}

/**
 * 手机验证码登录
 * @param {{mobile: string, code: string, userid?: string|number}} params
 * @returns
 */
export function loginByPhone(params = {}) {
    const payload = {
        mobile: params?.mobile || params?.phone || '',
        code: params?.code || params?.captcha || '',
        userid: params?.userid,
    }

    return request({
        url: '/login/cellphone',
        method: 'post',
        params: withTimestamp(payload),
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
