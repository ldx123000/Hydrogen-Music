<template>
    <div class="personal-fm">
        <div class="fm-stage">
            <div class="fm-panel" :class="{ 'fm-panel-intro-active': isPanelIntroActive, 'fm-panel-outline-ready': isPanelOutlineReady }">
                <span class="frame-corner frame-tl"></span>
                <span class="frame-corner frame-tr"></span>
                <span class="frame-corner frame-bl"></span>
                <span class="frame-corner frame-br"></span>
                <div class="fm-outline-draw" aria-hidden="true">
                    <span class="outline-seg top"></span>
                    <span class="outline-seg right"></span>
                    <span class="outline-seg bottom"></span>
                    <span class="outline-seg left"></span>
                </div>
                <div class="fm-mode-floating" ref="modePanelRef" :class="{ open: modePanelOpen }">
                    <button class="fm-mode-trigger" :disabled="loading || modeSwitching" @click.stop="toggleModePanel">
                        <span class="mode-trigger-code">MODE</span>
                        <span class="mode-trigger-value">{{ selectedFmModeSummary }}</span>
                        <svg class="mode-trigger-arrow" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M7 10l5 5 5-5z" />
                        </svg>
                    </button>
                    <Transition name="fm-mode-float">
                        <div v-if="modePanelOpen" class="fm-mode-dropdown" role="group" aria-label="私人漫游模式" @click.stop>
                            <div class="fm-mode-title">
                                <span class="fm-mode-title-code">MODE SELECT</span>
                                <span class="fm-mode-title-text">{{ selectedFmModeSummary }}</span>
                            </div>
                            <div class="fm-mode-grid">
                                <button
                                    v-for="mode in FM_MODE_OPTIONS"
                                    :key="mode.value"
                                    class="fm-mode-btn"
                                    :class="{ active: selectedFmMode === mode.value }"
                                    :disabled="loading || modeSwitching"
                                    @click="changeFmMode(mode.value)"
                                >
                                    <span class="mode-code">{{ mode.value }}</span>
                                    <span class="mode-label">{{ mode.label }}</span>
                                </button>
                            </div>
                            <div v-if="selectedFmMode === 'SCENE_RCMD'" class="fm-submode-grid">
                                <button
                                    v-for="scene in FM_SCENE_SUBMODE_OPTIONS"
                                    :key="scene.value"
                                    class="fm-submode-btn"
                                    :class="{ active: selectedFmSubmode === scene.value }"
                                    :disabled="loading || modeSwitching"
                                    @click="changeFmSubmode(scene.value)"
                                >
                                    <span class="mode-code">{{ scene.value }}</span>
                                    <span class="mode-label">{{ scene.label }}</span>
                                </button>
                            </div>
                        </div>
                    </Transition>
                </div>

                <div class="fm-header">
                    <div class="fm-headline">PERSONAL FM</div>
                    <h1>私人漫游</h1>
                    <span class="fm-subtitle">根据你的音乐喜好为你推荐</span>
                </div>

                <div class="fm-content" v-if="currentSong && !loading">
                    <div class="fm-main">
                        <div class="fm-cover-carousel">
                            <TransitionGroup :name="coverTransitionName" :css="!modeSwitching" tag="div" class="fm-cover-track">
                                <div
                                    v-for="item in coverTrackItems"
                                    :key="item.key"
                                    class="fm-cover-slot"
                                    :class="[
                                        `slot-${item.role}`,
                                        {
                                            'slot-center': item.role === 'center',
                                            'slot-side': item.role !== 'center',
                                            'slot-placeholder': item.isPlaceholder,
                                            'slot-clickable': item.clickable,
                                        },
                                    ]"
                                    @click="handleCoverSlotClick(item)"
                                >
                                    <template v-if="item.song && !item.isPlaceholder">
                                        <img :src="item.song.album?.picUrl || '/src/assets/default-cover.png'" :alt="item.song.name || 'FM Cover'" />
                                        <div v-if="item.role === 'center'" class="fm-play-overlay">
                                            <svg v-if="!isPlaying" width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M8 5v14l11-7z" />
                                            </svg>
                                            <svg v-else width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                            </svg>
                                        </div>
                                        <div v-else class="slot-side-overlay"></div>
                                    </template>
                                    <template v-else>
                                        <div class="slot-placeholder-text">{{ item.placeholderText }}</div>
                                    </template>
                                </div>
                            </TransitionGroup>
                        </div>

                        <div class="fm-info">
                            <h2 class="song-name">{{ getSongDisplayName(currentSong, '', showSongTranslation) }}</h2>
                            <p class="artist-name">{{ currentSong.artists?.map(a => a.name).join(' / ') }}</p>
                            <p class="album-name">{{ currentSong.album?.name }}</p>
                        </div>
                    </div>

                    <div class="fm-actions">
                        <div class="action-btn prev" @click="goPrev" title="上一首">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                            </svg>
                        </div>

                        <div class="action-btn trash" @click="trashSong" title="不喜欢">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                            </svg>
                        </div>

                        <div class="action-btn like" @click="likeSong" :class="{ active: isCurrentSongLiked }" title="喜欢">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path
                                    d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                                />
                            </svg>
                        </div>

                        <div class="action-btn next" @click="goNext" title="下一首">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div class="fm-loading" v-else-if="loading">
                    <div class="loading-spinner"></div>
                    <p>正在为你准备音乐...</p>
                </div>

                <div class="fm-empty" v-else>
                    <div class="empty-icon">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                        </svg>
                    </div>
                    <p>无法加载漫游歌曲</p>
                    <p class="error-hint">请检查网络连接或稍后重试</p>
                    <div class="refresh-button" @click="refreshFM()">重试</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, onActivated, onDeactivated, computed, watch } from 'vue'
import { getPersonalFM, getPersonalFMByMode, fmTrash, getLyric, likeMusic } from '../api/song'
import { getRecommendSongs } from '../api/playlist'
import { usePlayerStore } from '../store/playerStore'
import { useUserStore } from '../store/userStore'
import { useLibraryStore } from '../store/libraryStore'
import { mapSongsPlayableStatus } from '../utils/songStatus'
import { play, getFavoritePlaylistId, setSongLevel } from '../utils/player'
import { updatePlaylist } from '../api/playlist'
import { getLikelist } from '../api/user'
import { storeToRefs } from 'pinia'
import { getPreferredQuality } from '../utils/quality'
import { resolveTrackByQualityPreference } from '../utils/musicUrlResolver'
import { getSongDisplayName } from '../utils/songName'

const playerStore = usePlayerStore()
const userStore = useUserStore()
const libraryStore = useLibraryStore()
const { songId, playing, quality, showSongTranslation } = storeToRefs(playerStore)
const { likelist } = storeToRefs(userStore)

// 创建一个计算属性来实时判断当前歌曲是否被喜欢
const isCurrentSongLiked = computed(() => {
    if (!currentSong.value || !likelist.value) {
        return false
    }
    return likelist.value.includes(currentSong.value.id)
})

const fmSongs = ref([])
const playedSongs = ref([]) // 已播放的歌曲历史（用于前后切换浏览）
// 去重与“近期不重复”控制
const fmPoolIds = new Set() // 当前候选池中的歌曲ID，避免同一池内重复（仅内存，用于本次池）
const recentPlayedSet = new Set() // 近期播放过的歌曲集合（窗口集合）
const recentPlayedQueue = [] // 维护顺序的队列，配合 recentPlayedSet 形成滑动窗口
const RECENT_WINDOW = 300 // 近期去重窗口大小，避免短期内重复
const FM_REFRESH_SOURCE = Object.freeze({
    PERSONAL_FM: 'personal_fm',
    FM_MODE_RESCUE: 'fm_mode_rescue',
    DAILY_RECOMMEND: 'daily_recommend',
})
const FM_MODE_RESCUE_OPTIONS = Object.freeze({ mode: 'EXPLORE', limit: 6 })
const DEFAULT_FM_MODE = 'DEFAULT'
const DEFAULT_SCENE_SUBMODE = 'FOCUS'
const FM_MODE_REQUEST_LIMIT = 6
const FM_MODE_OPTIONS = Object.freeze([
    { value: 'DEFAULT', label: '默认推荐' },
    { value: 'FAMILIAR', label: '熟悉偏好' },
    { value: 'EXPLORE', label: '探索发现' },
    { value: 'SCENE_RCMD', label: '场景推荐' },
    { value: 'aidj', label: 'AI DJ' },
])
const FM_SCENE_SUBMODE_OPTIONS = Object.freeze([
    { value: 'EXERCISE', label: '运动' },
    { value: 'FOCUS', label: '专注' },
    { value: 'NIGHT_EMO', label: '夜晚情绪' },
])
const lastRefreshSource = ref(FM_REFRESH_SOURCE.PERSONAL_FM)
const selectedFmMode = ref(DEFAULT_FM_MODE)
const selectedFmSubmode = ref(DEFAULT_SCENE_SUBMODE)
const modeSwitching = ref(false)
const modePanelOpen = ref(false)
const modePanelRef = ref(null)
const awaitingSceneSubmodePick = ref(false)

