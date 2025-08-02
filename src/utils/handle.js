import pinia from '../store/pinia'
import { setCookies } from '../utils/authority'
import { getUserProfile } from '../api/user'
import { getUserLikelist } from './initApp'
import { useUserStore } from '../store/userStore'

const userStore = useUserStore(pinia)
const { updateUser } = userStore

//处理登录后的用户数据
export function loginHandle(data, type) {
    setCookies(data, type)
    getUserProfile().then(result => {
        updateUser(result.profile)
        getUserLikelist()
    })
}