import pinia from '../store/pinia'
import { getUserPlaylist, getUserProfile, logout } from '../api/user'
import { refreshLoginToken } from '../api/login'
import { useUserStore } from '../store/userStore'
import { resolveFavoritePlaylistMeta } from './player'
import { isLogin, setCookies, getCookie } from './authority'
import { clearAccountScopedState } from './accountState'
import { invalidateNcmApiCookieCache } from './request'

const userStore = useUserStore(pinia)

let accountSessionToken = 0

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

function normalizeUserProfile(profileResult = {}) {
    const raw = profileResult?.data || profileResult?.profile || profileResult || {}
    const userId = pickFirstValue(raw.userId, raw.userid, raw.id, getCookie('userid'))
    const nickname = pickFirstValue(raw.nickname, raw.k_nickname, raw.fx_nickname, raw.name)
    const avatarUrl = pickFirstValue(raw.avatarUrl, raw.pic, raw.k_pic, raw.fx_pic, raw.avatar)
    const backgroundUrl = pickFirstValue(raw.backgroundUrl, raw.backgroundPicUrl, raw.bg_pic)
    const signature = pickFirstValue(raw.signature, raw.descri)

    return {
        ...raw,
        userId: userId ? String(userId) : undefined,
        userid: userId ? String(userId) : undefined,
        nickname: nickname || '',
        avatarUrl: avatarUrl || '',
        backgroundUrl: backgroundUrl || '',
        signature: signature || '',
        vipType: Number(pickFirstValue(raw.vipType, raw.vip_type, 0)) || 0,
    }
}

export function normalizePlaylistItem(item, currentUserId) {
    if (item.listid === undefined) return item
    let isMine = item.is_mine
    if (isMine === undefined && item.list_create_userid !== undefined && currentUserId) {
        isMine = String(item.list_create_userid) === String(currentUserId) ? 1 : 0
    }
    return {
        ...item,
        id: item.listid,
        name: item.is_def === 1 ? '我喜欢的音乐' : item.name,
        coverImgUrl: item.pic || '',
        picUrl: item.pic || '',
        trackCount: item.list_count ?? 0,
        creator: { userId: String(item.userid ?? '') },
        is_mine: isMine,
    }
}

export function extractPlaylistItems(playlistResult = {}, currentUserId) {
    let items = null
    if (Array.isArray(playlistResult?.playlist)) items = playlistResult.playlist
    else if (Array.isArray(playlistResult?.info)) items = playlistResult.info
    else if (Array.isArray(playlistResult?.data?.info)) items = playlistResult.data.info
    else if (Array.isArray(playlistResult?.data?.playlist)) items = playlistResult.data.playlist
    else return []
    return items.map(item => normalizePlaylistItem(item, currentUserId))
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
            userStore.updateFavoritePlaylistMeta(resolveFavoritePlaylistMeta(extractPlaylistItems(playlistResult, profile?.userId)))
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
        return await hydrateAccountSession(token)
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
        return await hydrateAccountSession(token)
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
