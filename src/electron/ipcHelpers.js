const path = require('path')

function parseUrlSafely(value) {
    try {
        return new URL(String(value || '').trim())
    } catch (_) {
        return null
    }
}

function isHttpUrl(urlObj) {
    return !!(urlObj && (urlObj.protocol === 'https:' || urlObj.protocol === 'http:'))
}

function normalizeHttpMethod(value) {
    const method = String(value || 'get').trim().toLowerCase()
    return ['get', 'post'].includes(method) ? method : null
}

function normalizeTimeout(value) {
    const timeout = Number(value)
    if (!Number.isFinite(timeout) || timeout <= 0) return 10000
    return Math.min(Math.round(timeout), 2147483647)
}

function normalizePlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value
}

function normalizeResponseType(value) {
    const normalized = String(value || '').trim().toLowerCase()
    return normalized === 'text' ? 'text' : 'json'
}

function parseCookieString(cookieString) {
    const cookieMap = new Map()
    const cookieText = String(cookieString || '').trim()
    if (!cookieText) return cookieMap

    cookieText.split(';').forEach(segment => {
        const cookiePart = String(segment || '').trim()
        if (!cookiePart) return

        const separatorIndex = cookiePart.indexOf('=')
        if (separatorIndex <= 0) return

        const name = cookiePart.slice(0, separatorIndex).trim()
        const value = cookiePart.slice(separatorIndex + 1).trim()
        if (!name || !value) return
        cookieMap.set(name, value)
    })

    return cookieMap
}

function mergeCookieStrings(...cookieStrings) {
    const mergedCookieMap = new Map()

    cookieStrings.forEach(cookieString => {
        parseCookieString(cookieString).forEach((value, key) => {
            mergedCookieMap.set(key, value)
        })
    })

    if (mergedCookieMap.size === 0) return ''
    return Array.from(mergedCookieMap.entries()).map(([key, value]) => `${key}=${value}`).join('; ')
}

function isPathInsideDirectory(directoryPath, targetPath) {
    if (!directoryPath || !targetPath) return false
    const basePath = path.resolve(directoryPath)
    const resolvedTargetPath = path.resolve(targetPath)
    const relativePath = path.relative(basePath, resolvedTargetPath)
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function sanitizePathToken(value, fallback = 'unknown') {
    const normalized = String(value ?? '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80)
    if (!normalized || normalized === '.' || normalized === '..') return fallback
    return normalized
}

function getBufferLength(data) {
    if (!data) return 0
    if (Buffer.isBuffer(data)) return data.length
    if (data.byteLength && Number.isFinite(data.byteLength)) return data.byteLength
    return Buffer.from(data).length
}

function getImageMime(format, data) {
    let mime = (format && String(format).startsWith('image/')) ? format : null
    if (mime) return mime

    const buf = Buffer.from(data)
    if (buf.length > 12 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png'
    if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg'
    if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
    return 'image/jpeg'
}

function getImageMimeByPath(filePath) {
    const ext = (String(filePath || '').split('.').pop() || '').toLowerCase()
    if (ext === 'png') return 'image/png'
    if (ext === 'webp') return 'image/webp'
    return 'image/jpeg'
}

module.exports = {
    getBufferLength,
    getImageMime,
    getImageMimeByPath,
    isHttpUrl,
    isPathInsideDirectory,
    mergeCookieStrings,
    normalizeHttpMethod,
    normalizePlainObject,
    normalizeResponseType,
    normalizeTimeout,
    parseCookieString,
    parseUrlSafely,
    sanitizePathToken,
}
