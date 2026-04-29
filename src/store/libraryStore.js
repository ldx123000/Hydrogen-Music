import { defineStore } from "pinia";
import { getPlaylistAll, getRecommendSongs, getHistoryRecommendSongsDetail, normalizePlaylistSong, getRankInfo, getRankSongs } from '../api/playlist'
import { getAlbumDetail, albumDynamic } from '../api/album'
import { getArtistDetail, getArtistFansCount, getArtistTopSong, getArtistAlbum } from '../api/artist'
import { getArtistMV } from '../api/mv'
import { getSongDetail } from '../api/song'
import { mapSongsPlayableStatus } from "../utils/songStatus";
import { buildAlbumSearchText, buildCloudSongSearchText, buildMVSearchText } from "../utils/songFilter";

const PLAYLIST_PAGE_SIZE = 999
const PLAYLIST_HYDRATION_CONCURRENCY = 4

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

const getSearchEntryKey = (entry, fallbackKey = '0') => String(entry?.id ?? fallbackKey)
const normalizeRecommendSongList = result => {
    const directSongs = result?.data?.song_list || result?.song_list || []
    if (Array.isArray(directSongs) && directSongs.length > 0) return directSongs

    const nestedLists = result?.data?.lists || result?.lists || []
    if (!Array.isArray(nestedLists) || nestedLists.length == 0) return []

    const firstList = nestedLists.find(item => Array.isArray(item?.song_list) && item.song_list.length > 0) || nestedLists[0]
    return Array.isArray(firstList?.song_list) ? firstList.song_list : []
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
            playlistHydration: createPlaylistHydrationState(),
            playlistHydrationToken: null,
            playlistHydrationPromise: null,
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
                this.playlistUserCreated = playlist.filter(p => p.is_mine === 1)
                this.playlistUserSub = playlist.filter(p => p.is_mine === 0)
            } else {
                this.playlistUserCreated = playlist.splice(0, this.playlistCount?.createdPlaylistCount ?? playlist.length)
                this.playlistUserSub = playlist.splice(0, this.playlistCount?.subPlaylistCount ?? playlist.length)
            }
        },
        resetPlaylistHydration() {
            this.playlistHydration = createPlaylistHydrationState()
            this.playlistHydrationToken = null
            this.playlistHydrationPromise = null
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
            this.changeAnimation()
            this.resetSearchIndex()
            if (routerName != 'playlist') this.resetPlaylistHydration()
            if (routerName == 'playlist') await this.updatePlaylistDetail(id, options)
            if (routerName == 'album') await this.updateAlbumDetail(id)
            if (routerName == 'artist') await this.updateArtistDetail(id)
            this.artistPageType = 0
            this.libraryAlbum = null
            this.libraryMV = null
        },
        async updatePlaylistDetail(id, options = {}) {
            const { deferRemaining = false, routeQuery = {} } = options
            const playlistId = String(id || '')
            const listItem = Array.isArray(this.libraryList) ? this.libraryList.find(p => String(p.id) === playlistId) : null
            const seededPlaylist = !listItem && String(this.libraryInfo?.id || '') == playlistId ? this.libraryInfo : null
            const routeQuerySource = String(routeQuery?.source || '')
            const routeRankCid = routeQuery?.rankCid ? String(routeQuery.rankCid) : ''
            const isRankPlaylist = routeQuerySource == 'rank' || seededPlaylist?.source == 'rank'
            const resolvedCollectionId = listItem?.global_collection_id || playlistId
            const token = `${playlistId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            this.playlistHydrationToken = token
            this.playlistHydrationPromise = null
            this.playlistHydration = createPlaylistHydrationState({
                id: playlistId,
                total: 0,
                loaded: 0,
                status: 'loading',
            })

            try {
                if (isRankPlaylist) {
                    const rankInfoResult = await getRankInfo(playlistId, routeRankCid ? { rank_cid: routeRankCid } : {})
                    if (this.playlistHydrationToken != token) return

                    const rankInfo = rankInfoResult?.data || rankInfoResult || {}
                    const rankSongsResult = await getRankSongs({
                        rankid: playlistId,
                        rank_cid: routeRankCid || rankInfo?.rank_cid || '',
                        page: 1,
                        pagesize: 500,
                    })
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

                const playlist = listItem || seededPlaylist || null

                const trackParams = {
                    id: playlistId,
                    gid: listItem?.global_collection_id || null,
                    limit: PLAYLIST_PAGE_SIZE,
                    offset: 0,
                }
                const playlistTrackResult = await getPlaylistAll(trackParams)
                if (this.playlistHydrationToken != token) return

                const firstBatchSongs = mapSongsPlayableStatus(playlistTrackResult?.songs || [], playlistTrackResult?.privileges || []) || []
                
                const fallbackPlaylist = {
                    ...playlist,
                    id: playlist?.id || playlist?.list_create_listid || playlist?.listid || playlistId,
                    name: playlist?.name || playlist?.listname || playlist?.specialname || '歌单',
                    coverImgUrl: playlist?.coverImgUrl || playlist?.pic || playlist?.imgurl || firstBatchSongs[0]?.coverUrl || firstBatchSongs[0]?.al?.picUrl || '',
                    trackCount: playlist?.trackCount || playlist?.count || playlist?.list_count || playlist?.songcount || firstBatchSongs.length,
                    createTime: playlist?.createTime || (playlist?.create_time ? playlist.create_time * 1000 : null),
                    description: playlist?.description || playlist?.intro || playlist?.briefDesc || '',
                    creator: playlist?.creator || { nickname: playlist?.list_create_username || playlist?.username || '' },
                }

                const totalTracks = Number(fallbackPlaylist?.trackIds?.length || fallbackPlaylist?.trackCount || firstBatchSongs.length || 0)
                const loadedTracks = Math.min(firstBatchSongs.length, totalTracks)

                this.libraryInfo = fallbackPlaylist
                this.librarySongs = firstBatchSongs
                this.indexLibrarySongs(firstBatchSongs)


                if (totalTracks <= loadedTracks) {
                    this.playlistHydration = createPlaylistHydrationState({
                        id: playlistId,
                        total: totalTracks,
                        loaded: loadedTracks,
                        status: 'completed',
                    })
                    this.libraryChangeAnimation = false
                    return
                }

                this.playlistHydration = createPlaylistHydrationState({
                    id: playlistId,
                    total: totalTracks,
                    loaded: loadedTracks,
                    status: 'loading',
                })

                const hydrationTask = this.hydratePlaylistRemaining(playlistId, totalTracks, token, loadedTracks, listItem?.global_collection_id || null)
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
                            id: playlistId,
                            total: totalTracks,
                            loaded: totalTracks,
                            status: 'completed',
                        })
                    })
                    .catch(() => {
                        if (this.playlistHydrationToken != token) return
                        const loadedNow = Array.isArray(this.librarySongs) ? Math.min(this.librarySongs.length, totalTracks) : loadedTracks
                        this.playlistHydration = createPlaylistHydrationState({
                            id: playlistId,
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
                if (this.playlistHydrationToken == token) {
                    this.playlistHydration = createPlaylistHydrationState({
                        id: playlistId,
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
        async updateAlbumDetail(id) {
            let params = {
                id: id,
                // timestamp: new Date().getTime()
            }
            await Promise.all([getAlbumDetail(params), albumDynamic(id)]).then(results => {
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
                this.libraryChangeAnimation = false
            })
        },
        async updateArtistDetail(id) {
            let params = {
                id: id,
                // timestamp: new Date().getTime()
            }
            await Promise.all([getArtistDetail(params), getArtistFansCount(id)]).then(async results => {
                results[0].artist.follow = results[1].data
                results[0].artist.followed = results[1].data.follow
                this.libraryInfo = results[0].artist
                
                // 获取热门歌曲的完整详情（包括封面）
                const songIds = results[0].hotSongs.map(song => song.id)
                const songDetailResult = await getSongDetail(songIds)
                
                // 使用详情API返回的完整歌曲数据
                this.librarySongs = mapSongsPlayableStatus(songDetailResult.songs)
                this.indexLibrarySongs(this.librarySongs)
                this.libraryChangeAnimation = false
            })
        },
        //获取歌手热门歌曲前50首，并更新Store数据
        async updateArtistTopSong(id) {
            let params = {
                id: id,
                // timestamp: new Date().getTime()
            }
            await getArtistTopSong(params).then(async result => {
                // 获取所有歌曲ID
                const songIds = result.songs.map(song => song.id)
                
                // 使用歌曲详情API获取完整信息（包括正确的封面）
                const songDetailResult = await getSongDetail(songIds)
                
                // 使用详情API返回的完整歌曲数据
                this.librarySongs = mapSongsPlayableStatus(songDetailResult.songs)
                this.indexLibrarySongs(this.librarySongs)
            })
        },
        //获取歌手专辑，并更新Store数据
        async updateArtistAlbum(id) {
            let params = {
                id: id,
                limit: 500,
                offset: 0
                // timestamp: new Date().getTime()
            }
            await getArtistAlbum(params).then(result => {
                this.libraryAlbum = result.hotAlbums
                this.indexLibraryAlbums(this.libraryAlbum)
            })
        },
        //获取歌手MV，并更新Store数据
        async updateArtistsMV(id) {
            let params = {
                id: id,
                limit: 500,
                offset: 0
                // timestamp: new Date().getTime()
            }
            await getArtistMV(params).then(result => {
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
