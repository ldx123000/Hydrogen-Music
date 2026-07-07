const regNewLine = /\r?\n/;
const timeTag = /\[(\d{1,3})\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,2})(?:\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,3}))?\]/g;
const timeTagSingle = /\[(\d{1,3})\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,2})(?:\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,3}))?\]/;
const lrcMetadataTagLine = /^\s*\[(?:ar|ti|al|by|id|hash|sign|qq|total|offset|re|ve|au|length|language|lang)\s*:[^\]]*\]\s*$/i;
const lyricCreditLine = /^(?:作词|作曲|编曲|词|曲|制作人|监制|混音|母带|录音|和声|人声编辑|吉他|贝斯|鼓|弦乐|program(?:ming)?|producer|arranger|composer|lyricist|lyrics?|written by|music|vocal|mix(?:ed)?(?: by)?|master(?:ed)?(?: by)?)\s*[:：]/i;
const regTimeTagGlobal = /\[(\d{1,3})\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,2})(?:\s*[:：\.\uFF0E\u3002,，;；\/\-_\s]\s*(\d{1,3}))?\]/g;

function parseTimeTag(tag) {
    const match = typeof tag === 'string' ? tag.match(timeTagSingle) : null;
    if (!match) return 0;

    const mm = parseInt(match[1] || '0', 10);
    const ss = parseInt(match[2] || '0', 10);
    const ms = match[3] ? parseInt((match[3] + '00').slice(0, 3), 10) : 0;

    return mm * 60 + ss + ms / 1000;
}

function isIgnoredPreludeLine(text) {
    if (!text || !text.trim()) return true;
    return lrcMetadataTagLine.test(text.trim());
}

function isCreditLyricLine(text) {
    if (!text || typeof text !== 'string') return false;

    const normalized = text.trim();
    if (!normalized) return false;
    if (lrcMetadataTagLine.test(normalized)) return true;

    return lyricCreditLine.test(normalized);
}

function normalizePreludeCredits(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const normalized = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;

        const lyricText = typeof row.lyric === 'string' ? row.lyric.trim() : '';
        if (!isCreditLyricLine(lyricText)) {
            normalized.push(row);
            continue;
        }

        normalized.push({ ...row, lyric: lyricText, tlyric: '', rlyric: '' });

        for (const extra of [row.tlyric, row.rlyric]) {
            const extraText = typeof extra === 'string' ? extra.trim() : '';
            if (!extraText || !isCreditLyricLine(extraText)) continue;

            normalized.push({ ...row, lyric: extraText, tlyric: '', rlyric: '' });
        }
    }

    return normalized;
}

function extractUntimedPreludeLines(originalLyricText) {
    if (!originalLyricText || typeof originalLyricText !== 'string') return [];

    const lines = originalLyricText.split(regNewLine);
    const prelude = [];

    for (let index = 0; index < lines.length; index++) {
        const rawLine = lines[index];
        if (typeof rawLine !== 'string') continue;

        const normalized = index === 0 ? rawLine.replace(/^\uFEFF/, '') : rawLine;
        if (timeTagSingle.test(normalized)) break;

        const text = normalized.trim();
        if (isIgnoredPreludeLine(text)) continue;

        prelude.push(text);
    }

    return prelude;
}

function buildPureMusicRows(songDurationSec, withActive = false) {
    const tailRow = { lyric: '', time: songDurationSec };
    if (withActive) {
        return [
            { lyric: '纯音乐，请欣赏', tlyric: '', rlyric: '', time: 0, active: true },
            { lyric: '', tlyric: '', rlyric: '', time: songDurationSec, active: true },
        ];
    }

    return [
        { lyric: '纯音乐，请欣赏', time: 0 },
        tailRow,
    ];
}

