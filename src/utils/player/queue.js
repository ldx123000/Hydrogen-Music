export function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min)
}

export function createShuffledList(songList, {
    isPlayAll = false,
    currentSongId = null,
    currentSong = null,
    randomInt = getRandomInt,
} = {}) {
    const shuffledSongs = songList.slice()

    for (let i = 0; i < shuffledSongs.length; i++) {
        const j = randomInt(0, i)
        const t = shuffledSongs[i]
        shuffledSongs[i] = shuffledSongs[j]
        shuffledSongs[j] = t
    }

    if (!isPlayAll) {
        const currentSongIndex = (shuffledSongs || []).findIndex((song) => song && song.id === currentSongId)
        if (currentSong) {
            if (currentSongIndex >= 0) shuffledSongs.splice(currentSongIndex, 1)
            shuffledSongs.unshift(currentSong)
        }
    }

    return shuffledSongs
}
