import request from "../utils/request";

function normalizePlaylistArtists(song) {
  const sourceArtists = Array.isArray(song?.singerinfo)
    ? song.singerinfo
    : Array.isArray(song?.ar)
      ? song.ar
      : Array.isArray(song?.artists)
        ? song.artists
        : []

  return sourceArtists
    .map(artist => {
      if (!artist) return null
      const name = artist?.name ?? artist?.singername ?? artist?.artistName ?? ''
      if (!name) return null
      return {
        id: artist?.id ?? artist?.singerid ?? artist?.artistId ?? null,
        name,
        publish: artist?.publish,
        type: artist?.type,
      }
    })
    .filter(Boolean)
}

export function normalizePlaylistSong(song = {}) {
  const rawAlbum = song?.albuminfo || song?.album || {}
  const albumId = rawAlbum?.id ?? rawAlbum?.albumId ?? song?.album_id ?? null
  const albumName = rawAlbum?.name ?? song?.album_name ?? ''
  const coverUrl = song?.cover || rawAlbum?.picUrl || rawAlbum?.coverUrl || song?.trans_param?.union_cover || null
  const artists = normalizePlaylistArtists(song)
  const primaryId = song?.mixsongid ?? song?.audio_id ?? song?.id ?? song?.songId ?? song?.hash ?? song?.fileid ?? null
  const duration = Number(song?.timelen ?? song?.duration ?? song?.dt ?? 0)

  return {
    ...song,
    id: primaryId,
    name: (song?.name || song?.songName || '').replace(/^.*?\s*-\s*/, '').replace(/\.(mp3|flac|ogg|aac|wav|m4a|wma|ape|opus)$/i, ''),
    ar: artists,
    artists,
    al: {
      id: albumId,
      name: albumName,
      picUrl: coverUrl,
    },
    album: {
      id: albumId,
      name: albumName,
      picUrl: coverUrl,
    },
    dt: Number.isFinite(duration) && duration > 0 ? duration : 0,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    coverUrl,
    source: song?.source || 'playlist',
    type: song?.type || 'playlist',
  }
}

export function normalizePlaylistSongs(songs) {
  return Array.isArray(songs) ? songs.map(normalizePlaylistSong) : []
}

/**
 * 获取推荐歌单
 * @param {number} num 
 */
export function getRecommendedSongList(num) {
    return request({
        url: '/top/playlist',
        method: 'get',
        params: {
            category_id: 0,
            pagesize: num
        }
    })
}

export function getTopList() {
    return request({
      url: '/toplist',
      method: 'get',
      params: {

      }
    });
}

/**
 * 获取歌单详情
 * 说明 : 歌单能看到歌单名字, 但看不到具体歌单内容 , 调用此接口 , 传入歌单 id, 
 * 可以获取对应歌单内的所有的音乐(未登录状态只能获取不完整的歌单,登录后是完整的)，
 * 但是返回的 trackIds 是完整的，tracks 则是不完整的，可拿全部 trackIds 请求一次 song/detail 
 * 接口获取所有歌曲的详情 (https://github.com/Binaryify/NeteaseCloudMusicApi/issues/452)
 * @returns 
 */
export function getPlaylistDetail(params) {
    return request({
      url: '/playlist/detail',
      method: 'get',
      params: { ids: params.id || params.ids, ...params },
    });
}

/**
 * 说明 : 由于网易云接口限制，歌单详情只会提供 10 首歌，通过调用此接口，传入对应的歌单id，即可获得对应的所有歌曲
 * 必选参数 : id : 歌单 id
 * 可选参数 : limit : 限制获取歌曲的数量，默认值为当前歌单的歌曲数量
 * 可选参数 : offset : 默认值为0
 * @param {*} params 
 * @returns 
 */
async function fetchPlaylistPage(id, page, pagesize, rest) {
    const result = await request({
        url: '/playlist/track/all/new',
        method: 'get',
        params: { listid: id, page, pagesize, ...rest },
    })
    return normalizePlaylistSongs(result?.data?.info || result?.info || [])
}