function buildLocalMultiTrackTimeline(originalLyricText, translatedLyricText, romanizedLyricText, songDurationSec) {
    const preludeLines = extractUntimedPreludeLines(originalLyricText);
    const byTime = new Map();

    const feed = (text, fieldOrder = ['lyric', 'tlyric', 'rlyric'], directField = null) => {
        if (!text || typeof text !== 'string') return;

        const lines = text.split(regNewLine);
        for (const rawLine of lines) {
            if (!rawLine) continue;

            const tags = Array.from(rawLine.matchAll(timeTag));
            if (!tags.length) continue;

            const lyricText = rawLine.replace(timeTag, '').trim();
            if (!lyricText) continue;

            for (const tag of tags) {
                const time = parseTimeTag(tag[0]);
                const key = time.toFixed(3);

                if (!byTime.has(key)) {
                    byTime.set(key, { time, lyric: '', tlyric: '', rlyric: '', active: true });
                }

                const row = byTime.get(key);
                if (directField) {
                    if (!row[directField]) row[directField] = lyricText;
                    continue;
                }

                for (const field of fieldOrder) {
                    if (!row[field]) {
                        row[field] = lyricText;
                        break;
                    }
                }
            }
        }
    };

    feed(translatedLyricText, ['tlyric', 'lyric', 'rlyric'], 'tlyric');
    feed(romanizedLyricText, ['rlyric', 'lyric', 'tlyric'], 'rlyric');
    feed(originalLyricText, ['lyric', 'tlyric', 'rlyric']);

    let isPureMusic = false;
    for (const row of byTime.values()) {
        if ((row.lyric && row.lyric.includes('纯音乐')) || (row.tlyric && row.tlyric.includes('纯音乐'))) {
            isPureMusic = true;
            break;
        }
    }

    if (isPureMusic) {
        return buildPureMusicRows(songDurationSec, true);
    }

    const timedRows = normalizePreludeCredits(Array.from(byTime.values()).sort((left, right) => left.time - right.time));
    if (!preludeLines.length) return timedRows;

    const preludeRows = preludeLines.map(text => ({
        lyric: text,
        tlyric: '',
        rlyric: '',
        time: 0,
        active: true,
    }));

    return [...preludeRows, ...timedRows];
}

function parseTimedLyricList(lines) {
    if (!lines) return [];

    const parsed = [];
    for (const rawLine of lines) {
        if (!rawLine) continue;

        const tags = Array.from(rawLine.matchAll(regTimeTagGlobal));
        if (!tags.length) continue;

        const text = rawLine.replace(regTimeTagGlobal, '').trim();
        if (!text) continue;

        for (const tag of tags) {
            parsed.push({
                time: parseTimeTag(tag[0]),
                text,
            });
        }
    }

    return parsed.sort((left, right) => left.time - right.time);
}

function findNearestLineMatch(lines, targetTime, maxDelta = 0.35, usedIndexes = null) {
    if (!Array.isArray(lines) || !lines.length) return null;

    let left = 0;
    let right = lines.length - 1;
    let baseIndex = 0;

    while (left <= right) {
        const middle = (left + right) >> 1;
        if (lines[middle].time <= targetTime) {
            baseIndex = middle;
            left = middle + 1;
        } else {
            right = middle - 1;
        }
    }

    let bestIndex = -1;
    let bestDelta = Infinity;
    // 多轨歌词经常会整体偏移几百毫秒，因此放宽搜索范围而不是只看相邻 1-2 行。
    for (let index = Math.max(0, baseIndex - 4); index <= Math.min(lines.length - 1, baseIndex + 4); index++) {
        if (usedIndexes?.has(index)) continue;
        const delta = Math.abs(lines[index].time - targetTime);
        if (delta < bestDelta) {
            bestIndex = index;
            bestDelta = delta;
        }
    }

    if (bestIndex === -1 || bestDelta > maxDelta) return null;
    return {
        index: bestIndex,
        line: lines[bestIndex],
    };
}

