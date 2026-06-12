const BASE64_LOG_MIN_LENGTH = 2048
const IMAGE_DATA_URL_PATTERN = /^data:image\/[^;,]+;base64,/i
const INLINE_IMAGE_DATA_URL_PATTERN = /data:image\/[^;,\s]+;base64,[A-Za-z0-9+/]+={0,2}/gi
const INLINE_BASE64_CHUNK_PATTERN = /[A-Za-z0-9+/]{2048,}={0,2}/g
const BASE64_TEXT_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/
const CONSOLE_METHODS = ['log', 'info', 'debug', 'warn', 'error']

function isBase64Text(text) {
    const trimmed = text.trim()
    const compact = trimmed.replace(/\s+/g, '')
    return compact.length >= BASE64_LOG_MIN_LENGTH
        && compact.length / Math.max(trimmed.length, 1) > 0.95
        && BASE64_TEXT_PATTERN.test(compact)
}

function sanitizeString(value) {
    const text = String(value)
    const trimmed = text.trim()
    if (IMAGE_DATA_URL_PATTERN.test(trimmed)) {
        return `[omitted image data: ${text.length} chars]`
    }

    if (isBase64Text(text)) {
        return `[omitted base64 data: ${text.length} chars]`
    }

    let sanitized = text.replace(
        INLINE_IMAGE_DATA_URL_PATTERN,
        match => `[omitted image data: ${match.length} chars]`,
    )
    sanitized = sanitized.replace(
        INLINE_BASE64_CHUNK_PATTERN,
        match => `[omitted base64 data: ${match.length} chars]`,
    )

    return sanitized === text ? value : sanitized
}

function isPlainObject(value) {
    if (!value || typeof value !== 'object') return false
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

function sanitizeLogValue(value, seen = new WeakSet()) {
    if (typeof value === 'string') return sanitizeString(value)
    if (!value || typeof value !== 'object') return value
    if (value instanceof Error) return value
    if (seen.has(value)) return '[Circular]'

    seen.add(value)
    if (Array.isArray(value)) return value.map(item => sanitizeLogValue(item, seen))
    if (!isPlainObject(value)) return value

    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, sanitizeLogValue(item, seen)]),
    )
}

function sanitizeLogArgs(args) {
    try {
        return args.map(arg => sanitizeLogValue(arg))
    } catch (_) {
        return args
    }
}

export function installLogSanitizer() {
    if (console.__hydrogenMusicLogSanitizerInstalled) return

    Object.defineProperty(console, '__hydrogenMusicLogSanitizerInstalled', {
        value: true,
        enumerable: false,
    })

    for (const method of CONSOLE_METHODS) {
        const original = console[method]
        if (typeof original !== 'function') continue
        console[method] = (...args) => original.apply(console, sanitizeLogArgs(args))
    }
}
