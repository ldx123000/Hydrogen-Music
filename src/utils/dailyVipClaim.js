import { reactive } from 'vue'
import { claimYouthDailyVip, getServerNow, getYouthVipMonthRecord, getYouthVipUnionStatus } from '../api/user'
import { getCookie, isLogin } from './authority'
import { noticeOpen } from './dialog'

const STORAGE_PREFIX = 'hydrogenmusic:daily-vip'
const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'

export const dailyVipClaimState = reactive({
    running: false,
    status: 'idle',
    userId: '',
    claimDay: '',
    message: '',
    source: '',
    updatedAt: 0,
    serverTime: 0,
})

let claimPromise = null

function getCurrentUserId() {
    return String(getCookie('userid') || '').trim()
}

function getStorageKey(userId) {
    return `${STORAGE_PREFIX}:${userId}`
}

function readStoredRecord(userId) {
    if (!userId || typeof localStorage === 'undefined') return null

    try {
        const raw = localStorage.getItem(getStorageKey(userId))
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : null
    } catch (_) {
        return null
    }
}

function writeStoredRecord(userId, record) {
    if (!userId || typeof localStorage === 'undefined') return

    try {
        localStorage.setItem(getStorageKey(userId), JSON.stringify(record))
    } catch (_) {}
}

function updateState(partial = {}) {
    Object.assign(dailyVipClaimState, partial, {
        updatedAt: Date.now(),
    })
}

function toDateString(value) {
    return String(value || '').trim()
}