function getAdaptiveMatchWindow(lines, targetIndex, defaultWindow = 0.35) {
    if (!Array.isArray(lines) || !lines.length) return defaultWindow;

    const currentTime = Number(lines[targetIndex]?.time);
    if (!Number.isFinite(currentTime)) return defaultWindow;

    const gaps = [];
    const prevTime = Number(lines[targetIndex - 1]?.time);
    const nextTime = Number(lines[targetIndex + 1]?.time);

    if (Number.isFinite(prevTime) && currentTime > prevTime) gaps.push(currentTime - prevTime);
    if (Number.isFinite(nextTime) && nextTime > currentTime) gaps.push(nextTime - currentTime);
    if (!gaps.length) return defaultWindow;

    const nearestGap = Math.min(...gaps);
    return Math.max(defaultWindow, Math.min(0.75, nearestGap * 0.45));
}

function findOrderedFallbackMatch(lines, orderIndex, referenceLength, usedIndexes = null) {
    if (!Array.isArray(lines) || !lines.length) return null;

    const normalizedReferenceLength = Math.max(1, Number(referenceLength) || 0);
    const similarity = Math.min(lines.length, normalizedReferenceLength) / Math.max(lines.length, normalizedReferenceLength);
    // 只有当两条轨道的行数差距不大时，才按行序兜底，避免把完全不同结构的歌词硬拼在一起。
    if (similarity < 0.45) return null;

    const projectedIndex = normalizedReferenceLength <= 1
        ? 0
        : Math.round((Math.max(0, orderIndex) / (normalizedReferenceLength - 1)) * Math.max(0, lines.length - 1));

    let bestIndex = -1;
    let bestDistance = Infinity;
    for (let index = Math.max(0, projectedIndex - 2); index <= Math.min(lines.length - 1, projectedIndex + 2); index++) {
        if (usedIndexes?.has(index)) continue;

        const distance = Math.abs(index - projectedIndex);
        if (distance < bestDistance) {
            bestIndex = index;
            bestDistance = distance;
        }
    }

    if (bestIndex === -1) return null;
    return {
        index: bestIndex,
        line: lines[bestIndex],
    };
}

function resolveSupplementalLine(lines, targetTime, orderIndex, referenceLength, usedIndexes, matchWindow) {
    const timedMatch = findNearestLineMatch(lines, targetTime, matchWindow, usedIndexes);
    if (timedMatch) {
        if (usedIndexes) usedIndexes.add(timedMatch.index);
        return timedMatch.line;
    }

    const firstLineTime = Number(lines?.[0]?.time);
    const lastLineTime = Number(lines?.[lines.length - 1]?.time);
    const fallbackWindow = Math.max(Number(matchWindow) || 0, 0.75);
    // ponytail: only use order fallback inside the extra track's time range; widen this if providers ship heavily offset translations.
    if (Number.isFinite(firstLineTime) && targetTime < firstLineTime - fallbackWindow) return null;
    if (Number.isFinite(lastLineTime) && targetTime > lastLineTime + fallbackWindow) return null;

    const orderedMatch = findOrderedFallbackMatch(lines, orderIndex, referenceLength, usedIndexes);
    if (orderedMatch) {
        if (usedIndexes) usedIndexes.add(orderedMatch.index);
        return orderedMatch.line;
    }

    return null;
}

