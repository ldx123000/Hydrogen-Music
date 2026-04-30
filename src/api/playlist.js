import request from "../utils/request";

function normalizePlaylistArtists(song) {
  const sourceArtists = Array.isArray(song?.singerinfo)
    ? song.singerinfo
    : Array.isArray(song?.ar)
      ? song.ar
      : Array.isArray(song?.artists)
        ? song.artists
        : Array.isArray(song?.authors)
          ? song.authors
        : []

  return sourceArtists
    .map(artist => {
      if (!artist) return null
      const name = artist?.name ?? artist?.singername ?? artist?.artistName ?? artist?.author_name ?? ''
      if (!name) return null
      return {
        id: artist?.id ?? artist?.singerid ?? artist?.artistId ?? artist?.author_id ?? null,
        name,
        publish: artist?.publish,
        type: artist?.type,
      }
    })
    .filter(Boolean)
}

export function normalizePlaylistSong(song = {}) {
  const rawAlbum = song?.albuminfo || song?.album_info || song?.album || {}
  const albumId = rawAlbum?.id ?? rawAlbum?.albumId ?? song?.album_id ?? null
  const albumName = rawAlbum?.name ?? rawAlbum?.album_name ?? song?.album_name ?? song?.albumName ?? ''
  const coverTemplate = song?.cover || song?.sizable_cover || rawAlbum?.sizable_cover || rawAlbum?.picUrl || rawAlbum?.coverUrl || song?.album_sizable_cover || song?.trans_param?.union_cover || null
  const coverUrl = typeof coverTemplate == 'string' ? coverTemplate.replace('{size}', '480') : coverTemplate
  const artists = normalizePlaylistArtists(song)
  const primaryId = song?.album_audio_id ?? song?.mixsongid ?? song?.audio_id ?? song?.id ?? song?.songId ?? song?.hash ?? song?.fileid ?? null
  const normalizedHash = song?.hash || song?.FileHash || song?.file_hash || song?.deprecated?.hash || song?.audio_info?.hash_128 || song?.audio_info?.hash_320 || song?.trans_param?.hash_offset?.offset_hash || ''
  const durationSeconds = Number(song?.time_length ?? song?.timelength_320 ?? song?.timeLength ?? 0)
  const rawDuration = Number(song?.timelen ?? song?.duration ?? song?.dt ?? song?.timelength ?? song?.audio_info?.duration_128 ?? 0)
  const duration = rawDuration > 1000 ? rawDuration : durationSeconds > 0 ? durationSeconds * 1000 : rawDuration

  return {
    ...song,
    id: primaryId ?? song?.hash ?? null,
    hash: normalizedHash,
    mixsongid: song?.mixsongid ?? song?.mixsong_id ?? song?.album_audio_id ?? '',
    mixsong_id: song?.mixsong_id ?? song?.mixsongid ?? song?.album_audio_id ?? '',
    album_audio_id: song?.album_audio_id ?? song?.mixsongid ?? song?.mixsong_id ?? '',
    name: (song?.name || song?.songName || song?.songname || song?.filename || '').replace(/^.*?\s*-\s*/, '').replace(/\.(mp3|flac|ogg|aac|wav|m4a|wma|ape|opus)$/i, ''),
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

function normalizeRecommendedPlaylist(item = {}) {
  const rawCover = item?.imgurl || item?.flexible_cover || item?.pic || ''
  const coverImgUrl = typeof rawCover === 'string' ? rawCover.replace('{size}', '480') : rawCover
  const creatorName = item?.nickname || item?.list_create_username || item?.username || item?.singername || ''

  return {
    ...item,
    id: item?.specialid ?? item?.listid ?? item?.id ?? item?.global_collection_id ?? null,
    global_collection_id: item?.global_collection_id || null,
    name: item?.specialname || item?.name || item?.listname || '歌单',
    coverImgUrl,
    picUrl: coverImgUrl,
    trackCount: Number(item?.songcount ?? item?.list_count ?? item?.count ?? 0) || 0,
    playCount: Number(item?.play_count ?? item?.playcount ?? 0) || 0,
    description: item?.intro || item?.description || '',
    updateFrequency: item?.show || '',
    creator: {
      userId: item?.suid ?? item?.userid ?? null,
      nickname: creatorName,
    },
  }
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
    }).then(result => {
        const rawList = result?.data?.special_list || result?.special_list || result?.data?.list || result?.list || []
        return {
            ...result,
            result: Array.isArray(rawList) ? rawList.map(item => normalizeRecommendedPlaylist(item)) : [],
        }
    })
}

export function getTopList() {
    const normalizeRankItem = (item = {}) => {
      const rawCover = item?.imgurl || item?.img_9 || item?.banner_9 || item?.album_img_9 || ''
      const coverImgUrl = typeof rawCover === 'string' ? rawCover.replace('{size}', '480') : rawCover
      return {
        ...item,
        id: item?.rankid ?? item?.id ?? null,
        name: item?.rankname || item?.name || '排行榜',
        coverImgUrl,
        picUrl: coverImgUrl,
        updateFrequency: item?.update_frequency || '',
        description: item?.intro || '',
      }
    }

    return request({
      url: '/rank/top',
      method: 'get',
    })
      .then(result => {
        const rawList = result?.data?.list || result?.list || []
        return {
          ...result,
          list: Array.isArray(rawList) ? rawList.map(item => normalizeRankItem(item)) : [],
        }
      })
      .catch(() =>
        request({
          url: '/rank/list',
          method: 'get',
          params: { withsong: 0 },
        }).then(result => {
          const rawList = result?.data?.info || result?.info || []
          return {
            ...result,
            list: Array.isArray(rawList) ? rawList.map(item => normalizeRankItem(item)) : [],
          }
        })
      )
}