// 仅持久化“近期去重队列”（按账号隔离）
function getRecentQueueKey() {
    const uid = userStore?.user?.userId || 'guest'
    return `hm.fm.recentPlayedQueue:${uid}`
}

function safeParseArray(raw) {
    try {
        const arr = JSON.parse(raw)
        return Array.isArray(arr) ? arr : []
    } catch (_) {
        return []
    }
}

function normalizeSongId(id) {
    if (id === null || id === undefined || id === '') return null
    return String(id)
}

function loadPersistentRecent() {
    // 清空并加载“近期播放队列”（按账号隔离）
    recentPlayedQueue.length = 0
    recentPlayedSet.clear()
    const recentArr = safeParseArray(localStorage.getItem(getRecentQueueKey()))
    for (const rawId of recentArr) {
        const id = normalizeSongId(rawId)
        if (!id) continue
        recentPlayedQueue.push(id)
        recentPlayedSet.add(id)
    }
}

function persistRecent() {
    // 将近期播放队列持久化（用于跨会话恢复“近期不重复”）
    try {
        localStorage.setItem(getRecentQueueKey(), JSON.stringify(recentPlayedQueue))
    } catch (e) {
        console.warn('Persist recent FM queue failed:', e)
    }
}

function rememberRecent(id) {
    const normalizedId = normalizeSongId(id)
    if (!normalizedId) return
    const existingIndex = recentPlayedQueue.indexOf(normalizedId)
    if (existingIndex !== -1) {
        recentPlayedQueue.splice(existingIndex, 1)
    }
    recentPlayedQueue.push(normalizedId)
    recentPlayedSet.add(normalizedId)
    // 控制窗口大小，超过阈值就移除最早的一首
    if (recentPlayedQueue.length > RECENT_WINDOW) {
        const old = recentPlayedQueue.shift()
        if (old && !recentPlayedQueue.includes(old)) {
            recentPlayedSet.delete(old)
        }
    }
    // 持久化近期队列（账号隔离）
    persistRecent()
}

function addToFmPoolUnique(songs, source = FM_REFRESH_SOURCE.PERSONAL_FM) {
    if (!Array.isArray(songs) || songs.length === 0) {
        const emptyStats = {
            source,
            input: 0,
            added: 0,
            filteredByRecent: 0,
            filteredByPool: 0,
            invalid: 0,
            poolBefore: fmSongs.value.length,
            poolAfter: fmSongs.value.length,
        }
        console.log('[FM Dedup]', emptyStats)
        return emptyStats
    }
    const before = fmSongs.value.length
    const deduped = []
    let filteredByRecent = 0
    let filteredByPool = 0
    let invalid = 0
    for (const s of songs) {
        const id = normalizeSongId(s && (s.id || s.songId || s.trackId))
        if (!id) {
            invalid++
            continue
        }
        // 过滤：近期播放过、池中已有 → 不再加入
        if (recentPlayedSet.has(id)) {
            filteredByRecent++
            continue
        }
        if (fmPoolIds.has(id)) {
            filteredByPool++
            continue
        }
        fmPoolIds.add(id)
        deduped.push(s)
    }
    if (deduped.length) fmSongs.value.push(...deduped)
    const stats = {
        source,
        input: songs.length,
        added: deduped.length,
        filteredByRecent,
        filteredByPool,
        invalid,
        poolBefore: before,
        poolAfter: fmSongs.value.length,
    }
    console.log('[FM Dedup]', stats)
    return stats
}

function takeNextFromPool() {
    while (fmSongs.value.length > 0) {
        const s = fmSongs.value.shift()
        const id = normalizeSongId(s && (s.id || s.songId || s.trackId))
        if (id) fmPoolIds.delete(id)
        // 若近期播放过，则跳过，继续取下一首
        if (id && recentPlayedSet.has(id)) continue
        return s || null
    }
    return null
}

function bootstrapFromPoolIfNeeded(source) {
    if (playedSongs.value.length !== 0 || fmSongs.value.length === 0) return false
    const firstSong = takeNextFromPool()
    if (!firstSong) return false
    playedSongs.value.push(firstSong)
    rememberRecent(firstSong.id)
    currentIndex.value = 0
    console.log(`[FM] Started with first ${source} song:`, firstSong.name)
    return true
}
const currentIndex = ref(0)
const loading = ref(false)
const isPrefetching = ref(false)
const isPanelIntroActive = ref(false)
const isPanelOutlineReady = ref(false)
const coverNavigating = ref(false)
const coverTransitionDirection = ref('neutral')
const queuedDirection = ref(null)
const COVER_TRANSITION_FALLBACK_MS = 2500
const COVER_RELEASE_RATIO_FALLBACK = 0.45
const COVER_RELEASE_MIN_MS = 180
const COVER_RELEASE_BUFFER_MS = 16
const PANEL_INTRO_DURATION_MS = 1500
const PANEL_INTRO_BUFFER_MS = 40
let coverReleaseTimer = null
let panelIntroTimer = null
let panelIntroFrame = null
let skipIntroOnNextActivated = true

const currentSong = computed(() => {
    // 先从已播放历史中查找
    if (currentIndex.value < playedSongs.value.length) {
        return playedSongs.value[currentIndex.value] || null
    }
    return null
})

const isPlaying = computed(() => {
    return playing.value && songId.value === currentSong.value?.id
})

const prevCandidateSong = computed(() => {
    if (currentIndex.value > 0) {
        return playedSongs.value[currentIndex.value - 1] || null
    }
    return null
})

const nextCandidateSong = computed(() => {
    const historyCandidate = playedSongs.value[currentIndex.value + 1]
    if (historyCandidate) return historyCandidate
    return fmSongs.value[0] || null
})

const rightPlaceholderText = computed(() => {
    return isPrefetching.value ? 'NEXT LOADING' : 'NO NEXT'
})

const activeFmModeOption = computed(() => {
    return FM_MODE_OPTIONS.find(mode => mode.value === selectedFmMode.value) || FM_MODE_OPTIONS[0]
})

const activeFmSubmodeOption = computed(() => {
    return FM_SCENE_SUBMODE_OPTIONS.find(scene => scene.value === selectedFmSubmode.value) || FM_SCENE_SUBMODE_OPTIONS[1]
})

const selectedFmModeSummary = computed(() => {
    if (selectedFmMode.value === 'SCENE_RCMD') {
        return `${activeFmModeOption.value.label} · ${activeFmSubmodeOption.value.label}`
    }
    return activeFmModeOption.value.label
})

const isDefaultFmModeSelected = computed(() => selectedFmMode.value === DEFAULT_FM_MODE)

function buildSelectedModeRequest(limit = FM_MODE_REQUEST_LIMIT) {
    if (isDefaultFmModeSelected.value) return null
    const params = {
        mode: selectedFmMode.value,
        limit,
    }
    if (selectedFmMode.value === 'SCENE_RCMD') {
        params.submode = selectedFmSubmode.value
    }
    return params
}

function trimFmCandidatesForModeSwitch() {
    fmSongs.value = []
    fmPoolIds.clear()
    if (!playedSongs.value.length) {
        currentIndex.value = 0
        return
    }
    const keepUntil = Math.max(0, Math.min(currentIndex.value, playedSongs.value.length - 1))
    playedSongs.value = playedSongs.value.slice(0, keepUntil + 1)
    currentIndex.value = keepUntil
}

const refreshBySelectedMode = async () => {
    if (modeSwitching.value) return
    modeSwitching.value = true
    try {
        trimFmCandidatesForModeSwitch()
        await refreshFM({ silent: !!currentSong.value })
    } finally {
        modeSwitching.value = false
    }
}

const changeFmMode = async mode => {
    if (!mode || modeSwitching.value || loading.value) return
    if (selectedFmMode.value === mode) return
    selectedFmMode.value = mode
    if (mode === 'SCENE_RCMD') {
        // 场景模式需二次选择子场景：保持面板展开，等待用户点 EXERCISE/FOCUS/NIGHT_EMO
        awaitingSceneSubmodePick.value = true
        modePanelOpen.value = true
        return
    }
    awaitingSceneSubmodePick.value = false
    selectedFmSubmode.value = DEFAULT_SCENE_SUBMODE
    modePanelOpen.value = false
    await refreshBySelectedMode()
}

