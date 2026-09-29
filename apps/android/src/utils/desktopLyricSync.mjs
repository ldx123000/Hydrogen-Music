function normalizeProgress(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function normalizeNonNegativeInteger(value) {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

function normalizeSongId(value) {
    return value == null ? '' : String(value)
}

function hasOrderedSongProtocol(data) {
    return normalizeNonNegativeInteger(data?.songSerial) !== null
        && normalizeNonNegativeInteger(data?.syncSequence) !== null
}

export function shouldIgnoreDesktopLyricMessage(data, currentState = {}) {
    const incomingSongSerial = normalizeNonNegativeInteger(data?.songSerial)
    const activeSongSerial = normalizeNonNegativeInteger(currentState.songSerial)
    const incomingSongId = normalizeSongId(data?.songId)
    const activeSongId = normalizeSongId(currentState.songId)

    if (incomingSongSerial !== null) {
        if (activeSongSerial === null || incomingSongSerial !== activeSongSerial) return true
        if (incomingSongId && activeSongId && incomingSongId !== activeSongId) return true
    }

    const incomingSequence = normalizeNonNegativeInteger(data?.syncSequence)
    const lastSyncSequence = normalizeNonNegativeInteger(currentState.lastSyncSequence)
    return incomingSequence !== null
        && lastSyncSequence !== null
        && incomingSequence <= lastSyncSequence
}

export function resolveDesktopSongChangeState(data, currentState = {}) {
    const incomingSongSerial = normalizeNonNegativeInteger(data?.songSerial)
    const activeSongSerial = normalizeNonNegativeInteger(currentState.songSerial)
    const incomingSongId = normalizeSongId(data?.songId)
    const activeSongId = normalizeSongId(currentState.songId)
    const incomingSequence = normalizeNonNegativeInteger(data?.syncSequence)
    const lastSyncSequence = normalizeNonNegativeInteger(currentState.lastSyncSequence)

    const staleSong = incomingSongSerial !== null
        && activeSongSerial !== null
        && incomingSongSerial < activeSongSerial
    const staleSnapshot = incomingSongSerial !== null
        && activeSongSerial === incomingSongSerial
        && incomingSequence !== null
        && lastSyncSequence !== null
        && incomingSequence <= lastSyncSequence
    if (staleSong || staleSnapshot) {
        return {
            ignored: true,
            songChanged: false,
            songSerial: activeSongSerial,
            songId: activeSongId,
            progress: normalizeProgress(currentState.progress),
            currentLyricIndex: Number.isInteger(currentState.currentLyricIndex)
                ? currentState.currentLyricIndex
                : -1,
        }
    }

    const songChanged = activeSongSerial === null
        || (incomingSongSerial !== null && incomingSongSerial !== activeSongSerial)
        || (!!incomingSongId && incomingSongId !== activeSongId)
    const incomingProgress = Number(data?.progress)
    const incomingLyricIndex = Number(data?.currentLyricIndex)

    return {
        ignored: false,
        songChanged,
        songSerial: incomingSongSerial ?? activeSongSerial,
        songId: incomingSongId || activeSongId,
        progress: Number.isFinite(incomingProgress)
            ? normalizeProgress(incomingProgress)
            : (songChanged ? 0 : normalizeProgress(currentState.progress)),
        currentLyricIndex: Number.isInteger(incomingLyricIndex)
            ? incomingLyricIndex
            : (songChanged ? -1 : currentState.currentLyricIndex),
    }
}

export function shouldIgnoreDesktopLyricProgress(data, context = {}) {
    if (shouldIgnoreDesktopLyricMessage(data, context)) return true
    if (hasOrderedSongProtocol(data)) return false
    if (context.isSeekSync) return false

    const normalizedProgress = Number(data?.progress)
    if (!Number.isFinite(normalizedProgress)) return true
    if (context.isSettlingStale) return true

    const incomingIndex = Number(data?.currentIndex)
    const normalizedIncomingIndex = Number.isInteger(incomingIndex) ? incomingIndex : -1
    return normalizedIncomingIndex < context.currentLyricIndex && context.isBackwardProgress
}
