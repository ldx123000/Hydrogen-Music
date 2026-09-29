let cachedSystemFontOptions = []
let systemFontOptionsPromise = null

export const DEFAULT_FONT_OPTION = Object.freeze({
    label: '思源黑体（默认字体）',
    value: '',
})

function normalizeFontName(fontName) {
    return typeof fontName === 'string' ? fontName.trim() : ''
}

function getFontNameKey(fontName) {
    return normalizeFontName(fontName).toLocaleLowerCase()
}

function normalizeFontOption(option) {
    if (typeof option === 'string') {
        const fontName = normalizeFontName(option)
        return fontName ? { label: fontName, value: fontName } : null
    }

    const value = normalizeFontName(option?.value || option?.label)
    const label = normalizeFontName(option?.label || option?.value)
    if (!label || !value) return null

    return { label, value }
}

function normalizeFontOptions(options) {
    return Array.isArray(options)
        ? options.map(normalizeFontOption).filter(Boolean)
        : []
}

function hasNonAscii(text) {
    return /[^\x00-\x7F]/.test(text)
}

function hasChineseText(text) {
    return /[\u3400-\u9fff\uf900-\ufaff]/.test(String(text || ''))
}

function getDisplayLabelScore(label, value) {
    const normalizedLabel = normalizeFontName(label)
    const normalizedValue = normalizeFontName(value)
    if (!normalizedLabel) return -1

    let score = 0
    if (getFontNameKey(normalizedLabel) !== getFontNameKey(normalizedValue)) score += 2
    if (hasNonAscii(normalizedLabel)) score += 4
    if (/\s/.test(normalizedLabel) && !/\s/.test(normalizedValue)) score += 1
    return score
}

function isBetterDisplayLabel(candidateLabel, currentLabel, value) {
    const candidateScore = getDisplayLabelScore(candidateLabel, value)
    const currentScore = getDisplayLabelScore(currentLabel, value)
    if (candidateScore !== currentScore) return candidateScore > currentScore

    const candidate = normalizeFontName(candidateLabel)
    const current = normalizeFontName(currentLabel)
    if (!candidate) return false
    if (!current) return true
    if (candidate.length !== current.length) return candidate.length < current.length
    return candidate.localeCompare(current, undefined, { sensitivity: 'base' }) < 0
}

function compareFontOptionsByDisplayName(left, right) {
    const leftLabel = normalizeFontName(left?.label)
    const rightLabel = normalizeFontName(right?.label)
    const leftHasChinese = hasChineseText(leftLabel)
    const rightHasChinese = hasChineseText(rightLabel)

    if (leftHasChinese !== rightHasChinese) return leftHasChinese ? -1 : 1

    const labelOrder = leftLabel.localeCompare(
        rightLabel,
        leftHasChinese && rightHasChinese ? 'zh-Hans-CN' : undefined,
        { numeric: true, sensitivity: 'base' }
    )
    if (labelOrder !== 0) return labelOrder

    return normalizeFontName(left?.value).localeCompare(
        normalizeFontName(right?.value),
        undefined,
        { numeric: true, sensitivity: 'base' }
    )
}

export function buildFontOptions({ systemFonts = [], customFont = '', customFontLabel = '' } = {}) {
    const byValue = new Map()
    const addFont = font => {
        const option = normalizeFontOption(font)
        if (!option) return

        const key = getFontNameKey(option.value)
        const current = byValue.get(key)
        if (!current || isBetterDisplayLabel(option.label, current.label, option.value)) {
            byValue.set(key, option)
        }
    }

    if (customFontLabel) addFont({ label: customFontLabel, value: customFont })
    systemFonts.forEach(addFont)
    if (!customFontLabel) addFont(customFont)

    return [
        { ...DEFAULT_FONT_OPTION },
        ...Array.from(byValue.values()).sort(compareFontOptionsByDisplayName),
    ]
}

function setCachedSystemFontOptions(options) {
    cachedSystemFontOptions = normalizeFontOptions(options)
    return getCachedSystemFontOptions()
}

function getCachedSystemFontOptions() {
    return cachedSystemFontOptions.map(option => ({ ...option }))
}

function fontOptionMatchesName(option, normalizedName) {
    return getFontNameKey(option?.value) === normalizedName
        || getFontNameKey(option?.label) === normalizedName
}

function findFontOptionByName(fontName, fontOptions) {
    const normalizedName = getFontNameKey(fontName)
    return normalizedName
        ? fontOptions.find(option => fontOptionMatchesName(option, normalizedName))
        : null
}

export async function loadSystemFontOptions() {
    if (cachedSystemFontOptions.length > 0) return getCachedSystemFontOptions()
    if (systemFontOptionsPromise) return systemFontOptionsPromise

    if (typeof windowApi === 'undefined' || typeof windowApi?.getSystemFonts !== 'function') {
        return []
    }

    systemFontOptionsPromise = windowApi.getSystemFonts()
        .then(setCachedSystemFontOptions)
        .catch(error => {
            console.error('读取系统字体失败:', error)
            return []
        })
        .finally(() => {
            systemFontOptionsPromise = null
        })

    return systemFontOptionsPromise
}

export function resolveSystemFontValue(fontName, options = cachedSystemFontOptions) {
    const normalizedFontName = normalizeFontName(fontName)
    if (!normalizedFontName) return ''

    const fontOptions = normalizeFontOptions(options)
    return findFontOptionByName(normalizedFontName, fontOptions)?.value || normalizedFontName
}

export function resolveSystemFontLabel(fontName, fallback = '', options = cachedSystemFontOptions) {
    const normalizedFontName = normalizeFontName(fontName)
    if (!normalizedFontName) return ''

    const fontOptions = normalizeFontOptions(options)
    const resolvedValue = findFontOptionByName(normalizedFontName, fontOptions)?.value || normalizedFontName
    const normalizedValue = getFontNameKey(resolvedValue)
    const normalizedFallback = normalizeFontName(fallback || normalizedFontName)

    let displayLabel = normalizedFallback || resolvedValue
    for (const option of fontOptions) {
        if (!fontOptionMatchesName(option, normalizedValue)) continue
        if (isBetterDisplayLabel(option.label, displayLabel, resolvedValue)) {
            displayLabel = option.label
        }
    }

    return displayLabel
}

export async function resolveSystemFontValueAsync(fontName) {
    const normalizedFontName = normalizeFontName(fontName)
    const resolvedFromCache = resolveSystemFontValue(normalizedFontName)
    if (resolvedFromCache !== normalizedFontName || !hasNonAscii(normalizedFontName)) {
        return resolvedFromCache
    }

    const options = await loadSystemFontOptions()
    return resolveSystemFontValue(normalizedFontName, options)
}

export async function resolveSystemFontOptionAsync(fontName, fallbackLabel = '') {
    const normalizedFontName = normalizeFontName(fontName)
    if (!normalizedFontName) return { value: '', label: '' }

    const options = await loadSystemFontOptions()
    const value = resolveSystemFontValue(normalizedFontName, options)
    const label = resolveSystemFontLabel(value, fallbackLabel || normalizedFontName, options)
    return { value, label }
}