const changeFmSubmode = async submode => {
    if (!submode || modeSwitching.value || loading.value) return
    if (selectedFmMode.value !== 'SCENE_RCMD') return
    if (selectedFmSubmode.value === submode && !awaitingSceneSubmodePick.value) return
    selectedFmSubmode.value = submode
    awaitingSceneSubmodePick.value = false
    modePanelOpen.value = false
    await refreshBySelectedMode()
}

const toggleModePanel = () => {
    if (loading.value || modeSwitching.value) return
    modePanelOpen.value = !modePanelOpen.value
}

const handleModePanelClickOutside = event => {
    if (!modePanelOpen.value) return
    const host = modePanelRef.value
    if (!host || host.contains(event.target)) return
    modePanelOpen.value = false
}

const coverTrackItems = computed(() => {
    const currentId = currentSong.value?.id || 'none'
    const leftItem = prevCandidateSong.value
        ? {
              key: `song-${prevCandidateSong.value.id}`,
              role: 'left',
              song: prevCandidateSong.value,
              isPlaceholder: false,
              placeholderText: '',
              clickable: true,
          }
        : {
              key: `placeholder-left-${currentId}`,
              role: 'left',
              song: null,
              isPlaceholder: true,
              placeholderText: 'NO PREV',
              clickable: false,
          }

    const centerItem = {
        key: `song-${currentSong.value?.id || 'center'}`,
        role: 'center',
        song: currentSong.value,
        isPlaceholder: false,
        placeholderText: '',
        clickable: true,
    }

    const rightItem = nextCandidateSong.value
        ? {
              key: `song-${nextCandidateSong.value.id}`,
              role: 'right',
              song: nextCandidateSong.value,
              isPlaceholder: false,
              placeholderText: '',
              clickable: true,
          }
        : {
              key: `placeholder-right-${currentId}`,
              role: 'right',
              song: null,
              isPlaceholder: true,
              placeholderText: rightPlaceholderText.value,
              clickable: false,
          }

    return [leftItem, centerItem, rightItem]
})

const coverTransitionName = computed(() => {
    if (coverTransitionDirection.value === 'next') return 'fm-shift-next'
    if (coverTransitionDirection.value === 'prev') return 'fm-shift-prev'
    return 'fm-shift-neutral'
})

const setCoverTransitionDirection = direction => {
    coverTransitionDirection.value = direction
}

const parseDurationToMs = rawValue => {
    if (!rawValue) return NaN
    const value = rawValue.trim()
    if (!value) return NaN
    if (value.endsWith('ms')) return Number.parseFloat(value)
    if (value.endsWith('s')) return Number.parseFloat(value) * 1000
    return Number.parseFloat(value)
}

const getCoverTransitionDurationMs = () => {
    if (typeof window === 'undefined') return COVER_TRANSITION_FALLBACK_MS
    const host = document.querySelector('.personal-fm')
    const durationValue = host ? window.getComputedStyle(host).getPropertyValue('--fm-cover-transition-duration') : ''
    const durationMs = parseDurationToMs(durationValue)
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return COVER_TRANSITION_FALLBACK_MS
    }
    return durationMs
}

const getCoverReleaseDelayMs = () => {
    const transitionDurationMs = getCoverTransitionDurationMs()
    if (typeof window === 'undefined') return transitionDurationMs

    const host = document.querySelector('.personal-fm')
    const ratioValue = host ? window.getComputedStyle(host).getPropertyValue('--fm-cover-overlap-release-ratio') : ''
    const ratio = Number.parseFloat((ratioValue || '').trim())
    const safeRatio = Number.isFinite(ratio) && ratio > 0 && ratio <= 1 ? ratio : COVER_RELEASE_RATIO_FALLBACK
    const ratioDelay = transitionDurationMs * safeRatio

    return Math.max(COVER_RELEASE_MIN_MS, Math.min(transitionDurationMs, ratioDelay))
}

const queueCoverDirection = direction => {
    queuedDirection.value = direction
}

const clearCoverReleaseTimer = () => {
    if (coverReleaseTimer) {
        clearTimeout(coverReleaseTimer)
        coverReleaseTimer = null
    }
}

const clearPanelIntroSchedule = () => {
    if (panelIntroFrame !== null) {
        cancelAnimationFrame(panelIntroFrame)
        panelIntroFrame = null
    }
    if (panelIntroTimer) {
        clearTimeout(panelIntroTimer)
        panelIntroTimer = null
    }
}

const startPanelIntro = () => {
    if (typeof window === 'undefined') return

    clearPanelIntroSchedule()
    isPanelIntroActive.value = false
    isPanelOutlineReady.value = false

    panelIntroFrame = requestAnimationFrame(() => {
        panelIntroFrame = null
        isPanelIntroActive.value = true
        panelIntroTimer = window.setTimeout(() => {
            isPanelOutlineReady.value = true
            isPanelIntroActive.value = false
            panelIntroTimer = null
        }, PANEL_INTRO_DURATION_MS + PANEL_INTRO_BUFFER_MS)
    })
}

const releaseCoverNavigation = async () => {
    coverNavigating.value = false
    setCoverTransitionDirection('neutral')

    if (!queuedDirection.value) return

    const nextDirection = queuedDirection.value
    queuedDirection.value = null

    if (nextDirection === 'next') {
        await goNext()
        return
    }
    await goPrev()
}

const scheduleCoverRelease = () => {
    clearCoverReleaseTimer()

    if (typeof window === 'undefined') {
        void releaseCoverNavigation()
        return
    }

    const releaseDelay = getCoverReleaseDelayMs() + COVER_RELEASE_BUFFER_MS
    coverReleaseTimer = window.setTimeout(() => {
        coverReleaseTimer = null
        void releaseCoverNavigation()
    }, releaseDelay)
}

const togglePlay = async () => {
    console.log('togglePlay clicked!')
    console.log('currentSong:', currentSong.value)

    if (!currentSong.value) {
        console.log('No current song available')
        return
    }

    // 如果当前歌曲已经在播放，只需要切换播放状态
    if (songId.value === currentSong.value.id && playerStore.currentMusic) {
        if (playing.value) {
            console.log('Pausing current FM song')
            playerStore.currentMusic.pause()
        } else {
            console.log('Resuming current FM song')
            playerStore.currentMusic.play()
        }
        return
    }

    // 播放新的FM歌曲
    console.log('Playing new FM song:', currentSong.value.name)

    try {
        // 获取歌曲URL
        console.log('Getting music URL for:', currentSong.value.id)
        const preferredQuality = getPreferredQuality(quality.value)
        const trackInfo = await resolveTrackByQualityPreference(currentSong.value.id, preferredQuality)
        console.log('Music URL response:', trackInfo)
        if (trackInfo && trackInfo.url) {
            const musicUrl = trackInfo.url
            console.log('Playing music from URL:', musicUrl)

            // 创建一个临时的单曲列表用于FM播放（不影响用户的真实播放列表）
            const fmSongList = [
                {
                    id: currentSong.value.id,
                    name: currentSong.value.name,
                    tns: currentSong.value.tns || currentSong.value.song?.tns || [],
                    transNames: currentSong.value.transNames || currentSong.value.song?.transNames || [],
                    ar: currentSong.value.artists || [],
                    al: currentSong.value.album || {},
                    dt: currentSong.value.dt || currentSong.value.duration || 0,
                    duration: currentSong.value.dt || currentSong.value.duration || 0,
                    type: 'fm',
                },
            ]

            // 设置播放器状态
            playerStore.songId = currentSong.value.id
            playerStore.currentIndex = 0
            playerStore.songList = fmSongList
            playerStore.listInfo = {
                id: 'personalfm',
                type: 'personalfm',
                name: '私人漫游',
            }
            setSongLevel(trackInfo.level, trackInfo)

            // 直接播放音乐
            play(musicUrl, true)

            // 获取歌词
            try {
                const lyricResponse = await getLyric(currentSong.value.id)
                if (lyricResponse && lyricResponse.lrc) {
                    playerStore.lyric = lyricResponse
                }
            } catch (lyricError) {
                console.warn('Failed to load lyrics:', lyricError)
            }

            console.log('FM song started playing successfully')
        } else {
            console.error('No valid music URL found')
        }
    } catch (error) {
        console.error('Error playing FM song:', error)
    }
}

