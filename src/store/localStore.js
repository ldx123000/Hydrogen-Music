import { defineStore } from "pinia";
import { noticeOpen } from "../utils/dialog";

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
        updateLocalMusicDetail(type, query, id) {
            this.currentType = type
            if(type == 'localFiles') {
                if(query.type == 'downloaded')
                    this.getFolderSongs(this.downloadedFiles, query.name)
                if(query.type == 'local')
                    this.getFolderSongs(this.localMusicList, query.name)
            }
            if(type == 'localAlbum') {
                const index = (this.localMusicClassify.albums || []).findIndex((item) => item.id == id)
                this.currentSelectedInfo = {
                    id: this.localMusicClassify.albums[index].id,
                    name: this.localMusicClassify.albums[index].name
                }
                this.currentSelectedSongs = this.localMusicClassify.albums[index].songs
                if(this.currentSelectedSongs)
                    this.getImgBase64(this.currentSelectedSongs[0].common.fileUrl).then(res => {
                        this.currentSelectedFilePicUrl = res
                    })
            }
            if(type == 'localArtist') {
                const index = (this.localMusicClassify.artists || []).findIndex((item) => item.id == id)
                this.currentSelectedInfo = {
                    id: this.localMusicClassify.artists[index].id,
                    name: this.localMusicClassify.artists[index].name
                }
                this.currentSelectedSongs = this.localMusicClassify.artists[index].songs
                if(this.currentSelectedSongs)
                    this.getImgBase64(this.currentSelectedSongs[0].common.fileUrl).then(res => {
                        this.currentSelectedFilePicUrl = res
                    })
            }
        }
    },
})