import { watch } from 'vue';
import { storeToRefs } from 'pinia';
import pinia from '../store/pinia';
import { usePlayerStore } from '../store/playerStore';
import { buildCoverBackdropCandidates } from './coverBackdrop';
import { getSongDisplayName } from './songName';
import { PLAYBACK_TICK_FAST_INTERVAL_MS, subscribePlaybackTick } from './player/playbackTicker';
import { getIndexedSong } from './songList';

let stopLyricProgressTicker = null;
let songChangeTimer = null;
let progressTimer = null;
let bridgeInitialized = false;

const lastPayloadByType = new Map();
const DESKTOP_LYRIC_READY_PUSH_DELAY_MS = 200;

let unwatchPlaying = null;
let unwatchIsDesktopLyricOpen = null;
let unwatchSongSnapshot = null;
let unwatchProgress = null;
let unwatchCurrentLyricIndex = null;
let removeLyricDataRequestListener = null;
let removeDesktopLyricClosedListener = null;

const playerStore = usePlayerStore(pinia);
const {
    coverBlur,
    currentIndex,
    currentLyricIndex,
    isDesktopLyricOpen,
    localBase64Img,
    lyricsObjArr,
    playing,
    progress,
    showSongTranslation,
    songId,
    songList,
    videoIsPlaying,
} = storeToRefs(playerStore);

function buildCoverBackdropPayload(song) {
    const shouldShowBackdrop = !!(song && coverBlur.value && !videoIsPlaying.value);
    const urls = shouldShowBackdrop
        ? buildCoverBackdropCandidates(song, localBase64Img.value, { includeAlbumPicUrl: true })
        : [];

    return {
        urls,
        isSiren: shouldShowBackdrop && song?.source === 'siren',
    };
}

function clearSongChangeTimer() {
    if (!songChangeTimer) return;

    clearTimeout(songChangeTimer);
    songChangeTimer = null;
}

function clearProgressTimer() {
    if (!progressTimer) return;

    clearTimeout(progressTimer);
    progressTimer = null;
}

function stopDesktopLyricSync() {
    if (!stopLyricProgressTicker) return;
    stopLyricProgressTicker();
    stopLyricProgressTicker = null;
}

function startDesktopLyricSync() {
    stopDesktopLyricSync();
    if (!isDesktopLyricOpen.value || !playing.value) return;

    stopLyricProgressTicker = subscribePlaybackTick(() => {
        sendLyricProgress();
    }, {
        id: 'desktop-lyric-progress',
        interval: PLAYBACK_TICK_FAST_INTERVAL_MS,
        immediate: true,
    });
}

function serializePayload(payload) {
    try {
        return JSON.stringify(payload);
    } catch (_) {
        return '';
    }
}

function pushPayload(payload, { force = false } = {}) {
    if (!window.electronAPI || !payload || !payload.type) return;

    const serialized = serializePayload(payload);
    const lastSnapshot = lastPayloadByType.get(payload.type) || null;

    if (!force && serialized && serialized === lastSnapshot) return;

    lastPayloadByType.set(payload.type, serialized);

    window.electronAPI.updateLyricData(payload);
}

function buildSongChangePayload() {
    const currentSong = getIndexedSong(songList.value, currentIndex.value);

    return {
        type: 'song-change',
        song: currentSong
            ? {
                  name: String(getSongDisplayName(currentSong, '未知歌曲', showSongTranslation.value)),
                  ar: Array.isArray(currentSong.ar)
                      ? currentSong.ar.map(artist => ({ name: String(artist?.name || '未知艺术家') }))
                      : [{ name: '未知艺术家' }],
                  type: String(currentSong.type || 'online'),
              }
            : null,
        lyrics: Array.isArray(lyricsObjArr.value)
            ? lyricsObjArr.value.map(row => ({
                  lyric: String(row?.lyric || ''),
                  tlyric: String(row?.tlyric || ''),
                  rlyric: String(row?.rlyric || ''),
                  time: Number(row?.time || 0),
              }))
            : [],
        coverBackdrop: buildCoverBackdropPayload(currentSong),
    };
}

function buildPlayStatePayload() {
    return {
        type: 'play-state',
        playing: !!playing.value,
    };
}

function buildLyricProgressPayload() {
    const currentProgress = Number(progress.value || 0);

    return {
        type: 'lyric-progress',
        currentIndex: Number.isInteger(currentLyricIndex.value) ? currentLyricIndex.value : -1,
        progress: currentProgress,
        currentTime: currentProgress,
    };
}

function sendCurrentLyricData(options = {}) {
    if (!isDesktopLyricOpen.value || !window.electronAPI) return;
    pushPayload(buildSongChangePayload(), options);
}

function sendPlayState(options = {}) {
    if (!isDesktopLyricOpen.value || !window.electronAPI) return;
    pushPayload(buildPlayStatePayload(), options);
}