const nextSong = async () => {
    // 如果有下一首已播放的歌曲，直接播放
    if (currentIndex.value < playedSongs.value.length - 1) {
        currentIndex.value++
        if (currentSong.value) {
            console.log('Playing next FM song from history:', currentSong.value.name)
            await togglePlay()
        }
        return
    }

    // 如果没有下一首，需要获取新歌曲
    if (fmSongs.value.length === 0) {
        await refreshFM({ silent: true })
    }

    // 从未播放的歌曲中取下一首
    let nextSongFromPool = takeNextFromPool()
    if (nextSongFromPool) {
        // 添加到播放历史并记录近期去重
        playedSongs.value.push(nextSongFromPool)
        rememberRecent(nextSongFromPool.id)
        currentIndex.value = playedSongs.value.length - 1

        console.log('Playing new FM song:', nextSongFromPool.name)
        await togglePlay()
        // 低水位预取，保持池内始终有歌可播
        if (fmSongs.value.length < 2) {
            refreshFM({ silent: true })
        }
    } else {
        console.log('No more FM songs available')
        // 如果歌曲池为空，尝试再次刷新
        if (fmSongs.value.length === 0) {
            await refreshFM({ silent: true })
            // 再次尝试获取歌曲
            nextSongFromPool = takeNextFromPool()
            if (nextSongFromPool) {
                playedSongs.value.push(nextSongFromPool)
                rememberRecent(nextSongFromPool.id)
                currentIndex.value = playedSongs.value.length - 1
                console.log('Playing retry FM song:', nextSongFromPool.name)
                await togglePlay()
                if (fmSongs.value.length < 2) {
                    refreshFM({ silent: true })
                }
            }
        }
    }
}

const prevSong = async () => {
    if (currentIndex.value > 0) {
        currentIndex.value--
        if (currentSong.value) {
            console.log('Playing previous FM song:', currentSong.value.name)
            await togglePlay()
        }
    } else {
        console.log('Already at first song, cannot go to previous')
    }
}

const goNext = async () => {
    if (coverNavigating.value) {
        queueCoverDirection('next')
        return
    }

    coverNavigating.value = true
    clearCoverReleaseTimer()
    setCoverTransitionDirection('next')

    try {
        await nextSong()
    } finally {
        scheduleCoverRelease()
    }
}

const goPrev = async () => {
    if (coverNavigating.value) {
        queueCoverDirection('prev')
        return
    }
    if (currentIndex.value <= 0) return

    coverNavigating.value = true
    clearCoverReleaseTimer()
    setCoverTransitionDirection('prev')

    try {
        await prevSong()
    } finally {
        scheduleCoverRelease()
    }
}

const handleCoverSlotClick = async item => {
    if (!item || !item.clickable) return

    if (item.role === 'center') {
        if (coverNavigating.value) return
        await togglePlay()
        return
    }
    if (item.role === 'left') {
        await goPrev()
        return
    }
    if (item.role === 'right') {
        if (nextCandidateSong.value) {
            await goNext()
        } else {
            prefetchNextCandidate()
        }
    }
}

const trashSong = async () => {
    if (!currentSong.value) return

    try {
        await fmTrash(currentSong.value.id)
        goNext()
    } catch (error) {
        console.warn('FM trash failed, skipping to next song:', error)
        goNext()
    }
}

// 检查并更新我喜欢的音乐歌单
const updateFavoritePlaylistIfViewing = async () => {
    // 检查当前是否在查看"我喜欢的音乐"歌单
    if (libraryStore.libraryInfo && userStore.favoritePlaylistId && libraryStore.libraryInfo.id == userStore.favoritePlaylistId) {
        console.log('当前正在查看我喜欢的音乐，正在更新歌单内容...')

        try {
            // 重新获取歌单详情
            await libraryStore.updatePlaylistDetail(userStore.favoritePlaylistId)
            console.log('我喜欢的音乐歌单已更新')
        } catch (error) {
            console.error('更新我喜欢的音乐歌单失败:', error)
        }
    }
}

const likeSong = async () => {
    if (!currentSong.value) return

    try {
        // 使用计算属性来判断当前的操作是“喜欢”还是“取消喜欢”
        const isLiked = !isCurrentSongLiked.value
        console.log('PersonalFM开始喜欢操作:', { songId: currentSong.value.id, like: isLiked })

        // 1) 优先使用官方 /like 接口
        try {
            const result = await likeMusic(currentSong.value.id, isLiked)
            if (result && result.code === 200) {
                const res = await getLikelist(userStore.user.userId)
                userStore.updateLikelist(res.ids)
                await updateFavoritePlaylistIfViewing()
                return
            }
            throw new Error('likeMusic 返回异常')
        } catch (apiErr) {
            console.warn('PersonalFM likeMusic 失败，尝试使用歌单 tracks:', apiErr.message)
        }

        // 2) 降级：使用“我喜欢的音乐”歌单 tracks
        try {
            const favoritePlaylistId = await getFavoritePlaylistId()
            if (favoritePlaylistId) {
                const params = {
                    op: isLiked ? 'add' : 'del',
                    pid: favoritePlaylistId,
                    tracks: currentSong.value.id,
                    timestamp: new Date().getTime(),
                }
                const result = await updatePlaylist(params)
                const isSuccess = result && ((result.status === 200 && result.body && result.body.code === 200) || result.code === 200 || result.status === 200)
                if (isSuccess) {
                    const res = await getLikelist(userStore.user.userId)
                    userStore.updateLikelist(res.ids)
                    await updateFavoritePlaylistIfViewing()
                    return
                }
            }
            throw new Error('歌单 tracks 返回异常')
        } catch (playlistError) {
            console.error('PersonalFM 歌单 tracks 也失败:', playlistError)
        }
    } catch (error) {
        console.error('Failed to like song:', error)
    }
}

const refreshFM = async ({ silent = false } = {}) => {
    if (!silent) {
        loading.value = true
    }
    try {
        const selectedModeRequest = buildSelectedModeRequest(FM_MODE_REQUEST_LIMIT)
        const usingDefaultMode = !selectedModeRequest
        const selectedModeLabel = usingDefaultMode ? DEFAULT_FM_MODE : `${selectedModeRequest.mode}${selectedModeRequest.submode ? `/${selectedModeRequest.submode}` : ''}`
        console.log('[FM] Requesting Personal FM data, mode:', selectedModeLabel)
        let shouldTryModeRescue = false

        // 1) 主流程：DEFAULT 走 personal_fm，其余模式走 personal/fm/mode
        try {
            let songs = []
            let primarySource = FM_REFRESH_SOURCE.PERSONAL_FM
            if (usingDefaultMode) {
                const response = await getPersonalFM()
                songs = Array.isArray(response?.data) ? response.data : []
                console.log('[FM] personal_fm response size:', songs.length)
            } else {
                const response = await getPersonalFMByMode(selectedModeRequest)
                songs = Array.isArray(response?.data) ? response.data : []
                primarySource = FM_REFRESH_SOURCE.FM_MODE_RESCUE
                console.log('[FM] personal/fm/mode response size:', songs.length, selectedModeRequest)
            }

            if (songs.length > 0) {
                const stats = addToFmPoolUnique(songs, primarySource)
                if (stats.added > 0) {
                    lastRefreshSource.value = primarySource
                    bootstrapFromPoolIfNeeded(primarySource)
                    console.log('[FM] refresh source:', lastRefreshSource.value)
                    return
                }
                // 仅在“去重后无新增 + 当前无可播下一首”时触发模式救援
                if (!nextCandidateSong.value && usingDefaultMode) {
                    shouldTryModeRescue = true
                    console.log('[FM] personal_fm deduped to empty and no next candidate, try mode rescue')
                } else if (!nextCandidateSong.value) {
                    console.log('[FM] selected mode deduped to empty, fallback to daily recommendations')
                } else {
                    console.log('[FM] primary source deduped to empty, but next candidate already exists; skip fallback')
                    return
                }
            } else if (!nextCandidateSong.value && usingDefaultMode) {
                shouldTryModeRescue = true
                console.log('[FM] personal_fm returned empty list, try mode rescue')
            } else if (!nextCandidateSong.value) {
                console.log('[FM] selected mode returned empty list, fallback to daily recommendations')
            } else {
                return
            }
        } catch (fmError) {
            console.warn('Primary FM API failed, fallback path starts:', fmError)
            if (usingDefaultMode) {
                shouldTryModeRescue = true
            }
        }

        // 2) 救援流程：按模式拉取（EXPLORE）
        if (shouldTryModeRescue) {
            try {
                const modeResponse = await getPersonalFMByMode(FM_MODE_RESCUE_OPTIONS)
                const modeSongs = Array.isArray(modeResponse?.data) ? modeResponse.data : []
                console.log('[FM] fm_mode_rescue response size:', modeSongs.length, FM_MODE_RESCUE_OPTIONS)
                if (modeSongs.length > 0) {
                    const modeStats = addToFmPoolUnique(modeSongs, FM_REFRESH_SOURCE.FM_MODE_RESCUE)
                    if (modeStats.added > 0) {
                        lastRefreshSource.value = FM_REFRESH_SOURCE.FM_MODE_RESCUE
                        bootstrapFromPoolIfNeeded(FM_REFRESH_SOURCE.FM_MODE_RESCUE)
                        console.log('[FM] refresh source:', lastRefreshSource.value)
                        return
                    }
                }
            } catch (modeError) {
                console.warn('FM mode rescue failed, trying daily recommendations:', modeError)
            }
        }

        // 3) 最终回退：每日推荐
        try {
            const recResponse = await getRecommendSongs()
            console.log('Daily recommendations response:', recResponse)

            if (recResponse && recResponse.data && recResponse.data.dailySongs) {
                const songs = mapSongsPlayableStatus(recResponse.data.dailySongs)
                const shuffledSongs = songs.sort(() => Math.random() - 0.5)
                const dailyStats = addToFmPoolUnique(shuffledSongs, FM_REFRESH_SOURCE.DAILY_RECOMMEND)
                if (dailyStats.added > 0) {
                    lastRefreshSource.value = FM_REFRESH_SOURCE.DAILY_RECOMMEND
                    bootstrapFromPoolIfNeeded(FM_REFRESH_SOURCE.DAILY_RECOMMEND)
                    console.log('[FM] refresh source:', lastRefreshSource.value)
                    return
                }
                console.log('[FM] daily_recommend deduped to empty')
            }
        } catch (recError) {
            console.warn('Daily recommendations also failed:', recError)
        }

        console.error('All FM data sources failed or yielded no new songs')
    } catch (error) {
        console.error('All FM data sources failed:', error)
    } finally {
        if (!silent) {
            loading.value = false
        }
    }
}

