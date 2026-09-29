const COMMON_SKIP_SELECTORS = [
    'script',
    'style',
    'noscript',
    'svg',
    'canvas',
    '.ignore-opencc',
    '[data-opencc-ignore="true"]',
]
const TEXT_SKIP_SELECTOR = [
    ...COMMON_SKIP_SELECTORS,
    'textarea',
    'select',
    'option',
    'pre',
    'code',
    'kbd',
    'samp',
    '[contenteditable="true"]',
].join(',')
const ATTRIBUTE_SKIP_SELECTOR = COMMON_SKIP_SELECTORS.join(',')
const CONVERTIBLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt']
const TRADITIONAL_TEXT_TARGETS = new Set(['hk', 'tw', 'twp', 't'])

let enabled = false
let currentTarget = ''
let converter = null
let observer = null
let applyingConversion = false
let openccModulePromise = null
let modeToken = 0
let originalHtmlLang = null
const originalTextByNode = new WeakMap()
const convertedTextNodes = new Set()
const originalAttributesByElement = new WeakMap()
const convertedAttributeElements = new Set()

function hasChineseText(text) {
    return /[\u3400-\u9fff\uf900-\ufaff]/.test(String(text || ''))
}

function normalizeFontText(...parts) {
    return parts
        .map(part => String(part || ''))
        .filter(Boolean)
        .join(' ')
}

function loadOpenCCModule() {
    if (!openccModulePromise) openccModulePromise = import('opencc-js/cn2t')
    return openccModulePromise
}

function hasSeparatedLatinToken(text, token) {
    return new RegExp(`[A-Za-z]${token}(?:[-_\\s]|$)|(?:^|[-_\\s])${token}(?:[-_\\s]|$)`, 'i').test(text)
}

function getTraditionalTextTargetForFont(fontName = '', fontLabel = '') {
    const text = normalizeFontText(fontName, fontLabel)
    if (!text) return ''

    if (
        /[\u6e2f\u6fb3]|\b(Hong\s*Kong|Macau|Macao)\b/i.test(text)
        || hasSeparatedLatinToken(text, 'HK')
        || hasSeparatedLatinToken(text, 'MO')
    ) {
        return 'hk'
    }

    if (
        /[\u7e41\u50b3\u81fa\u53f0]|\b(Traditional|Taiwan)\b/i.test(text)
        || hasSeparatedLatinToken(text, 'TC')
        || hasSeparatedLatinToken(text, 'TW')
    ) {
        return 'twp'
    }

    return ''
}

function getRootElement() {
    if (typeof document === 'undefined') return null
    return document.body || document.documentElement
}

function getElementForNode(node) {
    if (!node) return null
    if (node.nodeType === Node.ELEMENT_NODE) return node
    return node.parentElement || null
}

function shouldSkipTextNode(node) {
    const element = getElementForNode(node)
    return !element || !!element.closest(TEXT_SKIP_SELECTOR)
}

function shouldSkipElementAttributes(element) {
    return !element || !!element.closest(ATTRIBUTE_SKIP_SELECTOR)
}

function convertTextNode(node) {
    if (!enabled || !converter || !node || node.nodeType !== Node.TEXT_NODE || shouldSkipTextNode(node)) return

    const currentText = node.nodeValue || ''
    if (!hasChineseText(currentText)) return

    const previousOriginal = originalTextByNode.get(node)
    if (previousOriginal !== undefined && currentText === converter(previousOriginal)) return

    const originalText = currentText
    const convertedText = converter(originalText)
    if (convertedText === originalText) {
        if (previousOriginal !== undefined) {
            originalTextByNode.delete(node)
            convertedTextNodes.delete(node)
        }
        return
    }

    originalTextByNode.set(node, originalText)
    convertedTextNodes.add(node)
    applyingConversion = true
    try {
        node.nodeValue = convertedText
    } finally {
        applyingConversion = false
    }
}

