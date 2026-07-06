const regNewLine = /\r?\n/;
const krcTimeLine = /^\[(\d+),(\d+)\](.*)$/;
const languageTag = /^\[language:([^\]]+)\]\s*$/m;
const wordTimeTag = /<[^>]*>/g;

function decodeBase64Utf8(value) {
    const text = String(value || '').trim();
    if (!text) return '';

    try {
        if (typeof atob === 'function') {
            const binary = atob(text);
            const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
            if (typeof TextDecoder === 'function') return new TextDecoder('utf-8').decode(bytes);
        }
    } catch (_) {}

    try {
        if (typeof Buffer !== 'undefined') return Buffer.from(text, 'base64').toString('utf8');
    } catch (_) {}

    return '';
}

function formatLrcTime(msValue) {
    const ms = Math.max(0, Math.floor(Number(msValue) || 0));
    const centiseconds = Math.floor(ms / 10);
    const minutes = Math.floor(centiseconds / 6000);
    const seconds = Math.floor((centiseconds % 6000) / 100);
    const cs = centiseconds % 100;

    return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(cs).padStart(2, '0')}]`;
}

function normalizeKrcText(text) {
    return String(text || '').replace(wordTimeTag, '').trim();
}

function flattenLyricContent(value) {
    if (Array.isArray(value)) return value.map(flattenLyricContent).join('');
    return typeof value === 'string' ? value : '';
}

function getKrcLanguageLines(krcText) {
    const encoded = String(krcText || '').match(languageTag)?.[1];
    if (!encoded) return [];

    try {
        const payload = JSON.parse(decodeBase64Utf8(encoded));
        const content = Array.isArray(payload?.content) ? payload.content : [];
        // ponytail: Kugou currently puts the translation in the first lyricContent block; if multiple tracks appear, choose by language/type here.
        const section = content.find(item => Array.isArray(item?.lyricContent));
        if (!section) return [];

        return section.lyricContent.map(line => flattenLyricContent(line).trim());
    } catch (_) {
        return [];
    }
}

function parseKrcRows(krcText) {
    return String(krcText || '')
        .split(regNewLine)
        .map(line => {
            const match = line.match(krcTimeLine);
            if (!match) return null;

            return {
                time: Number(match[1]) || 0,
                text: normalizeKrcText(match[3]),
            };
        })
        .filter(Boolean);
}

export function normalizeKugouKrcLyric(krcText) {
    const rows = parseKrcRows(krcText);
    if (!rows.length) return { originalLyricText: String(krcText || ''), translatedLyricText: '' };

    const metadataLines = String(krcText || '')
        .split(regNewLine)
        .filter(line => /^\[[a-z]+:/i.test(line) && !languageTag.test(line));
    const originalLines = rows
        .filter(row => row.text)
        .map(row => `${formatLrcTime(row.time)}${row.text}`);
    const languageLines = getKrcLanguageLines(krcText);
    const translatedLines = rows
        .map((row, index) => {
            const text = languageLines[index];
            return text ? `${formatLrcTime(row.time)}${text}` : '';
        })
        .filter(Boolean);

    return {
        originalLyricText: [...metadataLines, ...originalLines].join('\n'),
        translatedLyricText: translatedLines.join('\n'),
    };
}