const prefetchNextCandidate = async () => {
    if (isPrefetching.value || loading.value || coverNavigating.value) return
    if (!currentSong.value) return
    // 历史尾部且右侧无候选时，静默预取下一首
    if (currentIndex.value < playedSongs.value.length - 1) return
    if (nextCandidateSong.value) return

    isPrefetching.value = true
    try {
        await refreshFM({ silent: true })
    } finally {
        isPrefetching.value = false
    }
}

onMounted(() => {
    startPanelIntro()
    // 恢复持久化的“近期去重队列”（按账号隔离）
    loadPersistentRecent()
    // 只有在FM列表为空时才加载新歌
    if (playedSongs.value.length === 0) {
        refreshFM()
    }

    // 确保FM模式使用正确的播放模式
    if (playerStore.playMode !== 2 && playerStore.playMode !== 3) {
        playerStore.playMode = 2
    }

    // 监听播放器控制事件
    window.addEventListener('fmPlayModeResponse', handleFMPlayModeResponse)
    window.addEventListener('fmPreviousResponse', handleFMPreviousResponse)
    window.addEventListener('fmNextResponse', handleFMNextResponse)
    window.addEventListener('fmClearRecent', handleFmClearRecent)
    window.addEventListener('mousedown', handleModePanelClickOutside)
    window.addEventListener('touchstart', handleModePanelClickOutside)
})

onActivated(() => {
    if (skipIntroOnNextActivated) {
        skipIntroOnNextActivated = false
        return
    }
    startPanelIntro()
})

onDeactivated(() => {
    clearPanelIntroSchedule()
    isPanelIntroActive.value = false
    modePanelOpen.value = false
})

onUnmounted(() => {
    // 清理所有事件监听器
    window.removeEventListener('fmPlayModeResponse', handleFMPlayModeResponse)
    window.removeEventListener('fmPreviousResponse', handleFMPreviousResponse)
    window.removeEventListener('fmNextResponse', handleFMNextResponse)
    window.removeEventListener('fmClearRecent', handleFmClearRecent)
    window.removeEventListener('mousedown', handleModePanelClickOutside)
    window.removeEventListener('touchstart', handleModePanelClickOutside)
    clearCoverReleaseTimer()
    clearPanelIntroSchedule()
    isPanelIntroActive.value = false
    skipIntroOnNextActivated = true
    queuedDirection.value = null
})

// 监听账号切换：按账号隔离“近期去重队列”
watch(
    () => userStore?.user?.userId,
    () => {
        loadPersistentRecent()
    }
)

watch(
    [() => currentSong.value?.id, currentIndex, () => playedSongs.value.length, () => fmSongs.value.length, loading, coverNavigating],
    () => {
        prefetchNextCandidate()
    },
    { immediate: true }
)

// 处理播放模式响应
const handleFMPlayModeResponse = async event => {
    const { action } = event.detail
    console.log('Received FM play mode response:', action)

    if (action === 'loop') {
        // 单曲循环模式：重新播放当前歌曲
        console.log('Loop mode: replaying current song')
        await togglePlay()
    } else if (action === 'next') {
        // FM模式：播放下一首漫游歌曲
        console.log('FM mode: playing next song')
        await goNext()
    }
}

// 处理上一首FM歌曲响应
const handleFMPreviousResponse = async event => {
    const { action } = event.detail
    console.log('Received FM previous response:', action)

    if (action === 'previous') {
        console.log('Playing previous FM song from player controls')
        await goPrev()
    }
}

// 处理下一首FM歌曲响应
const handleFMNextResponse = async event => {
    const { action } = event.detail
    console.log('Received FM next response:', action)

    if (action === 'next') {
        console.log('Playing next FM song from player controls')
        await goNext()
    }
}

// 处理设置页触发的清空漫游缓存事件
const handleFmClearRecent = () => {
    console.log('Received fmClearRecent event from Settings, reloading recent queue')
    loadPersistentRecent()
}
</script>

<style scoped lang="scss">
.personal-fm {
    --fm-stage-bg: transparent;
    --fm-panel-bg: rgba(239, 245, 247, 0.16);
    --fm-panel-border: rgba(0, 0, 0, 0.24);
    --fm-panel-texture: none;
    --fm-panel-texture-size: 160px;
    --fm-panel-overlay: linear-gradient(135deg, transparent 0%, transparent 43%, rgba(0, 0, 0, 0.07) 43%, rgba(0, 0, 0, 0.07) 44%, transparent 44%, transparent 100%);
    --fm-panel-overlay-opacity: 1;

    --fm-text: #111213;
    --fm-muted: rgba(0, 0, 0, 0.62);
    --fm-subtle: rgba(0, 0, 0, 0.46);
    --fm-corner: #111213;
    --fm-primary-btn-bg: #111213;
    --fm-primary-btn-text: #ffffff;
    --fm-primary-btn-border: var(--fm-panel-border);
    --fm-primary-btn-hover-bg: #24272d;
    --fm-ghost-btn-bg: rgba(0, 0, 0, 0.06);
    --fm-ghost-btn-hover-bg: rgba(0, 0, 0, 0.12);
    --fm-mode-bg: rgba(255, 255, 255, 0.42);
    --fm-mode-hover-bg: rgba(255, 255, 255, 0.56);
    --fm-mode-panel-bg: rgba(255, 255, 255, 0.64);
    --fm-mode-panel-bg-soft: rgba(255, 255, 255, 0.3);
    --fm-mode-active-bg: var(--fm-primary-btn-bg);
    --fm-mode-active-text: var(--fm-primary-btn-text);
    --fm-mode-active-border: var(--fm-primary-btn-border);
    --fm-play-overlay-bg: rgba(0, 0, 0, 0.72);
    --fm-play-overlay-hover-bg: rgba(0, 0, 0, 0.82);
    --fm-play-overlay-border: rgba(0, 0, 0, 0.24);
    --fm-play-overlay-icon: #ffffff;
    --fm-danger: #ff3b30;
    --fm-danger-bg: rgba(255, 59, 48, 0.12);
    --fm-spinner-track: rgba(0, 0, 0, 0.14);
    --fm-slot-bg: rgba(0, 0, 0, 0.05);
    --fm-slot-hover-border: rgba(0, 0, 0, 0.5);
    --fm-side-opacity: 0.52;
    --fm-placeholder-bg: rgba(0, 0, 0, 0.03);
    --fm-placeholder-text: rgba(0, 0, 0, 0.44);
    --fm-intro-duration: 1.5s;
    --fm-intro-line-color: var(--fm-panel-border);
    --fm-intro-line-width: 1px;
    --fm-intro-content-offset: 8px;
    --fm-cover-transition-duration: 1.5s;
    --fm-cover-transition-ease: cubic-bezier(0.16, 1, 0.3, 1);
    --fm-cover-ghost-fade-duration: 0.1s;
    --fm-cover-ghost-fade-delay: calc(var(--fm-cover-transition-duration) - var(--fm-cover-ghost-fade-duration));
    --fm-cover-placeholder-fade-duration: 0.12s;
    --fm-cover-overlap-release-ratio: 0.45;
    --fm-cover-overlap-fade-duration: 0.14s;
    --fm-cover-overlap-release-delay: calc(var(--fm-cover-transition-duration) * var(--fm-cover-overlap-release-ratio));
    --fm-cover-z-leaving: 1;
    --fm-cover-z-side: 2;
    --fm-cover-z-side-moving: 3;
    --fm-cover-z-center: 4;
    --fm-cover-z-prev-new-center-top: calc(var(--fm-cover-z-center) + 2);
    --fm-cover-z-prev-old-center-mid: calc(var(--fm-cover-z-center) + 1);
    --fm-cover-z-prev-right-leave-bottom: var(--fm-cover-z-leaving);

    height: 100%;
    overflow: auto;
    padding: 12px 0 8px;

    &::-webkit-scrollbar {
        display: none;
    }
}

