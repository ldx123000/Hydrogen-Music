import { loadLastSong } from "./player";
import { scanMusic } from "./locaMusic";
import { initDownloadManager } from "./downloadManager";
import { usePlayerStore } from "../store/playerStore";
import { useLocalStore } from "../store/localStore";
import { storeToRefs } from "pinia";
import { getPreferredQuality } from "./quality";
import { initializeCurrentAccountSession } from "./accountSession";
import { installGlobalImageFallback } from "./imageUtils";
import { applyCustomFontStyle } from "./setFont";

const playerStore = usePlayerStore();
const {
  quality,
  lyricSize,
  tlyricSize,
  rlyricSize,
  lyricInterludeTime,
  searchAssistLimit,
  showSongTranslation,
  coverSize,
  gaplessPlayback,
  audioVisualizer,
} = storeToRefs(playerStore);
const localStore = useLocalStore();

export const initSettings = () => {
  windowApi.getSettings().then((settings) => {
    const rawSearchAssistLimit = Number.parseInt(
      settings?.music?.searchAssistLimit,
      10,
    );
    if (!quality.value)
      quality.value = getPreferredQuality(settings?.music?.level);
    lyricSize.value = settings.music.lyricSize;
    tlyricSize.value = settings.music.tlyricSize;
    rlyricSize.value = settings.music.rlyricSize;
    lyricInterludeTime.value = settings.music.lyricInterlude;
    searchAssistLimit.value = Number.isFinite(rawSearchAssistLimit)
      ? Math.max(1, rawSearchAssistLimit)
      : 8;
    showSongTranslation.value = settings?.music?.showSongTranslation !== false;
    gaplessPlayback.value = settings?.music?.gaplessPlayback === true;
    audioVisualizer.value = settings?.music?.audioVisualizer === true;
    coverSize.value = settings?.music?.coverSize ?? 400;
    applyCustomFontStyle(settings?.other?.customFont || "");
    // 记录旧的文件夹设置，用于检测变化
    const prevDownloadFolder = localStore.downloadedFolderSettings;
    const prevLocalFolders = [...(localStore.localFolderSettings || [])];

    localStore.downloadedFolderSettings = settings.local.downloadFolder;
    localStore.localFolderSettings = settings.local.localFolder;
    localStore.quitApp = settings.other.quitApp;

    // 检测下载文件夹是否新增或变化
    const downloadFolderChanged =
      localStore.downloadedFolderSettings &&
      localStore.downloadedFolderSettings !== prevDownloadFolder;
    if (downloadFolderChanged) {
      // 文件夹有变化，清除旧缓存并重新扫描
      if (localStore.downloadedMusicFolder) {
        windowApi.clearLocalMusicData("downloaded");
        localStore.downloadedMusicFolder = null;
        localStore.downloadedFiles = null;
      }
    }
    if (
      localStore.downloadedFolderSettings &&
      !localStore.downloadedMusicFolder
    ) {
      scanMusic({ type: "downloaded", refresh: downloadFolderChanged });
    }

    // 检测本地文件夹列表是否有变化
    const newLocalFolders = localStore.localFolderSettings || [];
    const localFoldersChanged =
      prevLocalFolders.length !== newLocalFolders.length ||
      prevLocalFolders.some((f, i) => f !== newLocalFolders[i]);
    if (localFoldersChanged) {
      // 文件夹列表有变化，清除旧缓存并重新扫描
      if (localStore.localMusicFolder) {
        windowApi.clearLocalMusicData("local");
        localStore.localMusicFolder = null;
        localStore.localMusicList = null;
        localStore.localMusicClassify = null;
      }
    }
    if (newLocalFolders.length != 0 && !localStore.localMusicFolder) {
      scanMusic({ type: "local", refresh: localFoldersChanged });
    }

    // 如果设置中已无文件夹但仍有缓存数据，清除它们
    if (
      !localStore.downloadedFolderSettings &&
      localStore.downloadedMusicFolder
    ) {
      localStore.downloadedMusicFolder = null;
      localStore.downloadedFiles = null;
      windowApi.clearLocalMusicData("downloaded");
    }
    if (newLocalFolders.length == 0 && localStore.localMusicFolder) {
      ((localStore.localMusicFolder = null),
        (localStore.localMusicList = null));
      localStore.localMusicClassify = null;
      windowApi.clearLocalMusicData("local");
    }
  });
};

//初始化
export const init = async () => {
  // 渲染进程版本迁移：清理旧版本可能不兼容的 localStorage 数据
  migrateLocalStorage();
  initSettings();
  installGlobalImageFallback();
  initDownloadManager(); // 初始化下载管理器

  // 重置FM模式状态 - 应用启动时不应保持FM模式
  if (playerStore.listInfo && playerStore.listInfo.type === "personalfm") {
    playerStore.listInfo = null;
    playerStore.songList = null;
    playerStore.currentIndex = 0;
    playerStore.songId = null;
  }

  try {
    await initializeCurrentAccountSession();
  } catch (error) {
    console.error("用户信息加载失败:", error);
  } finally {
    loadLastSong();
  }
};

/**
 * 渲染进程本地存储版本迁移
 * 当检测到应用版本变更时，清理可能不兼容的旧数据
 */
function migrateLocalStorage() {
  try {
    const MIGRATION_KEY = "_hydrogenmusic_app_version";
    // 尝试从 electron-store 获取当前版本（通过 windowApi）
    // 如果无法获取，从 package.json 或 userAgent 推断
    const storedVersion = localStorage.getItem(MIGRATION_KEY);

    // 获取当前版本字符串（从 windowApi 或回退方案）
    const getCurrentVersion = async () => {
      try {
        const settings = await windowApi.getSettings();
        return settings?._appVersion || null;
      } catch (_) {
        return null;
      }
    };

    // 异步执行版本检查
    getCurrentVersion()
      .then((currentVersion) => {
        if (!currentVersion) return;

        if (storedVersion !== currentVersion) {
          console.log(
            `[localStorage migration] 版本变更: ${storedVersion || "无"} → ${currentVersion}`,
          );

          // 清理可能不兼容的 Pinia 持久化数据
          // 保留用户认证相关的 cookie 数据
          const keysToKeep = [
            "cookie:token",
            "cookie:userid",
            "cookie:vip_type",
            "cookie:vip_token",
            "cookie:t1",
            "cookie:dfid",
          ];
          const allKeys = [];
          for (let i = 0; i < localStorage.length; i++) {
            allKeys.push(localStorage.key(i));
          }

          // 清理 pinia 持久化数据（通常以 store 名称为前缀）
          const piniaKeys = allKeys.filter(
            (key) =>
              key &&
              (key.startsWith("playerStore") ||
                key.startsWith("userStore") ||
                key.startsWith("localStore") ||
                key.startsWith("libraryStore") ||
                key.startsWith("otherStore") ||
                key.startsWith("cloudStore") ||
                key.startsWith("sirenStore")),
          );

          for (const key of piniaKeys) {
            try {
              localStorage.removeItem(key);
            } catch (_) {}
          }

          if (piniaKeys.length > 0) {
            console.log(
              `[localStorage migration] 已清理 ${piniaKeys.length} 个旧的 Pinia 持久化条目`,
            );
          }

          // 更新版本标记
          localStorage.setItem(MIGRATION_KEY, currentVersion);
        }
      })
      .catch(() => {});
  } catch (_) {}
}
