import pinia from '../store/pinia'
import { getLikelist, getUserPlaylist, getUserProfile, logout } from '../api/user'
import { useUserStore } from '../store/userStore'
import { useCloudStore } from '../store/cloudStore'
import { isLogin, setCookies } from './authority'
import { clearAccountScopedState } from './accountState'
import { invalidateNcmApiCookieCache } from './request'
import { resolveFavoritePlaylistMeta } from './favoritePlaylist'
import { runIdleTask } from './player/idleTask'

const userStore = useUserStore(pinia)

let accountSessionToken = 0
const cloudDiskDataPreloadMaxAge = 5 * 60 * 1000

function nextAccountSessionToken() {
    accountSessionToken += 1
    return accountSessionToken
}

function isAccountSessionTokenActive(token) {
    return token === accountSessionToken
}

function scheduleCloudDiskDataPreload(profile) {
    const userId = profile?.userId
    if (!userId || !userStore.cloudDiskPage) return

    const normalizedUserId = String(userId)
    void runIdleTask(async () => {
        if (!isLogin() || String(userStore.user?.userId || '') !== normalizedUserId || !userStore.cloudDiskPage) return

        const cloudStore = useCloudStore(pinia)
        await cloudStore.refreshCloudData(normalizedUserId, { maxAge: cloudDiskDataPreloadMaxAge })
    }, { timeout: 1800, fallbackDelay: 900 }).catch(() => {})
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
            userStore.updateFavoritePlaylistMeta(resolveFavoritePlaylistMeta(playlistResult?.playlist, profile.userId))
        }
    } catch (error) {
        if (isAccountSessionTokenActive(token)) {
            userStore.updateFavoritePlaylistMeta(null)
        }
        console.error('加载喜欢歌单信息失败:', error)
    }

    scheduleCloudDiskDataPreload(profile)
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

    await clearAccountScopedState({ clearCookies: false, clearSessionCookies: true, clearStores: false })
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
