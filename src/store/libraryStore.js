import { defineStore } from "pinia";
import { getPlaylistDetail, getRecommendSongs, getHistoryRecommendSongsDetail, playlistDynamic } from '../api/playlist'
import { getAlbumDetail, albumDynamic } from '../api/album'
import { getArtistDetail, getArtistFansCount, getArtistTopSong, getArtistAlbum } from '../api/artist'
import { getArtistMV } from '../api/mv'
import { getSongDetail } from '../api/song'
import { mapSongsPlayableStatus } from "../utils/songStatus";
import { buildAlbumSearchText, buildCloudSongSearchText, buildMVSearchText } from "../utils/songFilter";

const PLAYLIST_PAGE_SIZE = 100
const PLAYLIST_HYDRATION_CONCURRENCY = 4
const PLAYLIST_OVERVIEW_COUNT_FIELDS = ['trackCount', 'size']

const createPlaylistHydrationState = ({ id = null, total = 0, loaded = 0, status = 'idle', nextOffset = 0 } = {}) => ({
    id,
    total,
    loaded,
    status,
    nextOffset,
})
const createSearchIndexState = () => ({
    songs: {},
    albums: {},
    mvs: {},
})
const cloneSearchIndexState = index => ({
    songs: { ...(index?.songs || {}) },
    albums: { ...(index?.albums || {}) },
    mvs: { ...(index?.mvs || {}) },
})

const getSearchEntryKey = (entry, fallbackKey = '0') => String(entry?.id ?? fallbackKey)
const isBlankValue = value => value == null || value === ''
const normalizeOptionalId = id => isBlankValue(id) ? '' : String(id)
const getLibraryDetailCacheKey = (id, routerName) => {
    const normalizedName = String(routerName || '')
    const normalizedId = normalizeOptionalId(id)
    if (!normalizedName || !normalizedId) return ''
    return `${normalizedName}:${normalizedId}`
}
const trimRecordMap = (records, limit, fallbackLimit) => {
    if (!records || typeof records != 'object') return {}

    const parsedLimit = Number(limit)
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : fallbackLimit
    const entries = Object.entries(records)
    if (entries.length <= safeLimit) return records

    entries.sort((a, b) => Number(a?.[1]?.updatedAt || 0) - Number(b?.[1]?.updatedAt || 0))
    const nextRecords = { ...records }
    const deleteCount = entries.length - safeLimit
    for (let i = 0; i < deleteCount; i++) {
        delete nextRecords[entries[i][0]]
    }
    return nextRecords
}
const hasNeedTimestampUrl = (needTimestamp, url) => {
    return Array.isArray(needTimestamp) && needTimestamp.includes(url)
}
const createLibraryDetailToken = key => `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`


function orderPlaylistSongs(trackIds, songs, privileges = []) {
    const privilegesById = new Map(privileges.map(privilege => [String(privilege.id), privilege]))
    const playableSongs = mapSongsPlayableStatus(songs, songs.map(song => privilegesById.get(String(song.id))))
    const songsById = new Map(playableSongs.map(song => [String(song.id), song]))
    return trackIds.map(track => songsById.get(String(track.id)))
}

async function loadPlaylistSongs(trackIds, options, knownSongs = new Map()) {
    const missingIds = trackIds.filter(track => !knownSongs.has(String(track.id)))
    let fetchedSongs = []
    if (missingIds.length > 0) {
        const result = await getSongDetail(missingIds.map(track => track.id), options)
        fetchedSongs = orderPlaylistSongs(missingIds, result.songs, result.privileges).filter(Boolean)
    }
    const songsById = new Map([...knownSongs, ...fetchedSongs.map(song => [String(song.id), song])])
    return trackIds.map(track => songsById.get(String(track.id))).filter(Boolean)
}

