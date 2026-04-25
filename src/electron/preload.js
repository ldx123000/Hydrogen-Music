const { contextBridge, ipcRenderer } = require('electron')
const TRUSTED_RESOURCE_ERROR_MARKER = '__hydrogenMusicTrustedResourceError'

function subscribeChannel(channel, callback) {
    if (typeof callback !== 'function') return () => {}
    ipcRenderer.on(channel, callback)
    return () => {
        ipcRenderer.removeListener(channel, callback)
    }
}

function windowMin() {
    ipcRenderer.send('window-min')
}
function windowMax() {
    ipcRenderer.send('window-max')
}
function windowClose() {
    ipcRenderer.send('window-close')
}
function getWindowMaximizedState() {
    return ipcRenderer.invoke('window-is-maximized')
}
function onWindowMaximizedChange(callback) {
    const listener = (_event, isMaximized) => callback?.(Boolean(isMaximized))
    ipcRenderer.on('window-maximized-changed', listener)
    return () => {
        ipcRenderer.removeListener('window-maximized-changed', listener)
    }
}
function toRegister(url) {
    ipcRenderer.send('to-register', url)
}
function beforeQuit(callback) {
    return subscribeChannel('player-save', callback)
}
function exitApp(playlist) {
    ipcRenderer.send('exit-app', playlist)
}
function startDownload() {
    ipcRenderer.send('download-start')
}
function download(url) {
    ipcRenderer.send('download', url)
}
function downloadNext(callback) {
    return subscribeChannel('download-next', callback)
}
function downloadProgress(callback) {
    return subscribeChannel('download-progress', callback)
}
function downloadError(callback) {
    const listener = (_event, code) => callback?.(code)
    return subscribeChannel('download-error', listener)
}
function downloadPause(close) {
    ipcRenderer.send('download-pause', close)
}
function downloadResume() {
    ipcRenderer.send('download-resume')
}
function downloadCancel() {
    ipcRenderer.send('download-cancel')
}
function lyricControl(callback) {
    return subscribeChannel('lyric-control', callback)
}
function scanLocalMusic(type) {
    ipcRenderer.send('scan-local-music', type)
}
function localMusicFiles(callback) {
    return subscribeChannel('local-music-files', callback)
}
function localMusicCount(callback) {
    return subscribeChannel('local-music-count', callback)
}
function playOrPauseMusic(callback) {
    return subscribeChannel('music-playing-control', callback)
}
function playOrPauseMusicCheck(playing) {
    ipcRenderer.send('music-playing-check', playing)
}
function lastOrNextMusic(callback) {
    return subscribeChannel('music-song-control', callback)
}
function changeMusicPlaymode(callback) {
    return subscribeChannel('music-playmode-control', callback)
}
function changeTrayMusicPlaymode(mode) {
    ipcRenderer.send('music-playmode-tray-change', mode)
}
function volumeUp(callback) {
    return subscribeChannel('music-volume-up', callback)
}
function volumeDown(callback) {
    return subscribeChannel('music-volume-down', callback)
}
function musicProcessControl(callback) {
    return subscribeChannel('music-process-control', callback)
}
function hidePlayer(callback) {
    return subscribeChannel('hide-player', callback)
}
function setSettings(settings) {
    ipcRenderer.send('set-settings', settings)
}
function clearLocalMusicData(type) {
    ipcRenderer.send('clear-local-music-data', type)
}
function registerShortcuts() {
    ipcRenderer.send('register-shortcuts')
}
function unregisterShortcuts() {
    ipcRenderer.send('unregister-shortcuts')
}
function openLocalFolder(path) {
    ipcRenderer.send('open-local-folder', path)
}
function saveLastPlaylist(playlist) {
    ipcRenderer.send('save-last-playlist', playlist)
}
function downloadVideoProgress(callback) {
    return subscribeChannel('download-video-progress', callback)
}
function cancelDownloadMusicVideo() {
    ipcRenderer.send('cancel-download-music-video')
}
function copyTxt(txt) {
    ipcRenderer.send('copy-txt', txt)
}
function checkUpdate(callback) {
    const listener = (_event, version) => callback?.(version)
    return subscribeChannel('check-update', listener)
}
function manualUpdateAvailable(callback) {
    const listener = (_event, version, url) => callback?.(version, url)
    return subscribeChannel('manual-update-available', listener)
}
function updateNotAvailable(callback) {
    const listener = (_event, infoOrVersion) => callback?.(infoOrVersion)
    return subscribeChannel('update-not-available', listener)
}
function updateDownloadProgress(callback) {
    const listener = (_event, percent) => callback?.(percent)
    return subscribeChannel('update-download-progress', listener)
}
function updateDownloaded(callback) {
    const listener = (_event, version) => callback?.(version)
    return subscribeChannel('update-downloaded', listener)
}
function updateError(callback) {
    const listener = (_event, message) => callback?.(message)
    return subscribeChannel('update-error', listener)
}
function checkForUpdate() {
    ipcRenderer.send('check-for-update')
}
function whenNcmApiReady() {
    return ipcRenderer.invoke('ncm-api-ready-state')
}
function requestNcmApi(request) {
    return ipcRenderer.invoke('ncm-api-request', request)
}
function requestTrustedResource(request) {
    return ipcRenderer.invoke('trusted-resource-request', request).then((response) => {
        if (response && typeof response === 'object' && response[TRUSTED_RESOURCE_ERROR_MARKER]) {
            const error = new Error(response.message || 'trusted-resource-request-failed')
            if (response.code) error.code = response.code
            if (response.status) error.status = response.status
            if (response.statusText) error.statusText = response.statusText
            throw error
        }
        return response
    })
}
function requestAudioArrayBuffer(request) {
    return ipcRenderer.invoke('audio-buffer-request', request)
}
function readLocalAudioBuffer(filePath) {
    return ipcRenderer.invoke('read-local-audio-buffer', filePath)
}
function clearNcmApiCookies() {
    return ipcRenderer.invoke('ncm-api-cookie-clear')
}
function downloadUpdate() {
    ipcRenderer.send('download-update')
}
function installUpdate() {
    ipcRenderer.send('install-update')
}
function cancelUpdate() {
    ipcRenderer.send('cancel-update')
}
function setWindowTile(title) {
    ipcRenderer.send('set-window-title', title)
}
function updatePlaylistStatus(status) {
    ipcRenderer.send('music-playlist-status', status)
}
function updateDockMenu(songInfo) {
    try {
        // 仅在 macOS 下转发，其他平台直接忽略，避免误触发
        if (process.platform !== 'darwin') return
        ipcRenderer.send('update-dock-menu', songInfo)
    } catch (e) {
        // ignore
    }
}
function sendMetaData(metadata) {
  ipcRenderer.send('metadata', metadata);
}

