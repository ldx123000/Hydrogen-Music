import { defineStore } from "pinia";
import { getPlaylistDetail, getPlaylistAll, getRecommendSongs, playlistDynamic } from '../api/playlist'
import { getAlbumDetail, albumDynamic } from '../api/album'
import { getArtistDetail, getArtistFansCount, getArtistTopSong, getArtistAlbum } from '../api/artist'
import { getArtistMV } from '../api/mv'
import { getSongDetail } from '../api/song'
import { mapSongsPlayableStatus } from "../utils/songStatus";

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
        async updateLibraryDetail(id, routerName) {
            this.changeAnimation()
            if (routerName == 'playlist') await this.updatePlaylistDetail(id)
            if (routerName == 'album') await this.updateAlbumDetail(id)
            if (routerName == 'artist') await this.updateArtistDetail(id)
            this.artistPageType = 0
            this.libraryAlbum = null
            this.libraryMV = null
        },
        async updatePlaylistDetail(id) {
            let params = {
                id: id,
                limit: 1000,
                offset: 0,
                // timestamp: new Date().getTime()
            }
            await Promise.all([getPlaylistDetail(params), getPlaylistAll(params), playlistDynamic(id)]).then(async results => {
                this.libraryInfo = results[0].playlist
                this.librarySongs = results[1].songs
                this.librarySongs = mapSongsPlayableStatus(results[1].songs, results[1].privileges)
                if (results[0].playlist.trackIds.length > 1000) {
                    for (let i = 1; i < (results[0].playlist.trackIds.length / 1000); i++) {
                        const params = {
                            id: id,
                            limit: 1000,
                            offset: i * 1000,
                        }
                        const res = await getPlaylistAll(params)
                        const songs = mapSongsPlayableStatus(res.songs, res.privileges)
                        this.librarySongs = this.librarySongs.concat(songs)
                    }
                }
                this.libraryInfo.followed = results[2].subscribed
                this.libraryChangeAnimation = false
            })
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
        async updateRecommendSongs() {
            await getRecommendSongs().then(result => {
                this.librarySongs = mapSongsPlayableStatus(result.data.dailySongs)
            })
        },
    },
})
