import pinia from '../store/pinia'
import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../store/playerStore'
import { startMusic, pauseMusic, playNext, playLast, changeProgress } from './player'

function getCurrentTrack(storeRefs) {
  const { songList, currentIndex } = storeRefs
  const list = songList.value || []
  const idx = typeof currentIndex.value === 'number' ? currentIndex.value : 0
  return list[idx] || null
}

function getArtworkForTrack(track, localBase64) {
  const arts = []
  if (localBase64) {
    arts.push({ src: localBase64 })
  }
  const cover = (track && (track.coverUrl || (track.al && track.al.picUrl) || track.blurPicUrl || track.img1v1Url)) || null
  if (cover) {
    // Use a single stable size to avoid artwork swaps in OS UI
    const sizes = [256]
    sizes.forEach(sz => arts.push({ src: `${cover}?param=${sz}y${sz}` }))
  }
  return arts
}

export function initMediaSession() {
  if (!(typeof navigator !== 'undefined' && navigator.mediaSession)) return

  const playerStore = usePlayerStore(pinia)
  const refs = storeToRefs(playerStore)
  const { songList, currentIndex, playing, progress, time, localBase64Img } = refs

  // 平台与节流参数（封面仅换曲更新；进度略动态且限流）
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''
  const isMac = /Mac/i.test(platform)
  const POS_MIN_INTERVAL = 1000 // macOS 更保守，Windows/其他约 1s
  const POS_MIN_DELTA = 0.8 // 小于 ~0.8s 的微小变化不推送
  // 切歌后短时间内更积极同步（爆发窗口）
  const BURST_WINDOW_MS = 2000
  const POS_MIN_INTERVAL_BURST = 450
  const POS_MIN_DELTA_BURST = 0.2
  let lastPos = -1
  let lastDur = -1
  let lastTs = 0
  let burstUntil = 0
  const inBurst = () => Date.now() < burstUntil

  const updatePlaybackState = () => {
    try {
      navigator.mediaSession.playbackState = playing.value ? 'playing' : 'paused'
    } catch (_) {}
  }

  // 静态模式：允许在“重置”时将进度归零，即便时长未知
  const updatePosition = (opts = {}) => {
    const { forceZero = false, override } = opts || {}
    try {
      if (typeof navigator.mediaSession.setPositionState !== 'function') return
      let duration = Number(time.value) || 0
      let position = Number(progress.value) || 0
      if (override && typeof override.duration === 'number') duration = override.duration
      if (override && typeof override.position === 'number') position = override.position
      if (forceZero) {
        duration = Number(override && typeof override.duration === 'number' ? override.duration : 0)
        position = 0
      }
      // 允许 duration 为 0 用于“换曲瞬间归零”，随后真正时长会在加载完成时刷新
      navigator.mediaSession.setPositionState({ duration, position, playbackRate: 1.0 })
      lastDur = duration
      lastPos = position
      lastTs = Date.now()
    } catch (_) {}
  }

  const updatePositionThrottled = (opts = {}) => {
    const { force = false } = opts || {}
    try {
      // macOS: 仅在爆发窗口或显式强制时做周期更新，避免封面闪烁
      if (isMac && !force && !inBurst()) return
      const dur = Number(time.value) || 0
      const pos = Number(progress.value) || 0
      const now = Date.now()
      const minInterval = inBurst() ? POS_MIN_INTERVAL_BURST : POS_MIN_INTERVAL
      const minDelta = inBurst() ? POS_MIN_DELTA_BURST : POS_MIN_DELTA
      const tooSoon = (now - lastTs) < minInterval
      const smallMove = Math.abs(pos - lastPos) < minDelta
      if (!force && (tooSoon || smallMove)) return
      updatePosition({ override: { duration: dur, position: pos } })
    } catch (_) {}
  }

  const updateMetadata = () => {
    const cur = getCurrentTrack(refs)
    if (!cur) return
    const title = cur.name || cur.localName || 'Hydrogen Music'
    const artist = Array.isArray(cur.ar) ? cur.ar.map(a => a && a.name).filter(Boolean).join(', ') : (cur.artist || '')
    const album = (cur.al && cur.al.name) || cur.album || ''
    let artwork = getArtworkForTrack(cur, localBase64Img.value)
    if (isMac && artwork && artwork.length > 1) artwork = [artwork[0]]
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album, artwork })
    } catch (_) {}
    updatePlaybackState()
    // 换曲瞬间：强制把位置归零，避免系统控件保留上一首进度
    updatePosition({ forceZero: true })
    // 开启爆发窗口：接下来几秒内更积极同步进度
    burstUntil = Date.now() + BURST_WINDOW_MS
  }

  // Initial registration of action handlers (SMTC hooks)
  try {
    navigator.mediaSession.setActionHandler('play', () => { startMusic(); updatePlaybackState(); updatePositionThrottled({ force: true }) })
    navigator.mediaSession.setActionHandler('pause', () => { pauseMusic(); updatePlaybackState(); updatePositionThrottled({ force: true }) })
    navigator.mediaSession.setActionHandler('previoustrack', () => playLast())
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext())
    navigator.mediaSession.setActionHandler('stop', () => { pauseMusic(); updatePlaybackState(); updatePositionThrottled({ force: true }) })
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details && typeof details.seekTime === 'number') {
        changeProgress(Math.max(0, Math.min(details.seekTime, Number(time.value) || 0)))
        updatePositionThrottled({ force: true })
      }
    })
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const offset = (details && details.seekOffset) || 5
      const pos = (Number(progress.value) || 0) + offset
      changeProgress(Math.max(0, Math.min(pos, Number(time.value) || 0)))
      updatePositionThrottled({ force: true })
    })
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const offset = (details && details.seekOffset) || 5
      const pos = (Number(progress.value) || 0) - offset
      changeProgress(Math.max(0, Math.min(pos, Number(time.value) || 0)))
      updatePositionThrottled({ force: true })
    })
  } catch (_) {}

  // Static strategy
  // 1) 仅在曲目切换时设置元数据并进度归零
  watch([songList, currentIndex], () => updateMetadata(), { immediate: true })
  // 2) 仅在播放状态切换时刷新一次位置（不走每秒更新）
  watch(playing, () => { updatePlaybackState(); updatePositionThrottled({ force: true }) }, { immediate: true })

  // 2.5) 轻量动态：进度限流更新
  // macOS：仅在爆发窗口内生效；Windows/其他：常规节流
  watch([progress, time], () => updatePositionThrottled(), { immediate: true })

  // 3) 监听渲染层的显式 seek/加载完成事件，以便精准刷新一次
  try {
    window.addEventListener('mediaSession:seeked', (e) => {
      const detail = (e && e.detail) || {}
      const duration = typeof detail.duration === 'number' ? detail.duration : Number(time.value) || 0
      const position = typeof detail.toTime === 'number' ? detail.toTime : Number(progress.value) || 0
      updatePosition({ override: { duration, position } })
    })
    // 本地音乐封面异步到达后，补一次 metadata（仅当当前曲目未切换）
    window.addEventListener('mediaSession:updateArtwork', () => {
      // 仅刷新 metadata，不动 position，避免产生闪烁；macOS 下只更新一次 artwork
      updateMetadata()
    })
  } catch (_) {}
}
