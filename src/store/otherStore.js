import { defineStore } from 'pinia'
import { getMVDetail, getMVUrl } from '../api/mv'
import { search } from '../api/other';
import { mapSongsPlayableStatus } from '../utils/songStatus';
import { noticeOpen } from '../utils/dialog';

export const useOtherStore = defineStore('otherStore', {
    state: () => {
        return {
          screenWidth: 1056,
          contextMenuShow: false,
          menuTree: null,
          tree1: [
            {
                id: 1,
                name: '播放'
            },
            {
                id: 2,
                name: '下一首播放'
            },
            {
                id: 3,
                name: '下载'
            },
            {
                id: 11,
                name: '显示专辑'
            },
            {
                id: 4,
                name: '添加到歌单'
            },
            {
                id: 5,
                name: '从歌单中删除'
            }
          ],
          tree2: [
            {
                id: 1,
                name: '播放'
            },
            {
                id: 2,
                name: '下一首播放'
            },
            {
                id: 3,
                name: '下载'
            },
            {
                id: 11,
                name: '显示专辑'
            },
            {
                id: 4,
                name: '添加到歌单'
            }
          ],
          tree3: [
            {
                id: 6,
                name: '新建歌单'
            },
            {
                id: 7,
                name: '删除此歌单'
            }
          ],
          tree4: [
            {
                id: 8,
                name: '播放'
            },
            {
                id: 9,
                name: '下一首播放'
            },
            {
                id: 10,
                name: '打开本地文件夹'
            }
          ],
          selectedPlaylist: null,
          selectedItem: null,
          addPlaylistShow: false,
          dialogShow: false,
          dialogHeader: null,
          dialogText: null,
          noticeShow: false,
          noticeText: null,
          niticeOutAnimation: false,
          videoPlayerShow: false,
          player: null,
          videoIsBlur: false,
          currentVideoId: null,
          videoIsFull: false,
          searchResult: {},
          toUpdate: false,
          newVersion: null,
        }
    },
    actions: {
        // setRem() {
        //     const scale = this.screenWidth / 16
        //     const htmlWidth = document.documentElement.clientWidth || document.body.clientWidth
        //     const htmlDom = document.getElementsByTagName('html')[0]
        //     htmlDom.style.fontSize = htmlWidth / scale + 'px'
        // },
        async waitForPlayerReady(timeoutMs = 3000, intervalMs = 80) {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                if (this.player) return this.player;
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
            return null;
        },
        async getMvData(id) {
            const mvId = Number(id);
            if (!Number.isFinite(mvId) || mvId <= 0) {
                noticeOpen('MV 加载失败，请稍后重试', 2);
                return false;
            }

            this.videoPlayerShow = true;
            this.currentVideoId = mvId;

            try {
                const detail = await getMVDetail(mvId);
                const mv = detail?.data || null;
                const brs = Array.isArray(mv?.brs) ? mv.brs : [];

                if (!mv || brs.length === 0) {
                    noticeOpen('MV 资源不可用', 2);
                    return false;
                }

                const sortedBrs = brs
                    .map(item => Number(item?.br))
                    .filter(br => Number.isFinite(br) && br > 0)
                    .sort((a, b) => b - a);

                if (sortedBrs.length === 0) {
                    noticeOpen('MV 资源不可用', 2);
                    return false;
                }

                const urlResults = await Promise.all(
                    sortedBrs.map(br => getMVUrl(mvId, br).catch(() => null))
                );

                const sourceMap = new Map();
                for (const res of urlResults) {
                    const src = res?.data?.url || '';
                    const size = Number(res?.data?.r);
                    if (!src || !Number.isFinite(size) || size <= 0) continue;
                    if (!sourceMap.has(size)) {
                        sourceMap.set(size, {
                            src,
                            type: 'video/mp4',
                            size,
                        });
                    }
                }

                const sources = Array.from(sourceMap.values()).sort((a, b) => b.size - a.size);
                if (sources.length === 0) {
                    noticeOpen('MV 资源不可用', 2);
                    return false;
                }

                const player = await this.waitForPlayerReady();
                if (!player) {
                    noticeOpen('MV 加载失败，请稍后重试', 2);
                    return false;
                }

                player.source = {
                    type: 'video',
                    title: mv?.name || `MV ${mvId}`,
                    sources,
                    poster: mv?.cover || '',
                };

                return true;
            } catch (_) {
                noticeOpen('MV 加载失败，请稍后重试', 2);
                return false;
            }
        },
        getSearchInfo(keywords) {
            let types = [1, 10, 100, 1000, 1004]
            types.forEach(type => {
                let params = {
                    keywords: keywords,
                    type: type,
                }
                if(type == 100) params.limit = 10
                if(type == 1000) params.limit = 10
                if(type == 1004) params.limit = 10
                search(params).then(data => {
                    if(type == 1) {
                        this.searchResult.searchSongs = mapSongsPlayableStatus(data.result.songs)
                    }
                    if(type == 10) this.searchResult.searchAlbums = data.result.albums
                    if(type == 100) this.searchResult.searchArtists = data.result.artists
                    if(type == 1000) this.searchResult.searchPlaylists = data.result.playlists
                    if(type == 1004) this.searchResult.searchMvs = data.result.mvs
                })
            });
        }
    },
})