export function getRankInfo(rankid, extraParams = {}) {
    return request({
      url: '/rank/info',
      method: 'get',
      params: { rankid, ...extraParams },
    })
}

export function getRankSongs({ rankid, rank_cid, page = 1, pagesize = 500 } = {}) {
    return request({
      url: '/rank/audio',
      method: 'get',
      params: {
        rankid,
        ...(rank_cid ? { rank_cid } : {}),
        page,
        pagesize,
      },
    }).then(result => {
      const rawSongs = result?.data?.songlist || result?.songlist || []
      return {
        ...result,
        songs: normalizePlaylistSongs(rawSongs),
        privileges: [],
      }
    })
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
    const pagesize = 300
    const startPage = offset != null && limit ? Math.floor(offset / limit) + 1 : 1
    try {
        const allSongs = []
        let page = startPage
        while (true) {
            const songs = await fetchPlaylistPage(id, page, pagesize, rest)
            allSongs.push(...songs)
            if (songs.length < pagesize) break
            page++
        }
        return { songs: allSongs.reverse(), privileges: [] }
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
      url: '/everyday/recommend',
      method: 'get',
      params,
    });
}

/**
 * 获取历史日推可用日期列表
 * @returns
 */
export function getHistoryRecommendSongDates() {
    return request({
      url: '/everyday/history',
      method: 'get',
      params: { mode: 'list' },
    });
}

/**
 * 获取指定日期的历史日推详情
 * @param {*} params - { history_name, date }
 * @returns
 */
export function getHistoryRecommendSongsDetail(params) {
    return request({
      url: '/everyday/history',
      method: 'get',
      params: { mode: 'song', ...params },
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
  const playlistName = String(params?.name || '').trim()
  return request({
    url: '/playlist/add',
    method: 'post',
    params: {
      name: playlistName,
      type: 0,
      source: 0,
      is_pri: params?.is_pri ?? params?.privacy ?? 0,
    },
  });
}

/**
 * 必选参数 :
 * op: 从歌单增加单曲为 add, 删除为 del
 * pid: 歌单 id tracks: 歌曲 id,可多个,用逗号隔开
 * @param {*} params 
 * @returns 
 */
function normalizePlaylistTrackName(track = {}) {
    return String(track?.name || track?.songname || track?.filename || '').replace(/[|,]/g, ' ').trim()
}

function normalizePlaylistTrackHash(track = {}) {
    return String(track?.hash || track?.FileHash || track?.file_hash || track?.deprecated?.hash || track?.audio_info?.hash_128 || track?.audio_info?.hash_320 || '').trim()
}

function unwrapPlaylistTrack(track) {
    if (track && typeof track == 'object' && track.value && typeof track.value == 'object') return track.value
    return track
}

function normalizePlaylistTrackAlbumId(track = {}) {
    return track?.al?.id || track?.album_id || track?.albumid || track?.albumId || track?.album?.id || 0
}

function normalizePlaylistTrackMixsongId(track = {}) {
    return track?.album_audio_id || track?.mixsongid || track?.mixsong_id || track?.id || 0
}

function buildPlaylistTrackAddEntry(track = {}) {
    track = unwrapPlaylistTrack(track) || {}
    const name = normalizePlaylistTrackName(track)
    const hash = normalizePlaylistTrackHash(track)
    const albumId = normalizePlaylistTrackAlbumId(track)
    const mixsongId = normalizePlaylistTrackMixsongId(track)
    if (!name || !hash) return ''

    if (albumId || mixsongId) {
        return `${name}|${hash}|${albumId || 0}|${mixsongId || 0}`
    }
    return `${name}|${hash}`
}

export function updatePlaylist(params) {
    const operation = String(params?.op || '').toLowerCase()
    const listid = params?.listid || params?.pid || ''

    if (operation == 'add') {
        const tracks = Array.isArray(params?.tracks) ? params.tracks : [params?.trackDetail || params?.selectedItem || params?.tracks]
        const data = tracks
          .map(track => {
            const normalizedTrack = unwrapPlaylistTrack(track)
            if (normalizedTrack && typeof normalizedTrack == 'object') return buildPlaylistTrackAddEntry(normalizedTrack)
            return ''
          })
          .filter(Boolean)
          .join(',')

        if (!data) {
            return Promise.resolve({ status: 0, error: 'missing playlist track payload' })
        }

        return request({
          url: '/playlist/tracks/add',
          method: 'post',
          params: {
            listid,
            data,
          },
        });
    }

    if (operation == 'del') {
        const trackList = Array.isArray(params?.tracks) ? params.tracks : [params?.tracks]
        const fileids = (params?.fileids || trackList.map(track => {
          if (track && typeof track == 'object') return track.fileid || track.file_id || track.id || ''
          return track || ''
        }).filter(Boolean).join(','))

        return request({
          url: '/playlist/tracks/del',
          method: 'post',
          params: {
            listid,
            fileids,
          },
        });
    }

    return Promise.resolve({ status: 0, error: 'unsupported playlist operation' })
}

/**
 * 说明 : 调用此接口 , 传入歌单 id 可删除歌单
 * 必选参数 : id : 歌单 id,可多个,用逗号隔开
 * @param {*} params 
 * @returns 
 */
export function deletePlaylist(params) {
    return request({
      url: '/playlist/del',
      method: 'post',
      params: {
        listid: params?.id || params?.listid,
      },
    });
}
