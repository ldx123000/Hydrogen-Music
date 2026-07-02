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
  const base = song?.base || {}
  const audioInfo = song?.audio_info || {}
  const rawAlbum = song?.albuminfo || song?.album_info || song?.album || {}
  const albumId = rawAlbum?.id ?? rawAlbum?.albumId ?? rawAlbum?.album_id ?? song?.album_id ?? base?.album_id ?? null
  const albumName = rawAlbum?.name ?? rawAlbum?.album_name ?? song?.album_name ?? song?.albumName ?? base?.album_name ?? ''
  const coverTemplate = song?.cover || song?.sizable_cover || rawAlbum?.sizable_cover || rawAlbum?.picUrl || rawAlbum?.cover || rawAlbum?.coverUrl || song?.album_sizable_cover || song?.trans_param?.union_cover || null
  const coverUrl = typeof coverTemplate == 'string' ? coverTemplate.replace('{size}', '480') : coverTemplate
  const artists = normalizePlaylistArtists(song)
  const primaryId = song?.album_audio_id ?? song?.mixsongid ?? song?.audio_id ?? song?.id ?? song?.songId ?? song?.hash ?? song?.fileid ?? base?.album_audio_id ?? base?.audio_id ?? audioInfo?.hash ?? null
  const normalizedHash = song?.hash || song?.FileHash || song?.file_hash || song?.deprecated?.hash || audioInfo?.hash || audioInfo?.hash_128 || audioInfo?.hash_320 || song?.trans_param?.hash_offset?.offset_hash || ''
  const durationSeconds = Number(song?.time_length ?? song?.timelength_320 ?? song?.timeLength ?? 0)
  const rawDuration = Number(song?.timelen ?? song?.duration ?? song?.dt ?? song?.timelength ?? audioInfo?.duration ?? audioInfo?.duration_128 ?? 0)
  const duration = rawDuration > 1000 ? rawDuration : durationSeconds > 0 ? durationSeconds * 1000 : rawDuration

  return {
    ...song,
    id: primaryId ?? song?.hash ?? null,
    hash: normalizedHash,
    mixsongid: song?.mixsongid ?? song?.mixsong_id ?? song?.album_audio_id ?? '',
    mixsong_id: song?.mixsong_id ?? song?.mixsongid ?? song?.album_audio_id ?? '',
    album_audio_id: song?.album_audio_id ?? song?.mixsongid ?? song?.mixsong_id ?? '',
    name: (song?.name || song?.songName || song?.songname || song?.audio_name || base?.audio_name || song?.filename || song?.FileName || '').replace(/^.*?\s*-\s*/, '').replace(/\.(mp3|flac|ogg|aac|wav|m4a|wma|ape|opus)$/i, ''),
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

export function normalizePlaylistSongs(songs, { filterShield = true } = {}) {
  const sourceSongs = Array.isArray(songs) ? songs : []
  const visibleSongs = filterShield ? sourceSongs.filter(song => song?.shield !== 1) : sourceSongs
  return visibleSongs.map(normalizePlaylistSong)
}

function getWindowApi() {
    return typeof windowApi == 'undefined' ? null : windowApi
}

async function getLocalHashTrackMap() {
    const api = getWindowApi()
    if (!api?.getLocalMusicHashTracks) return {}
    const tracks = await api.getLocalMusicHashTracks().catch(() => ({}))
    return tracks && typeof tracks == 'object' ? tracks : {}
}

function mergeLocalHashTrack(song = {}, localTrack = null) {
    if (!localTrack?.url) return song

    const localName = localTrack?.common?.title || localTrack?.common?.localTitle || localTrack?.name || song?.name
    const localArtists = Array.isArray(localTrack?.common?.artists)
        ? localTrack.common.artists.map(name => ({ id: 'local', name }))
        : song?.ar || []

    return {
        ...song,
        id: song?.id || localTrack.id || song?.hash,
        name: localName,
        ar: localArtists,
        artists: localArtists,
        url: localTrack.url,
        type: 'local',
        source: 'local-playlist',
        playable: true,
        reason: '',
        noCopyrightRcmd: null,
        shield: 0,
        common: localTrack.common || {},
        format: localTrack.format || {},
        localName: localTrack?.common?.localTitle || localTrack?.name || localName,
    }
}

async function applyLocalHashTrackFallback(songs = []) {
    // ponytail: only hashes recorded while adding local tracks are whitelisted; upgrade path is a background local-library hash index.
    const localTrackMap = await getLocalHashTrackMap()
    if (!Object.keys(localTrackMap).length) return songs.filter(song => song?.shield !== 1)

    return songs
        .map(song => {
            const hash = normalizePlaylistTrackHash(song).toUpperCase()
            return hash && localTrackMap[hash] ? mergeLocalHashTrack(song, localTrackMap[hash]) : song
        })
        .filter(song => song?.type === 'local' || song?.shield !== 1)
}

function normalizeRecommendedPlaylist(item = {}) {
  const rawCover = item?.imgurl || item?.flexible_cover || item?.pic || ''
  const coverImgUrl = typeof rawCover === 'string' ? rawCover.replace('{size}', '480') : rawCover
  const creatorName = item?.nickname || item?.list_create_username || item?.username || item?.singername || ''
  const playlistId = item?.global_collection_id || item?.gid || item?.listid || item?.specialid || item?.id || null

  return {
    ...item,
    // 酷狗推荐歌单进入详情页时要使用 global_collection_id，specialid 只适合做展示兜底。
    id: playlistId ? String(playlistId) : null,
    global_collection_id: item?.global_collection_id || item?.gid || null,
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
    const limit = Number(num) || 0
    return request({
        url: '/top/playlist',
        method: 'get',
        params: {
            category_id: 0,
            pagesize: limit || num
        }
    }).then(result => {
        const rawList = result?.data?.special_list || result?.special_list || result?.data?.list || result?.list || []
        const resultList = Array.isArray(rawList) ? rawList.map(item => normalizeRecommendedPlaylist(item)) : []
        return {
            ...result,
            result: limit > 0 ? resultList.slice(0, limit) : resultList,
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
async function fetchPlaylistPageByListId(id, page, pagesize, rest) {
    const result = await request({
        url: '/playlist/track/all/new',
        method: 'get',
        params: { listid: id, page, pagesize, ...rest },
    })
    return applyLocalHashTrackFallback(normalizePlaylistSongs(result?.data?.info || result?.info || [], { filterShield: false }))
}

async function fetchPlaylistPageByCollectionId(id, page, pagesize, rest) {
    const result = await request({
        url: '/playlist/track/all',
        method: 'get',
        params: { id, page, pagesize, ...rest },
    })
    return {
        raw: result,
        songs: await applyLocalHashTrackFallback(normalizePlaylistSongs(result?.songs || result?.data?.songs || result?.data?.info || result?.info || [], { filterShield: false })),
        privileges: Array.isArray(result?.privileges) ? result.privileges : [],
    }
}

export async function getPlaylistAll(params) {
    const { id, gid, limit, offset, ...rest } = params || {}
    const pagesize = 300
    const startPage = offset != null && limit ? Math.floor(offset / limit) + 1 : 1
    const normalizedId = String(id || '')
    // 酷狗公开/推荐歌单统一走 collection 接口，只有用户自建/收藏歌单才走新版 listid 接口。
    const collectionId = gid || rest?.global_collection_id || (/^collection_\d+_\d+_\d+_\d+$/.test(normalizedId) ? normalizedId : '')

    if (collectionId) {
        const allSongs = []
        let page = startPage
        let rawResult = null
        let privileges = []
        while (true) {
            const pageResult = await fetchPlaylistPageByCollectionId(collectionId, page, pagesize, rest)
            rawResult = pageResult?.raw || rawResult
            privileges = Array.isArray(pageResult?.privileges) ? pageResult.privileges : privileges
            const songs = pageResult?.songs || []
            allSongs.push(...songs)
            if (songs.length < pagesize) break
            page++
        }
        return {
            ...(rawResult || {}),
            songs: allSongs,
            privileges,
        }
    }

    try {
        const allSongs = []
        let page = startPage
        while (true) {
            const songs = await fetchPlaylistPageByListId(id, page, pagesize, rest)
            allSongs.push(...songs)
            if (songs.length < pagesize) break
            page++
        }
        return { songs: allSongs.reverse(), privileges: [] }
    } catch {
        if (!id) {
            return { songs: [], privileges: [] }
        }
        const fallback = await fetchPlaylistPageByCollectionId(id, startPage, pagesize, rest)
        return {
            ...(fallback?.raw || {}),
            songs: fallback?.songs || [],
            privileges: fallback?.privileges || [],
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
 * 调用此接口可新建歌单，也可在 type=1 时收藏已有歌单。
 * 收藏场景需要补齐原歌单的 creator / listid / gid 信息。
 * @param {*} params
 * @returns
 */
export function createPlaylist(params) {
  const playlistName = String(params?.name || '').trim()
  const playlistType = Number(params?.type ?? 0)
  const requestParams = {
    name: playlistName,
    type: playlistType,
    source: params?.source ?? (playlistType === 1 ? 1 : 0),
    is_pri: params?.is_pri ?? params?.privacy ?? 0,
  }

  if (params?.list_create_userid != null) requestParams.list_create_userid = params.list_create_userid
  if (params?.list_create_listid != null) requestParams.list_create_listid = params.list_create_listid
  if (params?.list_create_gid != null && params.list_create_gid !== '') requestParams.list_create_gid = params.list_create_gid

  return request({
    url: '/playlist/add',
    method: 'post',
    params: requestParams,
  });
}

/**
 * 收藏歌单是 `/playlist/add` 的一个特例，单独包一层方便调用处表达意图。
 * @param {*} params
 * @returns
 */
export function collectPlaylist(params) {
  return createPlaylist({
    ...params,
    type: 1,
    source: params?.source ?? 1,
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
    const filePath = getLocalTrackFilePath(track)
    const fallbackLocalName = filePath ? filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') : ''
    return String(track?.name || track?.songname || track?.filename || track?.common?.title || track?.common?.localTitle || track?.localName || fallbackLocalName || '').replace(/[|,]/g, ' ').trim()
}

function normalizePlaylistTrackHash(track = {}) {
    return String(track?.hash || track?.FileHash || track?.file_hash || track?.deprecated?.hash || track?.audio_info?.hash_128 || track?.audio_info?.hash_320 || '').trim()
}

function getLocalTrackFilePath(track = {}) {
    return track?.common?.fileUrl || track?.url || track?.dirPath || ''
}

function isLocalTrack(track = {}) {
    return track?.type == 'local' || !!track?.common?.fileUrl
}

function toRememberedLocalTrack(track = {}) {
    const fileUrl = getLocalTrackFilePath(track)
    return {
        id: track?.id || track?.hash || fileUrl,
        name: normalizePlaylistTrackName(track),
        url: fileUrl,
        dirPath: fileUrl,
        common: {
            title: track?.common?.title || track?.name || '',
            localTitle: track?.common?.localTitle || track?.localName || track?.name || '',
            artists: Array.isArray(track?.common?.artists) ? [...track.common.artists] : [],
            album: track?.common?.album || '',
            fileUrl,
        },
        format: {
            duration: track?.format?.duration || track?.dt || track?.duration || 0,
        },
    }
}

async function resolvePlaylistTrackHash(track = {}) {
    const hash = normalizePlaylistTrackHash(track)
    if (hash) return hash

    const filePath = getLocalTrackFilePath(track)
    const api = getWindowApi()
    if (!filePath || !api?.getLocalMusicFileHash) return ''

    const generatedHash = await api.getLocalMusicFileHash(filePath).catch(() => '')
    if (generatedHash && api?.rememberLocalMusicHashTrack) {
        await api.rememberLocalMusicHashTrack(generatedHash, toRememberedLocalTrack(track)).catch(() => false)
    }
    return generatedHash
}

function unwrapPlaylistTrack(track) {
    if (track && typeof track == 'object' && track.value && typeof track.value == 'object') return track.value
    return track
}

function normalizePlaylistTrackAlbumId(track = {}) {
    if (isLocalTrack(track)) return 0
    return track?.al?.id || track?.album_id || track?.albumid || track?.albumId || track?.album?.id || 0
}

function normalizePlaylistTrackMixsongId(track = {}) {
    if (isLocalTrack(track)) return 0
    return track?.album_audio_id || track?.mixsongid || track?.mixsong_id || track?.id || 0
}

async function buildPlaylistTrackAddEntry(track = {}) {
    track = unwrapPlaylistTrack(track) || {}
    const name = normalizePlaylistTrackName(track)
    const hash = await resolvePlaylistTrackHash(track)
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
        return Promise.all(tracks.map(track => {
            const normalizedTrack = unwrapPlaylistTrack(track)
            if (normalizedTrack && typeof normalizedTrack == 'object') return buildPlaylistTrackAddEntry(normalizedTrack)
            return ''
          })).then(entries => {
            const data = entries.filter(Boolean).join(',')

            if (!data) {
                return { status: 0, error: 'missing playlist track payload' }
            }

            return request({
              url: '/playlist/tracks/add',
              method: 'post',
              params: {
                listid,
                data,
              },
            });
        })
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
