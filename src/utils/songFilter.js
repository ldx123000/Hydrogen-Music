function normalizeSearchValue(value) {
    return String(value ?? '')
        .trim()
        .toLocaleLowerCase();
}

function appendText(buffer, value) {
    const normalized = normalizeSearchValue(value);
    if (!normalized || buffer.includes(normalized)) return;
    buffer.push(normalized);
}

function appendTextList(buffer, values) {
    if (!Array.isArray(values)) {
        appendText(buffer, values);
        return;
    }
    values.forEach(value => appendText(buffer, value));
}

function buildCloudSongSearchTexts(song = {}) {
    const texts = [];
    appendText(texts, song?.name);
    appendTextList(texts, song?.tns);
    appendTextList(texts, song?.transNames);
    appendTextList(texts, song?.song?.tns);
    appendTextList(texts, song?.song?.transNames);
    appendTextList(
        texts,
        Array.isArray(song?.ar) ? song.ar.map(artist => artist?.name) : []
    );
    return texts;
}

function buildLocalSongSearchTexts(song = {}) {
    const texts = [];
    appendText(texts, song?.common?.title);
    appendText(texts, song?.common?.localTitle);
    appendTextList(texts, song?.common?.artists);
    return texts;
}

function matchTexts(texts, keyword) {
    const normalizedKeyword = normalizeSearchValue(keyword);
    if (!normalizedKeyword) return true;
    return texts.some(text => text.includes(normalizedKeyword));
}

export function normalizeSongFilterKeyword(value) {
    return normalizeSearchValue(value);
}

export function matchCloudSongFilter(song, keyword) {
    return matchTexts(buildCloudSongSearchTexts(song), keyword);
}

export function matchLocalSongFilter(song, keyword) {
    return matchTexts(buildLocalSongSearchTexts(song), keyword);
}
