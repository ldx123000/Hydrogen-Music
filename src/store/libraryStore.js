import { defineStore } from "pinia";
import { getPlaylistAll, getRecommendSongs, getHistoryRecommendSongsDetail, normalizePlaylistSong, getRankInfo, getRankSongs } from '../api/playlist'
import { getAlbumDetail, albumDynamic } from '../api/album'
import { getArtistDetail, getArtistTopSong, getArtistAlbum } from '../api/artist'
import { getArtistMV } from '../api/mv'
import { mapSongsPlayableStatus } from "../utils/songStatus";
import { buildAlbumSearchText, buildCloudSongSearchText, buildMVSearchText } from "../utils/songFilter";

const PLAYLIST_PAGE_SIZE = 999
const PLAYLIST_HYDRATION_CONCURRENCY = 4
const ARTIST_SONG_PAGE_SIZE = 60
const ARTIST_ALBUM_PAGE_SIZE = 30

const createPlaylistHydrationState = ({ id = null, total = 0, loaded = 0, status = 'idle' } = {}) => ({
    id,
    total,
    loaded,
    status,
})
const createSearchIndexState = () => ({
    songs: {},
    albums: {},
    mvs: {},
})
const createArtistListPageState = ({ id = null, page = 0, pagesize = 0, total = 0, loaded = 0, loading = false } = {}) => ({
    id,
    page,
    pagesize,
    total,
    loaded,
    loading,
    hasMore: total > 0 ? loaded < total : false,
})
const createArtistPaginationState = () => ({
    songs: createArtistListPageState(),
    albums: createArtistListPageState(),
})

const getSearchEntryKey = (entry, fallbackKey = '0') => String(entry?.id ?? fallbackKey)
const getListMergeKey = (item, fallbackKey) => String(item?.id ?? item?.hash ?? item?.album_audio_id ?? fallbackKey)
const mergeUniqueEntries = (currentList = [], incomingList = [], fallbackPrefix = 'item') => {
    const merged = Array.isArray(currentList) ? [...currentList] : []
    const seen = new Set(merged.map((item, index) => getListMergeKey(item, `${fallbackPrefix}-current-${index}`)))

    incomingList.forEach((item, index) => {
        const mergeKey = getListMergeKey(item, `${fallbackPrefix}-incoming-${index}`)
        if (seen.has(mergeKey)) return
        seen.add(mergeKey)
        merged.push(item)
    })

    return merged
}
const normalizeRecommendSongList = result => {
    const directSongs = result?.data?.song_list || result?.song_list || []
    if (Array.isArray(directSongs) && directSongs.length > 0) return directSongs

    const nestedLists = result?.data?.lists || result?.lists || []
    if (!Array.isArray(nestedLists) || nestedLists.length == 0) return []

    const firstList = nestedLists.find(item => Array.isArray(item?.song_list) && item.song_list.length > 0) || nestedLists[0]
    return Array.isArray(firstList?.song_list) ? firstList.song_list : []
}

