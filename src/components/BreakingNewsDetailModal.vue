<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getSongDetail } from '../api/song'
import { getAlbumDetail } from '../api/album'
import { getPlaylistDetail } from '../api/playlist'
import { getMVDetail } from '../api/mv'
import { useLibraryStore } from '../store/libraryStore'
import { usePlayerStore } from '../store/playerStore'
import { useOtherStore } from '../store/otherStore'
import { mapSongsPlayableStatus } from '../utils/songStatus'
import { addToNext } from '../utils/player'
import { noticeOpen } from '../utils/dialog'
import { copyToClipboard } from '../utils/clipboard'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  banner: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close'])
const router = useRouter()
const libraryStore = useLibraryStore()
const playerStore = usePlayerStore()
const otherStore = useOtherStore()

const loading = ref(false)
const loadError = ref('')
const detailData = ref(null)
const requestSerial = ref(0)

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

const withCoverParam = (url, size = 720) => {
  if (!url) return ''
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  if (/(?:\?|&)param=\d+y\d+/.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}param=${size}y${size}`
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

const targetType = computed(() => toValidNumber(props.banner?.targetType))
const targetId = computed(() => toValidResourceId(props.banner?.targetId))

const parseTargetFromUrl = rawUrl => {
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
    if (parsedId) {
      return { type: item.type, id: parsedId }
    }
  }

  return { type: null, id: null }
}

const parsedTarget = computed(() => parseTargetFromUrl(props.banner?.url))

const resolvedTargetType = computed(() => {
  if (targetType.value === 3000 && parsedTarget.value.type) return parsedTarget.value.type
  if (!targetType.value && parsedTarget.value.type) return parsedTarget.value.type
  return targetType.value
})

const resolvedTargetId = computed(() => {
  if (targetType.value === 3000 && parsedTarget.value.id) return parsedTarget.value.id
  if (!targetId.value && parsedTarget.value.id && parsedTarget.value.type === resolvedTargetType.value) return parsedTarget.value.id
  return targetId.value
})

const targetTypeText = computed(() => {
  if (targetType.value === 3000 && resolvedTargetType.value === 10) return 'DIGITAL ALBUM'

  const type = resolvedTargetType.value
  if (type === 1) return 'SONG'
  if (type === 10) return 'ALBUM'
  if (type === 1000) return 'PLAYLIST'
  if (type === 1004) return 'MV'
  if (type === 3000) return 'EXTERNAL'
  return 'UNKNOWN'
})

const displayTypeTitle = computed(() => {
  return props.banner?.typeTitle || 'BREAKING NEWS'
})

const shareUrl = computed(() => {
  if (detailData.value?.shareUrl) return detailData.value.shareUrl
  if (resolvedTargetType.value === 1) return buildSongUrl(resolvedTargetId.value)
  if (resolvedTargetType.value === 10) return buildAlbumUrl(resolvedTargetId.value)
  if (resolvedTargetType.value === 1000) return buildPlaylistUrl(resolvedTargetId.value)
  if (resolvedTargetType.value === 1004) return buildMvUrl(resolvedTargetId.value)
  return normalizeUrl(props.banner?.url)
})

const coverUrl = computed(() => {
  return withCoverParam(detailData.value?.cover || props.banner?.pic || '', 720)
})

const displayTitle = computed(() => detailData.value?.title || 'BREAKING NEWS')
const displaySubtitle = computed(() => detailData.value?.subtitle || '暂无副标题')
const displayDesc = computed(() => detailData.value?.desc || '暂无详细内容')
const displayStats = computed(() => detailData.value?.stats || '')

const primaryActionLabel = computed(() => {
  if (resolvedTargetType.value === 1) return '立即播放'
  if (resolvedTargetType.value === 10) return '打开专辑'
  if (resolvedTargetType.value === 1000) return '打开歌单'
  if (resolvedTargetType.value === 1004) return '站内播放'
  return '打开链接'
})

const closeModal = () => {
  emit('close')
}

const openLibraryPage = async (routeName, id) => {
  playerStore.forbidLastRouter = true
  libraryStore.libraryInfo = null
  await router.push({
    name: routeName,
    params: { id: String(id) },
    query: {
      bn: String(Date.now()),
    },
  })
}

const buildFallbackDetail = message => {
  const type = resolvedTargetType.value
  const id = resolvedTargetId.value
  let fallbackLink = normalizeUrl(props.banner?.url)

  if (!fallbackLink && type === 1) fallbackLink = buildSongUrl(id)
  if (!fallbackLink && type === 10) fallbackLink = buildAlbumUrl(id)
  if (!fallbackLink && type === 1000) fallbackLink = buildPlaylistUrl(id)
  if (!fallbackLink && type === 1004) fallbackLink = buildMvUrl(id)

  return {
    kind: 'fallback',
    title: props.banner?.typeTitle || 'BREAKING NEWS',
    subtitle: '内容加载失败',
    desc: message || '暂时无法获取详细信息',
    stats: '',
    cover: props.banner?.pic || '',
    shareUrl: fallbackLink,
  }
}

const loadDetail = async () => {
  if (!props.banner) return

  const serial = ++requestSerial.value
  loading.value = true
  loadError.value = ''
  detailData.value = null

  try {
    const type = resolvedTargetType.value
    const id = resolvedTargetId.value

    if (type === 1) {
      if (!id) throw new Error('缺少歌曲 ID')
      const songRes = await getSongDetail(id)
      if (serial !== requestSerial.value) return

      const rawSongs = Array.isArray(songRes?.songs) ? songRes.songs : []
      if (rawSongs.length === 0) throw new Error('未获取到歌曲信息')

      const songs = mapSongsPlayableStatus(rawSongs) || rawSongs
      const song = songs[0]
      const artistText = (song?.ar || []).map(item => item?.name).filter(Boolean).join(' / ') || '未知歌手'
      const albumName = song?.al?.name || '未知专辑'

      detailData.value = {
        kind: 'song',
        title: song?.name || '未命名歌曲',
        subtitle: artistText,
        desc: `收录于专辑《${albumName}》`,
        stats: song?.playable === false ? `当前状态：${song?.reason || '不可播放'}` : `歌曲 ID: ${song?.id || id}`,
        cover: song?.al?.picUrl || props.banner?.pic || '',
        shareUrl: buildSongUrl(song?.id || id),
        song,
      }
      return
    }

    if (type === 10) {
      if (!id) throw new Error('缺少专辑 ID')
      const albumRes = await getAlbumDetail(id)
      if (serial !== requestSerial.value) return

      const album = albumRes?.album || null
      if (!album) throw new Error('未获取到专辑信息')

      const artistText = (album?.artists || []).map(item => item?.name).filter(Boolean).join(' / ') || album?.artist?.name || '未知艺术家'
      const songCount = toValidNumber(album?.size) || toValidNumber(album?.songCount) || 0
      const subCount = toValidNumber(album?.subCount) || 0

      detailData.value = {
        kind: 'album',
        title: album?.name || '未命名专辑',
        subtitle: artistText,
        desc: album?.description || album?.company || '暂无专辑简介',
        stats: `${songCount} 首歌曲 · ${formatCount(subCount)} 收藏`,
        cover: album?.picUrl || props.banner?.pic || '',
        shareUrl: buildAlbumUrl(album?.id || id),
      }
      return
    }

    if (type === 1000) {
      if (!id) throw new Error('缺少歌单 ID')
      const playlistRes = await getPlaylistDetail({ id })
      if (serial !== requestSerial.value) return

      const playlist = playlistRes?.playlist || null
      if (!playlist) throw new Error('未获取到歌单信息')

      const trackCount = toValidNumber(playlist?.trackCount) || 0
      const playCount = toValidNumber(playlist?.playCount) || 0

      detailData.value = {
        kind: 'playlist',
        title: playlist?.name || '未命名歌单',
        subtitle: playlist?.creator?.nickname ? `by ${playlist.creator.nickname}` : '官方推荐',
        desc: playlist?.description || '暂无歌单简介',
        stats: `${trackCount} 首歌曲 · ${formatCount(playCount)} 播放`,
        cover: playlist?.coverImgUrl || props.banner?.pic || '',
        shareUrl: buildPlaylistUrl(playlist?.id || id),
      }
      return
    }

    if (type === 1004) {
      if (!id) throw new Error('缺少 MV ID')
      const mvRes = await getMVDetail(id)
      if (serial !== requestSerial.value) return

      const mv = mvRes?.data || null
      if (!mv) throw new Error('未获取到 MV 信息')

      const artistText = (mv?.artists || []).map(item => item?.name).filter(Boolean).join(' / ') || mv?.artistName || '未知艺人'
      const publishTime = typeof mv?.publishTime === 'string' ? mv.publishTime.trim() : ''
      const playCount = toValidNumber(mv?.playCount) || 0
      const subCount = toValidNumber(mv?.subCount) || 0

      detailData.value = {
        kind: 'mv',
        title: mv?.name || '未命名 MV',
        subtitle: publishTime ? `${artistText} · ${publishTime}` : artistText,
        desc: mv?.desc || mv?.briefDesc || '暂无 MV 简介',
        stats: `${formatCount(playCount)} 播放 · ${formatCount(subCount)} 收藏`,
        cover: mv?.cover || props.banner?.pic || '',
        shareUrl: buildMvUrl(mv?.id || id),
        mvId: mv?.id || id,
      }
      return
    }

    const external = normalizeUrl(props.banner?.url)
    detailData.value = {
      kind: 'external',
      title: props.banner?.typeTitle || '外部内容',
      subtitle: external ? '将通过系统浏览器打开' : '暂无外部链接',
      desc: '该内容暂不支持站内解析，点击主按钮可尝试打开原始链接。',
      stats: external ? '已检测到可用外链' : '无可用链接',
      cover: props.banner?.pic || '',
      shareUrl: external,
    }
  } catch (error) {
    if (serial !== requestSerial.value) return
    const message = error?.message || '获取详情失败'
    loadError.value = message
    detailData.value = buildFallbackDetail(message)
  } finally {
    if (serial === requestSerial.value) loading.value = false
  }
}

const handlePrimaryAction = async () => {
  const type = resolvedTargetType.value

  if (type === 1) {
    const song = detailData.value?.song
    if (!song) {
      noticeOpen('歌曲信息加载失败', 2)
      return
    }

    if (song.playable === false) {
      noticeOpen(song.reason || '当前歌曲无法播放', 2)
      return
    }

    addToNext(song, true)
    closeModal()
    return
  }

  if (type === 10) {
    if (!resolvedTargetId.value) {
      noticeOpen('专辑信息缺失', 2)
      return
    }
    await openLibraryPage('album', resolvedTargetId.value)
    closeModal()
    return
  }

  if (type === 1000) {
    if (!resolvedTargetId.value) {
      noticeOpen('歌单信息缺失', 2)
      return
    }
    await openLibraryPage('playlist', resolvedTargetId.value)
    closeModal()
    return
  }

  if (type === 1004) {
    const mvId = resolvedTargetId.value || detailData.value?.mvId
    if (!mvId) {
      noticeOpen('MV 信息缺失', 2)
      return
    }
    const success = await otherStore.getMvData(mvId)
    if (success) closeModal()
    return
  }

  const url = shareUrl.value || normalizeUrl(props.banner?.url)
  if (!url) {
    noticeOpen('暂不支持该类型', 2)
    return
  }

  try {
    if (typeof windowApi !== 'undefined' && windowApi?.toRegister) {
      windowApi.toRegister(url)
      closeModal()
      return
    }

    if (typeof window !== 'undefined' && window?.open) {
      window.open(url, '_blank')
      closeModal()
      return
    }
  } catch (_) {
    noticeOpen('打开链接失败', 2)
    return
  }

  noticeOpen('当前环境无法打开外部链接', 2)
}

const copyLink = async () => {
  const link = shareUrl.value
  if (!link) {
    noticeOpen('暂无可复制链接', 2)
    return
  }

  let copied = false
  copied = await copyToClipboard(link)

  if (!copied && typeof windowApi !== 'undefined' && windowApi?.copyTxt) {
    try {
      windowApi.copyTxt(link)
      copied = true
    } catch (_) {
      copied = false
    }
  }

  noticeOpen(copied ? '链接已复制' : '复制失败', 2)
}

watch(
  () => [props.visible, props.banner?.bannerId, props.banner?.targetType, props.banner?.targetId, props.banner?.url],
  ([visible]) => {
    if (!visible) {
      requestSerial.value += 1
      loading.value = false
      loadError.value = ''
      detailData.value = null
      return
    }

    loadDetail()
  },
  { immediate: true }
)

const handleKeydown = event => {
  if (event.key === 'Escape' && props.visible) {
    closeModal()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Transition name="breaking-news-fade">
    <div v-if="visible" class="breaking-news-modal" @click.self="closeModal">
      <div class="breaking-news-panel" role="dialog" aria-modal="true" aria-label="Breaking News Detail">
        <span class="frame-corner frame-tl"></span>
        <span class="frame-corner frame-tr"></span>
        <span class="frame-corner frame-bl"></span>
        <span class="frame-corner frame-br"></span>

        <div class="panel-header">
          <div class="headline">BREAKING NEWS</div>
          <div class="headline-meta">
            <span class="type-chip">{{ displayTypeTitle }}</span>
            <span class="type-mark">{{ targetTypeText }}</span>
          </div>
        </div>

        <div class="panel-content">
          <div class="cover-wrapper">
            <img v-if="coverUrl" :src="coverUrl" alt="Banner Cover" />
            <div v-else class="cover-empty">NO IMAGE</div>
          </div>

          <div class="detail-wrapper">
            <h2 class="detail-title">{{ displayTitle }}</h2>
            <div class="detail-subtitle">{{ displaySubtitle }}</div>
            <p class="detail-desc">{{ displayDesc }}</p>
            <div class="detail-stats" v-if="displayStats">{{ displayStats }}</div>

            <div class="detail-state" v-if="loading">正在加载详情...</div>
            <div class="detail-state detail-state-error" v-else-if="loadError">{{ loadError }}</div>

            <div class="detail-actions">
              <button class="action-btn primary" @click="handlePrimaryAction">{{ primaryActionLabel }}</button>
              <button class="action-btn ghost" @click="copyLink">复制链接</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.breaking-news-modal {
  --bn-mask: rgba(0, 0, 0, 0.62);
  --bn-panel-bg: rgba(242, 246, 248, 0.95);
  --bn-panel-border: rgba(0, 0, 0, 0.28);
  --bn-grid: rgba(0, 0, 0, 0.08);
  --bn-panel-texture: url('../assets/img/halftone.png');
  --bn-panel-texture-size: 160px;
  --bn-panel-overlay: linear-gradient(
    135deg,
    transparent 0%,
    transparent 43%,
    var(--bn-grid) 43%,
    var(--bn-grid) 44%,
    transparent 44%,
    transparent 100%
  );
  --bn-text: #111213;
  --bn-muted: rgba(0, 0, 0, 0.62);
  --bn-desc: rgba(0, 0, 0, 0.78);
  --bn-chip-bg: #111213;
  --bn-chip-text: #ffffff;
  --bn-action-bg: #111213;
  --bn-action-text: #ffffff;
  --bn-action-ghost-bg: rgba(0, 0, 0, 0.06);
  --bn-action-ghost-text: #111213;
  --bn-action-ghost-hover-bg: rgba(0, 0, 0, 0.12);
  --bn-meta-bg: rgba(0, 0, 0, 0.04);
  --bn-cover-border: rgba(0, 0, 0, 0.2);
  --bn-cover-bg: rgba(0, 0, 0, 0.06);
  --bn-scrollbar-thumb: rgba(0, 0, 0, 0.22);
  --bn-error-text: #d4381f;

  position: fixed;
  inset: 0;
  z-index: 1200;
  background: var(--bn-mask);
  backdrop-filter: blur(7px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.breaking-news-panel {
  width: min(940px, calc(100vw - 48px));
  min-height: 520px;
  max-height: calc(100vh - 56px);
  padding: 24px;
  position: relative;
  overflow: hidden;
  background-color: var(--bn-panel-bg);
  background-image: var(--bn-panel-texture);
  background-size: var(--bn-panel-texture-size);
  border: 1px solid var(--bn-panel-border);
  box-shadow: 0 26px 54px rgba(0, 0, 0, 0.35);
}

.breaking-news-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: var(--bn-panel-overlay);
}

.frame-corner {
  width: 10px;
  height: 10px;
  border: 2px solid var(--bn-text);
  position: absolute;
}

.frame-tl {
  top: -1px;
  left: -1px;
  border-right: none;
  border-bottom: none;
}

.frame-tr {
  top: -1px;
  right: -1px;
  border-left: none;
  border-bottom: none;
}

.frame-bl {
  bottom: -1px;
  left: -1px;
  border-right: none;
  border-top: none;
}

.frame-br {
  bottom: -1px;
  right: -1px;
  border-left: none;
  border-top: none;
}

.panel-header {
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 0;
  position: relative;
  z-index: 1;
}

.headline {
  padding: 4px 14px;
  font: 13px Geometos;
  letter-spacing: 1px;
  background: var(--bn-chip-bg);
  color: var(--bn-chip-text) !important;
}

.headline-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-chip,
.type-mark {
  border: 1px solid var(--bn-panel-border);
  font: 11px Bender-Bold;
  letter-spacing: 0.8px;
  color: var(--bn-text) !important;
  background: var(--bn-meta-bg);
}

.type-chip {
  padding: 3px 8px;
}

.type-mark {
  padding: 3px 7px;
}

.panel-content {
  height: calc(100% - 58px);
  min-height: 430px;
  display: flex;
  gap: 18px;
  position: relative;
  z-index: 1;
}

.cover-wrapper {
  width: 42%;
  min-height: 430px;
  border: 1px solid var(--bn-cover-border);
  background: var(--bn-cover-bg);
  overflow: hidden;
}

.cover-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font: 13px Bender-Bold;
  color: var(--bn-muted) !important;
}

.detail-wrapper {
  width: 58%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}

.detail-title {
  margin: 0;
  width: 100%;
  font: 28px SourceHanSansCN-Heavy;
  color: var(--bn-text) !important;
  line-height: 1.25;
  word-break: break-word;
}

.detail-subtitle {
  margin-top: 8px;
  font: 14px Bender-Bold;
  color: var(--bn-muted) !important;
}

.detail-desc {
  margin: 14px 0 0;
  max-height: 160px;
  overflow: auto;
  width: 100%;
  font: 14px SourceHanSansCN-Bold;
  line-height: 1.7;
  color: var(--bn-desc) !important;
  white-space: pre-wrap;
}

.detail-desc::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.detail-desc::-webkit-scrollbar-thumb {
  background: var(--bn-scrollbar-thumb);
}

.detail-stats {
  margin-top: 10px;
  font: 12px Bender-Bold;
  color: var(--bn-muted) !important;
}

.detail-state {
  margin-top: 10px;
  font: 12px SourceHanSansCN-Bold;
  color: var(--bn-muted) !important;
}

.detail-state-error {
  color: var(--bn-error-text) !important;
}

.detail-actions {
  margin-top: auto;
  width: 100%;
  display: flex;
  gap: 10px;
  padding-top: 18px;
}

.action-btn {
  min-width: 128px;
  height: 36px;
  border: 1px solid var(--bn-panel-border);
  font: 13px Bender-Bold;
  letter-spacing: 0.6px;
  transition: 0.2s;
  outline: none !important;
  box-shadow: none !important;
  -webkit-appearance: none;
  appearance: none;
  -webkit-tap-highlight-color: transparent;
}

.action-btn:focus,
.action-btn:focus-visible,
.action-btn:active {
  outline: none !important;
  box-shadow: none !important;
}

.action-btn:hover {
  cursor: pointer;
  transform: translateY(-1px);
}

.action-btn.primary {
  background: var(--bn-action-bg) !important;
  color: var(--bn-action-text) !important;
}

.action-btn.primary:hover {
  opacity: 0.88;
}

.action-btn.ghost {
  background: var(--bn-action-ghost-bg) !important;
  color: var(--bn-action-ghost-text) !important;
}

.action-btn.ghost:hover {
  background: var(--bn-action-ghost-hover-bg) !important;
}

.breaking-news-fade-enter-active,
.breaking-news-fade-leave-active {
  transition: opacity 0.2s;
}

.breaking-news-fade-enter-from,
.breaking-news-fade-leave-to {
  opacity: 0;
}

@media (max-width: 980px) {
  .breaking-news-panel {
    width: calc(100vw - 32px);
    min-height: 0;
    max-height: calc(100vh - 32px);
    padding: 18px;
  }

  .panel-content {
    min-height: 0;
    flex-direction: column;
    height: auto;
  }

  .cover-wrapper,
  .detail-wrapper {
    width: 100%;
  }

  .cover-wrapper {
    min-height: 210px;
    max-height: 240px;
  }

  .detail-title {
    font-size: 22px;
  }

  .detail-actions {
    margin-top: 16px;
    padding-top: 10px;
  }
}
</style>

<style lang="scss">
html.dark .breaking-news-modal,
.dark .breaking-news-modal {
  --bn-mask: rgba(5, 8, 10, 0.72);
  --bn-panel-bg: rgba(35, 41, 48, 0.94);
  --bn-panel-border: rgba(255, 255, 255, 0.22);
  --bn-grid: rgba(255, 255, 255, 0.05);
  --bn-panel-texture: none;
  --bn-panel-texture-size: 160px;
  --bn-panel-overlay: linear-gradient(
    135deg,
    transparent 0%,
    transparent 43%,
    var(--bn-grid) 43%,
    var(--bn-grid) 44%,
    transparent 44%,
    transparent 100%
  );
  --bn-text: #f1f3f5;
  --bn-muted: rgba(241, 243, 245, 0.78);
  --bn-desc: rgba(241, 243, 245, 0.9);
  --bn-chip-bg: #f1f3f5;
  --bn-chip-text: #0f1114;
  --bn-action-bg: #f1f3f5;
  --bn-action-text: #0f1114;
  --bn-action-ghost-bg: rgba(255, 255, 255, 0.08);
  --bn-action-ghost-hover-bg: rgba(255, 255, 255, 0.14);
  --bn-action-ghost-text: #f1f3f5;
  --bn-meta-bg: rgba(255, 255, 255, 0.1);
  --bn-cover-border: rgba(255, 255, 255, 0.22);
  --bn-cover-bg: rgba(255, 255, 255, 0.08);
  --bn-scrollbar-thumb: rgba(255, 255, 255, 0.28);
  --bn-error-text: #ff7a66;
}
</style>
