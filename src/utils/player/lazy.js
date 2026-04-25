let playerModulePromise = null;
let playerModule = null;

function loadPlayerModule() {
    if (playerModule) return Promise.resolve(playerModule);
    if (!playerModulePromise) {
        playerModulePromise = import('../player.js').then(module => {
            playerModule = module;
            return module;
        }).catch(error => {
            playerModulePromise = null;
            throw error;
        });
    }
    return playerModulePromise;
}

function callPlayerExport(name, args) {
    if (playerModule && typeof playerModule[name] === 'function') {
        return playerModule[name](...args);
    }

    return loadPlayerModule().then(module => {
        const fn = module[name];
        if (typeof fn !== 'function') {
            throw new Error(`player export not found: ${name}`);
        }
        return fn(...args);
    });
}

const lazyPlayerExport = name => (...args) => callPlayerExport(name, args);

export const checkAndLoadVideoForCurrentSong = lazyPlayerExport('checkAndLoadVideoForCurrentSong');
export const pauseCurrentMusicVideo = lazyPlayerExport('pauseCurrentMusicVideo');
export const reopenCurrentMusicVideo = lazyPlayerExport('reopenCurrentMusicVideo');
export const isVideoClosedByUser = lazyPlayerExport('isVideoClosedByUser');
export const loadLastSong = lazyPlayerExport('loadLastSong');
export const play = lazyPlayerExport('play');
export const startProgress = lazyPlayerExport('startProgress');
export const setId = lazyPlayerExport('setId');
export const addToList = lazyPlayerExport('addToList');
export const localMusicHandle = lazyPlayerExport('localMusicHandle');
export const addLocalMusicTOList = lazyPlayerExport('addLocalMusicTOList');
export const startLocalMusicVideo = lazyPlayerExport('startLocalMusicVideo');
export const startMusicVideo = lazyPlayerExport('startMusicVideo');
export const unloadMusicVideo = lazyPlayerExport('unloadMusicVideo');
export const loadMusicVideo = lazyPlayerExport('loadMusicVideo');
export const addSong = lazyPlayerExport('addSong');
export const setSongLevel = lazyPlayerExport('setSongLevel');
export const getLocalLyric = lazyPlayerExport('getLocalLyric');
export const getSongUrl = lazyPlayerExport('getSongUrl');
export const preloadGaplessSongPlayback = lazyPlayerExport('preloadGaplessSongPlayback');
export const startMusic = lazyPlayerExport('startMusic');
export const pauseMusic = lazyPlayerExport('pauseMusic');
export const playLast = lazyPlayerExport('playLast');
export const playNext = lazyPlayerExport('playNext');
export const changeProgress = lazyPlayerExport('changeProgress');
export const changeProgressByDragStart = lazyPlayerExport('changeProgressByDragStart');
export const changeProgressByDragEnd = lazyPlayerExport('changeProgressByDragEnd');
export const changePlayMode = lazyPlayerExport('changePlayMode');
export const playAll = lazyPlayerExport('playAll');
export const setShuffledList = lazyPlayerExport('setShuffledList');
export const getLikeActionErrorMessage = lazyPlayerExport('getLikeActionErrorMessage');
export const isSongLiked = lazyPlayerExport('isSongLiked');
export const applyOptimisticLikeState = lazyPlayerExport('applyOptimisticLikeState');
export const createLikeActionToken = lazyPlayerExport('createLikeActionToken');
export const isActiveLikeActionToken = lazyPlayerExport('isActiveLikeActionToken');
export const queueLikeRequest = lazyPlayerExport('queueLikeRequest');
export const resolveFavoritePlaylistMeta = lazyPlayerExport('resolveFavoritePlaylistMeta');
export const getFavoritePlaylistId = lazyPlayerExport('getFavoritePlaylistId');
export const getFavoritePlaylistNoticeText = lazyPlayerExport('getFavoritePlaylistNoticeText');
export const isPlaylistTrackOperationSuccess = lazyPlayerExport('isPlaylistTrackOperationSuccess');
export const updateFavoritePlaylistTrack = lazyPlayerExport('updateFavoritePlaylistTrack');
export const syncLikelistAfterLikeAction = lazyPlayerExport('syncLikelistAfterLikeAction');
export const likeSong = lazyPlayerExport('likeSong');
export const addToNext = lazyPlayerExport('addToNext');
export const addToNextLocal = lazyPlayerExport('addToNextLocal');
export const savePlaylist = lazyPlayerExport('savePlaylist');
export const musicVideoCheck = lazyPlayerExport('musicVideoCheck');
export const initPlayerExternalBridge = lazyPlayerExport('initPlayerExternalBridge');
