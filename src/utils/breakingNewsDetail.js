import { getSongDetail } from '../api/song'
import { getAlbumDetail } from '../api/album'
import { getPlaylistDetail } from '../api/playlist'
import { getMVDetail } from '../api/mv'
import { mapSongsPlayableStatus } from './songStatus'

const RESOLVABLE_TARGET_TYPES = new Set([1, 10, 1000, 1004])
const detailCache = new Map()
const pendingDetailRequests = new Map()
const queuedPrefetchKeys = new Set()
const prefetchQueue = []
let prefetchScheduled = false

const toValidNumber = value => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const toValidResourceId = value => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

const normalizeUrl = value => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export const withBreakingNewsCoverParam = (url, size = 720) => {
  const normalizedUrl = normalizeUrl(url)
  if (!normalizedUrl) return ''
  if (normalizedUrl.startsWith('data:') || normalizedUrl.startsWith('blob:')) return normalizedUrl

  const nextParam = `param=${size}y${size}`
  if (/(?:\?|&)param=\d+y\d+/.test(normalizedUrl)) {
    return normalizedUrl.replace(/([?&])param=\d+y\d+/, `$1${nextParam}`)
  }

  return `${normalizedUrl}${normalizedUrl.includes('?') ? '&' : '?'}${nextParam}`
}

const formatCount = value => {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return '0'
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}亿`
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`
  return `${Math.round(num)}`
}

const buildSongUrl = id => (id ? `https://music.163.com/#/song?id=${id}` : '')
const buildAlbumUrl = id => (id ? `https://music.163.com/#/album?id=${id}` : '')
const buildPlaylistUrl = id => (id ? `https://music.163.com/#/playlist?id=${id}` : '')
const buildMvUrl = id => (id ? `https://music.163.com/mv?id=${id}` : '')

const getBannerPic = banner => normalizeUrl(banner?.pic || banner?.imageUrl || '')

