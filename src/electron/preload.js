const { contextBridge, ipcRenderer } = require('electron')
 
function windowMin() {
    ipcRenderer.send('window-min')
}
function windowMax() {
    ipcRenderer.send('window-max')
}
function windowClose() {
    ipcRenderer.send('window-close')
}
function toRegister(url) {
    ipcRenderer.send('to-register', url)
}
function beforeQuit(callback) {
    ipcRenderer.on('player-save', callback)
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
    ipcRenderer.on('download-next', callback)
}
function downloadProgress(callback) {
    ipcRenderer.on('download-progress', callback)
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
    ipcRenderer.on('lyric-control', callback)
}
function scanLocalMusic(type) {
    ipcRenderer.send('scan-local-music', type)
}
function localMusicFiles(callback) {
    ipcRenderer.on('local-music-files', callback)
    callback = null
}
function localMusicCount(callback) {
    ipcRenderer.on('local-music-count', callback)
}
function playOrPauseMusic(callback) {
    ipcRenderer.on('music-playing-control', callback)
}
function playOrPauseMusicCheck(playing) {
    ipcRenderer.send('music-playing-check', playing)
}
function lastOrNextMusic(callback) {
    ipcRenderer.on('music-song-control', callback)
}
function changeMusicPlaymode(callback) {
    ipcRenderer.on('music-playmode-control', callback)
}
function changeTrayMusicPlaymode(mode) {
    ipcRenderer.send('music-playmode-tray-change', mode)
}
function volumeUp(callback) {
    ipcRenderer.on('music-volume-up', callback)
}
function volumeDown(callback) {
    ipcRenderer.on('music-volume-down', callback)
}
function musicProcessControl(callback) {
    ipcRenderer.on('music-process-control', callback)
}
function hidePlayer(callback) {
    ipcRenderer.on('hide-player', callback)
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
    ipcRenderer.on('download-video-progress', callback)
}
function cancelDownloadMusicVideo() {
    ipcRenderer.send('cancel-download-music-video')
}
function copyTxt(txt) {
    ipcRenderer.send('copy-txt', txt)
}
function checkUpdate(callback) {
    ipcRenderer.on('check-update', callback)
}
function setWindowTile(title) {
    ipcRenderer.send('set-window-title', title)
}
function updatePlaylistStatus(status) {
    ipcRenderer.send('music-playlist-status', status)
}
function updateDockMenu(songInfo) {
    ipcRenderer.send('update-dock-menu', songInfo)
}
function openNeteaseLogin() {
    return ipcRenderer.invoke('open-netease-login')
}
function clearLoginSession() {
    return ipcRenderer.invoke('clear-login-session')
}
contextBridge.exposeInMainWorld('windowApi', {
    windowMin,
    windowMax,
    windowClose,
    toRegister,
    beforeQuit,
    exitApp,
    startDownload,
    download,
    downloadNext,
    downloadProgress,
    downloadPause,
    downloadResume,
    downloadCancel,
    lyricControl,
    scanLocalMusic,
    localMusicFiles,
    localMusicCount,
    getLocalMusicImage: (filePath) => ipcRenderer.invoke('get-image-base64', filePath),
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
    registerShortcuts,
    unregisterShortcuts,
    getLastPlaylist: () => ipcRenderer.invoke('get-last-playlist'),
    openLocalFolder,
    saveLastPlaylist,
    getRequestData: (request) => ipcRenderer.invoke('get-request-data', request),
    getBiliVideo: (request) => ipcRenderer.invoke('get-bili-video', request),
    downloadVideoProgress,
    cancelDownloadMusicVideo,
    musicVideoIsExists: (obj) => ipcRenderer.invoke('music-video-isexists', obj),
    clearUnusedVideo: (state) => ipcRenderer.invoke('clear-unused-video', state),
    deleteMusicVideo: (id) => ipcRenderer.invoke('delete-music-video', id),
    getLocalMusicLyric: (filePath) => ipcRenderer.invoke('get-local-music-lyric', filePath),
    copyTxt,
    checkUpdate,
    setWindowTile,
    updatePlaylistStatus,
    updateDockMenu,
})

// 新的API用于处理登录功能和桌面歌词
contextBridge.exposeInMainWorld('electronAPI', {
    openNeteaseLogin,
    clearLoginSession,
    // 桌面歌词相关API
    createLyricWindow: () => ipcRenderer.invoke('create-lyric-window'),
    closeLyricWindow: () => ipcRenderer.invoke('close-lyric-window'),
    setLyricWindowMovable: (movable) => ipcRenderer.invoke('set-lyric-window-movable', movable),
    lyricWindowReady: () => ipcRenderer.send('lyric-window-ready'),
    onLyricUpdate: (callback) => ipcRenderer.on('lyric-update', callback),
    requestLyricData: () => ipcRenderer.send('request-lyric-data'),
    updateLyricData: (data) => ipcRenderer.send('update-lyric-data', data),
    getCurrentLyricData: (callback) => ipcRenderer.on('get-current-lyric-data', callback),
    sendCurrentLyricData: (data) => ipcRenderer.send('current-lyric-data', data),
    isLyricWindowVisible: () => ipcRenderer.invoke('is-lyric-window-visible'),
    resizeWindow: (width, height) => ipcRenderer.invoke('resize-lyric-window', { width, height }),
    notifyLyricWindowClosed: () => ipcRenderer.send('lyric-window-closed'),
    onDesktopLyricClosed: (callback) => ipcRenderer.on('desktop-lyric-closed', callback),
})