import { get } from './base'
import request from '../utils/request'
import { normalizePlaylistSong } from './playlist'

function toArray(value) {
  return Array.isArray(value) ? value : value ? [value] : []
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function resolveCover(url) {
  if (typeof url != 'string' || url === '') return ''
  return url.includes('{size}') ? url.replace('{size}', '480') : url
}

function normalizeDjOwner(raw = {}) {
  const nickname =
    raw?.dj?.nickname ||
    raw?.author_name ||
    raw?.nickname ||
    raw?.username ||
    raw?.user_name ||
    raw?.creator?.nickname ||
    ''

  return nickname ? { nickname } : null
}

function normalizeDjRadio(raw = {}, extra = {}) {
  const radioId = raw?.global_collection_id || raw?.channel_id || raw?.id || raw?.rid || raw?.radio_id || raw?.fmid || ''
  const cover = resolveCover(raw?.pic || raw?.imgurl || raw?.cover || raw?.sizable_cover || raw?.image || raw?.img || raw?.img_url || '')
  const description = raw?.description || raw?.desc || raw?.intro || raw?.summary || raw?.subtitle || raw?.rcmdtext || ''

  return {
    ...raw,
    id: String(radioId || ''),
    rid: String(radioId || ''),
    global_collection_id: String(radioId || ''),
    name: raw?.name || raw?.channel_name || raw?.title || raw?.specialname || raw?.fmname || '电台',
    picUrl: cover,
    intervenePicUrl: cover,
    desc: description,
    rcmdtext: description,
    programCount: toNumber(raw?.songcount ?? raw?.song_count ?? raw?.programCount ?? raw?.program_count ?? raw?.trackCount ?? raw?.total ?? raw?.count, 0),
    subCount: toNumber(raw?.subscribe_count ?? raw?.sub_count ?? raw?.subCount ?? raw?.follow_count ?? raw?.collect_count, 0),
    dj: normalizeDjOwner(raw),
    source: 'kugou-channel',
    ...extra,
  }
}

function extractDjRadioList(result = {}) {
  return toArray(
    result?.data?.list ||
    result?.data?.channel_list ||
    result?.data?.data?.list ||
    result?.data?.data ||
    result?.data ||
    result?.list
  )
}

function extractDjRadioDetail(result = {}) {
  return toArray(result?.data?.list || result?.data?.data || result?.data || result)[0] || {}
}

function extractChannelSongList(result = {}) {
  return toArray(
    result?.data?.list ||
    result?.data?.song_list ||
    result?.data?.data?.list ||
    result?.data?.data ||
    result?.list ||
    result?.data
  )
}

function normalizeChannelProgram(raw = {}, radioInfo = null) {
  const cover = resolveCover(
    raw?.cover ||
    raw?.imgurl ||
    raw?.sizable_cover ||
    raw?.pic ||
    raw?.album_img ||
    radioInfo?.picUrl ||
    ''
  )

  // 频道歌曲结构和普通歌曲很接近，先转成通用歌曲，再包一层节目外壳兼容旧页面。
  const mainSong = normalizePlaylistSong({
    ...raw,
    name: raw?.song_name || raw?.audio_name || raw?.name || raw?.filename || '',
    cover,
    sizable_cover: cover,
    album_sizable_cover: cover,
    albuminfo: raw?.albuminfo || raw?.album_info || {
      id: raw?.album_id || raw?.albumid || '',
      name: raw?.album_name || raw?.album || '',
      picUrl: cover,
      sizable_cover: cover,
      cover,
    },
  })

  return {
    ...raw,
    id: String(raw?.fileid || raw?.song_id || raw?.album_audio_id || mainSong?.id || ''),
    name: raw?.story_title || raw?.title || mainSong?.name || '电台节目',
    description: raw?.description || raw?.desc || raw?.intro || '',
    coverUrl: cover,
    blurCoverUrl: cover,
    mainSong,
  }
}

// 获取我订阅的电台列表。酷狗收藏电台对应“频道”能力，因此这里改走 youth/channel/all。
export function getDjSubList({ limit = 30, offset = 0 } = {}) {
  const page = Math.floor(offset / limit) + 1
  return get('/youth/channel/all', { page, pagesize: limit }).then(result => {
    const djRadios = extractDjRadioList(result).map(item => normalizeDjRadio(item))
    return {
      ...result,
      djRadios,
      radios: djRadios,
      data: djRadios,
    }
  })
}

// 订阅/取消订阅电台。
export function subDj(rid, isSubscribe = true) {
  return request({
    url: '/youth/channel/sub',
    method: isSubscribe ? 'post' : 'delete',
    params: {
      global_collection_id: rid,
      t: isSubscribe ? 1 : 0,
    },
  })
}

// 电台详情。先拿频道详情，再尝试用安利接口补一点简介文案。
export async function getDjDetail(rid) {
  const [detailResult, amwayResult] = await Promise.allSettled([
    get('/youth/channel/detail', { global_collection_id: rid }),
    get('/youth/channel/amway', { global_collection_id: rid }),
  ])

  const detailData = detailResult.status === 'fulfilled' ? detailResult.value : {}
  const amwayData = amwayResult.status === 'fulfilled' ? amwayResult.value : {}
  const detail = extractDjRadioDetail(detailData)
  const amway = toArray(amwayData?.data?.list || amwayData?.data || amwayData)[0] || {}

  const merged = normalizeDjRadio({
    ...detail,
    ...amway,
    global_collection_id: detail?.global_collection_id || detail?.channel_id || rid,
  })

  return {
    ...(detailResult.status === 'fulfilled' ? detailResult.value : {}),
    djRadio: merged,
    data: merged,
  }
}

// 电台节目列表。酷狗频道接口直接返回歌曲，这里包成旧页面能识别的“节目”结构。
export async function getDjPrograms(rid, { limit = 30, offset = 0 } = {}) {
  const page = Math.floor(offset / limit) + 1
  const [detailResult, songResult] = await Promise.all([
    getDjDetail(rid),
    get('/youth/channel/song', {
      global_collection_id: rid,
      page,
      pagesize: limit,
    }),
  ])

  const radioInfo = detailResult?.data || detailResult?.djRadio || null
  const programs = extractChannelSongList(songResult).map(item => normalizeChannelProgram(item, radioInfo))

  return {
    ...songResult,
    programs,
    data: programs,
    radio: radioInfo,
  }
}

// 节目评论（电台节目）
export function getDjProgramComments(id, { limit = 20, offset = 0, before } = {}) {
  const params = { id, limit, offset }
  if (before) params.before = before
  params.timestamp = new Date().getTime()
  return get('/comment/dj', params)
}

function normalizeCommentNewResponse(response) {
  const data = response && typeof response === 'object' ? response.data || {} : {}
  return {
    ...(response || {}),
    comments: Array.isArray(data.comments) ? data.comments : [],
    total: Number.isFinite(Number(data.totalCount)) ? Number(data.totalCount) : 0,
    hasMore: !!data.hasMore,
    cursor: data.cursor ?? ''
  }
}

// 节目评论（新版，comment/new）
export async function getDjProgramCommentsNew({ id, sortType = 3, pageSize = 20, pageNo = 1, cursor } = {}) {
  const response = await get('/comment/new', {
    id,
    type: 4,
    sortType,
    pageSize,
    pageNo,
    ...(cursor !== undefined && cursor !== null && cursor !== '' ? { cursor } : {}),
    timestamp: new Date().getTime()
  })
  return normalizeCommentNewResponse(response)
}

// 节目评论楼层回复
export function getDjProgramCommentFloor({ id, parentCommentId, limit = 20, time = -1 } = {}) {
  return get('/comment/floor', {
    id,
    type: 4,
    parentCommentId,
    limit,
    time,
    timestamp: new Date().getTime()
  })
}

export function postDjProgramComment(id, content, commentId = null) {
  const params = {
    id,
    t: 1,
    type: 4,
    content,
    timestamp: new Date().getTime()
  }
  if (commentId) params.commentId = commentId
  return get('/comment', params)
}

export function likeDjProgramComment(id, cid, isLike = true) {
  const params = {
    id,
    cid,
    t: isLike ? 1 : 0,
    type: 4,
    timestamp: new Date().getTime()
  }
  return get('/comment/like', params)
}
