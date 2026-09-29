import pinia from '../store/pinia'
import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../store/playerStore'
import { startMusic, pauseMusic, playNext, playLast, changeProgress } from './player/lazy'
import { getSongDisplayName } from './songName'
import { getIndexedSong, getIndexedSongOrFirst } from './songList'
import { getSongCoverUrl, withCoverParam } from './coverBackdrop'

function getCurrentTrack(storeRefs) {
  const { songList, currentIndex, playMode, shuffledList, shuffleIndex, songId } = storeRefs
  const isShuffleMode = Number(playMode.value) === 3
  const activeList = isShuffleMode && Array.isArray(shuffledList.value) && shuffledList.value.length > 0
    ? shuffledList.value
    : songList.value
  const activeIndex = isShuffleMode ? shuffleIndex.value : currentIndex.value
  const indexedTrack = getIndexedSong(activeList, activeIndex)
  if (indexedTrack) return indexedTrack

  const targetId = songId.value === undefined || songId.value === null ? '' : String(songId.value)
  if (targetId && Array.isArray(activeList)) {
    const matchedTrack = activeList.find(track => track && String(track.id) === targetId)
    if (matchedTrack) return matchedTrack
  }

  return getIndexedSongOrFirst(songList.value, currentIndex.value)
}

function getArtworkForTrack(track, localBase64) {
  const arts = []
  if (localBase64) {
    arts.push({ src: localBase64 })
  }
  const cover = getSongCoverUrl(track) || null
  if (cover) {
    // Use a single stable size to avoid artwork swaps in OS UI
    arts.push({ src: withCoverParam(cover, 256) })
  }
  return arts
}

function getArtistsForTrack(track) {
  if (Array.isArray(track?.ar)) {
    const artists = track.ar.map(a => a && a.name).filter(Boolean)
    if (artists.length > 0) return artists
  }
  if (Array.isArray(track?.artists)) {
    const artists = track.artists.map(a => typeof a === 'string' ? a : a?.name).filter(Boolean)
    if (artists.length > 0) return artists
  }
  if (track?.artist) return String(track.artist).split(/\s*[,/、]\s*/).filter(Boolean)
  return []
}

function getMediaSessionApi() {
  if (typeof navigator === 'undefined') return null
  if (!navigator.mediaSession) return null
  return navigator.mediaSession
}

