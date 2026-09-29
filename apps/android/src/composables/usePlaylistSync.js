import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getPlaylistDetail } from '../api/playlist'
import { getLikelist } from '../api/user'
import { useLibraryStore } from '../store/libraryStore'
import { useUserStore } from '../store/userStore'
import { isLogin } from '../utils/authority'
import { schedulePlaylistCacheInvalidation } from '../utils/cacheInvalidation'
import { resolveFavoritePlaylistMeta } from '../utils/favoritePlaylist'

const PLAYLIST_SYNC_MIN_INTERVAL = 15 * 1000
const PLAYLIST_SYNC_INTERVAL = 60 * 1000

const getLikelistSignature = ids => {
    if (!Array.isArray(ids)) return ''
    return ids.map(id => String(id)).join(',')
}

const getPlaylistSignature = playlist => {
    if (!playlist) return ''
    const hasTrackIds = Array.isArray(playlist.trackIds)
    const trackIds = hasTrackIds
        ? playlist.trackIds.map(track => String(track?.id ?? track))
        : []
    const trackCount = hasTrackIds ? trackIds.length : Number(playlist.trackCount ?? 0)

    return JSON.stringify([
        String(playlist.id ?? ''),
        playlist.name ?? '',
        playlist.coverImgUrl ?? '',
        playlist.description ?? '',
        trackCount,
        Number(playlist.updateTime ?? 0),
        Number(playlist.trackUpdateTime ?? 0),
        Number(playlist.trackNumberUpdateTime ?? 0),
        trackIds.join(','),
    ])
}

