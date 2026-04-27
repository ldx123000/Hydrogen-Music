import { defineStore } from "pinia";
import { getCloudDiskData } from "../api/cloud";

const BYTES_PER_GB = 1024 * 1024 * 1024
let cloudRefreshToken = 0
let pendingCloudDataRequest = null
let pendingCloudDataUserId = null

function normalizeUserId(userId) {
    if (userId == null || userId === '') return null
    return String(userId)
}

function clearPendingRequest() {
    pendingCloudDataRequest = null
    pendingCloudDataUserId = null
}

function clearCloudDataState(store) {
    store.count = null
    store.size = null
    store.maxSize = null
    store.cloudSongs = null
    store.loadedUserId = null
    store.loadedAt = 0
}

function hasCloudDataForUser(store, userId) {
    const normalizedUserId = normalizeUserId(userId)
    return !!normalizedUserId
        && store.loadedUserId === normalizedUserId
        && Array.isArray(store.cloudSongs)
}

export const useCloudStore= defineStore('cloudStore', {
    state: () => {
        return {
            count: null,
            size: null,
            maxSize: null,
            cloudSongs: null,
            loadedUserId: null,
            loadedAt: 0,
        }
    },
    actions: {
        resetAccountState() {
            cloudRefreshToken += 1
            clearPendingRequest()
            clearCloudDataState(this)
        },
        async refreshCloudData(userId, options = {}) {
            const currentUserId = normalizeUserId(userId)
            const maxAge = Number(options.maxAge || 0)
            const now = Date.now()
            const hasCurrentUserData = hasCloudDataForUser(this, currentUserId)

            if (!currentUserId) {
                this.resetAccountState()
                return false
            }

            if (!options.force && hasCurrentUserData && maxAge > 0 && now - this.loadedAt < maxAge) {
                return true
            }

            if (!options.force && pendingCloudDataRequest && pendingCloudDataUserId === currentUserId) {
                return pendingCloudDataRequest
            }

            if (options.force || this.loadedUserId !== currentUserId) {
                clearCloudDataState(this)
            }

            const requestToken = ++cloudRefreshToken

            const request = getCloudDiskData({
                limit: 500,
                offset: 0,
                timestamp: now,
            }).then(result => {
                if (requestToken !== cloudRefreshToken) return false

                this.count = Number(result?.count || 0)
                this.size = Number(((Number(result?.size) || 0) / BYTES_PER_GB).toFixed(1))
                this.maxSize = Number(Number(result?.maxSize || 0) / BYTES_PER_GB)
                this.cloudSongs = Array.isArray(result?.data) ? result.data : []
                this.loadedUserId = currentUserId
                this.loadedAt = Date.now()
                return true
            }).catch(error => {
                if (requestToken !== cloudRefreshToken) return false

                console.error('获取云盘数据失败:', error)
                if (!hasCurrentUserData) {
                    clearCloudDataState(this)
                }
                return false
            }).finally(() => {
                if (pendingCloudDataRequest === request) {
                    clearPendingRequest()
                }
            })

            pendingCloudDataRequest = request
            pendingCloudDataUserId = currentUserId
            return request
        }
    },
})