function sendPlayerCurrentTrackTime(t) {
  ipcRenderer.send("playerCurrentTrackTime", t)
}

function toFileUrl(filePathOrUrl) {
    if (!filePathOrUrl || typeof filePathOrUrl !== 'string') return ''
    if (filePathOrUrl.startsWith('file://')) return filePathOrUrl
    const normalized = String(filePathOrUrl).replace(/\\/g, '/')
    // If it already looks like a URL (http/https/etc.), return as-is
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalized)) return normalized

    // Windows drive letter paths need a leading slash in file URLs: /C:/...
    const withLeadingSlash = /^[a-zA-Z]:\//.test(normalized) ? `/${normalized}` : normalized

    // encodeURI won't encode '#' and '?', which break URLs (fragment/query), so patch them manually
    const encoded = encodeURI(withLeadingSlash).replace(/#/g, '%23').replace(/\?/g, '%3F')
    return encoded.startsWith('/') ? `file://${encoded}` : `file:///${encoded}`
}


contextBridge.exposeInMainWorld('windowApi', {
    windowMin,
    windowMax,
    windowClose,
    getWindowMaximizedState,
    onWindowMaximizedChange,
    toRegister,
    beforeQuit,
    exitApp,
    startDownload,
    download,
    downloadNext,
    downloadProgress,
    downloadError,
    downloadPause,
    downloadResume,
    downloadCancel,
    lyricControl,
    scanLocalMusic,
    localMusicFiles,
    localMusicCount,
    getLocalMusicImage: (filePath) => ipcRenderer.invoke('get-image-base64', filePath),
    toFileUrl,
    playOrPauseMusic,
    playOrPauseMusicCheck,
    lastOrNextMusic,
    changeMusicPlaymode,
    changeTrayMusicPlaymode,
    volumeUp,
    volumeDown,
    musicProcessControl,
    hidePlayer,
    setSettings,
    getSettings: () => ipcRenderer.invoke('get-settings'),
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    clearLocalMusicData,
    persistLocalMusicDerived: (payload) => ipcRenderer.send('persist-local-music-derived', payload),
    registerShortcuts,
    unregisterShortcuts,
    getLastPlaylist: () => ipcRenderer.invoke('get-last-playlist'),
    openLocalFolder,
    saveLastPlaylist,
    getBiliVideo: (request) => ipcRenderer.invoke('get-bili-video', request),
    downloadVideoProgress,
    cancelDownloadMusicVideo,
    musicVideoIsExists: (obj) => ipcRenderer.invoke('music-video-isexists', obj),
    clearUnusedVideo: (state) => ipcRenderer.invoke('clear-unused-video', state),
    deleteMusicVideo: (id) => ipcRenderer.invoke('delete-music-video', id),
    getLocalMusicLyric: (filePath, options) => ipcRenderer.invoke('get-local-music-lyric', filePath, options),
    copyTxt,
    checkUpdate,
    manualUpdateAvailable,
    updateNotAvailable,
    updateDownloadProgress,
    updateDownloaded,
    updateError,
    checkForUpdate,
    whenNcmApiReady,
    requestNcmApi,
    requestTrustedResource,
    requestAudioArrayBuffer,
    readLocalAudioBuffer,
    clearNcmApiCookies,
    downloadUpdate,
    installUpdate,
    cancelUpdate,
    setWindowTile,
    updatePlaylistStatus,
    updateDockMenu,
})

