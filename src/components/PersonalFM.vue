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

                <div class="fm-header">
                    <div class="fm-headline">PERSONAL FM</div>
                    <h1>私人漫游</h1>
                    <span class="fm-subtitle">根据你的音乐喜好为你推荐</span>
                </div>

                <div class="fm-content" v-if="currentSong && !loading">
                    <div class="fm-main">
                        <div class="fm-cover-carousel">
                            <TransitionGroup :name="coverTransitionName" tag="div" class="fm-cover-track">
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
                            <h2 class="song-name">{{ currentSong.name }}</h2>
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
import { getPersonalFM, fmTrash } from '../api/song'
import { getRecommendSongs } from '../api/playlist'
import { usePlayerStore } from '../store/playerStore'
import { useUserStore } from '../store/userStore'
import { useLibraryStore } from '../store/libraryStore'
import { mapSongsPlayableStatus } from '../utils/songStatus'
import { getLyric } from '../api/song'
import { play, getFavoritePlaylistId, setSongLevel } from '../utils/player'
import { updatePlaylist } from '../api/playlist'
import { getLikelist } from '../api/user'
import { likeMusic } from '../api/song'
import { storeToRefs } from 'pinia'
import { getPreferredQuality } from '../utils/quality'
import { resolveTrackByQualityPreference } from '../utils/musicUrlResolver'

const playerStore = usePlayerStore()
const userStore = useUserStore()
const libraryStore = useLibraryStore()
const { songId, playing, quality } = storeToRefs(playerStore)
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
const RECENT_WINDOW = 100 // 近期去重窗口大小，避免短期内重复

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

function loadPersistentRecent() {
    // 清空并加载“近期播放队列”（按账号隔离）
    recentPlayedQueue.length = 0
    recentPlayedSet.clear()
    const recentArr = safeParseArray(localStorage.getItem(getRecentQueueKey()))
    for (const id of recentArr) {
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
    if (!id) return
    recentPlayedQueue.push(id)
    recentPlayedSet.add(id)
    // 控制窗口大小，超过阈值就移除最早的一首
    if (recentPlayedQueue.length > RECENT_WINDOW) {
        const old = recentPlayedQueue.shift()
        recentPlayedSet.delete(old)
    }
    // 持久化近期队列（账号隔离）
    persistRecent()
}

function addToFmPoolUnique(songs) {
    if (!Array.isArray(songs) || songs.length === 0) return
    const before = fmSongs.value.length
    const deduped = []
    for (const s of songs) {
        const id = s && (s.id || s.songId || s.trackId)
        if (!id) continue
        // 过滤：近期播放过、池中已有 → 不再加入
        if (recentPlayedSet.has(id) || fmPoolIds.has(id)) continue
        fmPoolIds.add(id)
        deduped.push(s)
    }
    if (deduped.length) fmSongs.value.push(...deduped)
    console.log('FM池新增歌曲:', deduped.length, '（池总数从', before, '到', fmSongs.value.length, '）')
}

function takeNextFromPool() {
    while (fmSongs.value.length > 0) {
        const s = fmSongs.value.shift()
        const id = s && s.id
        if (id) fmPoolIds.delete(id)
        // 若近期播放过，则跳过，继续取下一首
        if (id && recentPlayedSet.has(id)) continue
        return s || null
    }
    return null
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

    const releaseDelay = getCoverTransitionDurationMs() + COVER_RELEASE_BUFFER_MS
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
        console.log('Requesting Personal FM data...')

        // 首先尝试官方Personal FM API
        try {
            const response = await getPersonalFM()
            console.log('Personal FM response:', response)

            if (response && response.data && response.data.length > 0) {
                // 去重追加到歌曲池
                addToFmPoolUnique(response.data)

                // 如果当前没有歌曲在播放历史中，从池中取第一首歌开始播放
                if (playedSongs.value.length === 0 && fmSongs.value.length > 0) {
                    const firstSong = takeNextFromPool()
                    if (firstSong) {
                        playedSongs.value.push(firstSong)
                        rememberRecent(firstSong.id)
                        currentIndex.value = 0
                        console.log('Started with first FM song:', firstSong.name)
                    }
                }
                return
            }
        } catch (fmError) {
            console.warn('Personal FM API failed, trying daily recommendations:', fmError)
        }

        // 如果Personal FM失败，使用每日推荐作为备选
        try {
            const recResponse = await getRecommendSongs()
            console.log('Daily recommendations response:', recResponse)

            if (recResponse && recResponse.data && recResponse.data.dailySongs) {
                const songs = mapSongsPlayableStatus(recResponse.data.dailySongs)
                // 随机打乱歌曲顺序，模拟FM效果
                const shuffledSongs = songs.sort(() => Math.random() - 0.5)
                // 去重后追加到歌曲池
                addToFmPoolUnique(shuffledSongs)
                console.log('Added daily recommendation songs to FM pool (deduped):', fmSongs.value.length)

                // 如果当前没有歌曲在播放历史中，从池中取第一首歌开始播放
                if (playedSongs.value.length === 0 && fmSongs.value.length > 0) {
                    const firstSong = takeNextFromPool()
                    if (firstSong) {
                        playedSongs.value.push(firstSong)
                        rememberRecent(firstSong.id)
                        currentIndex.value = 0
                        console.log('Started with first recommendation song:', firstSong.name)
                    }
                }
                return
            }
        } catch (recError) {
            console.warn('Daily recommendations also failed:', recError)
        }

        // 如果所有API都失败，显示空状态
        console.error('All FM data sources failed')
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
})

onUnmounted(() => {
    // 清理所有事件监听器
    window.removeEventListener('fmPlayModeResponse', handleFMPlayModeResponse)
    window.removeEventListener('fmPreviousResponse', handleFMPreviousResponse)
    window.removeEventListener('fmNextResponse', handleFMNextResponse)
    window.removeEventListener('fmClearRecent', handleFmClearRecent)
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
    min-height: 650px;
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

.fm-cover-slot.slot-side.fm-shift-next-move,
.fm-cover-slot.slot-side.fm-shift-neutral-move {
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
</style>