export async function getPlaylistAll(params) {
    const { id, gid, limit, offset, ...rest } = params || {}
    const pagesize = Math.min(limit || 300, 300)
    const page = offset != null && limit ? Math.floor(offset / limit) + 1 : 1
    try {
        const songs = await fetchPlaylistPage(id, page, pagesize, rest)
        if (songs.length >= 300) {
            const songs2 = await fetchPlaylistPage(id, page + 1, pagesize, rest)
            return { songs: [...songs, ...songs2], privileges: [] }
        }
        return { songs, privileges: [] }
    } catch {
        const fallbackId = gid || id
        const fallback = await request({
            url: '/playlist/track/all',
            method: 'get',
            params: { id: fallbackId, page, pagesize, ...rest },
        })
        return {
            ...fallback,
            songs: normalizePlaylistSongs(fallback?.songs || fallback?.data?.songs || fallback?.data?.info || fallback?.info || []),
            privileges: Array.isArray(fallback?.privileges) ? fallback.privileges : [],
        }
    }
}

/**
 * 调用此接口 , 可获得每日推荐歌曲 ( 需要登录 )
 * @returns 
 */
export function getRecommendSongs(params) {
    return request({
      url: '/recommend/songs',
      method: 'get',
      params: {
        
      },
    });
}

/**
 * 获取历史日推可用日期列表
 * @returns
 */
export function getHistoryRecommendSongDates() {
    return request({
      url: '/history/recommend/songs',
      method: 'get',
      params: {

      },
    });
}

/**
 * 获取指定日期的历史日推详情
 * @param {*} params
 * @returns
 */
export function getHistoryRecommendSongsDetail(params) {
    return request({
      url: '/history/recommend/songs/detail',
      method: 'get',
      params,
    });
}

/**
 * 说明 : 调用此接口 , 传入类型和歌单 id 可收藏歌单或者取消收藏歌单
 * 必选参数 :
 * t : 类型,1:收藏,2:取消收藏 id : 歌单 id
 * @param {*} params 
 * @returns 
 */
export function subPlaylist(params) {
    return request({
      url: '/playlist/subscribe',
      method: 'get',
      params,
    });
}

/**
 * 说明 : 调用后可获取歌单详情动态部分,如评论数,是否收藏,播放数
 * 必选参数 : id : 歌单 id
 * @param {*} params 
 * @returns 
 */
export function playlistDynamic(id) {
    return request({
      url: '/playlist/detail/dynamic',
      method: 'get',
      params: {
        id: id,
        timestamp: new Date().getTime(),
      }
    });
}

/**
 * 说明 : 调用此接口 , 传入歌单名字可新建歌单
 * 必选参数 : name : 歌单名
 * 可选参数 :
 * privacy : 是否设置为隐私歌单，默认否，传'10'则设置成隐私歌单
 * type : 歌单类型,默认'NORMAL',传 'VIDEO'则为视频歌单,传 'SHARED'则为共享歌单
 * @param {*} params 
 * @returns 
 */
export function createPlaylist(params) {
  return request({
    url: '/playlist/create',
    method: 'post',
    params,
  });
}

/**
 * 必选参数 :
 * op: 从歌单增加单曲为 add, 删除为 del
 * pid: 歌单 id tracks: 歌曲 id,可多个,用逗号隔开
 * @param {*} params 
 * @returns 
 */
export function updatePlaylist(params) {
    return request({
      url: '/playlist/tracks',
      method: 'post',
      params,
    });
}

/**
 * 说明 : 调用此接口 , 传入歌单 id 可删除歌单
 * 必选参数 : id : 歌单 id,可多个,用逗号隔开
 * @param {*} params 
 * @returns 
 */
export function deletePlaylist(params) {
    return request({
      url: '/playlist/delete',
      method: 'post',
      params,
    });
}
