/**
 * windowApi Stub - 在非 Electron 环境（如 vite preview / 浏览器）下提供 windowApi 降级实现
 * 避免因 windowApi 未定义导致 ReferenceError 崩溃（白屏）
 */
(function () {
  if (typeof windowApi !== "undefined") return;

  const noop = () => {};
  const noopPromise = () => Promise.resolve();
  const noopResolve = (val) => () => Promise.resolve(val);

  window.windowApi = {
    // ── 窗口控制 ──
    windowMin: noop,
    windowMax: noop,
    windowClose: noop,
    getWindowMaximizedState: noopResolve(false),
    onWindowMaximizedChange: noop,

    // ── 播放控制（注册回调）──
    playOrPauseMusic: noop,
    playOrPauseMusicCheck: noop,
    lastOrNextMusic: noop,
    changeMusicPlaymode: noop,
    changeTrayMusicPlaymode: noop,
    volumeUp: noop,
    volumeDown: noop,
    musicProcessControl: noop,
    hidePlayer: noop,
    syncWindowsTaskbarPlaybackState: noop,

    // ── 设置 ──
    getSettings: noopResolve({
      music: {
        level: "high",
        lyricSize: 28,
        tlyricSize: 22,
        rlyricSize: 22,
        lyricInterlude: 4,
        searchAssistLimit: 8,
        showSongTranslation: true,
        coverSize: 400,
      },
      local: {
        downloadFolder: "",
        localFolder: [],
      },
      other: {
        quitApp: "minimize",
        enableUpdate: false,
      },
    }),
    setSettings: noop,

    // ── 本地音乐 / 文件 ──
    scanLocalMusic: noop,
    localMusicFiles: noop,
    localMusicCount: noop,
    clearLocalMusicData: noop,
    openLocalFolder: noop,
    openFile: noopResolve(""),
    toFileUrl: (path) => path || "",
    getLocalMusicImage: noopResolve(""),
    getLocalMusicLyric: noopResolve(""),

    // ── 歌单 ──
    getLastPlaylist: noopResolve(null),
    saveLastPlaylist: noop,

    // ── 更新 ──
    checkUpdate: noop,
    manualUpdateAvailable: noop,
    updateNotAvailable: noop,
    updateDownloadProgress: noop,
    updateDownloaded: noop,
    updateError: noop,
    checkForUpdate: noop,
    downloadUpdate: noop,
    installUpdate: noop,
    cancelUpdate: noop,

    // ── 下载 ──
    startDownload: noop,
    download: noop,
    downloadNext: noop,
    downloadProgress: noop,
    downloadPause: noop,
    downloadResume: noop,
    downloadCancel: noop,

    // ── 菜单 / Dock ──
    setWindowTile: noop,
    updatePlaylistStatus: noop,
    updateDockMenu: noop,

    // ── 视频 ──
    musicVideoIsExists: noopResolve(false),
    clearUnusedVideo: noopResolve([]),
    deleteMusicVideo: noop,
    downloadVideoProgress: noop,
    cancelDownloadMusicVideo: noop,

    // ── 登录 / 外部链接 ──
    toRegister: noop,
    copyTxt: noop,

    // ── 快捷键 ──
    registerShortcuts: noop,
    unregisterShortcuts: noop,

    // ── MediaSession / MPRIS ──
    sendMetaData: noop,
    sendPlayerCurrentTrackTime: noop,
    beforeQuit: noop,
    exitApp: noop,

    // ── 杂项 ──
    lyricControl: noop,
    getRequestData: noopResolve(null),
    getBiliVideo: noopResolve(null),

    // ── 数据重置 ──
    resetAllData: noopResolve({ success: false, error: "Not in Electron" }),
    onResetLocalStorage: noop,
  };

  // 如果 electronAPI 也未定义，也补充一个空对象避免引用错误
  if (typeof window.electronAPI === "undefined") {
    window.electronAPI = {};
  }
  if (typeof window.playerApi === "undefined") {
    window.playerApi = {
      onSetPosition: noop,
      onPlayPause: noop,
      onNext: noop,
      onPrevious: noop,
      onPlayM: noop,
      onPauseM: noop,
      onRepeat: noop,
      onShuffle: noop,
      sendMetaData: noop,
      sendPlayerCurrentTrackTime: noop,
      setVolume: noop,
      onVolumeChanged: noop,
    };
  }
  if (typeof window.process === "undefined") {
    window.process = { platform: "browser" };
  }
})();