export function usePlaylistSync() {
    const router = useRouter()
    const userStore = useUserStore()
    const libraryStore = useLibraryStore()
    let lastFavoriteSyncAt = 0
    let lastOverviewRefreshAt = 0
    let lastPlaylistSyncAt = 0
    let favoriteSyncPromise = null
    let playlistSyncPromise = null
    let playlistSyncTargetId = ''
    let syncTimer = null

    const getFavoritePlaylistId = () => {
        const cachedId = userStore.favoritePlaylistId
        if (cachedId != null && cachedId !== '') return String(cachedId)

        const favoritePlaylist = resolveFavoritePlaylistMeta(
            libraryStore.playlistUserCreated,
            userStore.user?.userId
        )
        return favoritePlaylist?.id == null ? '' : String(favoritePlaylist.id)
    }

    const getCurrentPlaylistId = () => {
        if (router.currentRoute.value?.name != 'playlist') return ''
        return String(router.currentRoute.value?.params?.id || '')
    }

    const isAccountLibraryRoute = () => {
        return String(router.currentRoute.value?.fullPath || '').startsWith('/mymusic')
    }

    const requestPlaylistOverviewRefresh = ({ force = false } = {}) => {
        const now = Date.now()
        if (!force && now - lastOverviewRefreshAt < PLAYLIST_SYNC_MIN_INTERVAL) return false
        lastOverviewRefreshAt = now
        libraryStore.markPlaylistOverviewStale({ silent: true })
        return true
    }

    const syncFavoriteState = async ({ force = false } = {}) => {
        const userId = userStore.user?.userId
        if (userStore.localOnlyMode || !userId || !isLogin()) return false
        if (favoriteSyncPromise) return favoriteSyncPromise

        const now = Date.now()
        if (!force && now - lastFavoriteSyncAt < PLAYLIST_SYNC_MIN_INTERVAL) return false
        lastFavoriteSyncAt = now

        const syncUserId = String(userId)
        const startingSignature = getLikelistSignature(userStore.likelist)
        const task = (async () => {
            const result = await getLikelist(userId, { silent: true })
            if (String(userStore.user?.userId || '') != syncUserId) return false

            const currentSignature = getLikelistSignature(userStore.likelist)
            if (currentSignature != startingSignature || !Array.isArray(result?.ids)) return false
            if (getLikelistSignature(result.ids) == currentSignature) return false

            userStore.updateLikelist(result.ids)
            const favoritePlaylistId = getFavoritePlaylistId()
            schedulePlaylistCacheInvalidation()
            requestPlaylistOverviewRefresh()
            if (favoritePlaylistId) libraryStore.invalidatePlaylistDetailCache(favoritePlaylistId)
            return true
        })().catch(error => {
            console.warn('同步我喜欢的音乐失败:', error)
            return false
        })

        favoriteSyncPromise = task
        try {
            return await task
        } finally {
            if (favoriteSyncPromise === task) favoriteSyncPromise = null
        }
    }

    const syncCurrentPlaylist = async ({ force = false } = {}) => {
        const playlistId = getCurrentPlaylistId()
        if (!playlistId || userStore.localOnlyMode || !isLogin()) return false
        if (playlistSyncPromise) {
            if (playlistSyncTargetId == playlistId) return playlistSyncPromise
            await playlistSyncPromise
            return syncCurrentPlaylist({ force: true })
        }

        const now = Date.now()
        if (!force && now - lastPlaylistSyncAt < PLAYLIST_SYNC_MIN_INTERVAL) return false
        lastPlaylistSyncAt = now

        const currentPlaylist = String(libraryStore.libraryInfo?.id || '') == playlistId
            ? libraryStore.libraryInfo
            : null
        const currentSignature = getPlaylistSignature(currentPlaylist)
        const task = (async () => {
            const result = await getPlaylistDetail({ id: playlistId, timestamp: Date.now() }, { silent: true })
            if (getCurrentPlaylistId() != playlistId) return false

            const activePlaylist = String(libraryStore.libraryInfo?.id || '') == playlistId
                ? libraryStore.libraryInfo
                : null
            if (getPlaylistSignature(activePlaylist) != currentSignature) return false

            const latestPlaylist = result?.playlist || null
            if (!latestPlaylist || getPlaylistSignature(latestPlaylist) == currentSignature) return false

            schedulePlaylistCacheInvalidation()
            requestPlaylistOverviewRefresh()
            libraryStore.invalidatePlaylistDetailCache(playlistId)
            await libraryStore.updatePlaylistDetail(playlistId, { deferRemaining: true, silent: true })
            return true
        })().catch(error => {
            console.warn('同步歌单失败:', error)
            return false
        })

        playlistSyncPromise = task
        playlistSyncTargetId = playlistId
        try {
            return await task
        } finally {
            if (playlistSyncPromise === task) {
                playlistSyncPromise = null
                playlistSyncTargetId = ''
            }
        }
    }

    const syncActivePlaylist = async ({ force = false, refreshOverview = false } = {}) => {
        if (!isAccountLibraryRoute()) return
        if (refreshOverview) requestPlaylistOverviewRefresh({ force })

        const playlistId = getCurrentPlaylistId()
        if (!playlistId) return
        if (playlistId == getFavoritePlaylistId()) await syncFavoriteState({ force })
        await syncCurrentPlaylist({ force })
    }

    const syncAfterReturningToApp = () => {
        void syncActivePlaylist({ refreshOverview: true })
    }

    const handleVisibilityChange = () => {
        if (document.visibilityState == 'visible') syncAfterReturningToApp()
    }

    watch(
        () => router.currentRoute.value?.fullPath,
        () => {
            if (router.currentRoute.value?.name == 'mymusic') {
                requestPlaylistOverviewRefresh({ force: true })
                return
            }
            if (getCurrentPlaylistId()) void syncActivePlaylist({ force: true })
        }
    )

    watch(
        () => userStore.user?.userId,
        userId => {
            if (!userId || !isAccountLibraryRoute()) return
            void syncActivePlaylist({ force: true, refreshOverview: true })
        }
    )

    watch(
        () => userStore.favoritePlaylistId,
        favoritePlaylistId => {
            if (!favoritePlaylistId || getCurrentPlaylistId() != String(favoritePlaylistId)) return
            void syncActivePlaylist({ force: true })
        }
    )

    onMounted(() => {
        window.addEventListener('focus', syncAfterReturningToApp)
        document.addEventListener('visibilitychange', handleVisibilityChange)
        syncTimer = setInterval(() => {
            if (document.visibilityState == 'visible' && getCurrentPlaylistId()) {
                void syncActivePlaylist()
            }
        }, PLAYLIST_SYNC_INTERVAL)
        syncAfterReturningToApp()
    })

    onBeforeUnmount(() => {
        window.removeEventListener('focus', syncAfterReturningToApp)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        if (syncTimer) clearInterval(syncTimer)
    })
}
