import { defineStore } from "pinia";
import { noticeOpen } from "../utils/dialog";

const createLookupIndexState = () => ({
    localFoldersByName: {},
    downloadedFoldersByName: {},
    albumsById: {},
    artistsById: {},
    songSearchByScope: {
        local: {},
        downloaded: {},
    },
})

export const useLocalStore = defineStore('localStore', {
    state: () => {
        return {
            isFirstDownload: true,
            isDownloading: false,
            downloadList: [],
            downloadedFolderSettings: null,
            downloadedMusicFolder: null,
            downloadedFiles: null,
            localFolderSettings: [],
            localMusicFolder: null,
            localMusicList: null,
            localMusicClassify: null,

            currentSelectedFile: {name: null},

            currentType: null,
            currentSelectedInfo: null,
            currentSelectedSongs: null,
            currentSelectedFilePicUrl: null,
            isRefreshLocalFile: false,

            quitApp: null,
            lookupIndex: createLookupIndexState(),
        }
    },
    actions: {
        //对象数组去重(根据batch参数去重)
        removedup(arr, batch) {
            if (!Array.isArray(arr)) {
              return arr;
            }
            if (arr.length == 0) {
              return [];
            }
            let obj = {};
            let uniqueArr = arr.reduce(function (total, item) {
              obj[item[batch]] ? '' : (obj[item[batch]] = true && total.push(item));
              return total;
            }, []);
            return uniqueArr;
        },
        updateDownloadList(list) {
            if(!this.downloadedFolderSettings) {noticeOpen("请先在设置中设置下载目录", 2);return}
            this.downloadList = this.downloadList.concat(list)
            this.downloadList = this.removedup(this.downloadList, 'id')
            if(!this.isDownloading && this.isFirstDownload) {
                windowApi.startDownload()
                this.isFirstDownload = false
            }
            noticeOpen('已添加到下载列表', 2)
        },
        getSongs(arr) {
            arr.forEach(song => {
              if(song.children) this.getSongs(song.children)
              else {
                this.currentSelectedSongs.push(song)
              }
            })
        },
        getFolderSongs(arr, folderName) {
            arr.forEach(item => {
              if(item.name == folderName) {
                this.currentSelectedInfo = {
                    name: item.name,
                    dirPath: item.dirPath
                }
                this.currentSelectedSongs = []
                this.getSongs(item.children)
                return
              } else if(item.children) this.getFolderSongs(item.children, folderName)
        
            });
        },
        async getImgBase64(fileUrl) {
            return await windowApi.getLocalMusicImage(fileUrl)
        },
        updateLookupIndex(type, indexData = {}) {
            const nextLookupIndex = {
                ...this.lookupIndex,
                songSearchByScope: {
                    ...this.lookupIndex.songSearchByScope,
                    [type]: indexData.songSearchById || {},
                },
            }

            if (type == 'downloaded') {
                nextLookupIndex.downloadedFoldersByName = indexData.foldersByName || {}
            }

            if (type == 'local') {
                nextLookupIndex.localFoldersByName = indexData.foldersByName || {}
                nextLookupIndex.albumsById = indexData.albumsById || {}
                nextLookupIndex.artistsById = indexData.artistsById || {}
            }

            this.lookupIndex = nextLookupIndex
        },
        getSongSearchText(song, scope = null) {
            const songId = String(song?.id || '')
            if (!songId) return ''

            if (scope && this.lookupIndex.songSearchByScope?.[scope]?.[songId]) {
                return this.lookupIndex.songSearchByScope[scope][songId]
            }

            return this.lookupIndex.songSearchByScope?.local?.[songId]
                || this.lookupIndex.songSearchByScope?.downloaded?.[songId]
                || ''
        },
        updateLocalMusicDetail(type, query, id) {
            this.currentType = type
            this.currentSelectedFilePicUrl = null
            if(type == 'localFiles') {
                const folderScope = query?.type == 'downloaded' ? 'downloaded' : 'local'
                const folderLookupKey = query?.path || query?.dirPath || query?.name
                const folderEntry = folderScope == 'downloaded'
                    ? this.lookupIndex.downloadedFoldersByName?.[folderLookupKey] || this.lookupIndex.downloadedFoldersByName?.[query?.name]
                    : this.lookupIndex.localFoldersByName?.[folderLookupKey] || this.lookupIndex.localFoldersByName?.[query?.name]

                this.currentSelectedInfo = {
                    name: folderEntry?.name || query?.name || null,
                    dirPath: folderEntry?.dirPath || null,
                    scope: folderScope,
                }
                this.currentSelectedSongs = Array.isArray(folderEntry?.songs) ? folderEntry.songs : []
            }
            if(type == 'localAlbum') {
                const albumEntry = this.lookupIndex.albumsById?.[String(id)] || null
                this.currentSelectedInfo = {
                    id: albumEntry?.id || id,
                    name: albumEntry?.name || null,
                    scope: 'local',
                }
                this.currentSelectedSongs = Array.isArray(albumEntry?.songs) ? albumEntry.songs : []
                if(Array.isArray(this.currentSelectedSongs) && this.currentSelectedSongs.length > 0)
                    this.getImgBase64(this.currentSelectedSongs[0].common.fileUrl).then(res => {
                        this.currentSelectedFilePicUrl = res
                    })
            }
            if(type == 'localArtist') {
                const artistEntry = this.lookupIndex.artistsById?.[String(id)] || null
                this.currentSelectedInfo = {
                    id: artistEntry?.id || id,
                    name: artistEntry?.name || null,
                    scope: 'local',
                }
                this.currentSelectedSongs = Array.isArray(artistEntry?.songs) ? artistEntry.songs : []
                if(Array.isArray(this.currentSelectedSongs) && this.currentSelectedSongs.length > 0)
                    this.getImgBase64(this.currentSelectedSongs[0].common.fileUrl).then(res => {
                        this.currentSelectedFilePicUrl = res
                    })
            }
        }
    },
})
