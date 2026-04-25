export function createEmptyLyric() {
    return { lrc: { lyric: '' } }
}

export function normalizeLyricPayload(lyric) {
    return lyric && typeof lyric === 'object' ? lyric : createEmptyLyric()
}
