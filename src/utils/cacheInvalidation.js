import pinia from '../store/pinia'
import { useLibraryStore } from '../store/libraryStore'

const DEFAULT_CACHE_INVALIDATION_TTL_MS = 130000
const cacheInvalidationTimers = new Map()

const CACHE_INVALIDATION_KEYS = Object.freeze({
    playlist: 'playlist',
    albumSublist: 'album-sublist',
    artistSublist: 'artist-sublist',
})

const CACHE_INVALIDATION_URLS = Object.freeze({
    playlist: ['/playlist/detail', '/playlist/track/all'],
    albumSublist: ['/album/sublist'],
    artistSublist: ['/artist/sublist'],
})

function normalizeCacheInvalidationUrls(urls) {
    if (!Array.isArray(urls)) return []

    const seenUrls = new Set()
    return urls.reduce((result, url) => {
        const normalizedUrl = String(url || '').trim()
        if (!normalizedUrl || seenUrls.has(normalizedUrl)) return result

        seenUrls.add(normalizedUrl)
        result.push(normalizedUrl)
        return result
    }, [])
}

function dedupeNeedTimestampUrls(needTimestamp) {
    if (!Array.isArray(needTimestamp)) return []

    const seenUrls = new Set()
    return needTimestamp.reduce((result, url) => {
        const normalizedUrl = String(url || '').trim()
        if (!normalizedUrl || seenUrls.has(normalizedUrl)) return result

        seenUrls.add(normalizedUrl)
        result.push(normalizedUrl)
        return result
    }, [])
}

function appendNeedTimestampUrls(needTimestamp, urls) {
    const nextNeedTimestamp = removeNeedTimestampUrls(dedupeNeedTimestampUrls(needTimestamp), urls)
    return nextNeedTimestamp.concat(urls)
}

function removeNeedTimestampUrls(needTimestamp, urls) {
    if (!Array.isArray(needTimestamp)) return []
    if (urls.length == 0) return needTimestamp.slice()

    const targetUrls = new Set(urls)
    return needTimestamp.filter(url => !targetUrls.has(url))
}

export function scheduleCacheInvalidationWindow(key, urls, ttlMs = DEFAULT_CACHE_INVALIDATION_TTL_MS) {
    const cacheKey = String(key || '').trim()
    const normalizedUrls = normalizeCacheInvalidationUrls(urls)
    if (!cacheKey || normalizedUrls.length == 0) return

    const safeTtlMs = Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0
        ? Math.floor(Number(ttlMs))
        : DEFAULT_CACHE_INVALIDATION_TTL_MS

    const libraryStore = useLibraryStore(pinia)
    const existingTimer = cacheInvalidationTimers.get(cacheKey)
    if (existingTimer) clearTimeout(existingTimer)

    libraryStore.needTimestamp = appendNeedTimestampUrls(libraryStore.needTimestamp, normalizedUrls)

    const timerId = setTimeout(() => {
        if (cacheInvalidationTimers.get(cacheKey) !== timerId) return

        const currentLibraryStore = useLibraryStore(pinia)
        currentLibraryStore.needTimestamp = removeNeedTimestampUrls(currentLibraryStore.needTimestamp, normalizedUrls)
        cacheInvalidationTimers.delete(cacheKey)
    }, safeTtlMs)

    cacheInvalidationTimers.set(cacheKey, timerId)
}

export function schedulePlaylistCacheInvalidation(ttlMs = DEFAULT_CACHE_INVALIDATION_TTL_MS) {
    scheduleCacheInvalidationWindow(CACHE_INVALIDATION_KEYS.playlist, CACHE_INVALIDATION_URLS.playlist, ttlMs)
}

export function scheduleAlbumSublistCacheInvalidation(ttlMs = DEFAULT_CACHE_INVALIDATION_TTL_MS) {
    scheduleCacheInvalidationWindow(CACHE_INVALIDATION_KEYS.albumSublist, CACHE_INVALIDATION_URLS.albumSublist, ttlMs)
}

export function scheduleArtistSublistCacheInvalidation(ttlMs = DEFAULT_CACHE_INVALIDATION_TTL_MS) {
    scheduleCacheInvalidationWindow(CACHE_INVALIDATION_KEYS.artistSublist, CACHE_INVALIDATION_URLS.artistSublist, ttlMs)
}
