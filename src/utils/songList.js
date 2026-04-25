export function getIndexedSong(songList, index) {
    const list = Array.isArray(songList) ? songList : [];
    const normalizedIndex = Number.isInteger(index) ? index : -1;

    return normalizedIndex >= 0 && normalizedIndex < list.length ? list[normalizedIndex] : null;
}

export function getIndexedSongOrFirst(songList, index) {
    const list = Array.isArray(songList) ? songList : [];
    const normalizedIndex = typeof index === 'number' ? index : 0;

    return list[normalizedIndex] || null;
}
