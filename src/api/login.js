import request from "../utils/request";

/**
 * 调用此接口可生成一个 key
 * @returns 
 */
export function getQRcode() {
    return request({
        url: '/login/qr/key',
        method: 'get',
        params: {
            timestamp: new Date().getTime()
        }
    })
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
 * 使用Cookie登录
 * 通过粘贴网页版网易云音乐的cookie来登录
 * @param {String} cookie - 从网页版复制的cookie字符串
 * @returns 
 */
export function loginByCookie(cookie) {
    return new Promise((resolve, reject) => {
        try {
            // 直接设置cookie到document.cookie
            document.cookie = cookie;
            
            // 解析cookie字符串，提取关键字段
            const cookieObj = {};
            cookie.split(';').forEach(item => {
                const [key, value] = item.trim().split('=');
                if (key && value) {
                    cookieObj[key] = value;
                }
            });
            
            // 检查是否包含必要的登录cookie
            if (cookieObj.MUSIC_U) {
                // 模拟成功响应格式
                resolve({
                    code: 200,
                    cookie: cookie,
                    message: 'Cookie登录成功'
                });
            } else {
                reject({
                    code: 400,
                    message: 'Cookie中缺少必要的登录信息(MUSIC_U)'
                });
            }
        } catch (error) {
            reject({
                code: 500,
                message: 'Cookie格式错误或登录失败'
            });
        }
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