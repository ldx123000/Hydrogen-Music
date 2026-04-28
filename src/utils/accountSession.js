import pinia from '../store/pinia'
import { getUserPlaylist, getUserProfile, logout } from '../api/user'
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

function extractPlaylistItems(playlistResult = {}) {
    if (Array.isArray(playlistResult?.playlist)) return playlistResult.playlist
    if (Array.isArray(playlistResult?.info)) return playlistResult.info
    if (Array.isArray(playlistResult?.data?.info)) return playlistResult.data.info
    if (Array.isArray(playlistResult?.data?.playlist)) return playlistResult.data.playlist
    return []
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
        return await hydrateAccountSession(token)
    } catch (error) {
        await clearCurrentAccountSessionState(token)
        throw error
    }
}

export async function applyLoginSession(data) {
    const token = nextAccountSessionToken()

    await clearCurrentAccountSessionState(token)
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
