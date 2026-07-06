<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { getLyricByCandidate, searchLyricCandidates } from '../api/song'
import { usePlayerStore } from '../store/playerStore'
import { noticeOpen } from '../utils/dialog'
import { getSongDisplayName } from '../utils/songName'
import Lyric from './Lyric.vue'

const playerStore = usePlayerStore()
const { currentIndex, lyricShow, showSongTranslation, songId, songList } = storeToRefs(playerStore)

const candidates = ref([])
const activeIndex = ref(-1)
const loadingSearch = ref(false)
const loadingLyric = ref(false)
const errorText = ref('')
const lyricCache = new Map()
let searchSerial = 0
let lyricSerial = 0

const currentSong = computed(() => {
    const list = Array.isArray(songList.value) ? songList.value : []
    const index = Number.isInteger(currentIndex.value) ? currentIndex.value : -1
    return index >= 0 && index < list.length ? list[index] : null
})

const canSearchLyrics = computed(() => {
    const song = currentSong.value
    return !!song && song.type !== 'local' && song.source !== 'siren'
})

const searchTargetKey = computed(() => {
    const song = currentSong.value
    if (!song || !canSearchLyrics.value) return ''
    return [
        songId.value,
        currentIndex.value,
        song.hash || '',
        song.album_audio_id || song.mixsongid || song.mixsong_id || '',
        song.name || song.songname || song.filename || '',
        song.dt || song.duration || song.timelength || '',
    ].join('|')
})

const activeCandidate = computed(() => candidates.value[activeIndex.value] || null)
const activeCandidateKey = computed(() => {
    const item = activeCandidate.value
    return item ? `${activeIndex.value}-${item.id}-${item.accesskey}` : 'none'
})

const pageText = computed(() => {
    if (!candidates.value.length || activeIndex.value < 0) return '--/--'
    return `${activeIndex.value + 1}/${candidates.value.length}`
})

const candidateTitle = computed(() => {
    const item = activeCandidate.value || {}
    return item.song || item.songname || item.filename || getSongDisplayName(currentSong.value, 'LYRIC', showSongTranslation.value)
})

const candidateSubtitle = computed(() => {
    const item = activeCandidate.value || {}
    const singer = item.singer || item.singername || item.author || item.nickname || ''
    const duration = formatCandidateDuration(item.duration || item.duration_ms || item.timelength)
    return [singer, duration].filter(Boolean).join(' / ')
})

function formatCandidateDuration(value) {
    const raw = Number(value)
    if (!Number.isFinite(raw) || raw <= 0) return ''
    const seconds = Math.floor(raw > 1000 ? raw / 1000 : raw)
    const minutes = Math.floor(seconds / 60)
    const rest = String(seconds % 60).padStart(2, '0')
    return `${minutes}:${rest}`
}

function getCandidateCacheKey(item) {
    return item ? `${item.id}:${item.accesskey}` : ''
}

async function applyCandidate(index) {
    const item = candidates.value[index]
    if (!item || loadingLyric.value) return

    const cacheKey = getCandidateCacheKey(item)
    const cachedLyric = lyricCache.get(cacheKey)
    if (cachedLyric) {
        playerStore.lyric = cachedLyric
        activeIndex.value = index
        lyricShow.value = true
        return
    }

    const serial = ++lyricSerial
    loadingLyric.value = true
    errorText.value = ''

    try {
        const lyric = await getLyricByCandidate(item)
        if (serial !== lyricSerial) return
        lyricCache.set(cacheKey, lyric)
        playerStore.lyric = lyric
        activeIndex.value = index
        lyricShow.value = true
    } catch (error) {
        if (serial !== lyricSerial) return
        console.error('加载候选歌词失败:', error)
        errorText.value = '歌词加载失败'
        noticeOpen('歌词加载失败', 2)
    } finally {
        if (serial === lyricSerial) loadingLyric.value = false
    }
}

async function fetchCandidates() {
    const serial = ++searchSerial
    lyricSerial += 1
    candidates.value = []
    activeIndex.value = -1
    errorText.value = ''
    lyricCache.clear()

    if (!canSearchLyrics.value) {
        errorText.value = '暂无可用歌词'
        return
    }

    loadingSearch.value = true
    loadingLyric.value = false

    try {
        const result = await searchLyricCandidates(currentSong.value, { man: 'yes' })
        if (serial !== searchSerial) return
        candidates.value = result
        if (!result.length) {
            errorText.value = '暂无可用歌词'
            return
        }
        await applyCandidate(0)
    } catch (error) {
        if (serial !== searchSerial) return
        console.error('搜索歌词候选失败:', error)
        errorText.value = '歌词搜索失败'
        noticeOpen('歌词搜索失败', 2)
    } finally {
        if (serial === searchSerial) loadingSearch.value = false
    }
}

function showPrevious() {
    if (activeIndex.value <= 0) return
    void applyCandidate(activeIndex.value - 1)
}