function sendLyricProgress(options = {}) {
    if (!isDesktopLyricOpen.value || !window.electronAPI) return;
    pushPayload(buildLyricProgressPayload(), options);
}

function scheduleSongChangePush(delayMs = 0, options = {}) {
    if (!isDesktopLyricOpen.value) return;

    clearSongChangeTimer();
    songChangeTimer = setTimeout(() => {
        songChangeTimer = null;
        sendCurrentLyricData(options);
    }, delayMs);
}

function scheduleProgressPush(delayMs = 0, options = {}) {
    if (!isDesktopLyricOpen.value) return;

    clearProgressTimer();
    progressTimer = setTimeout(() => {
        progressTimer = null;
        sendLyricProgress(options);
    }, delayMs);
}

export const toggleDesktopLyric = async () => {
    if (!window.electronAPI) return;

    try {
        if (isDesktopLyricOpen.value) {
            const result = await window.electronAPI.closeLyricWindow();
            if (result?.success) {
                playerStore.isDesktopLyricOpen = false;
            }
            return;
        }

        const result = await window.electronAPI.createLyricWindow();
        if (result?.success) {
            playerStore.isDesktopLyricOpen = true;
            setTimeout(() => {
                sendCurrentLyricData({ force: true });
                sendPlayState({ force: true });
                sendLyricProgress({ force: true });
            }, DESKTOP_LYRIC_READY_PUSH_DELAY_MS);
        }
    } catch (_) {
        // ignore window bridge errors
    }
};

export const initDesktopLyric = () => {
    if (bridgeInitialized) return;
    bridgeInitialized = true;

    if (window.electronAPI) {
        window.electronAPI.isLyricWindowVisible().then(isVisible => {
            playerStore.isDesktopLyricOpen = isVisible;
        });

        removeLyricDataRequestListener = window.electronAPI.getCurrentLyricData(() => {
            sendCurrentLyricData({ force: true });
            sendPlayState({ force: true });
            sendLyricProgress({ force: true });
        });

        removeDesktopLyricClosedListener = window.electronAPI.onDesktopLyricClosed(() => {
            playerStore.isDesktopLyricOpen = false;
        });
    }

    unwatchPlaying = watch(
        () => playing.value,
        isPlaying => {
            sendPlayState({ force: true });

            if (isPlaying) {
                startDesktopLyricSync();
                sendLyricProgress({ force: true });
                return;
            }

            stopDesktopLyricSync();
            sendLyricProgress({ force: true });
        },
        { immediate: true }
    );

    unwatchIsDesktopLyricOpen = watch(
        () => isDesktopLyricOpen.value,
        isOpen => {
            if (isOpen) {
                sendCurrentLyricData({ force: true });
                sendPlayState({ force: true });
                sendLyricProgress({ force: true });
                startDesktopLyricSync();
                return;
            }

            stopDesktopLyricSync();
            clearSongChangeTimer();
            clearProgressTimer();
        },
        { immediate: true }
    );

    unwatchSongSnapshot = watch(
        () => [
            songId.value,
            currentIndex.value,
            lyricsObjArr.value,
            showSongTranslation.value,
            coverBlur.value,
            localBase64Img.value,
            videoIsPlaying.value,
        ],
        () => {
            scheduleSongChangePush(0);
        }
    );

    unwatchProgress = watch(
        () => progress.value,
        (nextProgress, previousProgress) => {
            if (!isDesktopLyricOpen.value) return;
            if (!playing.value) {
                scheduleProgressPush(0, { force: true });
                return;
            }

            if (typeof previousProgress !== 'number' || Math.abs(nextProgress - previousProgress) > 1.2) {
                scheduleProgressPush(0, { force: true });
            }
        }
    );

    unwatchCurrentLyricIndex = watch(
        () => currentLyricIndex.value,
        () => {
            if (!isDesktopLyricOpen.value || playing.value) return;
            scheduleProgressPush(0, { force: true });
        }
    );
};

export const destroyDesktopLyric = () => {
    stopDesktopLyricSync();
    clearSongChangeTimer();
    clearProgressTimer();

    if (unwatchPlaying) {
        unwatchPlaying();
        unwatchPlaying = null;
    }
    if (unwatchIsDesktopLyricOpen) {
        unwatchIsDesktopLyricOpen();
        unwatchIsDesktopLyricOpen = null;
    }
    if (unwatchSongSnapshot) {
        unwatchSongSnapshot();
        unwatchSongSnapshot = null;
    }
    if (unwatchProgress) {
        unwatchProgress();
        unwatchProgress = null;
    }
    if (unwatchCurrentLyricIndex) {
        unwatchCurrentLyricIndex();
        unwatchCurrentLyricIndex = null;
    }
    removeLyricDataRequestListener?.();
    removeLyricDataRequestListener = null;
    removeDesktopLyricClosedListener?.();
    removeDesktopLyricClosedListener = null;

    lastPayloadByType.clear();
    bridgeInitialized = false;
};