.fm-stage {
    height: 100%;
    min-height: 100%;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 0;
    background: var(--fm-stage-bg) !important;
}

.fm-panel {
    width: 100%;
    max-width: 100%;
    min-height: max(650px, 100%);
    padding: 24px 34px;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
    background-color: var(--fm-panel-bg);
    background-image: var(--fm-panel-texture);
    background-size: var(--fm-panel-texture-size);
    border: 1px solid transparent;
    background-clip: padding-box;
}

.fm-panel::before {
    content: '';
    position: absolute;
    inset: 1px;
    pointer-events: none;
    background-image: var(--fm-panel-overlay);
    opacity: var(--fm-panel-overlay-opacity);
    clip-path: inset(0 0 0 0);
}

.fm-outline-draw {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 1;
    z-index: 3;
}

.outline-seg {
    position: absolute;
    background: var(--fm-intro-line-color);
    opacity: 1;
}

.outline-seg.top,
.outline-seg.bottom {
    left: 0;
    right: 0;
    height: var(--fm-intro-line-width);
    transform: scaleX(0);
}

.outline-seg.top {
    top: 0;
    transform-origin: left center;
}

.outline-seg.bottom {
    bottom: 0;
    transform-origin: right center;
}

.outline-seg.left,
.outline-seg.right {
    top: 0;
    bottom: 0;
    width: var(--fm-intro-line-width);
    transform: scaleY(0);
}

.outline-seg.left {
    left: 0;
    transform-origin: bottom center;
}

.outline-seg.right {
    right: 0;
    transform-origin: top center;
}

.frame-corner {
    width: 10px;
    height: 10px;
    border: 2px solid var(--fm-corner);
    position: absolute;
    z-index: 2;
    pointer-events: none;
}

.fm-panel-intro-active .fm-outline-draw {
    opacity: 1;
}

.fm-panel-intro-active .outline-seg.top,
.fm-panel-intro-active .outline-seg.bottom {
    animation: fm-outline-grow-x 0.64s cubic-bezier(0.25, 0.9, 0.3, 1) both;
}

.fm-panel-intro-active .outline-seg.left,
.fm-panel-intro-active .outline-seg.right {
    animation: fm-outline-grow-y 0.64s cubic-bezier(0.25, 0.9, 0.3, 1) both;
}

.fm-panel-outline-ready .outline-seg.top,
.fm-panel-outline-ready .outline-seg.bottom,
.fm-panel-outline-ready .outline-seg.left,
.fm-panel-outline-ready .outline-seg.right {
    transform: none;
}

.fm-panel-intro-active::before {
    opacity: 0;
    clip-path: inset(0 100% 0 0);
    animation: fm-overlay-reveal 0.68s cubic-bezier(0.25, 0.9, 0.3, 1) 0.16s both;
}

.fm-panel-intro-active .frame-corner {
    animation: fm-corner-reveal 0.48s cubic-bezier(0.2, 0.9, 0.2, 1) 0.44s both;
}

.fm-panel-intro-active .fm-header,
.fm-panel-intro-active .fm-content,
.fm-panel-intro-active .fm-loading,
.fm-panel-intro-active .fm-empty {
    animation: fm-content-reveal 0.9s cubic-bezier(0.18, 0.92, 0.28, 1) 0.6s both;
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

.fm-header {
    margin-bottom: 28px;
    text-align: center;
    position: relative;
    z-index: 1;

    h1 {
        margin: 12px 0 0;
        font: 30px SourceHanSansCN-Heavy;
        letter-spacing: 1px;
        color: var(--fm-text) !important;
    }
}

.fm-headline {
    display: inline-block;
    padding: 4px 12px;
    font: 12px Geometos;
    letter-spacing: 1px;
    background: var(--fm-primary-btn-bg);
    color: var(--fm-primary-btn-text) !important;
}

.fm-subtitle {
    margin: 6px 0 0;
    font: 14px SourceHanSansCN-Bold;
    color: var(--fm-muted) !important;
    display: block;
}

.fm-mode-floating {
    position: absolute;
    top: 18px;
    right: 22px;
    z-index: 8;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
}

.fm-mode-trigger {
    border: 1px solid var(--fm-panel-border);
    min-height: 30px;
    min-width: 170px;
    max-width: 230px;
    padding: 0 10px;
    background: var(--fm-mode-bg);
    color: var(--fm-text) !important;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
    cursor: pointer;
    outline: none;
    box-shadow: none;
    appearance: none;
    -webkit-appearance: none;
    -webkit-tap-highlight-color: transparent;
    transition:
        transform 0.2s ease,
        background 0.2s ease,
        border-color 0.2s ease;

    &:hover:not(:disabled) {
        background: var(--fm-mode-hover-bg);
        transform: translateY(-1px);
    }

    &:disabled {
        opacity: 0.58;
        cursor: not-allowed;
        transform: none;
    }

    &:focus,
    &:focus-visible,
    &:active {
        outline: none;
        box-shadow: none;
    }
}

.mode-trigger-code {
    flex: 0 0 auto;
    font: 10px Geometos;
    letter-spacing: 0.8px;
    opacity: 0.8;
}

.mode-trigger-value {
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
    font: 12px SourceHanSansCN-Bold;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.mode-trigger-arrow {
    flex: 0 0 auto;
    transition: transform 0.2s ease;
}

.fm-mode-floating.open .mode-trigger-arrow {
    transform: rotate(180deg);
}

.fm-mode-dropdown {
    margin-top: 8px;
    width: min(360px, calc(100vw - 72px));
    padding: 10px;
    border: 1px solid var(--fm-panel-border);
    background: linear-gradient(180deg, var(--fm-mode-panel-bg) 0%, var(--fm-mode-panel-bg-soft) 100%);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.15);
}

.fm-mode-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 8px;
}

.fm-mode-title-code {
    font: 10px Geometos;
    letter-spacing: 0.8px;
    color: var(--fm-subtle) !important;
}

.fm-mode-title-text {
    font: 12px SourceHanSansCN-Bold;
    color: var(--fm-muted) !important;
}

.fm-mode-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
}

.fm-submode-grid {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed var(--fm-panel-border);
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
}

.fm-mode-btn,
.fm-submode-btn {
    border: 1px solid var(--fm-panel-border);
    background: var(--fm-mode-bg);
    color: var(--fm-text) !important;
    padding: 5px 6px;
    min-height: 34px;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    clip-path: polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px));
    transition:
        transform 0.2s ease,
        background 0.2s ease,
        border-color 0.2s ease,
        color 0.2s ease;
    cursor: pointer;
    outline: none;
    box-shadow: none;
    appearance: none;
    -webkit-appearance: none;
    -webkit-tap-highlight-color: transparent;

    .mode-code {
        font: 9px Bender-Bold;
        letter-spacing: 0.6px;
        line-height: 1.1;
        opacity: 0.82;
    }

    .mode-label {
        font: 11px SourceHanSansCN-Bold;
        line-height: 1.15;
        white-space: nowrap;
    }

    &:hover:not(:disabled) {
        transform: translateY(-1px);
        background: var(--fm-mode-hover-bg);
    }

    &.active {
        background: var(--fm-mode-active-bg);
        color: var(--fm-mode-active-text) !important;
        border-color: var(--fm-mode-active-border);

        .mode-code {
            opacity: 1;
        }
    }

    &:disabled {
        opacity: 0.58;
        cursor: not-allowed;
        transform: none;
    }

    &:focus,
    &:focus-visible,
    &:active {
        outline: none;
        box-shadow: none;
    }
}

.fm-mode-float-enter-active,
.fm-mode-float-leave-active {
    transition:
        opacity 0.16s ease,
        transform 0.16s ease;
}

.fm-mode-float-enter-from,
.fm-mode-float-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

.fm-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 26px;
    position: relative;
    z-index: 1;
}

.fm-main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
}

.fm-cover-carousel {
    width: min(760px, 100%);
    overflow: hidden;
}

.fm-cover-track {
    min-height: 262px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 50px;
    isolation: isolate;
}

.fm-cover-slot {
    position: relative;
    width: 168px;
    height: 168px;
    padding: 6px;
    border: 1px solid var(--fm-panel-border);
    background: var(--fm-slot-bg);
    transition: border-color 0.2s ease;
    will-change: transform, opacity;
    backface-visibility: hidden;

    img {
        width: 100%;
        height: 100%;
        border-radius: 2px;
        object-fit: cover;
        border: 1px solid var(--fm-panel-border);
        display: block;
        transform: translateZ(0);
    }
}

