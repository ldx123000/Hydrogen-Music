import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import pinia from '../../store/pinia'
import { usePlayerStore } from '../../store/playerStore'

const playerStore = usePlayerStore(pinia)
const { currentMusic, playing, progress, time } = storeToRefs(playerStore)

export const PLAYBACK_TICK_FAST_INTERVAL_MS = 200

let subscriberIdSeed = 0
let tickerTimer = null
let tickerInterval = 0
const subscribers = new Map()
const DEFAULT_PLAYBACK_TICK_INTERVAL_MS = 1000
const MIN_PLAYBACK_TICK_INTERVAL_MS = 25

function normalizeInterval(interval) {
    const parsedInterval = Number(interval)
    if (!Number.isFinite(parsedInterval) || parsedInterval <= 0) return DEFAULT_PLAYBACK_TICK_INTERVAL_MS
    return Math.max(MIN_PLAYBACK_TICK_INTERVAL_MS, Math.round(parsedInterval))
}

function getSafeCurrentSeek() {
    try {
        if (currentMusic.value && typeof currentMusic.value.seek === 'function') {
            const seekValue = currentMusic.value.seek()
            if (typeof seekValue === 'number' && !Number.isNaN(seekValue)) return seekValue
        }
    } catch (_) {}

    const fallbackProgress = Number(progress.value)
    return Number.isFinite(fallbackProgress) ? fallbackProgress : 0
}

function getSafeCurrentDuration() {
    try {
        if (currentMusic.value && typeof currentMusic.value.duration === 'function') {
            const durationValue = currentMusic.value.duration()
            if (typeof durationValue === 'number' && !Number.isNaN(durationValue) && durationValue > 0) return durationValue
        }
    } catch (_) {}

    const fallbackDuration = Number(time.value)
    return Number.isFinite(fallbackDuration) && fallbackDuration > 0 ? fallbackDuration : 0
}

function createSnapshot() {
    return {
        seek: getSafeCurrentSeek(),
        duration: getSafeCurrentDuration(),
        playing: !!playing.value,
    }
}

function clearTicker() {
    if (!tickerTimer) return
    clearInterval(tickerTimer)
    tickerTimer = null
    tickerInterval = 0
}

function getDesiredTickerInterval() {
    if (!playing.value || subscribers.size === 0) return 0

    let nextInterval = DEFAULT_PLAYBACK_TICK_INTERVAL_MS
    subscribers.forEach(subscriber => {
        nextInterval = Math.min(nextInterval, subscriber.interval)
    })
    return nextInterval
}

function tick(force = false) {
    if (subscribers.size === 0) return

    const now = Date.now()
    const snapshot = createSnapshot()
    subscribers.forEach(subscriber => {
        if (!force && now - subscriber.lastRunAt < subscriber.interval) return
        runSubscriber(subscriber, snapshot, now)
    })
}

function runSubscriber(subscriber, snapshot = createSnapshot(), now = Date.now()) {
    subscriber.lastRunAt = now
    try {
        subscriber.callback(snapshot)
    } catch (_) {}
}

function syncTicker() {
    const nextInterval = getDesiredTickerInterval()
    if (nextInterval === 0) {
        clearTicker()
        return
    }

    if (tickerTimer && tickerInterval === nextInterval) return

    clearTicker()
    tickerInterval = nextInterval
    tickerTimer = setInterval(() => {
        tick(false)
    }, nextInterval)
}

watch(
    () => playing.value,
    () => {
        syncTicker()
        if (playing.value) tick(true)
    },
    { immediate: true }
)

export function subscribePlaybackTick(callback, options = {}) {
    if (typeof callback !== 'function') return () => {}

    subscriberIdSeed += 1
    const subscriberId = options.id || `playback-ticker-${subscriberIdSeed}`
    const subscriber = {
        id: subscriberId,
        interval: normalizeInterval(options.interval),
        callback,
        lastRunAt: 0,
    }

    subscribers.set(subscriberId, subscriber)
    syncTicker()

    if (options.immediate !== false) {
        runSubscriber(subscriber)
    }

    return () => {
        if (subscribers.get(subscriberId) === subscriber) {
            subscribers.delete(subscriberId)
        }
        syncTicker()
    }
}

export function getPlaybackSnapshot() {
    return createSnapshot()
}