export function initMediaSession() {
  if (typeof navigator === 'undefined') return

  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''
  const isMac = /Mac/i.test(platform)
  const mediaSession = getMediaSessionApi()

  const playerStore = usePlayerStore(pinia)
  const refs = storeToRefs(playerStore)
  const { songList, currentIndex, playing, progress, time, localBase64Img, showSongTranslation, playMode, shuffledList, shuffleIndex, songId } = refs

  // 平台与节流参数（封面仅换曲更新；进度略动态且限流）
  const POS_MIN_INTERVAL = 1000 // macOS 更保守，Windows/其他约 1s
  const POS_MIN_DELTA = 0.8 // 小于 ~0.8s 的微小变化不推送
  // 切歌后短时间内更积极同步（爆发窗口）
  const BURST_WINDOW_MS = 2000
  const POS_MIN_INTERVAL_BURST = 450
  const POS_MIN_DELTA_BURST = 0.2
  let lastPos = -1
  let lastDur = -1
  let lastTs = 0
  let lastMetadataDuration = 0
  let burstUntil = 0
  const inBurst = () => Date.now() < burstUntil

  const updatePlaybackState = () => {
    try {
      if (!mediaSession) return
      mediaSession.playbackState = playing.value ? 'playing' : 'paused'
    } catch (_) {}
  }

  const clearMetadata = () => {
    try {
      if (mediaSession) {
        mediaSession.metadata = null
        mediaSession.playbackState = 'none'
      }
    } catch (_) {}
    try { window.playerApi?.sendMetaData?.(null) } catch (_) {}
    updatePosition({ forceZero: true })
    lastMetadataDuration = 0
  }

  // 静态模式：允许在“重置”时将进度归零，即便时长未知
  const updatePosition = (opts = {}) => {
    const { forceZero = false, override } = opts || {}
    try {
      let duration = Number(time.value) || 0
      let position = Number(progress.value) || 0
      if (override && typeof override.duration === 'number') duration = override.duration
      if (override && typeof override.position === 'number') position = override.position
      if (forceZero) {
        duration = Number(override && typeof override.duration === 'number' ? override.duration : 0)
        position = 0
      }
      window.playerApi?.sendPlayerCurrentTrackTime?.(position)
      lastDur = duration
      lastPos = position
      lastTs = Date.now()
      if (!mediaSession || typeof mediaSession.setPositionState !== 'function') return
      if (duration <= 0) return
      const safePosition = Math.max(0, Math.min(position, duration))
      mediaSession.setPositionState({ duration, position: safePosition, playbackRate: 1.0 })
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

  const updateMetadata = (opts = {}) => {
    const { resetPosition = true } = opts || {}
    const cur = getCurrentTrack(refs)
    if (!cur) {
      clearMetadata()
      return
    }
    const title = getSongDisplayName(cur, 'Hydrogen Music', showSongTranslation.value)
    const artists = getArtistsForTrack(cur)
    const artist = artists.join(', ')
    const album = (cur.al && cur.al.name) || cur.album || ''
    const duration = Number(time.value) || 0
    let artwork = getArtworkForTrack(cur, localBase64Img.value)
    if (isMac && artwork && artwork.length > 1) artwork = [artwork[0]]
    try {
      if (!artwork || artwork.length === 0) artwork = [{ src: '' }]
      const metadata = {
        title: title,
        artist: artist,
        artists: artists,
        album: album,
        artwork: artwork || [],
        length: duration,
        // 供 mpris 使用的附加字段
        trackId: (cur && (cur.id || cur.url || 'local')),
        url: (typeof cur.url === 'string') ? cur.url : ''
      }

      if (mediaSession && typeof window.MediaMetadata === 'function') {
        mediaSession.metadata = new window.MediaMetadata({ title, artist, album, artwork: metadata.artwork })
      }
      // 发送给 mpris（Linux）桥接
      try { window.playerApi?.sendMetaData?.(metadata) } catch (_) {}
    } catch (_) {}
    lastMetadataDuration = duration
    updatePlaybackState()
    if (resetPosition) {
      // 换曲瞬间：强制把位置归零，避免系统控件保留上一首进度
      updatePosition({ forceZero: true })
      // 开启爆发窗口：接下来几秒内更积极同步进度
      burstUntil = Date.now() + BURST_WINDOW_MS
    } else {
      updatePositionThrottled({ force: true })
    }
  }

  const updateMetadataDuration = () => {
    const duration = Number(time.value) || 0
    if (duration <= 0) return
    if (Math.abs(duration - lastMetadataDuration) < 0.25) return
    updateMetadata({ resetPosition: false })
  }

  // Initial registration of action handlers (SMTC hooks)
  try {
    if (mediaSession && typeof mediaSession.setActionHandler === 'function') {
      mediaSession.setActionHandler('play', () => { startMusic(); updatePlaybackState(); updatePositionThrottled({ force: true }) })
      mediaSession.setActionHandler('pause', () => { pauseMusic(); updatePlaybackState(); updatePositionThrottled({ force: true }) })
      mediaSession.setActionHandler('previoustrack', () => playLast())
      mediaSession.setActionHandler('nexttrack', () => playNext())
      mediaSession.setActionHandler('stop', () => { pauseMusic(); updatePlaybackState(); updatePositionThrottled({ force: true }) })
      mediaSession.setActionHandler('seekto', (details) => {
        if (details && typeof details.seekTime === 'number') {
          changeProgress(Math.max(0, Math.min(details.seekTime, Number(time.value) || 0)))
          updatePositionThrottled({ force: true })
        }
      })
      mediaSession.setActionHandler('seekforward', (details) => {
        const offset = (details && details.seekOffset) || 5
        const pos = (Number(progress.value) || 0) + offset
        changeProgress(Math.max(0, Math.min(pos, Number(time.value) || 0)))
        updatePositionThrottled({ force: true })
      })
      mediaSession.setActionHandler('seekbackward', (details) => {
        const offset = (details && details.seekOffset) || 5
        const pos = (Number(progress.value) || 0) - offset
        changeProgress(Math.max(0, Math.min(pos, Number(time.value) || 0)))
        updatePositionThrottled({ force: true })
      })
    }
  } catch (_) {}

  // Static strategy
  // 1) 仅在曲目切换时设置元数据并进度归零
  watch([songList, currentIndex, playMode, shuffledList, shuffleIndex, songId, showSongTranslation], () => updateMetadata(), { immediate: true })
  // 1.5) 歌曲真实时长通常在加载后才出现；刷新 metadata，但不重置系统进度。
  watch(time, () => updateMetadataDuration(), { immediate: true })
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

/**
 * 原生媒体通知（Android 通知栏 / 锁屏控制）。
 *
 * 实测本机 Android 16 的 WebView **不提供** navigator.mediaSession / MediaMetadata /
 * Notification（全部 undefined），所以上面那套 Web 标准在 App 里根本不生效，
 * 通知栏必须由原生插件 MediaNotification 去发。
 *
 * 插件不存在时（浏览器 / Electron）直接返回，不做任何事。
 */
export async function initNativeMediaNotification() {
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core')
    if (!Capacitor || typeof Capacitor.isNativePlatform !== 'function') return
    if (!Capacitor.isNativePlatform()) return
    if (typeof Capacitor.isPluginAvailable === 'function' && !Capacitor.isPluginAvailable('MediaNotification')) {
      return
    }

    const MediaNotification = registerPlugin('MediaNotification')
    const playerStore = usePlayerStore(pinia)
    const refs = storeToRefs(playerStore)
    const { songList, currentIndex, playing, songId, playMode, shuffledList, shuffleIndex, showSongTranslation, time, progress } = refs

    // 曲目 / 播放状态变化时，把最新信息推给通知栏
    const push = () => {
      const track = getCurrentTrack({ songList, currentIndex, playMode, shuffledList, shuffleIndex, songId })
      if (!track) {
        void MediaNotification.hide().catch(() => {})
        return
      }
      const covers = getArtworkForTrack(track)
      void MediaNotification.show({
        title: getSongDisplayName(track, '', showSongTranslation.value) || track.name || '',
        artist: getArtistsForTrack(track).join(' / '),
        album: (track.al || track.album || {}).name || '',
        coverUrl: covers.length ? covers[0].src : '',
        playing: !!playing.value,
        // MIUI 的媒体卡片在 mediaId 为空、时长为 0 时渲染异常（按钮点不动），必须带上
        mediaId: track.id === undefined || track.id === null ? '' : String(track.id),
        duration: Number(track.dt || track.duration || 0),
      }).catch(() => {})
    }

    /**
     * 把播放进度推给原生。
     *
     * 通知栏媒体卡片上的进度条与「当前时间 / 总时长」读的是 MediaSession 的
     * PlaybackState；此前只在切歌时推过一次、且位置恒为 PLAYBACK_POSITION_UNKNOWN，
     * 系统拿不到有效位置，就固定显示 00:00 - 00:00（用户实测反馈）。
     *
     * 单位换算：store 里的 time / progress 是**秒**，原生 PlaybackState 要**毫秒**；
     * track.dt 本身就是毫秒，仅作时长兜底。
     * 节流：至少间隔 1s 且位置变化 ≥0.8s 才推，避免每秒都跨桥。
     */
    let lastProgressAt = 0
    let lastProgressPos = -1
    const pushProgress = (force = false) => {
      try {
        const track = getCurrentTrack({ songList, currentIndex, playMode, shuffledList, shuffleIndex, songId })
        if (!track) return
        const durationMs = Math.round((Number(time.value) || 0) * 1000) || Number(track.dt || track.duration || 0)
        const positionMs = Math.max(0, Math.round((Number(progress.value) || 0) * 1000))
        const now = Date.now()
        if (!force) {
          if (now - lastProgressAt < 1000) return
          if (Math.abs(positionMs - lastProgressPos) < 800) return
        }
        lastProgressAt = now
        lastProgressPos = positionMs
        void MediaNotification.setProgress({ position: positionMs, duration: durationMs }).catch(() => {})
      } catch (_) {}
    }

    watch([songList, currentIndex, playMode, shuffledList, shuffleIndex, songId, showSongTranslation], push, { immediate: true })
    watch(playing, () => {
      void MediaNotification.setPlaying({ playing: !!playing.value }).catch(() => {})
      // 暂停/续播时补推一次位置，保证暂停后卡片上的时间停在正确位置
      pushProgress(true)
    })
    // 播放中续推进度：time 变化（拿到真实时长）或 progress 前进都会触发
    watch([progress, time], () => pushProgress())

    // 通知栏上的按钮 → 播放控制
    MediaNotification.addListener('mediaAction', async event => {
      const action = event && event.action
      console.log('[媒体通知] 前端收到动作:', action)
      try {
        const mod = await import('./player/lazy')
        if (action === 'play') mod.startMusic()
        else if (action === 'pause') mod.pauseMusic()
        else if (action === 'next') mod.playNext()
        else if (action === 'previous') mod.playLast()
      } catch (error) {
        console.warn('[媒体通知] 执行动作失败:', action, error && error.message)
      }
    })
    console.log('[媒体通知] 已注册 mediaAction 监听')
  } catch (error) {
    console.warn('[mediaSession] 原生媒体通知初始化失败:', error && error.message)
  }
}