.fm-cover-slot.slot-center {
    width: 246px;
    height: 246px;
    padding: 8px;
    opacity: 1;
    z-index: var(--fm-cover-z-center);
}

.fm-cover-slot.slot-side {
    opacity: var(--fm-side-opacity);
    z-index: var(--fm-cover-z-side);
}

.fm-cover-slot.slot-clickable:hover {
    cursor: pointer;
    border-color: var(--fm-slot-hover-border);
}

.fm-cover-slot.slot-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--fm-placeholder-bg);
    border-style: dashed;
}

.slot-placeholder-text {
    font: 11px Bender-Bold;
    letter-spacing: 0.8px;
    color: var(--fm-placeholder-text) !important;
}

.slot-side-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.12) 0%, rgba(0, 0, 0, 0.22) 100%);
    pointer-events: none;
}

.fm-play-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 64px;
    height: 64px;
    border: 1px solid var(--fm-play-overlay-border);
    background: var(--fm-play-overlay-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--fm-play-overlay-icon) !important;
    opacity: 0.86;
    transition:
        transform 0.2s ease,
        opacity 0.2s ease,
        background 0.2s ease;
    z-index: 10;
    pointer-events: none;
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
}

.fm-cover-slot.slot-center:hover .fm-play-overlay {
    opacity: 1;
    background: var(--fm-play-overlay-hover-bg);
    transform: translate(-50%, -50%) scale(1.04);
}

.fm-info {
    text-align: center;

    .song-name {
        font: 21px SourceHanSansCN-Bold;
        color: var(--fm-text) !important;
        margin: 0 0 8px 0;
    }

    .artist-name {
        font: 14px SourceHanSansCN-Bold;
        color: var(--fm-muted) !important;
        margin: 0 0 4px 0;
    }

    .album-name {
        font: 12px SourceHanSansCN-Bold;
        color: var(--fm-subtle) !important;
        margin: 0;
    }
}

.fm-actions {
    display: flex;
    gap: 10px;
    align-items: center;
}

.action-btn {
    min-width: 64px;
    height: 36px;
    border: 1px solid var(--fm-panel-border);
    background: var(--fm-ghost-btn-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
        transform 0.2s ease,
        background 0.2s ease,
        color 0.2s ease,
        border-color 0.2s ease;
    color: var(--fm-text) !important;

    svg {
        width: 18px;
        height: 18px;
    }

    &:hover {
        transform: translateY(-1px);
        background: var(--fm-ghost-btn-hover-bg);
    }

    &.trash:hover {
        background: var(--fm-danger-bg);
        border-color: var(--fm-danger);
        color: var(--fm-danger) !important;
    }

    &.like.active {
        background: var(--fm-danger-bg);
        border-color: var(--fm-danger);
        color: var(--fm-danger) !important;
    }

    &.like:hover {
        background: var(--fm-danger-bg);
        border-color: var(--fm-danger);
        color: var(--fm-danger) !important;
    }

    &.prev,
    &.next {
        background: var(--fm-primary-btn-bg);
        color: var(--fm-primary-btn-text) !important;
        border-color: var(--fm-primary-btn-border);

        &:hover {
            background: var(--fm-primary-btn-hover-bg);
        }
    }
}

.fm-loading,
.fm-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    position: relative;
    z-index: 1;
    color: var(--fm-muted) !important;
}

.loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--fm-spinner-track);
    border-top: 3px solid var(--fm-text);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 16px;
}

.fm-loading p,
.fm-empty p {
    color: var(--fm-muted) !important;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}

@keyframes fm-outline-grow-x {
    0% {
        transform: scaleX(0);
    }
    99% {
        transform: scaleX(1);
    }
    100% {
        transform: none;
    }
}

@keyframes fm-outline-grow-y {
    0% {
        transform: scaleY(0);
    }
    99% {
        transform: scaleY(1);
    }
    100% {
        transform: none;
    }
}

@keyframes fm-overlay-reveal {
    from {
        opacity: 0;
        clip-path: inset(0 100% 0 0);
    }
    to {
        opacity: var(--fm-panel-overlay-opacity);
        clip-path: inset(0 0 0 0);
    }
}

@keyframes fm-corner-reveal {
    from {
        opacity: 0;
        transform: scale(0.78);
    }
    to {
        opacity: 1;
        transform: scale(1);
    }
}

