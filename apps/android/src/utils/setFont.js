import { applyTraditionalTextByFont } from './traditionalText'

const CUSTOM_FONT_STYLE_ID = '__CUSTOM_FONT__'
const LEGACY_CUSTOM_FONT_STYLE_ID = '__HYDROGEN_CUSTOM_FONT__'
const FONT_WEIGHT_SUFFIXES = ['Regular', 'Bold', 'Medium', 'Semibold']

export const CUSTOM_FONT_FACE_NAME = 'SourceHanSansCN-Bold'

function escapeCssString(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/[\n\r\f]/g, ' ')
}

function getLocalFontCandidates(fontName) {
    const seen = new Set()
    const compactName = fontName.replace(/\s+/g, '')
    const candidates = [
        fontName,
        ...FONT_WEIGHT_SUFFIXES.map(suffix => `${fontName} ${suffix}`),
        compactName,
        ...FONT_WEIGHT_SUFFIXES.map(suffix => `${compactName}-${suffix}`),
    ]

    return candidates.filter(candidate => {
        const key = candidate.toLocaleLowerCase()
        if (seen.has(key)) return false

        seen.add(key)
        return true
    })
}

function insertCustomFontStyle(customFont) {
    if (typeof document === 'undefined') return ''

    const head = document.head || document.querySelector('head')
    if (!head) return ''

    const fontName = typeof customFont === 'string' ? customFont.trim() : ''
    const existingStyle = document.getElementById(CUSTOM_FONT_STYLE_ID)
    document.getElementById(LEGACY_CUSTOM_FONT_STYLE_ID)?.remove()

    if (!fontName) {
        existingStyle?.remove()
        return ''
    }

    const localSources = getLocalFontCandidates(fontName)
        .map(candidate => `local("${escapeCssString(candidate)}")`)
        .join(', ')

    const styleText = `
    @font-face {
      font-family: ${CUSTOM_FONT_FACE_NAME};
      src: ${localSources};
      font-display: swap;
    }`

    const style = existingStyle || document.createElement('style')
    style.id = CUSTOM_FONT_STYLE_ID
    style.textContent = styleText

    if (!existingStyle) head.appendChild(style)
    document.fonts?.load?.(`16px ${CUSTOM_FONT_FACE_NAME}`).catch(() => {})

    return fontName
}

export function applyCustomFontStyle(customFont, customFontLabel = '') {
    const insertedFont = insertCustomFontStyle(customFont)
    applyTraditionalTextByFont(insertedFont, customFontLabel)
    return insertedFont
}

export function syncDesktopLyricCustomFont(customFont, customFontLabel = '') {
    try {
        window.electronAPI?.updateLyricData?.({
            type: 'settings-change',
            customFont,
            customFontLabel,
        })
    } catch (_) {}
}
