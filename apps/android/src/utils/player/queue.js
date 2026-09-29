export function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min)
}

export function createShuffledList(songList, {
    isPlayAll = false,
    currentSongId = null,
    currentSong = null,
    avoidFirstSongId = null,
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
        const currentSongIndex = shuffledSongs.findIndex(song => String(song?.id ?? '') === String(currentSongId ?? ''))
        if (currentSong) {
            if (currentSongIndex >= 0) shuffledSongs.splice(currentSongIndex, 1)
            shuffledSongs.unshift(currentSong)
        }
    }

    if (avoidFirstSongId != null && shuffledSongs.length > 1 && String(shuffledSongs[0]?.id ?? '') === String(avoidFirstSongId)) {
        const nextSongIndex = shuffledSongs.findIndex(song => String(song?.id ?? '') !== String(avoidFirstSongId))
        const firstSong = shuffledSongs[0]
        shuffledSongs[0] = shuffledSongs[nextSongIndex]
        shuffledSongs[nextSongIndex] = firstSong
    }

    return shuffledSongs
}

export function createNextShuffledCycle(songList, previousShuffledList, {
    currentSongId = null,
    randomInt = getRandomInt,
} = {}) {
    const nextCycle = createShuffledList(songList, {
        isPlayAll: true,
        avoidFirstSongId: currentSongId,
        randomInt,
    })
    const previousCycle = Array.isArray(previousShuffledList) ? previousShuffledList : []
    const repeatsPreviousOrder = nextCycle.length > 2
        && nextCycle.every((song, index) => String(song?.id ?? '') === String(previousCycle[index]?.id ?? ''))
    if (repeatsPreviousOrder) {
        const lastIndex = nextCycle.length - 1
        const previousSong = nextCycle[lastIndex - 1]
        nextCycle[lastIndex - 1] = nextCycle[lastIndex]
        nextCycle[lastIndex] = previousSong
    }

    return nextCycle
}

export function haveSameSongIds(leftList, rightList) {
    if (!Array.isArray(leftList) || !Array.isArray(rightList) || leftList.length !== rightList.length) return false

    const songIdCounts = new Map()
    leftList.forEach(song => {
        const songId = String(song?.id ?? '')
        songIdCounts.set(songId, (songIdCounts.get(songId) || 0) + 1)
    })

    for (const song of rightList) {
        const songId = String(song?.id ?? '')
        const remainingCount = songIdCounts.get(songId) || 0
        if (remainingCount === 0) return false
        songIdCounts.set(songId, remainingCount - 1)
    }

    return true
}
