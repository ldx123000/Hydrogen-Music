<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../store/playerStore'

const BAR_COUNT = 57
const BAR_WIDTH = 3
const ANALYSER_FFT_SIZE = 128
const ANALYSER_SMOOTHING = 0.8
const FLAT_LEVEL = 0.08
const FREQUENCY_VALUE_SCALE = 256
const RETRY_ATTACH_LIMIT = 16
const DEFAULT_BAR_GAP = 2
const EMPTY_ANALYSER_FRAME_LIMIT = 72
const ANALYSER_REATTACH_COOLDOWN_MS = 1200

const playerStore = usePlayerStore()
const {
    audioVisualizer,
    currentMusic,
    playing,
    playerShow,
    widgetState,
} = storeToRefs(playerStore)

const visible = computed(() => {
    return audioVisualizer.value && playerShow.value && !widgetState.value && !!currentMusic.value
})

function createFlatLevels() {
    return Array.from({ length: BAR_COUNT }, () => FLAT_LEVEL)
}

const levels = ref(createFlatLevels())
const visualizerRef = ref(null)
const barGap = ref(DEFAULT_BAR_GAP)

let animationFrame = 0
let attachTimer = null
let analyser = null
let analyserData = null
let attachedPlayback = null
let mediaAudioContext = null
let mediaStreamSource = null
let mediaStream = null
let playbackEventCleanup = null
let resizeObserver = null
let emptyAnalyserFrames = 0
let lastAnalyserReattachAt = 0

function resetFlat() {
    levels.value = createFlatLevels()
}

function settleFlat() {
    let changed = false
    let stillSettling = false

    const nextLevels = levels.value.map(level => {
        const delta = FLAT_LEVEL - level
        if (Math.abs(delta) <= 0.001) return FLAT_LEVEL

        changed = true
        const nextLevel = level + delta * 0.42
        if (Math.abs(FLAT_LEVEL - nextLevel) > 0.001) stillSettling = true
        return nextLevel
    })

    if (changed) levels.value = nextLevels
    return stillSettling
}

function clearAttachTimer() {
    if (!attachTimer) return
    window.clearTimeout(attachTimer)
    attachTimer = null
}

function disconnectMediaStreamSource() {
    if (mediaStreamSource) {
        try { mediaStreamSource.disconnect() } catch (_) {}
    }
    mediaStreamSource = null
    mediaStream = null
}

function clearPlaybackEventListeners() {
    if (!playbackEventCleanup) return
    playbackEventCleanup()
    playbackEventCleanup = null
}

function resetAnalyser(options = {}) {
    const keepPlayback = options.keepPlayback === true
    clearAttachTimer()
    analyser = null
    analyserData = null
    emptyAnalyserFrames = 0

    disconnectMediaStreamSource()

    if (!keepPlayback) {
        clearPlaybackEventListeners()
        attachedPlayback = null
    }
}

function refreshAnalyserForPlayback(playback) {
    if (!visible.value || currentMusic.value !== playback) return

    resetAnalyser({ keepPlayback: true })
    attachedPlayback = playback
    tryAttachAnalyser()

    if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(drawFrame)
    }
}

function bindPlaybackEventListeners(playback) {
    clearPlaybackEventListeners()
    if (!playback || typeof playback.on !== 'function') return

    const handlePlaybackStart = () => refreshAnalyserForPlayback(playback)
    playback.on('play', handlePlaybackStart)
    playbackEventCleanup = () => {
        try { playback.off?.('play', handlePlaybackStart) } catch (_) {}
    }
}

function updateBarGap() {
    const element = visualizerRef.value
    if (!element) return

    const width = element.getBoundingClientRect().width
    if (!width) return

    const nextGap = (width - BAR_COUNT * BAR_WIDTH) / Math.max(1, BAR_COUNT - 1)
    barGap.value = Math.max(1, Math.round(nextGap * 1000) / 1000)
}

function configureAnalyser(nextAnalyser) {
    nextAnalyser.fftSize = ANALYSER_FFT_SIZE
    nextAnalyser.smoothingTimeConstant = ANALYSER_SMOOTHING
    return nextAnalyser
}

function getWebAudioAnalyser(playback) {
    const context = playback?._context
    const gain = playback?._gain
    if (!context || !gain || typeof context.createAnalyser !== 'function') return null

    if (!playback.__hmTopVisualizerAnalyser) {
        const nextAnalyser = configureAnalyser(context.createAnalyser())
        gain.connect(nextAnalyser)
        playback.__hmTopVisualizerAnalyser = nextAnalyser
    }

    return configureAnalyser(playback.__hmTopVisualizerAnalyser)
}

