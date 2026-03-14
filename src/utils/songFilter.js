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

function buildAlbumSearchTexts(album = {}) {
    const texts = [];
    appendText(texts, album?.name);
    appendTextList(texts, album?.alias);
    appendTextList(texts, album?.transNames);
    appendText(texts, album?.artist?.name);
    appendTextList(
        texts,
        Array.isArray(album?.artists) ? album.artists.map(artist => artist?.name) : []
    );
    return texts;
}

function buildMVSearchTexts(mv = {}) {
    const texts = [];
    appendText(texts, mv?.name);
    appendTextList(texts, mv?.alias);
    appendText(texts, mv?.artistName);
    appendText(texts, mv?.artistNames);
    appendText(texts, mv?.artist?.name);
    appendTextList(
        texts,
        Array.isArray(mv?.artists) ? mv.artists.map(artist => artist?.name) : []
    );
    return texts;
}

function matchTexts(texts, keyword) {
    const normalizedKeyword = normalizeSearchValue(keyword);
    if (!normalizedKeyword) return true;
    return texts.some(text => text.includes(normalizedKeyword));
}

function buildSearchText(builder, payload = {}) {
    return builder(payload).join('\n');
}

export function normalizeSongFilterKeyword(value) {
    return normalizeSearchValue(value);
}

export function buildCloudSongSearchText(song = {}) {
    return buildSearchText(buildCloudSongSearchTexts, song);
}

export function buildLocalSongSearchText(song = {}) {
    return buildSearchText(buildLocalSongSearchTexts, song);
}

export function buildAlbumSearchText(album = {}) {
    return buildSearchText(buildAlbumSearchTexts, album);
}

export function buildMVSearchText(mv = {}) {
    return buildSearchText(buildMVSearchTexts, mv);
}

export function matchSearchText(searchText, keyword) {
    const normalizedKeyword = normalizeSearchValue(keyword);
    if (!normalizedKeyword) return true;
    const normalizedText = normalizeSearchValue(searchText);
    if (!normalizedText) return false;
    return normalizedText.includes(normalizedKeyword);
}

export function matchCloudSongFilter(song, keyword) {
    return matchSearchText(buildCloudSongSearchText(song), keyword);
}

export function matchLocalSongFilter(song, keyword) {
    return matchSearchText(buildLocalSongSearchText(song), keyword);
}

export function matchAlbumFilter(album, keyword) {
    return matchSearchText(buildAlbumSearchText(album), keyword);
}

export function matchMVFilter(mv, keyword) {
    return matchSearchText(buildMVSearchText(mv), keyword);
}