export const useLibraryStore = defineStore('libraryStore', {
    state: () => {
        return {
            listType1: 0,
            listType2: 0,
            artistPageType: 0,
            libraryList: null,
            libraryListAlbum: null,
            libraryListAritist: null,
            playlistCount: null,
            playlistUserCreated: null,
            playlistUserSub: null,
            playlistOverviewVersion: 0,
            playlistOverviewRefreshSilent: false,
            libraryInfo: null,
            lastLibraryRoute: null,
            lastLibraryScrollTop: 0,
            restoreLibraryScrollOnActivate: false,
            detailScrollMemory: {},
            detailScrollMemoryLimit: 100,
            detailCache: {},
            detailCacheLimit: 20,
            playlistHydration: createPlaylistHydrationState(),
            libraryDetailToken: null,
            playlistHydrationPromise: null,
            librarySongs: null,
            libraryAlbum: null,
            libraryMV: null,
            searchIndexById: createSearchIndexState(),
            needTimestamp: [],
            libraryDetailKey: '',
            libraryDetailStatus: 'idle',
            playlistDynamicStatus: 'idle',
        }
    },
    actions: {
        changeLibraryList(type) {
            if (type == 0) this.libraryList = this.playlistUserCreated
            else if (type == 1) this.libraryList = this.playlistUserSub
        },
        updateLibrary(libraryData) {
            this.libraryData = libraryData
        },
        updateUserPlaylistCount(listCount) {
            this.playlistCount = listCount
        },
        updateUserPlaylist(playlist) {
            this.playlistUserCreated = playlist.splice(0, this.playlistCount.createdPlaylistCount)
            this.playlistUserSub = playlist.splice(0, this.playlistCount.subPlaylistCount)
        },
        markPlaylistOverviewStale({ silent = false } = {}) {
            this.playlistOverviewRefreshSilent = silent
            this.playlistOverviewVersion += 1
        },
        updatePlaylistOverviewTrackCount(playlistId, delta) {
            const normalizedPlaylistId = String(playlistId ?? '')
            const parsedDelta = Number(delta)
            if (!normalizedPlaylistId || !Number.isFinite(parsedDelta) || parsedDelta == 0) return

            const updateItem = item => {
                if (String(item?.id ?? '') != normalizedPlaylistId) return item

                const nextItem = { ...item }
                for (const key of PLAYLIST_OVERVIEW_COUNT_FIELDS) {
                    if (isBlankValue(nextItem[key])) continue
                    const count = Number(nextItem[key])
                    if (!Number.isFinite(count)) continue
                    nextItem[key] = Math.max(0, count + parsedDelta)
                }

                return nextItem
            }
            const updateList = list => Array.isArray(list) ? list.map(updateItem) : list

            this.playlistUserCreated = updateList(this.playlistUserCreated)
            this.playlistUserSub = updateList(this.playlistUserSub)
            this.libraryList = updateList(this.libraryList)
            if (this.libraryInfo && String(this.libraryInfo.id ?? '') == normalizedPlaylistId) {
                this.libraryInfo = updateItem(this.libraryInfo)
            }
        },
        setPlaylistOverviewTrackCount(playlistId, trackCount) {
            const normalizedPlaylistId = String(playlistId ?? '')
            const normalizedTrackCount = Math.max(0, Number(trackCount))
            if (!normalizedPlaylistId || !Number.isFinite(normalizedTrackCount)) return

            const updateItem = item => {
                if (String(item?.id ?? '') != normalizedPlaylistId) return item

                const nextItem = { ...item }
                for (const key of PLAYLIST_OVERVIEW_COUNT_FIELDS) {
                    if (!isBlankValue(nextItem[key])) nextItem[key] = normalizedTrackCount
                }
                return nextItem
            }
            const updateList = list => Array.isArray(list) ? list.map(updateItem) : list

            this.playlistUserCreated = updateList(this.playlistUserCreated)
            this.playlistUserSub = updateList(this.playlistUserSub)
            this.libraryList = updateList(this.libraryList)
            if (this.libraryInfo && String(this.libraryInfo.id ?? '') == normalizedPlaylistId) {
                this.libraryInfo = updateItem(this.libraryInfo)
            }
        },
        resetPlaylistHydration() {
            this.playlistHydration = createPlaylistHydrationState()
            this.playlistHydrationPromise = null
        },
        cancelLibraryDetailLoad() {
            this.libraryDetailToken = null
            this.playlistHydrationPromise = null
        },
        resetAccountState() {
            this.libraryList = null
            this.libraryListAlbum = null
            this.libraryListAritist = null
            this.playlistCount = null
            this.playlistUserCreated = null
            this.playlistUserSub = null
            this.playlistOverviewVersion = 0
            this.playlistOverviewRefreshSilent = false
            this.libraryInfo = null
            this.lastLibraryRoute = null
            this.lastLibraryScrollTop = 0
            this.restoreLibraryScrollOnActivate = false
            this.detailScrollMemory = {}
            this.detailCache = {}
            this.librarySongs = null
            this.libraryAlbum = null
            this.libraryMV = null
            this.cancelLibraryDetailLoad()
            this.libraryDetailKey = ''
            this.libraryDetailStatus = 'idle'
            this.playlistDynamicStatus = 'idle'
            this.resetPlaylistHydration()
            this.resetSearchIndex()
        },
        resetSearchIndex(section = null) {
            if (!section) {
                this.searchIndexById = createSearchIndexState()
                return
            }
            this.searchIndexById = {
                ...this.searchIndexById,
                [section]: {},
            }
        },
        indexLibrarySongs(songs, { append = false } = {}) {
            const nextSongsIndex = append ? { ...(this.searchIndexById?.songs || {}) } : {}
            const targetSongs = Array.isArray(songs) ? songs : []
            targetSongs.forEach((song, index) => {
                nextSongsIndex[getSearchEntryKey(song, `song-${index}`)] = buildCloudSongSearchText(song)
            })
            this.searchIndexById = {
                ...this.searchIndexById,
                songs: nextSongsIndex,
            }
        },
        indexLibraryAlbums(albums) {
            const nextAlbumsIndex = {}
            const targetAlbums = Array.isArray(albums) ? albums : []
            targetAlbums.forEach((album, index) => {
                nextAlbumsIndex[getSearchEntryKey(album, `album-${index}`)] = buildAlbumSearchText(album)
            })
            this.searchIndexById = {
                ...this.searchIndexById,
                albums: nextAlbumsIndex,
            }
        },
        indexLibraryMVs(mvs) {
            const nextMvsIndex = {}
            const targetMvs = Array.isArray(mvs) ? mvs : []
            targetMvs.forEach((mv, index) => {
                nextMvsIndex[getSearchEntryKey(mv, `mv-${index}`)] = buildMVSearchText(mv)
            })
            this.searchIndexById = {
                ...this.searchIndexById,
                mvs: nextMvsIndex,
            }
        },
        getSongSearchText(song, fallbackKey = '0') {
            return this.searchIndexById?.songs?.[getSearchEntryKey(song, fallbackKey)] || buildCloudSongSearchText(song)
        },
        getAlbumSearchText(album, fallbackKey = '0') {
            return this.searchIndexById?.albums?.[getSearchEntryKey(album, fallbackKey)] || buildAlbumSearchText(album)
        },
        getMVSearchText(mv, fallbackKey = '0') {
            return this.searchIndexById?.mvs?.[getSearchEntryKey(mv, fallbackKey)] || buildMVSearchText(mv)
        },
        trimDetailScrollMemory() {
            this.detailScrollMemory = trimRecordMap(this.detailScrollMemory, this.detailScrollMemoryLimit, 100)
        },
        saveDetailScroll(fullPath, top) {
            const targetPath = String(fullPath || '')
            if (!targetPath) return

            const parsedTop = Number(top)
            const normalizedTop = Number.isFinite(parsedTop) ? Math.max(0, parsedTop) : 0
            if (!this.detailScrollMemory || typeof this.detailScrollMemory != 'object') this.detailScrollMemory = {}

            this.detailScrollMemory[targetPath] = {
                top: normalizedTop,
                updatedAt: Date.now(),
            }
            this.trimDetailScrollMemory()
        },
        getDetailScroll(fullPath) {
            const targetPath = String(fullPath || '')
            if (!targetPath) return null
            const record = this.detailScrollMemory?.[targetPath]
            if (!record) return null

            const parsedTop = Number(record.top)
            if (!Number.isFinite(parsedTop)) return null
            return Math.max(0, parsedTop)
        },
        trimDetailCache() {
            this.detailCache = trimRecordMap(this.detailCache, this.detailCacheLimit, 20)
        },
        invalidateLibraryDetailCache(id = null, routerName = null) {
            if (!this.detailCache || typeof this.detailCache != 'object') {
                this.detailCache = {}
                return
            }

            const normalizedName = String(routerName || '')
            const normalizedId = normalizeOptionalId(id)

            if (normalizedName && normalizedId) {
                delete this.detailCache[getLibraryDetailCacheKey(normalizedId, normalizedName)]
            } else if (normalizedName) {
                const keyPrefix = `${normalizedName}:`
                Object.keys(this.detailCache).forEach(key => {
                    if (key.startsWith(keyPrefix)) delete this.detailCache[key]
                })
            } else if (normalizedId) {
                Object.keys(this.detailCache).forEach(key => {
                    if (key.endsWith(`:${normalizedId}`)) delete this.detailCache[key]
                })
            } else {
                this.detailCache = {}
                return
            }

            this.detailCache = { ...this.detailCache }
        },
        invalidatePlaylistDetailCache(id = null) {
            this.invalidateLibraryDetailCache(id, 'playlist')

            const normalizedId = normalizeOptionalId(id)
            const hydrationId = String(this.playlistHydration?.id || '')
            if (!normalizedId || hydrationId == normalizedId) {
                this.cancelLibraryDetailLoad()
                this.resetPlaylistHydration()
            }
        },
        cacheCurrentLibraryDetail(id, routerName) {
            const key = getLibraryDetailCacheKey(id, routerName)
            if (key != this.libraryDetailKey || this.libraryDetailStatus != 'ready' || String(this.libraryInfo?.id) != String(id)) return
            if (!this.detailCache || typeof this.detailCache != 'object') this.detailCache = {}

            this.detailCache[key] = {
                libraryInfo: this.libraryInfo,
                librarySongs: this.librarySongs,
                libraryAlbum: this.libraryAlbum,
                libraryMV: this.libraryMV,
                artistPageType: this.artistPageType,
                playlistDynamicStatus: this.playlistDynamicStatus,
                playlistHydration: { ...(this.playlistHydration || createPlaylistHydrationState()) },
                searchIndexById: cloneSearchIndexState(this.searchIndexById),
                updatedAt: Date.now(),
            }
            this.trimDetailCache()
        },
        restoreLibraryDetailFromCache(id, routerName) {
            const key = getLibraryDetailCacheKey(id, routerName)
            const cached = key ? this.detailCache?.[key] : null
            if (!cached?.libraryInfo) return false

            cached.updatedAt = Date.now()
            this.libraryInfo = cached.libraryInfo
            this.librarySongs = cached.librarySongs
            this.libraryAlbum = cached.libraryAlbum
            this.libraryMV = cached.libraryMV
            this.artistPageType = Number.isInteger(cached.artistPageType) ? cached.artistPageType : 0
            this.searchIndexById = cloneSearchIndexState(cached.searchIndexById)
            this.libraryDetailStatus = 'ready'

            if (routerName == 'playlist') {
                this.playlistDynamicStatus = cached.playlistDynamicStatus
                if (this.playlistDynamicStatus != 'ready') void this.updatePlaylistDynamic(id, this.libraryDetailToken)
                this.playlistHydration = { ...(cached.playlistHydration || createPlaylistHydrationState()) }
                this.resumePlaylistHydrationFromCache(id)
            } else {
                this.resetPlaylistHydration()
            }

            return true
        },
        shouldBypassLibraryDetailCache(routerName) {
            return routerName == 'playlist' && (
                hasNeedTimestampUrl(this.needTimestamp, '/playlist/detail')
                || hasNeedTimestampUrl(this.needTimestamp, '/playlist/track/all')
            )
        },
        async waitForPlaylistHydration(id) {
            const targetId = String(id)
            const token = this.libraryDetailToken
            if (String(this.playlistHydration.id) != targetId) return false
            while (this.libraryDetailToken == token && this.playlistHydration.status == 'loading' && this.playlistHydrationPromise) {
                try {
                    await this.playlistHydrationPromise
                } catch (error) {
                    return false
                }
            }
            return this.libraryDetailToken == token && this.playlistHydration.status == 'completed'
        },
        async hydratePlaylistRemaining(id, trackIds, token, initialOffset, options = {}) {
            const knownSongs = new Map((this.libraryInfo.tracks ?? []).map(song => [String(song.id), song]))
            const offsets = []
            for (let offset = initialOffset; offset < trackIds.length; offset += PLAYLIST_PAGE_SIZE) {
                offsets.push(offset)
            }
            const pages = []
            let failed = false
            const worker = async () => {
                while (offsets.length > 0) {
                    if (failed || this.libraryDetailToken != token) return
                    const offset = offsets.shift()
                    const songs = await loadPlaylistSongs(trackIds.slice(offset, offset + PLAYLIST_PAGE_SIZE), options, knownSongs).catch(error => {
                        failed = true
                        throw error
                    })
                    if (this.libraryDetailToken != token) return
                    pages.push({ offset, songs })
                }
            }
            await Promise.all(Array.from({ length: Math.min(PLAYLIST_HYDRATION_CONCURRENCY, offsets.length) }, () => worker()))
            pages.sort((a, b) => a.offset - b.offset)
            return pages.flatMap(page => page.songs)
        },
        startPlaylistHydrationTask(playlistId, trackIds, token, initialOffset, options = {}) {
            const hydrationTask = this.hydratePlaylistRemaining(playlistId, trackIds, token, initialOffset, options)
                .then(remainingSongs => {
                    if (this.libraryDetailToken != token) return
                    this.librarySongs.push(...remainingSongs)
                    this.indexLibrarySongs(remainingSongs, { append: true })
                    const loaded = this.librarySongs.length
                    this.setPlaylistOverviewTrackCount(playlistId, loaded)
                    this.playlistHydration = createPlaylistHydrationState({
                        id: playlistId, total: loaded, loaded, status: 'completed', nextOffset: trackIds.length,
                    })
                    this.cacheCurrentLibraryDetail(playlistId, 'playlist')
                })
                .catch(error => {
                    if (this.libraryDetailToken != token) return
                    console.error('加载剩余歌曲失败:', error)
                    this.playlistHydration.status = 'failed'
                    this.cacheCurrentLibraryDetail(playlistId, 'playlist')
                })
                .finally(() => {
                    if (this.playlistHydrationPromise === hydrationTask) this.playlistHydrationPromise = null
                })
            this.playlistHydrationPromise = hydrationTask
            return hydrationTask
        },
        resumePlaylistHydrationFromCache(id) {
            if (this.playlistHydration.status == 'completed') return
            this.playlistHydration.status = 'loading'
            this.startPlaylistHydrationTask(id, this.libraryInfo.trackIds, this.libraryDetailToken, this.playlistHydration.nextOffset)
        },
        async updateLibraryDetail(id, routerName, options = {}) {
            const { force = false, deferRemaining = false } = options
            const key = getLibraryDetailCacheKey(id, routerName)
            const preserveContent = options.preserveContent === true && this.libraryDetailKey == key && this.libraryDetailStatus == 'ready'
            const token = createLibraryDetailToken(key)
            this.libraryDetailToken = token
            this.libraryDetailKey = key
            this.resetPlaylistHydration()
            if (!preserveContent) this.playlistDynamicStatus = 'idle'
            if (!force && !this.shouldBypassLibraryDetailCache(routerName) && this.restoreLibraryDetailFromCache(id, routerName)) return true

            const overview = routerName == 'playlist'
                ? [...(this.playlistUserCreated || []), ...(this.playlistUserSub || [])].find(item => String(item.id) == String(id))
                : null
            if (!preserveContent) {
                this.libraryInfo = overview ? { ...overview, followed: overview.subscribed } : null
                this.librarySongs = []
                this.libraryAlbum = null
                this.libraryMV = null
                this.artistPageType = 0
                this.libraryDetailStatus = 'loading'
                this.resetSearchIndex()
            }
            try {
                if (routerName == 'playlist') {
                    const initialLoad = this.loadPlaylistDetail(id, token, { ...options, preserveContent })
                    this.playlistHydrationPromise = initialLoad
                    await initialLoad
                    if (this.libraryDetailToken == token && this.playlistHydrationPromise === initialLoad) this.playlistHydrationPromise = null
                }
                if (routerName == 'album') await this.updateAlbumDetail(id, token)
                if (routerName == 'artist') await this.updateArtistDetail(id, token)
                if (this.libraryDetailToken != token) return false
                this.libraryDetailStatus = 'ready'
                this.cacheCurrentLibraryDetail(id, routerName)
                if (!deferRemaining && this.playlistHydrationPromise) await this.playlistHydrationPromise
                return this.libraryDetailToken == token
            } catch (error) {
                if (this.libraryDetailToken != token) return false
                this.libraryDetailStatus = 'failed'
                if (routerName == 'playlist') this.playlistHydration.status = 'failed'
                throw error
            }
        },
        updatePlaylistDetail(id, options = {}) {
            return this.updateLibraryDetail(id, 'playlist', { ...options, force: true, preserveContent: true })
        },
        async updatePlaylistDynamic(id, token = this.libraryDetailToken) {
            this.playlistDynamicStatus = 'loading'
            const followed = this.libraryInfo.followed
            try {
                const result = await playlistDynamic(id)
                if (this.libraryDetailToken != token) return
                if (this.libraryInfo.followed == followed) this.libraryInfo.followed = result.subscribed
                this.playlistDynamicStatus = 'ready'
                this.cacheCurrentLibraryDetail(id, 'playlist')
            } catch (error) {
                if (this.libraryDetailToken != token) return
                console.error('加载歌单收藏状态失败:', error)
                this.playlistDynamicStatus = 'failed'
            }
        },
        async loadPlaylistDetail(id, token, options) {
            const playlistId = String(id)
            this.playlistHydration = createPlaylistHydrationState({ id: playlistId, status: 'loading' })
            const result = await getPlaylistDetail({ id: playlistId }, options)
            if (this.libraryDetailToken != token) return
            const playlist = result.playlist
            const trackIds = playlist.trackIds
            playlist.followed = playlist.subscribed
            if (!options.preserveContent) {
                this.libraryInfo = playlist
                void this.updatePlaylistDynamic(playlistId, token)
            }
            this.playlistHydration.total = trackIds.length

            // 详情中的 tracks 可能已包含部分或全部歌曲，直接展示连续的已知前缀。
            const providedSongs = orderPlaylistSongs(trackIds, playlist.tracks ?? [], result.privileges)
            const firstMissing = providedSongs.findIndex(song => !song)
            let nextOffset = firstMissing == -1 ? trackIds.length : firstMissing
            let songs = providedSongs.slice(0, nextOffset)
            if (songs.length == 0 && trackIds.length > 0) {
                const firstIds = trackIds.slice(0, PLAYLIST_PAGE_SIZE)
                const knownSongs = new Map(providedSongs.filter(Boolean).map(song => [String(song.id), song]))
                songs = await loadPlaylistSongs(firstIds, options, knownSongs)
                if (this.libraryDetailToken != token) return
                nextOffset = firstIds.length
            }
            if (options.preserveContent) {
                this.libraryInfo = playlist
                void this.updatePlaylistDynamic(playlistId, token)
            }
            this.librarySongs = songs
            this.indexLibrarySongs(songs)
            this.setPlaylistOverviewTrackCount(playlistId, trackIds.length)
            this.playlistHydration = createPlaylistHydrationState({
                id: playlistId, total: trackIds.length, loaded: songs.length,
                nextOffset,
                status: nextOffset == trackIds.length ? 'completed' : 'loading',
            })
            if (nextOffset < trackIds.length) {
                this.startPlaylistHydrationTask(playlistId, trackIds, token, nextOffset, options)
            }
        },
        async updateAlbumDetail(id, token = this.libraryDetailToken) {
            let params = {
                id: id,
                // timestamp: new Date().getTime()
            }
            await Promise.all([getAlbumDetail(params), albumDynamic(id)]).then(results => {
                if (this.libraryDetailToken != token) return
                const albumDetail = results[0]
                this.libraryInfo = albumDetail.album

                const playableSongs = mapSongsPlayableStatus(albumDetail.songs) || []
                const albumCover = this.libraryInfo?.picUrl || this.libraryInfo?.blurPicUrl || null

                this.librarySongs = playableSongs.map((song = {}) => {
                    // 确保播放器在专辑场景下总能拿到封面
                    if (!song.al) song.al = {}
                    if (!song.al.picUrl && albumCover) song.al.picUrl = albumCover
                    return song
                })
                this.indexLibrarySongs(this.librarySongs)
                this.libraryInfo.followed = results[1].isSub
            })
        },
        async updateArtistDetail(id, token = this.libraryDetailToken) {
            let params = {
                id: id,
                // timestamp: new Date().getTime()
            }
            await Promise.all([getArtistDetail(params), getArtistFansCount(id)]).then(async results => {
                if (this.libraryDetailToken != token) return
                results[0].artist.follow = results[1].data
                results[0].artist.followed = results[1].data.follow
                this.libraryInfo = results[0].artist
                
                // 获取热门歌曲的完整详情（包括封面）
                const songIds = results[0].hotSongs.map(song => song.id)
                const songDetailResult = await getSongDetail(songIds)
                if (this.libraryDetailToken != token) return
                
                // 使用详情API返回的完整歌曲数据
                this.librarySongs = mapSongsPlayableStatus(songDetailResult.songs)
                this.indexLibrarySongs(this.librarySongs)
            })
        },
        //获取歌手热门歌曲前50首，并更新Store数据
        async updateArtistTopSong(id) {
            const token = this.libraryDetailToken
            let params = {
                id: id,
                // timestamp: new Date().getTime()
            }
            await getArtistTopSong(params).then(async result => {
                if (this.libraryDetailToken != token) return
                // 获取所有歌曲ID
                const songIds = result.songs.map(song => song.id)
                
                // 使用歌曲详情API获取完整信息（包括正确的封面）
                const songDetailResult = await getSongDetail(songIds)
                if (this.libraryDetailToken != token) return
                
                // 使用详情API返回的完整歌曲数据
                this.librarySongs = mapSongsPlayableStatus(songDetailResult.songs)
                this.indexLibrarySongs(this.librarySongs)
            })
        },
        //获取歌手专辑，并更新Store数据
        async updateArtistAlbum(id) {
            const token = this.libraryDetailToken
            let params = {
                id: id,
                limit: 500,
                offset: 0
                // timestamp: new Date().getTime()
            }
            await getArtistAlbum(params).then(result => {
                if (this.libraryDetailToken != token) return
                this.libraryAlbum = result.hotAlbums
                this.indexLibraryAlbums(this.libraryAlbum)
            })
        },
        //获取歌手MV，并更新Store数据
        async updateArtistsMV(id) {
            const token = this.libraryDetailToken
            let params = {
                id: id,
                limit: 500,
                offset: 0
                // timestamp: new Date().getTime()
            }
            await getArtistMV(params).then(result => {
                if (this.libraryDetailToken != token) return
                this.libraryMV = result.mvs
                this.indexLibraryMVs(this.libraryMV)
            })
        },
        async updateRecommendSongs(date) {
            const request = date ? getHistoryRecommendSongsDetail({ date }) : getRecommendSongs()
            await request.then(result => {
                const dailySongs = result?.data?.dailySongs || []
                const historySongs = result?.data?.songs || result?.data?.dailySongs || result?.songs || []
                const songs = date ? historySongs : dailySongs

                this.librarySongs = mapSongsPlayableStatus(songs) || []
                this.indexLibrarySongs(this.librarySongs)
            })
        },
    },
})
