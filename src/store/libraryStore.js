import { defineStore } from "pinia";
import { getPlaylistDetail, getPlaylistAll, getRecommendSongs, getHistoryRecommendSongsDetail, playlistDynamic } from '../api/playlist'
import { getAlbumDetail, albumDynamic } from '../api/album'
import { getArtistDetail, getArtistFansCount, getArtistTopSong, getArtistAlbum } from '../api/artist'
import { getArtistMV } from '../api/mv'
import { getSongDetail } from '../api/song'
import { mapSongsPlayableStatus } from "../utils/songStatus";

const PLAYLIST_PAGE_SIZE = 100
const PLAYLIST_HYDRATION_CONCURRENCY = 4

const createPlaylistHydrationState = ({ id = null, total = 0, loaded = 0, status = 'idle' } = {}) => ({
    id,
    total,
    loaded,
    status,
})

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
            this.playlistUserCreated = playlist.splice(0, this.playlistCount.createdPlaylistCount)
            this.playlistUserSub = playlist.splice(0, this.playlistCount.subPlaylistCount)
        },
        resetPlaylistHydration() {
            this.playlistHydration = createPlaylistHydrationState()
            this.playlistHydrationToken = null
            this.playlistHydrationPromise = null
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
        async hydratePlaylistRemaining(id, totalTracks, token, initialLoaded = 0) {
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
            if (routerName != 'playlist') this.resetPlaylistHydration()
            if (routerName == 'playlist') await this.updatePlaylistDetail(id, options)
            if (routerName == 'album') await this.updateAlbumDetail(id)
            if (routerName == 'artist') await this.updateArtistDetail(id)
            this.artistPageType = 0
            this.libraryAlbum = null
            this.libraryMV = null
        },
        async updatePlaylistDetail(id, options = {}) {
            const { deferRemaining = false } = options
            const playlistId = String(id || '')
            const token = `${playlistId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            this.playlistHydrationToken = token
            this.playlistHydrationPromise = null
            this.playlistHydration = createPlaylistHydrationState({
                id: playlistId,
                total: 0,
                loaded: 0,
                status: 'loading',
            })

            const params = {
                id: playlistId,
                limit: PLAYLIST_PAGE_SIZE,
                offset: 0,
            }
            try {
                const [playlistDetailResult, playlistTrackResult, playlistDynamicResult] = await Promise.all([
                    getPlaylistDetail(params),
                    getPlaylistAll(params),
                    playlistDynamic(playlistId),
                ])
                if (this.playlistHydrationToken != token) return

                const playlist = playlistDetailResult?.playlist || null
                const firstBatchSongs = mapSongsPlayableStatus(playlistTrackResult?.songs || [], playlistTrackResult?.privileges || []) || []
                const totalTracks = Number(playlist?.trackIds?.length || firstBatchSongs.length || 0)
                const loadedTracks = Math.min(firstBatchSongs.length, totalTracks)

                this.libraryInfo = playlist
                this.librarySongs = firstBatchSongs
                if (this.libraryInfo) this.libraryInfo.followed = !!playlistDynamicResult?.subscribed

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

                const hydrationTask = this.hydratePlaylistRemaining(playlistId, totalTracks, token, loadedTracks)
                    .then(remainingSongs => {
                        if (this.playlistHydrationToken != token) return
                        if (Array.isArray(remainingSongs) && remainingSongs.length > 0) {
                            const currentSongs = Array.isArray(this.librarySongs) ? this.librarySongs : []
                            if (!Array.isArray(this.librarySongs)) this.librarySongs = currentSongs
                            for (let i = 0; i < remainingSongs.length; i++) {
                                currentSongs.push(remainingSongs[i])
                            }
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
            })
        },
        async updateRecommendSongs(date) {
            const request = date ? getHistoryRecommendSongsDetail({ date }) : getRecommendSongs()
            await request.then(result => {
                const dailySongs = result?.data?.dailySongs || []
                const historySongs = result?.data?.songs || result?.data?.dailySongs || result?.songs || []
                const songs = date ? historySongs : dailySongs

                this.librarySongs = mapSongsPlayableStatus(songs) || []
            })
        },
    },
})