@keyframes fm-content-reveal {
    from {
        opacity: 0;
        transform: translateY(var(--fm-intro-content-offset));
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes fm-content-reveal-reduced {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

.empty-icon {
    margin-bottom: 16px;
    color: var(--fm-subtle) !important;
}

.error-hint {
    font-size: 12px;
    color: var(--fm-danger) !important;
    margin: 5px 0;
}

.refresh-button {
    margin-top: 18px;
    min-width: 112px;
    height: 34px;
    padding: 0 14px;
    border: 1px solid var(--fm-panel-border);
    background: var(--fm-ghost-btn-bg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
        transform 0.2s ease,
        background 0.2s ease;
    font: 14px SourceHanSansCN-Bold;
    color: var(--fm-text) !important;

    &:hover {
        transform: translateY(-1px);
        background: var(--fm-ghost-btn-hover-bg);
    }
}

.fm-shift-next-move,
.fm-shift-prev-move,
.fm-shift-neutral-move {
    transition: transform var(--fm-cover-transition-duration) var(--fm-cover-transition-ease);
}

.fm-cover-slot.slot-side.fm-shift-next-move {
    transition: transform var(--fm-cover-transition-duration) var(--fm-cover-transition-ease);
    opacity: 1;
    z-index: var(--fm-cover-z-side-moving);
    animation: fm-cover-side-overlap-release var(--fm-cover-overlap-fade-duration) linear var(--fm-cover-overlap-release-delay) both;
}

.fm-cover-slot.slot-center.fm-shift-next-move,
.fm-cover-slot.slot-center.fm-shift-neutral-move {
    opacity: 1;
    z-index: var(--fm-cover-z-center);
}

/* goPrev 三层顺序：新中间 > 旧中间 > right->leave（最低） */
.fm-cover-slot.slot-side.fm-shift-prev-move {
    transition: transform var(--fm-cover-transition-duration) var(--fm-cover-transition-ease);
    opacity: 1;
    z-index: var(--fm-cover-z-prev-right-leave-bottom);
    animation: fm-cover-side-overlap-release var(--fm-cover-overlap-fade-duration) linear var(--fm-cover-overlap-release-delay) both;
}

.fm-cover-slot.slot-right.fm-shift-prev-move {
    z-index: var(--fm-cover-z-prev-old-center-mid);
}

.fm-cover-slot.slot-center.fm-shift-prev-move {
    opacity: 1;
    z-index: var(--fm-cover-z-prev-new-center-top);
}

.fm-cover-slot.slot-center.fm-shift-prev-enter-active,
.fm-cover-slot.slot-center.fm-shift-prev-enter-from,
.fm-cover-slot.slot-center.fm-shift-prev-enter-to,
.fm-cover-slot.slot-left.fm-shift-prev-enter-active,
.fm-cover-slot.slot-left.fm-shift-prev-enter-from,
.fm-cover-slot.slot-left.fm-shift-prev-enter-to {
    z-index: var(--fm-cover-z-prev-right-leave-bottom);
}

.fm-shift-next-enter-active,
.fm-shift-prev-enter-active,
.fm-shift-neutral-enter-active {
    transition:
        transform var(--fm-cover-transition-duration) var(--fm-cover-transition-ease),
        opacity var(--fm-cover-transition-duration) var(--fm-cover-transition-ease);
}

.fm-shift-next-leave-active,
.fm-shift-prev-leave-active,
.fm-shift-neutral-leave-active {
    transition:
        transform var(--fm-cover-transition-duration) var(--fm-cover-transition-ease),
        opacity var(--fm-cover-ghost-fade-duration) linear var(--fm-cover-ghost-fade-delay);
}

.fm-cover-slot.slot-placeholder.fm-shift-next-leave-active,
.fm-cover-slot.slot-placeholder.fm-shift-prev-leave-active,
.fm-cover-slot.slot-placeholder.fm-shift-neutral-leave-active {
    transition: opacity var(--fm-cover-placeholder-fade-duration) linear;
}

.fm-cover-slot.fm-shift-next-leave-active,
.fm-cover-slot.fm-shift-prev-leave-active,
.fm-cover-slot.fm-shift-neutral-leave-active {
    position: absolute;
    pointer-events: none;
    z-index: var(--fm-cover-z-leaving);
}

.fm-shift-next-leave-from,
.fm-shift-prev-leave-from,
.fm-shift-neutral-leave-from {
    opacity: 1;
}

.fm-cover-slot.slot-right.fm-shift-prev-leave-active,
.fm-cover-slot.slot-right.fm-shift-prev-leave-from,
.fm-cover-slot.slot-right.fm-shift-prev-leave-to {
    z-index: var(--fm-cover-z-prev-right-leave-bottom);
}

.fm-shift-next-enter-from {
    opacity: 0;
    transform: translateX(20px) scale(0.97);
}

.fm-shift-next-leave-to {
    opacity: 0;
    transform: translateX(-20px) scale(0.97);
}

.fm-shift-prev-enter-from {
    opacity: 0;
    transform: translateX(-20px) scale(0.97);
}

.fm-shift-prev-leave-to {
    opacity: 0;
    transform: translateX(20px) scale(0.97);
}

.fm-shift-neutral-enter-from,
.fm-shift-neutral-leave-to {
    opacity: 0;
    transform: scale(0.97);
}

.fm-cover-slot.slot-placeholder.fm-shift-next-leave-to,
.fm-cover-slot.slot-placeholder.fm-shift-prev-leave-to,
.fm-cover-slot.slot-placeholder.fm-shift-neutral-leave-to {
    opacity: 0;
    transform: none;
}

@keyframes fm-cover-side-overlap-release {
    from {
        opacity: 1;
    }
    to {
        opacity: var(--fm-side-opacity);
    }
}

@media (prefers-reduced-motion: reduce) {
    .fm-panel-intro-active,
    .fm-panel-intro-active::before,
    .fm-panel-intro-active .fm-outline-draw,
    .fm-panel-intro-active .outline-seg,
    .fm-panel-intro-active .frame-corner {
        animation: none !important;
    }

    .fm-panel-intro-active::before {
        opacity: 1 !important;
        clip-path: inset(0 0 0 0) !important;
    }

    .fm-panel-intro-active .fm-outline-draw {
        opacity: 1 !important;
    }

    .fm-panel-intro-active .outline-seg,
    .fm-panel-outline-ready .outline-seg {
        transform: none !important;
    }

    .fm-panel-intro-active .fm-header,
    .fm-panel-intro-active .fm-content,
    .fm-panel-intro-active .fm-loading,
    .fm-panel-intro-active .fm-empty {
        animation: fm-content-reveal-reduced 0.12s linear both;
    }
}

@media (max-width: 900px) {
    .personal-fm {
        padding: 8px 0 10px;
    }

    .fm-stage {
        padding: 0;
    }

    .fm-panel {
        width: 100%;
        max-width: 100%;
        min-height: 0;
        padding: 16px 16px;
    }

    .fm-cover-carousel {
        width: 100%;
    }

    .fm-header {
        margin-bottom: 20px;

        h1 {
            font-size: 24px;
        }
    }

    .fm-mode-floating {
        top: 12px;
        right: 12px;
    }

    .fm-mode-trigger {
        min-height: 28px;
        min-width: 150px;
        max-width: 176px;
        padding: 0 8px;
    }

    .mode-trigger-value {
        font-size: 11px;
    }

    .fm-mode-dropdown {
        width: min(300px, calc(100vw - 44px));
        padding: 8px;
    }

    .fm-mode-grid,
    .fm-submode-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 5px;
    }

    .fm-mode-btn,
    .fm-submode-btn {
        min-height: 30px;
        padding: 4px 5px;
    }

    .fm-cover-track {
        min-height: 224px;
        gap: 12px;
    }

    .fm-cover-slot {
        width: 124px;
        height: 124px;
        padding: 5px;
    }

    .fm-cover-slot.slot-center {
        width: 212px;
        height: 212px;
        padding: 6px;
    }

    .fm-actions {
        width: 100%;
        justify-content: center;
        gap: 8px;
    }

    .action-btn {
        min-width: 58px;
    }
}
</style>

<style lang="scss">
html.dark .personal-fm,
.dark .personal-fm {
    --fm-stage-bg: transparent;
    --fm-panel-bg: rgba(52, 58, 66, 0.88);
    --fm-panel-border: rgba(255, 255, 255, 0.22);
    --fm-panel-texture: none;
    --fm-panel-overlay: linear-gradient(135deg, transparent 0%, transparent 43%, rgba(255, 255, 255, 0.1) 43%, rgba(255, 255, 255, 0.1) 44%, transparent 44%, transparent 100%);
    --fm-panel-overlay-opacity: 0.6;
    --fm-text: #f1f3f5;
    --fm-muted: rgba(241, 243, 245, 0.78);
    --fm-subtle: rgba(241, 243, 245, 0.58);
    --fm-corner: rgba(241, 243, 245, 0.92);
    --fm-primary-btn-bg: rgba(241, 243, 245, 0.94);
    --fm-primary-btn-text: #0f1114;
    --fm-primary-btn-border: rgba(241, 243, 245, 0.58);
    --fm-primary-btn-hover-bg: #ffffff;
    --fm-ghost-btn-bg: rgba(255, 255, 255, 0.08);
    --fm-ghost-btn-hover-bg: rgba(255, 255, 255, 0.14);
    --fm-mode-bg: rgba(255, 255, 255, 0.08);
    --fm-mode-hover-bg: rgba(255, 255, 255, 0.14);
    --fm-mode-panel-bg: rgba(52, 58, 66, 0.9);
    --fm-mode-panel-bg-soft: rgba(255, 255, 255, 0.08);
    --fm-mode-active-bg: rgba(241, 243, 245, 0.94);
    --fm-mode-active-text: #0f1114;
    --fm-mode-active-border: rgba(241, 243, 245, 0.58);
    --fm-play-overlay-bg: rgba(0, 0, 0, 0.72);
    --fm-play-overlay-hover-bg: rgba(0, 0, 0, 0.82);
    --fm-play-overlay-border: rgba(0, 0, 0, 0.24);
    --fm-play-overlay-icon: #ffffff;
    --fm-danger: #ff6b5f;
    --fm-danger-bg: rgba(255, 107, 95, 0.18);
    --fm-spinner-track: rgba(255, 255, 255, 0.2);
    --fm-slot-bg: rgba(255, 255, 255, 0.08);
    --fm-slot-hover-border: rgba(241, 243, 245, 0.72);
    --fm-side-opacity: 0.5;
    --fm-placeholder-bg: rgba(255, 255, 255, 0.05);
    --fm-placeholder-text: rgba(241, 243, 245, 0.5);
}

.dark .personal-fm .action-btn.prev,
.dark .personal-fm .action-btn.next,
html.dark .personal-fm .action-btn.prev,
html.dark .personal-fm .action-btn.next {
    color: var(--fm-primary-btn-text) !important;
    border-color: var(--fm-primary-btn-border) !important;
}

.dark .personal-fm .fm-play-overlay,
html.dark .personal-fm .fm-play-overlay {
    color: var(--fm-play-overlay-icon) !important;
    border-color: var(--fm-play-overlay-border) !important;
}

.dark .personal-fm .action-btn.prev svg,
.dark .personal-fm .action-btn.next svg,
html.dark .personal-fm .action-btn.prev svg,
html.dark .personal-fm .action-btn.next svg {
    color: var(--fm-primary-btn-text) !important;
}

.dark .personal-fm .action-btn.prev svg path,
.dark .personal-fm .action-btn.next svg path,
html.dark .personal-fm .action-btn.prev svg path,
html.dark .personal-fm .action-btn.next svg path {
    fill: var(--fm-primary-btn-text) !important;
}

.dark .personal-fm .fm-play-overlay svg,
html.dark .personal-fm .fm-play-overlay svg {
    color: var(--fm-play-overlay-icon) !important;
}

.dark .personal-fm .fm-play-overlay svg path,
html.dark .personal-fm .fm-play-overlay svg path {
    fill: var(--fm-play-overlay-icon) !important;
}

.dark .personal-fm .fm-mode-btn.active,
html.dark .personal-fm .fm-mode-btn.active,
.dark .personal-fm .fm-submode-btn.active,
html.dark .personal-fm .fm-submode-btn.active {
    background-color: var(--fm-mode-active-bg) !important;
    color: var(--fm-mode-active-text) !important;
    border-color: var(--fm-mode-active-border) !important;
}

.dark .personal-fm .fm-mode-btn.active .mode-code,
html.dark .personal-fm .fm-mode-btn.active .mode-code,
.dark .personal-fm .fm-mode-btn.active .mode-label,
html.dark .personal-fm .fm-mode-btn.active .mode-label,
.dark .personal-fm .fm-submode-btn.active .mode-code,
html.dark .personal-fm .fm-submode-btn.active .mode-code,
.dark .personal-fm .fm-submode-btn.active .mode-label,
html.dark .personal-fm .fm-submode-btn.active .mode-label {
    color: var(--fm-mode-active-text) !important;
}
</style>