function showNext() {
    if (activeIndex.value < 0 || activeIndex.value >= candidates.value.length - 1) return
    void applyCandidate(activeIndex.value + 1)
}

watch(searchTargetKey, fetchCandidates, { immediate: true })

onUnmounted(() => {
    searchSerial += 1
    lyricSerial += 1
})
</script>

<template>
    <div class="lyric-selector">
        <div class="selector-toolbar">
            <div class="candidate-info" v-if="activeCandidate">
                <span class="candidate-title">{{ candidateTitle }}</span>
                <span class="candidate-subtitle" v-if="candidateSubtitle">{{ candidateSubtitle }}</span>
            </div>
            <div class="pager">
                <button type="button" class="pager-button" :disabled="loadingSearch || loadingLyric || activeIndex <= 0" @click="showPrevious" aria-label="上一条歌词">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path d="M15.5 5 8.5 12l7 7" />
                    </svg>
                </button>
                <span class="pager-count">{{ loadingSearch ? '...' : pageText }}</span>
                <button type="button" class="pager-button" :disabled="loadingSearch || loadingLyric || activeIndex < 0 || activeIndex >= candidates.length - 1" @click="showNext" aria-label="下一条歌词">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path d="m8.5 5 7 7-7 7" />
                    </svg>
                </button>
            </div>
        </div>

        <Transition name="panel-switch" mode="out-in">
            <Lyric v-if="activeIndex >= 0" :key="activeCandidateKey" class="selector-lyric"></Lyric>
            <div v-else class="selector-status" key="selector-status">
                <div class="status-line"></div>
                <span>{{ loadingSearch ? 'LOADING LYRICS' : errorText }}</span>
                <div class="status-line"></div>
            </div>
        </Transition>

        <div v-if="loadingLyric" class="selector-loading-bar"></div>
    </div>
</template>

<style scoped lang="scss">
.lyric-selector {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
}

.selector-toolbar {
    position: absolute;
    top: 1.2vh;
    right: 1.4vh;
    left: 1.4vh;
    z-index: 5;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    gap: 14px;
    pointer-events: none;
}

.candidate-info {
    min-width: 0;
    max-width: calc(100% - 120px);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    opacity: 0.66;
    pointer-events: none;

    .candidate-title,
    .candidate-subtitle {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: rgba(0, 0, 0, 0.78);
        text-align: right;
    }

    .candidate-title {
        font: 12px SourceHanSansCN-Bold;
        font-weight: bold;
    }

    .candidate-subtitle {
        font: 10px Bender-Bold;
        letter-spacing: 0;
    }
}

.pager {
    height: 30px;
    display: flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.36);
    border: 1px solid rgba(0, 0, 0, 0.18);
    pointer-events: auto;
}

.pager-button {
    width: 30px;
    height: 28px;
    border: none;
    padding: 0;
    background: transparent;
    color: rgba(0, 0, 0, 0.78);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: 0.2s;

    svg {
        fill: none;
        stroke: currentColor;
        stroke-width: 2.4;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    &:hover:not(:disabled) {
        background: rgba(0, 0, 0, 0.08);
    }

    &:active:not(:disabled) {
        transform: scale(0.92);
    }

    &:disabled {
        opacity: 0.28;
        cursor: not-allowed;
    }
}

.pager-count {
    min-width: 42px;
    color: rgba(0, 0, 0, 0.78);
    font: 11px Bender-Bold;
    letter-spacing: 0;
    text-align: center;
}

.selector-lyric {
    width: 100%;
    height: 100%;
}

.selector-status {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;

    span {
        color: rgba(0, 0, 0, 0.58);
        font: 13px Bender-Bold;
        letter-spacing: 0;
        white-space: nowrap;
    }

    .status-line {
        width: 12%;
        height: 1px;
        background: rgba(0, 0, 0, 0.32);
    }
}

.selector-loading-bar {
    position: absolute;
    right: 1.4vh;
    top: calc(1.2vh + 32px);
    z-index: 6;
    width: 86px;
    height: 2px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.12);

    &::after {
        content: '';
        display: block;
        width: 40%;
        height: 100%;
        background: rgba(0, 0, 0, 0.72);
        animation: selector-loading 0.9s ease-in-out infinite;
    }
}

@keyframes selector-loading {
    0% {
        transform: translateX(-110%);
    }
    100% {
        transform: translateX(260%);
    }
}

.panel-switch-enter-active {
    transition: all 0.4s cubic-bezier(0.4, 0, 0.12, 1);
}
.panel-switch-leave-active {
    transition: all 0.3s cubic-bezier(0.3, 0.79, 0.55, 0.99);
}
.panel-switch-enter-from {
    opacity: 0;
    transform: translateX(30px) scale(0.95);
}
.panel-switch-leave-to {
    opacity: 0;
    transform: translateX(-30px) scale(0.95);
}
</style>
