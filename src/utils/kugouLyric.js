const regNewLine = /\r?\n/;
const krcTimeLine = /^\[(\d+),(\d+)\](.*)$/;
const languageTag = /^\[language:([^\]]+)\]\s*$/m;
const wordTimeTag = /<-?\d+(?:\s*,\s*-?\d+)+\s*>/g;
const lyricCreditLine = /^(?:作词|作曲|编曲|词|曲|制作人|监制|混音|母带|录音|和声|人声编辑|吉他|贝斯|鼓|弦乐|program(?:ming)?|producer|arranger|composer|lyricist|lyrics?|written by|music|vocal|mix(?:ed)?(?: by)?|master(?:ed)?(?: by)?)\s*[:：]/i;

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

function normalizeLanguageSection(section) {
    if (!Array.isArray(section?.lyricContent)) return [];
    return section.lyricContent.map(line => flattenLyricContent(line).trim());
}

function isLikelyKrcPreludeLine(row, index) {
    const text = String(row?.text || '').trim();
    if (!text) return true;
    if (lyricCreditLine.test(text)) return true;

    const time = Number(row?.time);
    return index === 0 && Number.isFinite(time) && time < 2000 && /\s-\s|[（(].+[）)]/.test(text);
}

function getCompactStartIndex(rows, lineCount) {
    const textRows = rows.filter(row => row.text);
    const missingCount = textRows.length - lineCount;
    if (missingCount <= 0) return 0;

    let start = 0;
    while (start < missingCount && isLikelyKrcPreludeLine(textRows[start], start)) start += 1;
    return start === missingCount ? start : 0;
}

function buildLanguageLrcLines(rows, languageLines) {
    if (!Array.isArray(languageLines) || !languageLines.length) return [];

    const textRows = rows.filter(row => row.text);
    const compactLines = languageLines.filter(Boolean);
    const useDirectIndex = languageLines.length >= rows.length;
    const compactStart = useDirectIndex ? 0 : getCompactStartIndex(rows, compactLines.length);
    let compactIndex = 0;

    return textRows
        .map((row, textRowIndex) => {
            const text = useDirectIndex
                ? languageLines[row.index]
                : (textRowIndex >= compactStart ? compactLines[compactIndex++] : '');
            return text ? `${formatLrcTime(row.time)}${text}` : '';
        })
        .filter(Boolean);
}

function hasCjkText(lines) {
    return lines.some(line => /[\u3400-\u9FFF\uF900-\uFAFF]/.test(line));
}

function getKrcLanguageTracks(krcText) {
    const encoded = String(krcText || '').match(languageTag)?.[1];
    if (!encoded) return { romanizedLines: [], translatedLines: [] };

    try {
        const payload = JSON.parse(decodeBase64Utf8(encoded));
        const tracks = (Array.isArray(payload?.content) ? payload.content : [])
            .filter(item => Array.isArray(item?.lyricContent))
            .map((item, index) => {
                const type = Number(item?.type);
                return {
                    index,
                    type: Number.isFinite(type) ? type : null,
                    lines: normalizeLanguageSection(item),
                };
            });
        if (!tracks.length) return { romanizedLines: [], translatedLines: [] };

        const typedRomanizedTrack = tracks.find(track => track.type === 0) || null;
        const typedTranslatedTrack = tracks.find(track => track.type === 1) || null;
        // ponytail: Kugou multi-language blocks are normally romanization first, translation second; type wins when present.
        let romanizedTrack = typedRomanizedTrack || null;
        let translatedTrack = typedTranslatedTrack || null;

        if (!romanizedTrack && tracks.length > 1) {
            romanizedTrack = tracks.find(track => track !== translatedTrack && !hasCjkText(track.lines))
                || tracks.find(track => track !== translatedTrack)
                || null;
        }

        if (!translatedTrack) {
            translatedTrack = tracks.find(track => track !== romanizedTrack && hasCjkText(track.lines))
                || (tracks.length > 1 ? tracks.find(track => track !== romanizedTrack) : null)
                || (tracks[0] !== romanizedTrack ? tracks[0] : null);
        }

        if (!romanizedTrack && tracks.length > 1) {
            romanizedTrack = tracks.find(track => track !== translatedTrack) || null;
        }

        return {
            romanizedLines: romanizedTrack?.lines || [],
            translatedLines: translatedTrack?.lines || [],
        };
    } catch (_) {
        return { romanizedLines: [], translatedLines: [] };
    }
}

function parseKrcRows(krcText) {
    const rows = [];
    for (const line of String(krcText || '').split(regNewLine)) {
        const match = line.match(krcTimeLine);
        if (!match) continue;

        rows.push({
            index: rows.length,
            time: Number(match[1]) || 0,
            text: normalizeKrcText(match[3]),
        });
    }

    return rows;
}

export function normalizeKugouKrcLyric(krcText) {
    const rows = parseKrcRows(krcText);
    if (!rows.length) return { originalLyricText: String(krcText || ''), translatedLyricText: '', romanizedLyricText: '' };

    const metadataLines = String(krcText || '')
        .split(regNewLine)
        .filter(line => /^\[[a-z]+:/i.test(line) && !languageTag.test(line));
    const originalLines = rows
        .filter(row => row.text)
        .map(row => `${formatLrcTime(row.time)}${row.text}`);
    const { romanizedLines, translatedLines: languageLines } = getKrcLanguageTracks(krcText);
    const translatedLines = buildLanguageLrcLines(rows, languageLines);
    const romanizedLrcLines = buildLanguageLrcLines(rows, romanizedLines);

    return {
        originalLyricText: [...metadataLines, ...originalLines].join('\n'),
        translatedLyricText: translatedLines.join('\n'),
        romanizedLyricText: romanizedLrcLines.join('\n'),
    };
}