export const parseBreakingNewsTargetFromUrl = rawUrl => {
  const url = normalizeUrl(rawUrl)
  if (!url) return { type: null, id: null }

  const patterns = [
    { type: 1004, regex: /(?:orpheus:\/\/mv\/|[#/]mv\?id=|\/mv\/)(\d+)/i },
    { type: 10, regex: /(?:orpheus:\/\/album\/|[#/]album\?id=|\/album\/)(\d+)/i },
    { type: 1000, regex: /(?:orpheus:\/\/playlist\/|[#/]playlist\?id=|\/playlist\/)(\d+)/i },
    { type: 1, regex: /(?:orpheus:\/\/song\/|[#/]song\?id=|\/song\/)(\d+)/i },
  ]

  for (const item of patterns) {
    const matched = url.match(item.regex)
    const parsedId = toValidResourceId(matched && matched[1])
    if (parsedId) return { type: item.type, id: parsedId }
  }

  return { type: null, id: null }
}

export const resolveBreakingNewsTarget = banner => {
  const targetType = toValidNumber(banner?.targetType)
  const targetId = toValidResourceId(banner?.targetId)
  const parsedTarget = parseBreakingNewsTargetFromUrl(banner?.url)

  const type = (targetType === 3000 && parsedTarget.type) || (!targetType && parsedTarget.type)
    ? parsedTarget.type
    : targetType
  const id = (targetType === 3000 && parsedTarget.id) || (!targetId && parsedTarget.id && parsedTarget.type === type)
    ? parsedTarget.id
    : targetId

  return { type, id }
}

export const getBreakingNewsDetailCacheKey = banner => {
  const { type, id } = resolveBreakingNewsTarget(banner)
  const url = normalizeUrl(banner?.url) || 'no-url'
  return `${type || 'unknown'}:${id || 'no-id'}:${url}`
}

export const getCachedBreakingNewsDetail = banner => {
  const key = getBreakingNewsDetailCacheKey(banner)
  return detailCache.get(key) || null
}

const preloadImage = (url, timeoutMs = 2200) => new Promise(resolve => {
  const src = withBreakingNewsCoverParam(url, 720)
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
    resolve()
    return
  }

  if (typeof window === 'undefined' || typeof window.Image !== 'function') {
    resolve()
    return
  }

  const img = new window.Image()
  let settled = false
  const finish = () => {
    if (settled) return
    settled = true
    window.clearTimeout(timer)
    resolve()
  }
  const timer = window.setTimeout(finish, timeoutMs)
  img.onload = finish
  img.onerror = finish
  img.src = src
})

async function fetchBreakingNewsDetail(banner) {
  if (!banner) throw new Error('缺少 banner 信息')

  const { type, id } = resolveBreakingNewsTarget(banner)
  const fallbackCover = getBannerPic(banner)

  if (type === 1) {
    if (!id) throw new Error('缺少歌曲 ID')
    const songRes = await getSongDetail(id)
    const rawSongs = Array.isArray(songRes?.songs) ? songRes.songs : []
    if (rawSongs.length === 0) throw new Error('未获取到歌曲信息')

    const songs = mapSongsPlayableStatus(rawSongs) || rawSongs
    const song = songs[0]
    const artistText = (song?.ar || []).map(item => item?.name).filter(Boolean).join(' / ') || '未知歌手'
    const albumName = song?.al?.name || '未知专辑'

    return {
      kind: 'song',
      title: song?.name || '未命名歌曲',
      subtitle: artistText,
      desc: `收录于专辑《${albumName}》`,
      stats: song?.playable === false ? `当前状态：${song?.reason || '不可播放'}` : `歌曲 ID: ${song?.id || id}`,
      cover: song?.al?.picUrl || fallbackCover,
      shareUrl: buildSongUrl(song?.id || id),
      song,
    }
  }

  if (type === 10) {
    if (!id) throw new Error('缺少专辑 ID')
    const albumRes = await getAlbumDetail(id)
    const album = albumRes?.album || null
    if (!album) throw new Error('未获取到专辑信息')

    const artistText = (album?.artists || []).map(item => item?.name).filter(Boolean).join(' / ') || album?.artist?.name || '未知艺术家'
    const songCount = toValidNumber(album?.size) || toValidNumber(album?.songCount) || 0
    const subCount = toValidNumber(album?.subCount) || 0

    return {
      kind: 'album',
      title: album?.name || '未命名专辑',
      subtitle: artistText,
      desc: album?.description || album?.company || '暂无专辑简介',
      stats: `${songCount} 首歌曲 · ${formatCount(subCount)} 收藏`,
      cover: album?.picUrl || fallbackCover,
      shareUrl: buildAlbumUrl(album?.id || id),
    }
  }

  if (type === 1000) {
    if (!id) throw new Error('缺少歌单 ID')
    const playlistRes = await getPlaylistDetail({ id })
    const playlist = playlistRes?.playlist || null
    if (!playlist) throw new Error('未获取到歌单信息')

    const trackCount = toValidNumber(playlist?.trackCount) || 0
    const playCount = toValidNumber(playlist?.playCount) || 0

    return {
      kind: 'playlist',
      title: playlist?.name || '未命名歌单',
      subtitle: playlist?.creator?.nickname ? `by ${playlist.creator.nickname}` : '官方推荐',
      desc: playlist?.description || '暂无歌单简介',
      stats: `${trackCount} 首歌曲 · ${formatCount(playCount)} 播放`,
      cover: playlist?.coverImgUrl || fallbackCover,
      shareUrl: buildPlaylistUrl(playlist?.id || id),
    }
  }

  if (type === 1004) {
    if (!id) throw new Error('缺少 MV ID')
    const mvRes = await getMVDetail(id)
    const mv = mvRes?.data || null
    if (!mv) throw new Error('未获取到 MV 信息')

    const artistText = (mv?.artists || []).map(item => item?.name).filter(Boolean).join(' / ') || mv?.artistName || '未知艺人'
    const publishTime = typeof mv?.publishTime === 'string' ? mv.publishTime.trim() : ''
    const playCount = toValidNumber(mv?.playCount) || 0
    const subCount = toValidNumber(mv?.subCount) || 0

    return {
      kind: 'mv',
      title: mv?.name || '未命名 MV',
      subtitle: publishTime ? `${artistText} · ${publishTime}` : artistText,
      desc: mv?.desc || mv?.briefDesc || '暂无 MV 简介',
      stats: `${formatCount(playCount)} 播放 · ${formatCount(subCount)} 收藏`,
      cover: mv?.cover || fallbackCover,
      shareUrl: buildMvUrl(mv?.id || id),
      mvId: mv?.id || id,
    }
  }

  const external = normalizeUrl(banner?.url)
  return {
    kind: 'external',
    title: banner?.typeTitle || '外部内容',
    subtitle: external ? '将通过系统浏览器打开' : '暂无外部链接',
    desc: '该内容暂不支持站内解析，点击主按钮可尝试打开原始链接。',
    stats: external ? '已检测到可用外链' : '无可用链接',
    cover: fallbackCover,
    shareUrl: external,
  }
}

export async function getBreakingNewsDetail(banner, options = {}) {
  const key = getBreakingNewsDetailCacheKey(banner)
  const cachedDetail = detailCache.get(key)
  if (cachedDetail) return cachedDetail

  const pendingDetail = pendingDetailRequests.get(key)
  if (pendingDetail) return pendingDetail

  const request = fetchBreakingNewsDetail(banner)
    .then(async detail => {
      if (options.preloadCover !== false) await preloadImage(detail?.cover)
      detailCache.set(key, detail)
      return detail
    })
    .finally(() => {
      pendingDetailRequests.delete(key)
    })

  pendingDetailRequests.set(key, request)
  return request
}

const scheduleIdleTask = callback => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(callback, { timeout: 1800 })
    return
  }
  setTimeout(callback, 700)
}

const runPrefetchQueue = async () => {
  prefetchScheduled = false
  const batch = prefetchQueue.splice(0, 2)
  batch.forEach(item => queuedPrefetchKeys.delete(item.key))

  await Promise.all(batch.map(item => getBreakingNewsDetail(item.banner, { preloadCover: true }).catch(() => null)))

  if (prefetchQueue.length > 0) {
    prefetchScheduled = true
    scheduleIdleTask(runPrefetchQueue)
  }
}

export function prefetchBreakingNewsDetails(banners = [], options = {}) {
  if (!Array.isArray(banners) || banners.length === 0) return

  const nextPrefetchItems = []

  banners.forEach(banner => {
    const { type, id } = resolveBreakingNewsTarget(banner)
    if (!RESOLVABLE_TARGET_TYPES.has(type) || !id) return

    const key = getBreakingNewsDetailCacheKey(banner)
    if (detailCache.has(key) || pendingDetailRequests.has(key) || queuedPrefetchKeys.has(key)) return

    queuedPrefetchKeys.add(key)
    nextPrefetchItems.push({ key, banner })
  })

  if (options.immediateFirst && nextPrefetchItems.length > 0) {
    const firstItem = nextPrefetchItems.shift()
    queuedPrefetchKeys.delete(firstItem.key)
    getBreakingNewsDetail(firstItem.banner, { preloadCover: true }).catch(() => null)
  }

  prefetchQueue.push(...nextPrefetchItems)

  if (prefetchScheduled || prefetchQueue.length === 0) return
  prefetchScheduled = true
  scheduleIdleTask(runPrefetchQueue)
}
