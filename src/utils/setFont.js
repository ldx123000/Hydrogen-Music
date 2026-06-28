const CUSTOM_FONT_STYLE_ID = '__HM_CUSTOM_FONT__'
const CUSTOM_FONT_FACE_NAME = 'SourceHanSansCN-Bold'

function escapeCssString(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/[\n\r\f]/g, ' ')
}

function insertCustomFontStyle(customFont) {
    if (typeof document === 'undefined') return ''

    const head = document.head || document.querySelector('head')
    if (!head) return ''

    const fontName = typeof customFont === 'string' ? customFont.trim() : ''
    const existingStyle = document.getElementById(CUSTOM_FONT_STYLE_ID)

    if (!fontName) {
        existingStyle?.remove()
        return ''
    }

    const styleText = `
    @font-face {
      font-family: ${CUSTOM_FONT_FACE_NAME};
      src: local("${escapeCssString(fontName)}");
      font-display: swap;
    }`

    const style = existingStyle || document.createElement('style')
    style.id = CUSTOM_FONT_STYLE_ID
    style.textContent = styleText
    if (!existingStyle) head.appendChild(style)

    document.fonts?.load?.(`16px ${CUSTOM_FONT_FACE_NAME}`).catch(() => {})
    return fontName
}

export function applyCustomFontStyle(customFont) {
    return insertCustomFontStyle(customFont)
}
