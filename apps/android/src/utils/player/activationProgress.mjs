function normalizePlaybackNumber(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function clampPlaybackProgress(value, duration = 0) {
    const progress = Math.max(0, normalizePlaybackNumber(value))
    const normalizedDuration = Math.max(0, normalizePlaybackNumber(duration))
    return normalizedDuration > 0 ? Math.min(progress, normalizedDuration) : progress
}

export function resolveActivatedPlaybackPosition({
    resumeSeek = null,
    restoreStoredProgress = false,
    storedProgress = 0,
    playbackProgress = 0,
    duration = 0,
} = {}) {
    if (resumeSeek !== null) {
        return {
            progress: clampPlaybackProgress(resumeSeek, duration),
            shouldSeekPlayback: true,
        }
    }

    if (restoreStoredProgress) {
        return {
            progress: clampPlaybackProgress(storedProgress, duration),
            shouldSeekPlayback: true,
        }
    }

    return {
        progress: clampPlaybackProgress(playbackProgress, duration),
        shouldSeekPlayback: false,
    }
}
