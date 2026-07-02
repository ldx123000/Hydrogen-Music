import pinia from '../store/pinia'
import { getUserPlaylist, getUserProfile, logout } from '../api/user'
import { refreshLoginToken } from '../api/login'
import { useUserStore } from '../store/userStore'
import { resolveFavoritePlaylistMeta } from './player'
import { isLogin, setCookies, getCookie } from './authority'
import { clearAccountScopedState } from './accountState'
import { invalidateNcmApiCookieCache } from './request'
import { runDailyVipAutoClaim } from './dailyVipClaim'
import { dialogOpen, noticeOpen } from './dialog'

const userStore = useUserStore(pinia)

let accountSessionToken = 0
const logoutDialogTitle = '确定退出'
const logoutDialogText = '退出后需要重新登录才能使用账号相关功能，确定退出吗？'

function nextAccountSessionToken() {
    accountSessionToken += 1
    return accountSessionToken
}

function isAccountSessionTokenActive(token) {
    return token === accountSessionToken
}

function pickFirstValue(...values) {
    for (let i = 0; i < values.length; i += 1) {
        const value = values[i]
        if (value !== undefined && value !== null && value !== '') return value
    }
    return null
}

function formatBirthdayText(value) {
    const raw = pickFirstValue(value)
    if (raw === null) return ''

    const numeric = Number(raw)
    if (Number.isFinite(numeric) && numeric > 100000000000) {
        const date = new Date(numeric)
        if (!Number.isNaN(date.getTime())) {
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            return `${year}-${month}-${day}`
        }
    }

    const text = String(raw).trim()
    if (/^\d{8}$/.test(text)) {
        return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
    }
    return text
}

function formatLocationText(raw = {}) {
    const directLocation = pickFirstValue(raw.location, raw.city_name, raw.province_name)
    if (directLocation) return String(directLocation)

    const province = pickFirstValue(raw.province, raw.provinceName)
    const city = pickFirstValue(raw.city, raw.cityName)
    const region = [province, city].filter(Boolean).map(value => String(value))
    return region.join(' ')
}

function normalizeUserProfile(profileResult = {}) {
    const raw = profileResult?.data || profileResult?.profile || profileResult || {}
    const userId = pickFirstValue(raw.userId, raw.userid, raw.id, getCookie('userid'))
    const nickname = pickFirstValue(raw.nickname, raw.k_nickname, raw.fx_nickname, raw.name)
    const avatarUrl = pickFirstValue(raw.avatarUrl, raw.pic, raw.k_pic, raw.fx_pic, raw.avatar)
    const backgroundUrl = pickFirstValue(raw.backgroundUrl, raw.backgroundPicUrl, raw.bg_pic)
    const signature = pickFirstValue(raw.signature, raw.descri, raw.description)
    const birthdayText = formatBirthdayText(pickFirstValue(raw.birthdayText, raw.birthday, raw.birth))
    const location = formatLocationText(raw)
    const createdPlaylistCount = Number(pickFirstValue(raw.createdPlaylistCount, raw.created_playlist_count, raw.create_playlist_count, 0)) || 0
    const subPlaylistCount = Number(pickFirstValue(raw.subPlaylistCount, raw.subscribe_playlist_count, raw.sub_playlist_count, 0)) || 0

    return {
        ...raw,
        userId: userId ? String(userId) : undefined,
        userid: userId ? String(userId) : undefined,
        nickname: nickname || '',
        avatarUrl: avatarUrl || '',
        backgroundUrl: backgroundUrl || '',
        signature: signature || '',
        description: pickFirstValue(raw.description, raw.descri, signature) || '',
        birthdayText,
        location: location || '',
        occupation: pickFirstValue(raw.occupation, raw.job, raw.profession, raw.career) || '',
        follows: Number(pickFirstValue(raw.follows, raw.follow, 0)) || 0,
        followeds: Number(pickFirstValue(raw.followeds, raw.fans, raw.follower, 0)) || 0,
        fans: Number(pickFirstValue(raw.fans, raw.followeds, 0)) || 0,
        visitors: Number(pickFirstValue(raw.visitors, raw.visit_count, 0)) || 0,
        hvisitors: Number(pickFirstValue(raw.hvisitors, raw.history_visitors, 0)) || 0,
        svipLevel: Number(pickFirstValue(raw.svipLevel, raw.svip_level, 0)) || 0,
        mType: Number(pickFirstValue(raw.mType, raw.m_type, 0)) || 0,
        yType: Number(pickFirstValue(raw.yType, raw.y_type, 0)) || 0,
        bookvipValid: Number(pickFirstValue(raw.bookvipValid, raw.bookvip_valid, 0)) || 0,
        createdPlaylistCount,
        subPlaylistCount,
        vipType: Number(pickFirstValue(raw.vipType, raw.vip_type, 0)) || 0,
    }
}