function getHowlBufferAnalyser(playback) {
    const sounds = Array.isArray(playback?._sounds) ? playback._sounds : []
    const sound = sounds.find(item => item?._node?.bufferSource)
    const source = sound?._node?.bufferSource
    const context = source?.context
    if (!source || !context || typeof context.createAnalyser !== 'function') return null

    if (!playback.__hmTopVisualizerAnalyser || playback.__hmTopVisualizerAnalyserSource !== source) {
        const nextAnalyser = configureAnalyser(context.createAnalyser())
        source.connect(nextAnalyser)
        playback.__hmTopVisualizerAnalyser = nextAnalyser
        playback.__hmTopVisualizerAnalyserSource = source
    }

    return configureAnalyser(playback.__hmTopVisualizerAnalyser)
}

function getHowlMediaElement(playback) {
    const sounds = Array.isArray(playback?._sounds) ? playback._sounds : []
    const HTMLMediaElementCtor = typeof HTMLMediaElement === 'undefined' ? null : HTMLMediaElement

    for (const sound of sounds) {
        const node = sound?._node
        if (!node) continue
        if (HTMLMediaElementCtor && node instanceof HTMLMediaElementCtor) return node
        if (typeof node.captureStream === 'function' || typeof node.mozCaptureStream === 'function') return node
    }

    return null
}

function getMediaStreamAnalyser(playback) {
    const tracks = typeof mediaStream?.getAudioTracks === 'function' ? mediaStream.getAudioTracks() : []
    if (mediaStreamSource && analyser && tracks.some(track => track.readyState === 'live')) return analyser
    disconnectMediaStreamSource()

    const mediaElement = getHowlMediaElement(playback)
    const capture = mediaElement?.captureStream || mediaElement?.mozCaptureStream
    if (!mediaElement || typeof capture !== 'function') return null

    const stream = capture.call(mediaElement)
    if (!stream || typeof stream.getAudioTracks !== 'function' || stream.getAudioTracks().length === 0) return null

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextCtor) return null

    if (!mediaAudioContext) mediaAudioContext = new AudioContextCtor()
    if (mediaAudioContext.state === 'suspended') {
        void mediaAudioContext.resume().catch(() => {})
    }

    const nextAnalyser = configureAnalyser(mediaAudioContext.createAnalyser())
    mediaStream = stream
    mediaStreamSource = mediaAudioContext.createMediaStreamSource(stream)
    mediaStreamSource.connect(nextAnalyser)
    return nextAnalyser
}

function tryAttachAnalyser(retryCount = 0) {
    clearAttachTimer()
    if (!visible.value) return

    const playback = currentMusic.value
    if (!playback) return

    if (attachedPlayback !== playback) {
        resetAnalyser()
        attachedPlayback = playback
        bindPlaybackEventListeners(playback)
    }

    try {
        analyser = playback.__hmWebAudioPlayer
            ? getWebAudioAnalyser(playback)
            : getHowlBufferAnalyser(playback) || getMediaStreamAnalyser(playback)

        if (analyser) {
            analyserData = new Uint8Array(analyser.frequencyBinCount)
            return
        }
    } catch (_) {
        analyser = null
        analyserData = null
    }

    if (retryCount < RETRY_ATTACH_LIMIT) {
        attachTimer = window.setTimeout(() => tryAttachAnalyser(retryCount + 1), 250)
    }
}

function buildAnalyserLevels() {
    if (!analyser || !analyserData || !playing.value) return null

    try {
        analyser.getByteFrequencyData(analyserData)
    } catch (_) {
        analyser = null
        analyserData = null
        return null
    }

    const nextLevels = []
    let total = 0

    for (let i = 0; i < BAR_COUNT; i++) {
        const value = analyserData[i % analyserData.length] / FREQUENCY_VALUE_SCALE
        const level = Math.max(FLAT_LEVEL, value)
        total += level
        nextLevels.push(level)
    }

    if (total / BAR_COUNT < FLAT_LEVEL + 0.015) return null
    return nextLevels
}