// 新的API用于处理登录功能和桌面歌词
contextBridge.exposeInMainWorld('electronAPI', {
    // 桌面歌词相关API
    createLyricWindow: () => ipcRenderer.invoke('create-lyric-window'),
    closeLyricWindow: () => ipcRenderer.invoke('close-lyric-window'),
    setLyricWindowMovable: (movable) => ipcRenderer.invoke('set-lyric-window-movable', movable),
    lyricWindowReady: () => ipcRenderer.send('lyric-window-ready'),
    onLyricUpdate: (callback) => subscribeChannel('lyric-update', callback),
    requestLyricData: () => ipcRenderer.send('request-lyric-data'),
    updateLyricData: (data) => ipcRenderer.send('update-lyric-data', data),
    getCurrentLyricData: (callback) => subscribeChannel('get-current-lyric-data', callback),
    sendCurrentLyricData: (data) => ipcRenderer.send('current-lyric-data', data),
    isLyricWindowVisible: () => ipcRenderer.invoke('is-lyric-window-visible'),
    resizeWindow: (width, height) => ipcRenderer.invoke('resize-lyric-window', { width, height }),
    notifyLyricWindowClosed: () => ipcRenderer.send('lyric-window-closed'),
    onDesktopLyricClosed: (callback) => subscribeChannel('desktop-lyric-closed', callback),
    // 拖拽相关：获取与移动桌面歌词窗口
    getLyricWindowBounds: () => ipcRenderer.invoke('get-lyric-window-bounds'),
    moveLyricWindow: (x, y) => ipcRenderer.send('move-lyric-window', { x, y }),
    moveLyricWindowBy: (dx, dy) => ipcRenderer.send('move-lyric-window-by', { dx, dy }),
    setLyricWindowResizable: (resizable) => ipcRenderer.send('set-lyric-window-resizable', { resizable }),
    moveLyricWindowTo: (x, y, width, height) => ipcRenderer.send('move-lyric-window-to', { x, y, width, height }),
    getLyricWindowMinMax: () => ipcRenderer.invoke('get-lyric-window-min-max'),
    setLyricWindowMinMax: (minWidth, minHeight, maxWidth, maxHeight) => ipcRenderer.send('set-lyric-window-min-max', { minWidth, minHeight, maxWidth, maxHeight }),
    setLyricWindowAspectRatio: (aspectRatio) => ipcRenderer.send('set-lyric-window-aspect-ratio', { aspectRatio }),
    getLyricWindowContentBounds: () => ipcRenderer.invoke('get-lyric-window-content-bounds'),
    moveLyricWindowContentTo: (x, y, width, height) => ipcRenderer.send('move-lyric-window-content-to', { x, y, width, height }),
})

contextBridge.exposeInMainWorld('playerApi', {
  // 切换循环模式
  switchRepeatMode: (mode) => ipcRenderer.send('switchRepeatMode', mode), // mode: 'off' | 'one' | 'on'

  // 切换随机播放
  switchShuffle: (shuffle) => ipcRenderer.send('switchShuffle', shuffle), // shuffle: true/false
  sendMetaData,
  sendPlayerCurrentTrackTime,
  onSetPosition: (callback) => {
    const listener = (_, positionUs) => {
      callback(positionUs)
    }
    return subscribeChannel('setPosition', listener)
  },
  onNext: (callback) => subscribeChannel('next', callback),
  onPrevious: (callback) => subscribeChannel('previous', callback),
  onPlayM: (callback) => subscribeChannel('play', callback),
  onPlayPause: (callback) => subscribeChannel('playpause', callback),
  onPauseM: (callback) => subscribeChannel('pause', callback),
  onRepeat: (callback) => subscribeChannel('repeat', callback),
  onShuffle: (callback) => subscribeChannel('shuffle', callback),
  setVolume: (volume) => ipcRenderer.send('setVolume', volume),
  onVolumeChanged: (callback) => {
    const listener = (_, volume) => {
      callback(volume)
    }
    return subscribeChannel('volume_changed', listener)
  },
});

// 这里安全地暴露必要的接口
contextBridge.exposeInMainWorld('process', {
  platform: process.platform,
})
