const BILI_STORAGE_KEYS = Object.freeze(['Sessdata', 'BiliJct', 'DedeUserID', 'BiliCookie'])

function getSessionStore() {
    try {
        if (typeof sessionStorage !== 'undefined') return sessionStorage
    } catch (_) {}
    return null
}

function getLocalStore() {
    try {
        if (typeof localStorage !== 'undefined') return localStorage
    } catch (_) {}
    return null
}

function readStoredValue(key) {
    const localStore = getLocalStore()
    try {
        const localValue = localStore?.getItem(key)
        if (localValue) return localValue
    } catch (_) {}

    const sessionStore = getSessionStore()
    try {
        const sessionValue = sessionStore?.getItem(key)
        if (!sessionValue) return ''
        try { localStore?.setItem(key, sessionValue) } catch (_) {}
        return sessionValue
    } catch (_) {
        return ''
    }
}

function writeStoredValue(key, value) {
    if (!value) {
        clearStoredValue(key)
        return
    }

    const text = String(value)
    try { getLocalStore()?.setItem(key, text) } catch (_) {}
    try { getSessionStore()?.removeItem(key) } catch (_) {}
}

function clearStoredValue(key) {
    try { getSessionStore()?.removeItem(key) } catch (_) {}
    try { getLocalStore()?.removeItem(key) } catch (_) {}
}

function safeDecode(value) {
    if (!value) return ''
    try {
        const text = String(value)
        return text.includes('%') ? decodeURIComponent(text) : text
    } catch (_) {
        return String(value)
    }
}

export function migrateLegacyBiliSession() {
    BILI_STORAGE_KEYS.forEach((key) => {
        void readStoredValue(key)
    })
}

export function hasStoredBiliSession() {
    return !!(readStoredValue('BiliCookie') || readStoredValue('Sessdata'))
}

export function readStoredBiliCookie() {
    const storedCookie = readStoredValue('BiliCookie')
    if (storedCookie) return storedCookie

    const sessdata = safeDecode(readStoredValue('Sessdata'))
    if (!sessdata) return ''

    const biliJct = safeDecode(readStoredValue('BiliJct'))
    const dedeUserId = safeDecode(readStoredValue('DedeUserID'))
    let cookieString = `SESSDATA=${sessdata};`
    if (biliJct) cookieString += ` bili_jct=${biliJct};`
    if (dedeUserId) cookieString += ` DedeUserID=${dedeUserId};`
    return cookieString
}

export function storeBiliCookies({ sessdata, biliJct, dedeUserId, cookieString } = {}) {
    if (!sessdata) {
        clearStoredBiliSession()
        return ''
    }

    let nextCookieString = cookieString
    if (!nextCookieString) {
        nextCookieString = `SESSDATA=${sessdata};`
        if (biliJct) nextCookieString += ` bili_jct=${biliJct};`
        if (dedeUserId) nextCookieString += ` DedeUserID=${dedeUserId};`
    }

    writeStoredValue('Sessdata', sessdata)
    if (biliJct) writeStoredValue('BiliJct', biliJct)
    else clearStoredValue('BiliJct')
    if (dedeUserId) writeStoredValue('DedeUserID', dedeUserId)
    else clearStoredValue('DedeUserID')
    writeStoredValue('BiliCookie', nextCookieString)
    return nextCookieString
}

export function clearStoredBiliSession() {
    BILI_STORAGE_KEYS.forEach(clearStoredValue)
}
