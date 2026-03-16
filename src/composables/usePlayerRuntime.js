import { watch } from 'vue';
import { storeToRefs } from 'pinia';
import pinia from '../store/pinia';
import { usePlayerStore } from '../store/playerStore';
import { buildLyricsTimeline, findLyricIndexAtTime } from '../utils/lyricCore';

let lyricIndexInterval = null;
let unwatchSongSignature = null;
let unwatchLyric = null;
let unwatchPlaying = null;
let initialized = false;

const playerStore = usePlayerStore(pinia);
const {
    currentMusic,
    currentIndex,
    currentLyricIndex,
    lyric,
    lyricsObjArr,
    playing,
    progress,
    songId,
    songList,
    time,
} = storeToRefs(playerStore);

function getCurrentSong() {
    const list = Array.isArray(songList.value) ? songList.value : [];
    const index = Number.isInteger(currentIndex.value) ? currentIndex.value : -1;

    return index >= 0 && index < list.length ? list[index] : null;
}

function getCurrentSongDurationSec() {
    const currentSong = getCurrentSong();
    const songDurationSec = Math.trunc(Number(currentSong?.dt || 0) / 1000);
    if (songDurationSec > 0) return songDurationSec;

    return Math.max(0, Math.floor(Number(time.value) || 0));
}

function getSafeCurrentSeek() {
    try {
        if (currentMusic.value && typeof currentMusic.value.seek === 'function') {
            const seekValue = currentMusic.value.seek();
            if (typeof seekValue === 'number' && !Number.isNaN(seekValue)) return seekValue;
        }
    } catch (_) {
        // ignore and fall back to store progress
    }

    return typeof progress.value === 'number' && !Number.isNaN(progress.value) ? progress.value : 0;
}

function stopLyricIndexSync() {
    if (!lyricIndexInterval) return;

    clearInterval(lyricIndexInterval);
    lyricIndexInterval = null;
}

function applyCurrentLyricIndex(index) {
    const normalizedIndex = Number.isInteger(index) ? index : -1;
    if (currentLyricIndex.value === normalizedIndex) return;

    playerStore.currentLyricIndex = normalizedIndex;
}

function rebuildLyricsTimeline() {
    if (!lyric.value) {
        playerStore.lyricsObjArr = null;
        applyCurrentLyricIndex(-1);
        return;
    }

    const timeline = buildLyricsTimeline(lyric.value, {
        songDurationSec: getCurrentSongDurationSec(),
        isLocal: getCurrentSong()?.type === 'local',
    });

    playerStore.lyricsObjArr = timeline;
    syncLyricIndexForSeek(getSafeCurrentSeek());
}

export function syncLyricIndexForSeek(seekSeconds) {
    const nextIndex = findLyricIndexAtTime(lyricsObjArr.value, seekSeconds, 0.2);
    applyCurrentLyricIndex(nextIndex);
    return nextIndex;
}

function startLyricIndexSync() {
    stopLyricIndexSync();
    if (!playing.value) return;

    lyricIndexInterval = setInterval(() => {
        syncLyricIndexForSeek(getSafeCurrentSeek());
    }, 200);
}

export function initLyricRuntime() {
    if (initialized) return;
    initialized = true;

    unwatchSongSignature = watch(
        () => [songId.value, currentIndex.value],
        () => {
            playerStore.lyricsObjArr = null;
            applyCurrentLyricIndex(-1);
        },
        { immediate: true }
    );

    unwatchLyric = watch(
        () => lyric.value,
        () => {
            rebuildLyricsTimeline();
        },
        { immediate: true }
    );

    unwatchPlaying = watch(
        () => playing.value,
        isPlaying => {
            if (isPlaying) {
                syncLyricIndexForSeek(getSafeCurrentSeek());
                startLyricIndexSync();
                return;
            }

            stopLyricIndexSync();
        },
        { immediate: true }
    );
}

export function destroyLyricRuntime() {
    stopLyricIndexSync();

    if (unwatchSongSignature) {
        unwatchSongSignature();
        unwatchSongSignature = null;
    }
    if (unwatchLyric) {
        unwatchLyric();
        unwatchLyric = null;
    }
    if (unwatchPlaying) {
        unwatchPlaying();
        unwatchPlaying = null;
    }

    initialized = false;
}