const sortCreatedPlaylistsBySort = playlist => {
    return [...playlist].sort((left, right) => {
        const leftSort = Number(left?.sort)
        const rightSort = Number(right?.sort)
        const leftHasSort = Number.isFinite(leftSort)
        const rightHasSort = Number.isFinite(rightSort)

        if (leftHasSort && rightHasSort) return leftSort - rightSort
        if (leftHasSort) return -1
        if (rightHasSort) return 1
        return 0
    })
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
            libraryInfo: null,
            lastLibraryRoute: null,
            lastLibraryScrollTop: 0,
            restoreLibraryScrollOnActivate: false,
            detailScrollMemory: {},
            detailScrollMemoryLimit: 100,
            libraryDetailToken: null,
            playlistHydration: createPlaylistHydrationState(),
            playlistHydrationToken: null,
            playlistHydrationPromise: null,
            artistPagination: createArtistPaginationState(),
            librarySongs: null,
            libraryAlbum: null,
            libraryMV: null,
            searchIndexById: createSearchIndexState(),
            needTimestamp: [],
            libraryChangeAnimation: false,
        }
    },
    actions: {
        changeAnimation() {
            this.libraryChangeAnimation = true
        },
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
            if (playlist.length > 0 && playlist[0].is_mine !== undefined) {
                this.playlistUserCreated = sortCreatedPlaylistsBySort(playlist.filter(p => p.is_mine === 1))
                this.playlistUserSub = playlist.filter(p => p.is_mine === 0)
            } else {
                this.playlistUserCreated = sortCreatedPlaylistsBySort(
                    playlist.splice(0, this.playlistCount?.createdPlaylistCount ?? playlist.length)
                )
                this.playlistUserSub = playlist.splice(0, this.playlistCount?.subPlaylistCount ?? playlist.length)
            }
        },
        resetPlaylistHydration() {
            this.playlistHydration = createPlaylistHydrationState()
            this.playlistHydrationToken = null
            this.playlistHydrationPromise = null
        },
        resetArtistPagination(section = null) {
            if (!section) {
                this.artistPagination = createArtistPaginationState()
                return
            }
            this.artistPagination = {
                ...this.artistPagination,
                [section]: createArtistListPageState(),
            }
        },
        resetAccountState() {
            this.libraryList = null
            this.libraryListAlbum = null
            this.libraryListAritist = null
            this.playlistCount = null
            this.playlistUserCreated = null
            this.playlistUserSub = null
            this.libraryInfo = null
            this.lastLibraryRoute = null
            this.lastLibraryScrollTop = 0
            this.restoreLibraryScrollOnActivate = false
            this.detailScrollMemory = {}
            this.libraryDetailToken = null
            this.artistPagination = createArtistPaginationState()
            this.librarySongs = null
            this.libraryAlbum = null
            this.libraryMV = null
            this.libraryChangeAnimation = false
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
            if (!this.detailScrollMemory || typeof this.detailScrollMemory != 'object') {
                this.detailScrollMemory = {}
                return
            }

            const limit = Number(this.detailScrollMemoryLimit)
            const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 100
            const entries = Object.entries(this.detailScrollMemory)
            if (entries.length <= safeLimit) return

            entries.sort((a, b) => Number(a?.[1]?.updatedAt || 0) - Number(b?.[1]?.updatedAt || 0))
            const deleteCount = entries.length - safeLimit
            for (let i = 0; i < deleteCount; i++) {
                delete this.detailScrollMemory[entries[i][0]]
            }

            this.detailScrollMemory = { ...this.detailScrollMemory }
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
        async waitForPlaylistHydration(id) {
            const targetId = String(id || '')
            if (!targetId) return

            const hydration = this.playlistHydration || createPlaylistHydrationState()
            if (String(hydration.id || '') != targetId || hydration.status != 'loading') return

            const task = this.playlistHydrationPromise
            if (task && typeof task.then == 'function') {
                await task.catch(() => null)
            }
        },
        async hydratePlaylistRemaining(id, totalTracks, token, initialLoaded = 0, gid = null) {
            const offsets = []
            for (let offset = PLAYLIST_PAGE_SIZE; offset < totalTracks; offset += PLAYLIST_PAGE_SIZE) {
                offsets.push(offset)
            }
            if (offsets.length == 0) return []

            const queue = offsets.slice()
            const pages = []
            let loadedCount = Math.min(initialLoaded, totalTracks)
            const worker = async () => {
                while (queue.length > 0) {
                    if (this.playlistHydrationToken != token) return
                    const offset = queue.shift()
                    const params = {
                        id,
                        gid,
                        limit: PLAYLIST_PAGE_SIZE,
                        offset,
                    }
                    const result = await getPlaylistAll(params)
                    if (this.playlistHydrationToken != token) return

                    const songs = mapSongsPlayableStatus(result?.songs || [], result?.privileges || []) || []
                    pages.push({ offset, songs })
                    loadedCount = Math.min(totalTracks, loadedCount + songs.length)
                    this.playlistHydration = createPlaylistHydrationState({
                        id,
                        total: totalTracks,
                        loaded: loadedCount,
                        status: 'loading',
                    })
                }
            }
            const workerCount = Math.min(PLAYLIST_HYDRATION_CONCURRENCY, queue.length)
            await Promise.all(Array.from({ length: workerCount }, () => worker()))
            if (this.playlistHydrationToken != token) return []

            pages.sort((a, b) => a.offset - b.offset)
            const mergedSongs = []
            pages.forEach(page => mergedSongs.push(...page.songs))
            return mergedSongs
        },
        async updateLibraryDetail(id, routerName, options = {}) {
            const requestId = `${routerName}-${String(id || '')}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            this.libraryDetailToken = requestId
            this.changeAnimation()
            this.resetSearchIndex()
            // 先清空旧详情，避免路由已切换但旧内容还残留在页面上。
            this.libraryInfo = null
            this.librarySongs = null
            this.libraryAlbum = null
            this.libraryMV = null
            this.resetArtistPagination()
            if (routerName != 'playlist') this.resetPlaylistHydration()
            if (routerName == 'playlist') await this.updatePlaylistDetail(id, { ...options, loadToken: requestId })
            if (routerName == 'album') await this.updateAlbumDetail(id, requestId)
            if (routerName == 'artist') await this.updateArtistDetail(id, requestId)
            this.artistPageType = 0
        },
        async updatePlaylistDetail(id, options = {}) {
            const { deferRemaining = false, routeQuery = {} } = options
            const loadToken = options?.loadToken || this.libraryDetailToken
            const playlistId = String(id || '')
            const listItem = Array.isArray(this.libraryList)
                ? this.libraryList.find(p => String(p.id) === playlistId || String(p.global_collection_id || '') === playlistId)
                : null
            const seededPlaylist = !listItem && (
                String(this.libraryInfo?.id || '') == playlistId ||
                String(this.libraryInfo?.global_collection_id || '') == playlistId
            ) ? this.libraryInfo : null
            const playlist = listItem || seededPlaylist || null
            const routeQuerySource = String(routeQuery?.source || '')
            const routeRankCid = routeQuery?.rankCid ? String(routeQuery.rankCid) : ''
            const isRankPlaylist = routeQuerySource == 'rank' || seededPlaylist?.source == 'rank'
            const routeCollectionId = String(routeQuery?.globalCollectionId || routeQuery?.collectionId || routeQuery?.gid || routeQuery?.collection_id || '')
            const inferredCollectionId = /^collection_\d+_\d+_\d+_\d+$/.test(playlistId) ? playlistId : ''
            const resolvedCollectionId = playlist?.global_collection_id || routeCollectionId || inferredCollectionId || ''
            const resolvedPlaylistId = resolvedCollectionId || playlistId
            const token = `${resolvedPlaylistId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            this.playlistHydrationToken = token
            this.playlistHydrationPromise = null
            this.playlistHydration = createPlaylistHydrationState({
                id: resolvedPlaylistId,
                total: 0,
                loaded: 0,
                status: 'loading',
            })

            try {
                if (this.libraryDetailToken != loadToken) return
                if (isRankPlaylist) {
                    const rankInfoResult = await getRankInfo(playlistId, routeRankCid ? { rank_cid: routeRankCid } : {})
                    if (this.libraryDetailToken != loadToken) return
                    if (this.playlistHydrationToken != token) return

                    const rankInfo = rankInfoResult?.data || rankInfoResult || {}
                    const rankSongsResult = await getRankSongs({
                        rankid: playlistId,
                        rank_cid: routeRankCid || rankInfo?.rank_cid || '',
                        page: 1,
                        pagesize: 500,
                    })
                    if (this.libraryDetailToken != loadToken) return
                    if (this.playlistHydrationToken != token) return

                    const rankSongs = mapSongsPlayableStatus(rankSongsResult?.songs || [], rankSongsResult?.privileges || []) || []
                    const rankCover = rankInfo?.imgurl || rankInfo?.img_9 || rankInfo?.banner_9 || rankInfo?.album_img_9 || seededPlaylist?.coverImgUrl || ''
                    const coverImgUrl = typeof rankCover == 'string' ? rankCover.replace('{size}', '480') : rankCover
                    const trackCount = Number(rankSongsResult?.data?.total ?? rankInfo?.extra?.resp?.all_total ?? rankSongs.length) || rankSongs.length

                    this.libraryInfo = {
                        ...(seededPlaylist || {}),
                        id: rankInfo?.rankid ?? seededPlaylist?.id ?? playlistId,
                        name: rankInfo?.rankname || seededPlaylist?.name || '排行榜',
                        coverImgUrl,
                        trackCount,
                        description: rankInfo?.intro || seededPlaylist?.description || '',
                        updateFrequency: rankInfo?.update_frequency || seededPlaylist?.updateFrequency || '',
                        rank_cid: routeRankCid || rankInfo?.rank_cid || seededPlaylist?.rank_cid || '',
                        source: 'rank',
                    }
                    this.librarySongs = rankSongs
                    this.indexLibrarySongs(rankSongs)
                    this.playlistHydration = createPlaylistHydrationState({
                        id: playlistId,
                        total: trackCount,
                        loaded: rankSongs.length,
                        status: 'completed',
                    })
                    this.libraryChangeAnimation = false
                    return
                }

                // 酷狗公开/推荐歌单要使用 global_collection_id 拉取完整曲目；listid 只适合用户自建/收藏歌单。
                const trackParams = {
                    id: resolvedPlaylistId,
                    gid: resolvedCollectionId || null,
                    limit: PLAYLIST_PAGE_SIZE,
                    offset: 0,
                }
                const playlistTrackResult = await getPlaylistAll(trackParams)
                if (this.playlistHydrationToken != token) return

                const firstBatchSongs = mapSongsPlayableStatus(playlistTrackResult?.songs || [], playlistTrackResult?.privileges || []) || []
                const listInfo = playlistTrackResult?.data?.list_info || playlistTrackResult?.list_info || null
                const mergedPlaylist = {
                    ...(playlist || {}),
                    ...(listInfo || {}),
                }

                const fallbackPlaylist = {
                    ...mergedPlaylist,
                    id: resolvedPlaylistId || mergedPlaylist?.id || mergedPlaylist?.list_create_listid || mergedPlaylist?.listid || playlistId,
                    global_collection_id: resolvedCollectionId || mergedPlaylist?.global_collection_id || null,
                    list_create_userid: mergedPlaylist?.list_create_userid || mergedPlaylist?.creator?.userId || mergedPlaylist?.userid || null,
                    list_create_listid: mergedPlaylist?.list_create_listid || mergedPlaylist?.listid || null,
                    list_create_gid: mergedPlaylist?.list_create_gid || mergedPlaylist?.global_collection_id || null,
                    name: mergedPlaylist?.name || mergedPlaylist?.listname || mergedPlaylist?.specialname || '歌单',
                    coverImgUrl: mergedPlaylist?.coverImgUrl || mergedPlaylist?.pic || mergedPlaylist?.imgurl || firstBatchSongs[0]?.coverUrl || firstBatchSongs[0]?.al?.picUrl || '',
                    trackCount: mergedPlaylist?.trackCount || mergedPlaylist?.count || mergedPlaylist?.list_count || mergedPlaylist?.songcount || firstBatchSongs.length,
                    createTime: mergedPlaylist?.createTime || (mergedPlaylist?.create_time ? mergedPlaylist.create_time * 1000 : null),
                    description: mergedPlaylist?.description || mergedPlaylist?.intro || mergedPlaylist?.briefDesc || '',
                    creator: mergedPlaylist?.creator || { nickname: mergedPlaylist?.list_create_username || mergedPlaylist?.username || '' },
                }

                const totalTracks = Number(fallbackPlaylist?.trackIds?.length || fallbackPlaylist?.trackCount || firstBatchSongs.length || 0)
                const loadedTracks = Math.min(firstBatchSongs.length, totalTracks)

                this.libraryInfo = fallbackPlaylist
                this.librarySongs = firstBatchSongs
                this.indexLibrarySongs(firstBatchSongs)


                if (totalTracks <= loadedTracks) {
                    this.playlistHydration = createPlaylistHydrationState({
                        id: resolvedPlaylistId,
                        total: totalTracks,
                        loaded: loadedTracks,
                        status: 'completed',
                    })
                    this.libraryChangeAnimation = false
                    return
                }

                this.playlistHydration = createPlaylistHydrationState({
                    id: resolvedPlaylistId,
                    total: totalTracks,
                    loaded: loadedTracks,
                    status: 'loading',
                })

                const hydrationTask = this.hydratePlaylistRemaining(resolvedPlaylistId, totalTracks, token, loadedTracks, resolvedCollectionId || null)
                    .then(remainingSongs => {
                        if (this.playlistHydrationToken != token) return
                        if (Array.isArray(remainingSongs) && remainingSongs.length > 0) {
                            const currentSongs = Array.isArray(this.librarySongs) ? this.librarySongs : []
                            if (!Array.isArray(this.librarySongs)) this.librarySongs = currentSongs
                            for (let i = 0; i < remainingSongs.length; i++) {
                                currentSongs.push(remainingSongs[i])
                            }
                            this.indexLibrarySongs(remainingSongs, { append: true })
                        }
                        this.playlistHydration = createPlaylistHydrationState({
                            id: resolvedPlaylistId,
                            total: totalTracks,
                            loaded: totalTracks,
                            status: 'completed',
                        })
                    })
                    .catch(() => {
                        if (this.playlistHydrationToken != token) return
                        const loadedNow = Array.isArray(this.librarySongs) ? Math.min(this.librarySongs.length, totalTracks) : loadedTracks
                        this.playlistHydration = createPlaylistHydrationState({
                            id: resolvedPlaylistId,
                            total: totalTracks,
                            loaded: loadedNow,
                            status: 'failed',
                        })
                    })
                    .finally(() => {
                        if (this.playlistHydrationToken == token) this.playlistHydrationPromise = null
                    })

                this.playlistHydrationPromise = hydrationTask
                this.libraryChangeAnimation = false
                    if (!deferRemaining) await hydrationTask
            } catch (error) {
                if (this.libraryDetailToken != loadToken) return
                if (this.playlistHydrationToken == token) {
                    this.playlistHydration = createPlaylistHydrationState({
                        id: resolvedPlaylistId,
                        total: 0,
                        loaded: 0,
                        status: 'failed',
                    })
                    this.playlistHydrationPromise = null
                    this.libraryChangeAnimation = false
                }
                throw error
            }
        },
        async updateAlbumDetail(id, loadToken = null) {
            let params = {
                id: id,
                // timestamp: new Date().getTime()
            }
            const result = await Promise.all([getAlbumDetail(params), albumDynamic(id)])
            if (loadToken && this.libraryDetailToken != loadToken) return
            const albumDetail = result[0]
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
            this.libraryInfo.followed = result[1].isSub
            this.libraryChangeAnimation = false
        },
        async updateArtistDetail(id, loadToken = null) {
            let params = {
                id: id,
                // timestamp: new Date().getTime()
            }
            const results = await Promise.all([
                getArtistDetail(params),
                getArtistTopSong({ ...params, page: 1, pagesize: ARTIST_SONG_PAGE_SIZE }),
            ])
            if (loadToken && this.libraryDetailToken != loadToken) return
            this.libraryInfo = results[0].artist
            // 酷狗歌手详情本身不带热门歌曲，热门单曲需要单独走 /artist/audios。
            this.librarySongs = mapSongsPlayableStatus(results[1].songs)
            this.indexLibrarySongs(this.librarySongs)
            this.artistPagination = {
                ...this.artistPagination,
                songs: createArtistListPageState({
                    id: String(id || ''),
                    page: 1,
                    pagesize: ARTIST_SONG_PAGE_SIZE,
                    total: Number(results[1]?.total || this.librarySongs.length || 0),
                    loaded: this.librarySongs.length,
                    loading: false,
                }),
                albums: createArtistListPageState(),
            }
            this.libraryChangeAnimation = false
        },
        // 获取歌手热门歌曲，并按需支持下拉续页。
        async updateArtistTopSong(id, { reset = true } = {}) {
            const loadToken = this.libraryDetailToken
            const artistId = String(id || '')
            const currentState = this.artistPagination?.songs || createArtistListPageState()
            if (!artistId) return
            if (!reset && (currentState.loading || !currentState.hasMore || currentState.id != artistId)) return

            const nextPage = reset || currentState.id != artistId ? 1 : currentState.page + 1
            const pagesize = Number(currentState.pagesize || ARTIST_SONG_PAGE_SIZE) || ARTIST_SONG_PAGE_SIZE

            this.artistPagination = {
                ...this.artistPagination,
                songs: {
                    ...currentState,
                    id: artistId,
                    loading: true,
                    pagesize,
                },
            }

            try {
                const result = await getArtistTopSong({
                    id: artistId,
                    page: nextPage,
                    pagesize,
                })
                if (loadToken && this.libraryDetailToken != loadToken) return

                const normalizedSongs = mapSongsPlayableStatus(result.songs) || []
                const mergedSongs = reset ? normalizedSongs : mergeUniqueEntries(this.librarySongs, normalizedSongs, 'artist-song')
                this.librarySongs = mergedSongs
                this.indexLibrarySongs(this.librarySongs)

                const total = Number(result?.total || mergedSongs.length || 0)
                this.artistPagination = {
                    ...this.artistPagination,
                    songs: createArtistListPageState({
                        id: artistId,
                        page: nextPage,
                        pagesize,
                        total,
                        loaded: mergedSongs.length,
                        loading: false,
                    }),
                }
            } catch (error) {
                this.artistPagination = {
                    ...this.artistPagination,
                    songs: {
                        ...this.artistPagination.songs,
                        loading: false,
                    },
                }
                throw error
            }
        },
        async loadMoreArtistTopSong(id) {
            await this.updateArtistTopSong(id, { reset: false })
        },
        // 获取歌手专辑，并按需支持下拉续页。
        async updateArtistAlbum(id, { reset = true } = {}) {
            const loadToken = this.libraryDetailToken
            const artistId = String(id || '')
            const currentState = this.artistPagination?.albums || createArtistListPageState()
            if (!artistId) return
            if (!reset && (currentState.loading || !currentState.hasMore || currentState.id != artistId)) return

            const nextPage = reset || currentState.id != artistId ? 1 : currentState.page + 1
            const pagesize = Number(currentState.pagesize || ARTIST_ALBUM_PAGE_SIZE) || ARTIST_ALBUM_PAGE_SIZE

            this.artistPagination = {
                ...this.artistPagination,
                albums: {
                    ...currentState,
                    id: artistId,
                    loading: true,
                    pagesize,
                },
            }

            try {
                const result = await getArtistAlbum({
                    id: artistId,
                    limit: pagesize,
                    offset: (nextPage - 1) * pagesize,
                })
                if (loadToken && this.libraryDetailToken != loadToken) return

                const mergedAlbums = reset ? (result.hotAlbums || []) : mergeUniqueEntries(this.libraryAlbum, result.hotAlbums || [], 'artist-album')
                this.libraryAlbum = mergedAlbums
                this.indexLibraryAlbums(this.libraryAlbum)

                const total = Number(result?.total || mergedAlbums.length || 0)
                this.artistPagination = {
                    ...this.artistPagination,
                    albums: createArtistListPageState({
                        id: artistId,
                        page: nextPage,
                        pagesize,
                        total,
                        loaded: mergedAlbums.length,
                        loading: false,
                    }),
                }
            } catch (error) {
                this.artistPagination = {
                    ...this.artistPagination,
                    albums: {
                        ...this.artistPagination.albums,
                        loading: false,
                    },
                }
                throw error
            }
        },
        async loadMoreArtistAlbum(id) {
            await this.updateArtistAlbum(id, { reset: false })
        },
        //获取歌手MV，并更新Store数据
        async updateArtistsMV(id) {
            let params = {
                id: id,
                limit: 500,
                offset: 0
                // timestamp: new Date().getTime()
            }
            const loadToken = this.libraryDetailToken
            await getArtistMV(params).then(result => {
                if (loadToken && this.libraryDetailToken != loadToken) return
                this.libraryMV = result.mvs
                this.indexLibraryMVs(this.libraryMV)
            })
        },
        async updateRecommendSongs(date, historyName) {
            const request = date ? getHistoryRecommendSongsDetail({ date, history_name: historyName }) : getRecommendSongs()
            await request.then(result => {
                const songs = normalizeRecommendSongList(result)
                this.librarySongs = mapSongsPlayableStatus(songs.map(song => normalizePlaylistSong(song))) || []
                this.indexLibrarySongs(this.librarySongs)
            })
        },
    },
})