function formatShanghaiDate(timestamp) {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return ''

    try {
        const formatter = new Intl.DateTimeFormat('en', {
            timeZone: SHANGHAI_TIME_ZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        })
        const parts = formatter.formatToParts(date)
        const year = parts.find(item => item.type === 'year')?.value
        const month = parts.find(item => item.type === 'month')?.value
        const day = parts.find(item => item.type === 'day')?.value
        if (year && month && day) return `${year}-${month}-${day}`
    } catch (_) {}

    // 兜底：用 UTC+8 手动拼接，避免本地时区影响领取日期。
    const shanghai = new Date(date.getTime() + 8 * 60 * 60 * 1000)
    const year = shanghai.getUTCFullYear()
    const month = String(shanghai.getUTCMonth() + 1).padStart(2, '0')
    const day = String(shanghai.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function pickNumber(...values) {
    for (const value of values) {
        const number = Number(value)
        if (Number.isFinite(number)) return number
    }
    return NaN
}

function extractResponsePayload(result) {
    return result?.data ?? result?.result ?? result ?? {}
}

function extractServerTimestamp(result) {
    const payload = extractResponsePayload(result)
    const candidates = [
        payload?.timestamp,
        payload?.serverTime,
        payload?.server_time,
        payload?.now,
        payload?.time,
        payload?.data?.timestamp,
        payload?.data?.serverTime,
        payload?.data?.server_time,
        payload?.data?.now,
        payload?.data?.time,
    ]

    const resolved = pickNumber(...candidates)
    return Number.isFinite(resolved) ? resolved : Date.now()
}

function normalizeText(value) {
    return toDateString(value)
}

function walkPayload(payload, visitor, seen = new Set()) {
    if (payload == null) return
    if (typeof payload !== 'object') {
        visitor(payload)
        return
    }

    if (seen.has(payload)) return
    seen.add(payload)

    if (Array.isArray(payload)) {
        payload.forEach(item => walkPayload(item, visitor, seen))
        return
    }

    visitor(payload)
    Object.values(payload).forEach(item => walkPayload(item, visitor, seen))
}

function hasClaimDayInPayload(payload, claimDay) {
    let matched = false

    walkPayload(payload, (item) => {
        if (matched || item == null) return

        if (typeof item === 'string') {
            if (item === claimDay || item.includes(claimDay)) {
                matched = true
            }
            return
        }

        if (typeof item !== 'object') return

        const directDay = toDateString(item.receive_day || item.receiveDay || item.day || item.date || item.claim_day)
        if (directDay && directDay.includes(claimDay)) {
            matched = true
            return
        }

        const claimFlags = [
            item.received,
            item.is_received,
            item.isReceive,
            item.has_received,
            item.hasReceive,
            item.already_received,
            item.alreadyReceive,
        ]

        if (claimFlags.some(flag => flag === true || flag === 1 || flag === '1' || String(flag).toLowerCase() === 'true')) {
            matched = true
        }
    })

    return matched
}

function isClaimedText(text) {
    return /已领取|已经领取|今日已领|今天已领|重复领取|领取过|already\s*claimed|claimed\s*today/i.test(text)
}

function isLoginErrorText(text) {
    return /需要登录|请先登录|not\s*login|invalid\s*session|登录状态已失效|登录已过期/i.test(text)
}

function isSuccessResponse(result) {
    const payload = extractResponsePayload(result)
    const status = pickNumber(payload?.status, payload?.data?.status)
    const code = pickNumber(payload?.code, payload?.data?.code)
    const success = payload?.success ?? payload?.data?.success
    const text = normalizeText(payload?.msg || payload?.message || payload?.desc || payload?.data?.msg || payload?.data?.message)

    if (success === true) return true
    if (status === 1 || status === 200) return true
    if (code === 0 || code === 200) return true
    return /成功|领取成功|操作成功/i.test(text) && !/失败|error|错误/i.test(text)
}

function storeClaimResult(userId, claimDay, status, message, extra = {}) {
    const record = {
        userId,
        claimDay,
        status,
        message: message || '',
        source: extra.source || '',
        serverTime: extra.serverTime || 0,
        updatedAt: Date.now(),
    }

    writeStoredRecord(userId, record)
    updateState(record)
    return record
}

async function resolveClaimDay() {
    try {
        const result = await getServerNow()
        const serverTime = extractServerTimestamp(result)
        return {
            claimDay: formatShanghaiDate(serverTime),
            serverTime,
        }
    } catch (_) {
        const fallbackTime = Date.now()
        return {
            claimDay: formatShanghaiDate(fallbackTime),
            serverTime: fallbackTime,
        }
    }
}

async function precheckClaimed(claimDay) {
    const [unionStatus, monthRecord] = await Promise.allSettled([
        getYouthVipUnionStatus(),
        getYouthVipMonthRecord(),
    ])

    if (unionStatus.status === 'fulfilled' && hasClaimDayInPayload(unionStatus.value, claimDay)) {
        return true
    }

    if (monthRecord.status === 'fulfilled' && hasClaimDayInPayload(monthRecord.value, claimDay)) {
        return true
    }

    return false
}

/**
 * 启动后自动领取当天 VIP。
 * - 只对登录用户生效
 * - 同一用户同一天只会尝试一次
 * - 领取失败也会记录，避免频繁重试
 * @param {string} source - 触发来源，便于调试和状态展示
 * @returns {Promise<object|null>}
 */
export function runDailyVipAutoClaim(source = 'startup') {
    if (claimPromise) return claimPromise

    claimPromise = (async () => {
        const userId = getCurrentUserId()
        if (!isLogin() || !userId) {
            updateState({
                running: false,
                status: 'idle',
                userId: '',
                claimDay: '',
                message: '',
                source,
            })
            return null
        }

        const { claimDay, serverTime } = await resolveClaimDay()
        const storedRecord = readStoredRecord(userId)

        if (storedRecord?.claimDay === claimDay && storedRecord?.status) {
            updateState({
                running: false,
                ...storedRecord,
                userId,
                claimDay,
                source,
            })
            return {
                status: storedRecord.status,
                claimDay,
                message: storedRecord.message || '',
                skipped: true,
            }
        }

        updateState({
            running: true,
            status: 'checking',
            userId,
            claimDay,
            message: '正在检查今日 VIP 领取状态',
            source,
            serverTime,
        })

        try {
            const alreadyClaimed = await precheckClaimed(claimDay)
            if (!isLogin() || getCurrentUserId() !== userId) {
                updateState({
                    running: false,
                    status: 'idle',
                    userId: getCurrentUserId(),
                    claimDay: '',
                    message: '',
                    source,
                })
                return null
            }

            if (alreadyClaimed) {
                const record = storeClaimResult(userId, claimDay, 'already', '今日已领取', {
                    source,
                    serverTime,
                })
                return {
                    ...record,
                    alreadyClaimed: true,
                }
            }

            updateState({
                running: true,
                status: 'claiming',
                message: '正在领取今日 VIP',
            })

            const result = await claimYouthDailyVip(claimDay)
            const payload = extractResponsePayload(result)
            const message = normalizeText(payload?.msg || payload?.message || payload?.desc || payload?.data?.msg || payload?.data?.message)

            if (isLoginErrorText(message) || !isLogin() || getCurrentUserId() !== userId) {
                updateState({
                    running: false,
                    status: 'idle',
                    userId: getCurrentUserId(),
                    claimDay: '',
                    message: '',
                    source,
                })
                return null
            }

            if (isSuccessResponse(result)) {
                const record = storeClaimResult(userId, claimDay, 'success', message || '今日 VIP 领取成功', {
                    source,
                    serverTime,
                })
                noticeOpen('今日 VIP 领取成功', 2)
                return record
            }

            if (isClaimedText(message)) {
                const record = storeClaimResult(userId, claimDay, 'already', message || '今日已领取', {
                    source,
                    serverTime,
                })
                noticeOpen('今日 VIP 已领取', 2)
                return record
            }

            const failureMessage = message || '今日 VIP 领取失败'
            const record = storeClaimResult(userId, claimDay, 'failed', failureMessage, {
                source,
                serverTime,
            })
            noticeOpen(`今日 VIP 领取失败：${failureMessage}`, 2)
            return record
        } catch (error) {
            const failureMessage = normalizeText(error?.response?.data?.msg || error?.response?.data?.message || error?.message) || '未知错误'
            if (isLoginErrorText(failureMessage) || !isLogin()) {
                updateState({
                    running: false,
                    status: 'idle',
                    userId: getCurrentUserId(),
                    claimDay: '',
                    message: '',
                    source,
                })
                return null
            }
            const record = storeClaimResult(userId, claimDay, 'failed', failureMessage, {
                source,
                serverTime,
            })
            noticeOpen(`今日 VIP 领取失败：${failureMessage}`, 2)
            return record
        } finally {
            updateState({
                running: false,
                source,
            })
        }
    })().finally(() => {
        claimPromise = null
    })

    return claimPromise
}

/**
 * 供设置页等位置展示当前领取状态。
 * @param {string} userId
 * @returns {string}
 */
export function getDailyVipClaimText(userId = getCurrentUserId()) {
    const targetUserId = String(userId || '').trim()
    if (!isLogin() || !targetUserId) return '未登录'

    if (dailyVipClaimState.userId === targetUserId) {
        if (dailyVipClaimState.running || dailyVipClaimState.status === 'checking' || dailyVipClaimState.status === 'claiming') {
            return '自动检查中'
        }
        if (dailyVipClaimState.status === 'success' || dailyVipClaimState.status === 'already') {
            return '今日已领取'
        }
        if (dailyVipClaimState.status === 'failed') {
            return '今日领取失败'
        }
    }

    const storedRecord = readStoredRecord(targetUserId)
    if (!storedRecord) return '未领取'

    if (storedRecord.status === 'success' || storedRecord.status === 'already') {
        return '今日已领取'
    }

    if (storedRecord.status === 'failed') {
        return '今日已尝试'
    }

    return '未领取'
}
