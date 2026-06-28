let cachedSystemFonts = []
let systemFontsPromise = null

export const DEFAULT_FONT_OPTION = Object.freeze({
    label: '思源黑体（默认字体）',
    value: '',
})

function normalizeFontName(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function normalizeFontOption(option) {
    if (typeof option === 'string') {
        const fontName = normalizeFontName(option)
        return fontName ? { label: fontName, value: fontName } : null
    }

    const value = normalizeFontName(option?.value || option?.label)
    const label = normalizeFontName(option?.label || option?.value)
    if (!value || !label) return null
    return { label, value }
}

function fontNameKey(value) {
    return normalizeFontName(value).toLocaleLowerCase()
}

function normalizeFontOptions(options) {
    return Array.isArray(options)
        ? options.map(normalizeFontOption).filter(Boolean)
        : []
}

export function buildFontOptions({ systemFonts = [], customFont = '', customFontLabel = '' } = {}) {
    const byValue = new Map()

    const addFont = option => {
        const normalized = normalizeFontOption(option)
        if (!normalized) return
        const key = fontNameKey(normalized.value)
        if (!byValue.has(key)) byValue.set(key, normalized)
    }

    if (customFont) addFont({ label: customFontLabel || customFont, value: customFont })
    systemFonts.forEach(addFont)

    return [
        { ...DEFAULT_FONT_OPTION },
        ...Array.from(byValue.values()).sort((left, right) =>
            left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
        ),
    ]
}

export async function loadSystemFontOptions() {
    if (cachedSystemFonts.length > 0) return [...cachedSystemFonts]
    if (systemFontsPromise) return systemFontsPromise
    if (typeof windowApi === 'undefined' || typeof windowApi.getSystemFonts !== 'function') return []

    systemFontsPromise = windowApi.getSystemFonts()
        .then(fonts => {
            cachedSystemFonts = normalizeFontOptions(fonts)
            return [...cachedSystemFonts]
        })
        .catch(error => {
            console.error('读取系统字体失败:', error)
            return []
        })
        .finally(() => {
            systemFontsPromise = null
        })

    return systemFontsPromise
}

export function resolveSystemFontValue(fontName, options = cachedSystemFonts) {
    const normalizedFontName = normalizeFontName(fontName)
    if (!normalizedFontName) return ''

    const fontOptions = normalizeFontOptions(options)
    const matchedOption = fontOptions.find(option =>
        fontNameKey(option.value) === fontNameKey(normalizedFontName)
        || fontNameKey(option.label) === fontNameKey(normalizedFontName)
    )

    return matchedOption?.value || normalizedFontName
}

export function resolveSystemFontLabel(fontName, fallback = '', options = cachedSystemFonts) {
    const normalizedFontName = normalizeFontName(fontName)
    if (!normalizedFontName) return ''

    const fontOptions = normalizeFontOptions(options)
    const matchedOption = fontOptions.find(option =>
        fontNameKey(option.value) === fontNameKey(normalizedFontName)
        || fontNameKey(option.label) === fontNameKey(normalizedFontName)
    )

    return matchedOption?.label || normalizeFontName(fallback) || normalizedFontName
}
