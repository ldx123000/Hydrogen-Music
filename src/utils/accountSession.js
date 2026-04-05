import pinia from '../store/pinia'
import { getLikelist, getUserPlaylist, getUserProfile, logout } from '../api/user'
import { useUserStore } from '../store/userStore'
import { resolveFavoritePlaylistMeta } from './player'
import { isLogin, setCookies } from './authority'
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

async function hydrateAccountSession(token) {
    const profileResult = await getUserProfile()
    if (!isAccountSessionTokenActive(token)) return null

    const profile = profileResult?.profile || null
    userStore.updateUser(profile)

    if (!profile?.userId) {
        userStore.updateLikelist([])
        userStore.updateFavoritePlaylistMeta(null)
        return profile
    }

    try {
        const likelistResult = await getLikelist(profile.userId)
        if (isAccountSessionTokenActive(token)) {
            userStore.updateLikelist(likelistResult?.ids)
        }
    } catch (error) {
        if (isAccountSessionTokenActive(token)) {
            userStore.updateLikelist([])
        }
        console.error('加载喜欢列表失败:', error)
    }

    try {
        const playlistResult = await getUserPlaylist({
            uid: profile.userId,
            limit: 50,
            offset: 0,
            timestamp: Date.now(),
        })
        if (isAccountSessionTokenActive(token)) {
            userStore.updateFavoritePlaylistMeta(resolveFavoritePlaylistMeta(playlistResult?.playlist))
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