function buildOnlineTimeline(originalLyricText, translatedLyricText, romanizedLyricText, songDurationSec) {
    const preludeLines = extractUntimedPreludeLines(originalLyricText);
    const originalLines = parseTimedLyricList(originalLyricText ? originalLyricText.split(regNewLine) : null);
    const translatedLines = parseTimedLyricList(translatedLyricText ? translatedLyricText.split(regNewLine) : null);
    const romanizedLines = parseTimedLyricList(romanizedLyricText ? romanizedLyricText.split(regNewLine) : null);
    const translatedContentLines = translatedLines.filter(item => !isCreditLyricLine(item.text));
    const romanizedContentLines = romanizedLines.filter(item => !isCreditLyricLine(item.text));

    if (originalLines.some(item => item.text.includes('纯音乐')) || translatedLines.some(item => item.text.includes('纯音乐'))) {
        return buildPureMusicRows(songDurationSec, false);
    }

    const results = [];
    const translatedUsedIndexes = new Set();
    const romanizedUsedIndexes = new Set();
    const matchableOriginalCount = originalLines.filter(item => !isCreditLyricLine(item.text)).length;
    let matchableOriginalIndex = 0;

    for (let index = 0; index < originalLines.length; index++) {
        const item = originalLines[index];
        const row = { lyric: item.text, tlyric: '', rlyric: '', time: item.time };
        if (!isCreditLyricLine(item.text)) {
            const matchWindow = getAdaptiveMatchWindow(originalLines, index);
            const translated = resolveSupplementalLine(
                translatedContentLines,
                item.time,
                matchableOriginalIndex,
                matchableOriginalCount,
                translatedUsedIndexes,
                matchWindow
            );
            if (translated && translated.text) row.tlyric = translated.text;

            const romanized = resolveSupplementalLine(
                romanizedContentLines,
                item.time,
                matchableOriginalIndex,
                matchableOriginalCount,
                romanizedUsedIndexes,
                matchWindow
            );
            if (romanized && romanized.text) row.rlyric = romanized.text;

            matchableOriginalIndex += 1;
        }

        if (row.lyric) results.push(row);
    }

    const normalizedResults = normalizePreludeCredits(results);
    if (!preludeLines.length) return normalizedResults;

    const preludeRows = preludeLines.map(text => ({
        lyric: text,
        tlyric: '',
        rlyric: '',
        time: 0,
        active: true,
    }));

    return [...preludeRows, ...normalizedResults];
}

function buildPureTextTimeline(originalLyricText, songDurationSec) {
    const lines = (originalLyricText || '').split(regNewLine);
    const processed = [];

    for (const rawLine of lines) {
        if (!rawLine || rawLine.trim() === '') continue;
        processed.push({
            lyric: rawLine.trim(),
            tlyric: '',
            rlyric: '',
            time: 0,
            active: true,
        });
    }

    processed.push({
        lyric: '',
        tlyric: '',
        rlyric: '',
        time: songDurationSec,
        active: true,
    });

    return processed;
}

export function buildLyricsTimeline(lyricPayload, { songDurationSec = 0, isLocal = false } = {}) {
    if (!lyricPayload || typeof lyricPayload !== 'object') return [];

    const originalLyricText = lyricPayload.lrc?.lyric || '';
    if (!originalLyricText) return [];

    const normalizedDuration = Math.max(0, Math.trunc(Number(songDurationSec) || 0));
    const translatedLyricText = lyricPayload.tlyric?.lyric || '';
    const romanizedLyricText = lyricPayload.romalrc?.lyric || '';
    const hasTimeTag = timeTagSingle.test(originalLyricText);

    if (!hasTimeTag) {
        return buildPureTextTimeline(originalLyricText, normalizedDuration);
    }

    if (isLocal) {
        return buildLocalMultiTrackTimeline(
            originalLyricText,
            translatedLyricText,
            romanizedLyricText,
            normalizedDuration
        );
    }

    return buildOnlineTimeline(
        originalLyricText,
        translatedLyricText,
        romanizedLyricText,
        normalizedDuration
    );
}

export function findLyricIndexAtTime(lyrics, seekSeconds, biasSec = 0.2) {
    if (!Array.isArray(lyrics) || !lyrics.length) return -1;

    const seconds = Number(seekSeconds);
    if (!Number.isFinite(seconds)) return -1;

    const target = seconds + biasSec;
    let left = 0;
    let right = lyrics.length - 1;
    let answer = -1;

    while (left <= right) {
        const middle = (left + right) >> 1;
        const middleTime = Number(lyrics[middle]?.time || 0);

        if (middleTime <= target) {
            answer = middle;
            left = middle + 1;
        } else {
            right = middle - 1;
        }
    }

    if (answer < 0) return 0;
    if (answer > lyrics.length - 1) return lyrics.length - 1;

    return answer;
}
