function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function pickFirstTranslation(value) {
    if (Array.isArray(value)) {
        for (const item of value) {
            const text = normalizeText(item);
            if (text) return text;
        }
        return '';
    }
    return normalizeText(value);
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getSongDisplayName(song, fallback = '', showTranslation = true) {
    const baseName = normalizeText(song?.name) || normalizeText(song?.localName) || normalizeText(fallback);
    if (!baseName) return '';
    if (!showTranslation) return baseName;

    const translation =
        pickFirstTranslation(song?.tns) ||
        pickFirstTranslation(song?.transNames) ||
        pickFirstTranslation(song?.song?.tns) ||
        pickFirstTranslation(song?.song?.transNames);

    if (!translation) return baseName;
    if (translation === baseName) return baseName;

    const translationPattern = new RegExp(`[（(]\\s*${escapeRegExp(translation)}\\s*[）)]`);
    if (translationPattern.test(baseName)) return baseName;

    return `${baseName} (${translation})`;
}