function reattachStaleAnalyser() {
    if (!analyser || !playing.value || !visible.value) {
        emptyAnalyserFrames = 0
        return false
    }

    emptyAnalyserFrames += 1
    if (emptyAnalyserFrames < EMPTY_ANALYSER_FRAME_LIMIT) return false

    const now = Date.now()
    if (now - lastAnalyserReattachAt < ANALYSER_REATTACH_COOLDOWN_MS) return false

    lastAnalyserReattachAt = now
    const playback = currentMusic.value
    resetAnalyser({ keepPlayback: true })
    attachedPlayback = playback
    tryAttachAnalyser()
    return true
}

function drawFrame() {
    if (!visible.value) {
        animationFrame = 0
        return
    }

    if (!playing.value) {
        emptyAnalyserFrames = 0
        if (settleFlat()) animationFrame = window.requestAnimationFrame(drawFrame)
        else animationFrame = 0
        return
    }

    const analyserLevels = buildAnalyserLevels()

    if (analyserLevels) {
        emptyAnalyserFrames = 0
        levels.value = analyserLevels
    } else {
        const reattaching = reattachStaleAnalyser()
        settleFlat()
        if (!reattaching && !analyser && !attachTimer) tryAttachAnalyser()
    }

    animationFrame = window.requestAnimationFrame(drawFrame)
}

function start() {
    void nextTick(() => {
        if (!visible.value) return
        updateBarGap()
        if (!analyser && !attachTimer) tryAttachAnalyser()
        if (!animationFrame) animationFrame = window.requestAnimationFrame(drawFrame)
    })
}

function stop() {
    clearAttachTimer()
    emptyAnalyserFrames = 0
    if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = 0
    }
    resetFlat()
}

watch(visible, isVisible => {
    if (isVisible) start()
    else stop()
}, { immediate: true })

watch(currentMusic, () => {
    resetAnalyser()
    resetFlat()
    if (visible.value) start()
})

watch(playing, isPlaying => {
    if (isPlaying && visible.value) start()
})

onMounted(() => {
    void nextTick(updateBarGap)
    if (typeof ResizeObserver !== 'undefined' && visualizerRef.value) {
        resizeObserver = new ResizeObserver(updateBarGap)
        resizeObserver.observe(visualizerRef.value)
    }
})

onBeforeUnmount(() => {
    stop()
    resetAnalyser()
    if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
    }
    if (mediaAudioContext) {
        void mediaAudioContext.close().catch(() => {})
        mediaAudioContext = null
    }
})
</script>

<template>
    <div
        ref="visualizerRef"
        class="audio-visualizer"
        :class="{ 'is-visible': visible, 'is-paused': !playing }"
        :style="{ '--bar-gap': `${barGap}px` }"
        aria-hidden="true"
    >
        <span
            v-for="(level, index) in levels"
            :key="index"
            class="visualizer-bar"
            :style="{ transform: `scaleY(${level})` }"
        ></span>
    </div>
</template>

<style scoped lang="scss">
.audio-visualizer {
    width: var(--visualizer-width);
    height: 22px;
    margin-left: var(--visualizer-gap, 24px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--bar-gap, 2px);
    color: rgba(0, 0, 0, 0.88);
    opacity: 0;
    overflow: hidden;
    pointer-events: none;
    clip-path: inset(0 100% 0 0);
    contain: paint;
    transform: translate3d(0, 7px, 0);
    transform-origin: left center;
    transition:
        clip-path 0.72s cubic-bezier(0.16, 1, 0.3, 1),
        opacity 0.24s ease-out,
        transform 0.72s cubic-bezier(0.16, 1, 0.3, 1);
    will-change: clip-path, opacity, transform;
}

.audio-visualizer.is-visible {
    opacity: 1;
    clip-path: inset(0 0 0 0);
    transform: translate3d(0, 3px, 0);
    transition:
        clip-path 0.72s cubic-bezier(0.16, 1, 0.3, 1),
        opacity 0.38s ease-out 0.08s,
        transform 0.72s cubic-bezier(0.16, 1, 0.3, 1);
}

.visualizer-bar {
    flex: 0 0 3px;
    width: 3px;
    min-width: 3px;
    height: 100%;
    border-radius: 1px;
    background-color: currentColor;
    transform-origin: center;
    opacity: 0;
    transition: opacity 0.28s ease;
    will-change: transform;
}

.audio-visualizer.is-visible .visualizer-bar {
    opacity: 1;
}

.audio-visualizer.is-paused .visualizer-bar {
    opacity: 0.5;
}

:global(html.dark .audio-visualizer) {
    color: rgba(255, 255, 255, 0.92);
}
</style>
