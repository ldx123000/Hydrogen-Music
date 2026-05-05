import { watch } from 'vue';
import { storeToRefs } from 'pinia';
import pinia from '../store/pinia';
import { usePlayerStore } from '../store/playerStore';
import { buildLyricsTimeline, findLyricIndexAtTime } from '../utils/lyricCore';
import { applyLyricLineOffsets, getLyricOffsetSongKey } from '../utils/lyricLineOffset';
import { getPlaybackSnapshot, PLAYBACK_TICK_FAST_INTERVAL_MS, subscribePlaybackTick } from '../utils/player/playbackTicker';
import { hasUsableLyricPayload } from '../utils/player/lyricPayload';
import { getIndexedSong } from '../utils/songList';

export const LYRIC_INDEX_SYNC_BIAS_SEC = 0.2;

let stopLyricTicker = null;
let unwatchSongSignature = null;
let unwatchLyric = null;
let unwatchPlaying = null;
let initialized = false;

const playerStore = usePlayerStore(pinia);
const {
    currentIndex,
    currentLyricIndex,
    lyric,
    lyricLineOffsets,
    lyricsObjArr,
    playing,
    songId,
    songList,
    time,
} = storeToRefs(playerStore);

function getCurrentSong() {
    return getIndexedSong(songList.value, currentIndex.value);
}

function getCurrentSongDurationSec() {
    const currentSong = getCurrentSong();
    const songDurationSec = Math.trunc(Number(currentSong?.dt || 0) / 1000);
    if (songDurationSec > 0) return songDurationSec;

    return Math.max(0, Math.floor(Number(time.value) || 0));
}

function stopLyricIndexSync() {
    if (!stopLyricTicker) return;
    stopLyricTicker();
    stopLyricTicker = null;
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

    const currentSong = getCurrentSong();
    const timeline = buildLyricsTimeline(lyric.value, {
        songDurationSec: getCurrentSongDurationSec(),
        isLocal: currentSong?.type === 'local',
    });

    playerStore.lyricsObjArr = applyLyricLineOffsets(
        timeline,
        lyricLineOffsets.value,
        getLyricOffsetSongKey(currentSong)
    );
    syncLyricIndexForSeek(getPlaybackSnapshot().seek);
}

export function syncLyricIndexForSeek(seekSeconds) {
    const nextIndex = findLyricIndexAtTime(lyricsObjArr.value, seekSeconds, LYRIC_INDEX_SYNC_BIAS_SEC);
    applyCurrentLyricIndex(nextIndex);
    return nextIndex;
}

function startLyricIndexSync() {
    stopLyricIndexSync();
    if (!playing.value) return;

    stopLyricTicker = subscribePlaybackTick(snapshot => {
        syncLyricIndexForSeek(snapshot.seek);
    }, {
        id: 'lyric-runtime',
        interval: PLAYBACK_TICK_FAST_INTERVAL_MS,
        immediate: true,
    });
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
        () => [lyric.value, lyricLineOffsets.value],
        () => {
            rebuildLyricsTimeline();
        },
        { immediate: true }
    );

    unwatchPlaying = watch(
        () => playing.value,
        isPlaying => {
            if (isPlaying) {
                syncLyricIndexForSeek(getPlaybackSnapshot().seek);
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