export function normalizePlaylistItem(item) {
    if (item.listid === undefined) return item
    const currentUserId = getCookie('userid')
    const isMine = currentUserId && item.list_create_userid !== undefined
        ? String(item.list_create_userid) === String(currentUserId) ? 1 : 0
        : item.is_mine
    const collectionId = item.list_create_gid || item.global_collection_id || null
    const listId = item.list_create_listid || item.listid
    const id = Number(isMine) === 1 || !collectionId ? listId : collectionId
    return {
        ...item,
        id,
        list_create_listid: listId,
        global_collection_id: collectionId,
        name: item.name,
        coverImgUrl: item.pic || '',
        picUrl: item.pic || '',
        trackCount: item.count ?? item.list_count ?? 0,
        creator: { userId: String(item.userid ?? '') },
        is_mine: isMine,
    }
}

export function extractPlaylistItems(playlistResult = {}) {
    let items = null
    if (Array.isArray(playlistResult?.playlist)) items = playlistResult.playlist
    else if (Array.isArray(playlistResult?.info)) items = playlistResult.info
    else if (Array.isArray(playlistResult?.data?.info)) items = playlistResult.data.info
    else if (Array.isArray(playlistResult?.data?.playlist)) items = playlistResult.data.playlist
    else return []
    return items.map(normalizePlaylistItem)
}

async function hydrateAccountSession(token) {
    const profileResult = await getUserProfile()
    if (!isAccountSessionTokenActive(token)) return null

    const profile = normalizeUserProfile(profileResult)
    userStore.updateUser(profile)
    userStore.updateLikelist([])

    if (!profile?.userId) {
        userStore.updateFavoritePlaylistMeta(null)
        return profile
    }

    try {
        const playlistResult = await getUserPlaylist({
            page: 1,
            pagesize: 50,
        })
        if (isAccountSessionTokenActive(token)) {
            userStore.updateFavoritePlaylistMeta(resolveFavoritePlaylistMeta(extractPlaylistItems(playlistResult)))
        }
    } catch (error) {
        if (isAccountSessionTokenActive(token)) {
            userStore.updateFavoritePlaylistMeta(null)
        }
        console.error('加载喜欢歌单信息失败:', error)
    }

    return profile
}

async function clearCurrentAccountSessionState(token) {
    invalidateNcmApiCookieCache()
    await clearAccountScopedState({ clearSessionCookies: true })
    if (!isAccountSessionTokenActive(token)) return
    invalidateNcmApiCookieCache()
}

export async function initializeCurrentAccountSession() {
    const token = nextAccountSessionToken()

    if (!isLogin()) {
        await clearCurrentAccountSessionState(token)
        return null
    }

    await clearAccountScopedState({ clearCookies: false, clearSessionCookies: true })
    invalidateNcmApiCookieCache()

    try {
        await refreshLoginToken({ token: getCookie('token'), userid: getCookie('userid') }).catch(() => {})
        invalidateNcmApiCookieCache()
        const profile = await hydrateAccountSession(token)
        // 启动时如果已经登录，顺手尝试领取当天 VIP，失败也不阻塞主流程。
        void runDailyVipAutoClaim('startup')
        return profile
    } catch (error) {
        await clearCurrentAccountSessionState(token)
        throw error
    }
}

export async function applyLoginSession(data) {
    const token = nextAccountSessionToken()

    await clearAccountScopedState({ clearCookies: false })
    invalidateNcmApiCookieCache()
    if (!isAccountSessionTokenActive(token)) return null

    setCookies(data)
    invalidateNcmApiCookieCache()

    try {
        const profile = await hydrateAccountSession(token)
        // 登录成功后补一次自动领取，覆盖“启动时未登录”的场景。
        void runDailyVipAutoClaim('login')
        return profile
    } catch (error) {
        await clearCurrentAccountSessionState(token)
        throw error
    }
}

export async function logoutCurrentAccountSession() {
    const token = nextAccountSessionToken()

    if (isLogin()) {
        try {
            await logout()
        } catch (_) {
            // Prefer local cleanup over leaving stale session state behind.
        }
    }

    await clearCurrentAccountSessionState(token)
}

export async function logoutAccount(router) {
    if (!isLogin()) {
        noticeOpen('您已退出账号', 2)
        return
    }

    await logoutCurrentAccountSession()
    router.push('/')
    noticeOpen('已退出账号', 2)
}

export function confirmAccountLogout(router) {
    if (!isLogin()) {
        noticeOpen('您已退出账号', 2)
        return
    }

    dialogOpen(logoutDialogTitle, logoutDialogText, flag => {
        if (flag) void logoutAccount(router)
    })
}