function convertElementAttributes(element) {
    if (!enabled || !converter || !element || element.nodeType !== Node.ELEMENT_NODE || shouldSkipElementAttributes(element)) return

    for (const attribute of CONVERTIBLE_ATTRIBUTES) {
        const currentValue = element.getAttribute(attribute)
        if (!currentValue || !hasChineseText(currentValue)) continue

        const elementAttributes = originalAttributesByElement.get(element)
        const previousOriginal = elementAttributes?.get(attribute)
        if (previousOriginal !== undefined && currentValue === converter(previousOriginal)) continue

        const originalValue = currentValue
        const convertedValue = converter(originalValue)
        if (convertedValue === originalValue) continue

        let nextElementAttributes = elementAttributes
        if (!nextElementAttributes) {
            nextElementAttributes = new Map()
            originalAttributesByElement.set(element, nextElementAttributes)
            convertedAttributeElements.add(element)
        }
        nextElementAttributes.set(attribute, originalValue)

        applyingConversion = true
        try {
            element.setAttribute(attribute, convertedValue)
        } finally {
            applyingConversion = false
        }
    }
}

function convertTree(root) {
    if (!root) return

    if (root.nodeType === Node.TEXT_NODE) {
        convertTextNode(root)
        return
    }

    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return

    if (root.nodeType === Node.ELEMENT_NODE) convertElementAttributes(root)

    const elementWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
    while (elementWalker.nextNode()) {
        convertElementAttributes(elementWalker.currentNode)
    }

    const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while (textWalker.nextNode()) {
        convertTextNode(textWalker.currentNode)
    }
}

function restoreConvertedContent() {
    applyingConversion = true
    try {
        for (const node of convertedTextNodes) {
            const originalText = originalTextByNode.get(node)
            if (originalText !== undefined && node.nodeType === Node.TEXT_NODE) {
                node.nodeValue = originalText
            }
        }

        for (const element of convertedAttributeElements) {
            const attributes = originalAttributesByElement.get(element)
            if (!attributes || element.nodeType !== Node.ELEMENT_NODE) continue
            for (const [attribute, originalValue] of attributes.entries()) {
                element.setAttribute(attribute, originalValue)
            }
        }
    } finally {
        applyingConversion = false
        convertedTextNodes.clear()
        convertedAttributeElements.clear()
    }
}

function disconnectObserver() {
    observer?.disconnect()
    observer = null
}

function observeMutations(root) {
    disconnectObserver()
    if (typeof MutationObserver === 'undefined' || !root) return

    observer = new MutationObserver(mutations => {
        if (applyingConversion || !enabled) return

        for (const mutation of mutations) {
            if (mutation.type === 'characterData') {
                convertTextNode(mutation.target)
                continue
            }

            if (mutation.type === 'attributes') {
                convertElementAttributes(mutation.target)
                continue
            }

            mutation.addedNodes.forEach(node => convertTree(node))
        }
    })

    observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: CONVERTIBLE_ATTRIBUTES,
    })
}

function setHtmlLang(target) {
    const html = typeof document !== 'undefined' ? document.documentElement : null
    if (!html) return
    if (originalHtmlLang === null) originalHtmlLang = html.getAttribute('lang') || ''
    html.setAttribute('lang', target === 'hk' ? 'zh-HK' : 'zh-TW')
}

function restoreHtmlLang() {
    const html = typeof document !== 'undefined' ? document.documentElement : null
    if (!html || originalHtmlLang === null) return
    if (originalHtmlLang) html.setAttribute('lang', originalHtmlLang)
    else html.removeAttribute('lang')
    originalHtmlLang = null
}

function setTraditionalTextMode(target = '') {
    const normalizedTarget = TRADITIONAL_TEXT_TARGETS.has(target) ? target : ''
    const token = ++modeToken
    const root = getRootElement()
    if (!root) return

    if (!normalizedTarget) {
        enabled = false
        currentTarget = ''
        converter = null
        disconnectObserver()
        restoreConvertedContent()
        restoreHtmlLang()
        return
    }

    if (enabled && currentTarget === normalizedTarget && converter) {
        convertTree(root)
        return
    }

    disconnectObserver()
    restoreConvertedContent()

    currentTarget = normalizedTarget
    converter = null
    enabled = true
    setHtmlLang(currentTarget)
    void loadOpenCCModule()
        .then(OpenCC => {
            if (token !== modeToken || !enabled || currentTarget !== normalizedTarget) return

            const nextRoot = getRootElement()
            if (!nextRoot) return

            converter = OpenCC.Converter({ from: 'cn', to: currentTarget })
            convertTree(nextRoot)
            observeMutations(nextRoot)
        })
        .catch(() => {
            if (token !== modeToken) return
            enabled = false
            currentTarget = ''
            converter = null
            restoreHtmlLang()
        })
}

export function applyTraditionalTextByFont(fontName = '', fontLabel = '') {
    setTraditionalTextMode(getTraditionalTextTargetForFont(fontName, fontLabel))
}
