import { applyLoginSession } from './accountSession'

//处理登录后的用户数据
export function loginHandle(data, type) {
    return applyLoginSession(data).catch(error => {
        console.error('登录后初始化用户数据失败:', error)
    })
}
