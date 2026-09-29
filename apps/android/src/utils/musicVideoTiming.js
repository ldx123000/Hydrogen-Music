export function isValidMusicVideoTiming(timing) {
    return timing &&
        typeof timing.start === 'number' &&
        typeof timing.end === 'number' &&
        typeof timing.videoTiming === 'number';
}

export function isSeekInMusicVideoTiming(seek, timing) {
    return isValidMusicVideoTiming(timing) && seek >= timing.start && seek < timing.end;
}

export function buildMusicVideoTimingSegment(musicStart, videoRange) {
    const videoStart = videoRange[0];
    const videoEnd = videoRange[1];

    return {
        start: musicStart,
        end: musicStart + videoEnd - videoStart,
        videoTiming: videoStart,
    };
}

export function hasTimingOverlap(timingList, nextTiming) {
    const list = Array.isArray(timingList) ? timingList : [];

    return list.some(item => !(
        (nextTiming.start < item.start && nextTiming.end < item.start) ||
        (nextTiming.start > item.end && nextTiming.end > item.end)
    ));
}

export function clampVideoTimingRange(videoRange, maxMusicDurationFromStart) {
    const videoStart = videoRange[0];
    const videoEnd = videoRange[1];
    const videoDuration = videoEnd - videoStart;
    return [videoStart, videoEnd - (videoDuration - maxMusicDurationFromStart)];
}
