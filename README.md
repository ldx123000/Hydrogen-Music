<p align="center">
  <img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/icon.png" width="96" alt="Hydrogen Music" />
</p>

<h1 align="center">Hydrogen Music · Android</h1>

<p align="center">
  <strong>Android V1.0.2 (bata)</strong><br />
  明日方舟风格网易云播放器 —— Android 移植版
</p>

<p align="center">
  <img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/home.jpg" width="150" alt="首页" />
  <img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/player.jpg" width="150" alt="播放页" />
  <img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/lyrics.jpg" width="150" alt="歌词" />
  <img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/comments.jpg" width="150" alt="评论区" />
  <img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/fm.jpg" width="150" alt="私人漫游" />
  <img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/siren.jpg" width="150" alt="塞壬唱片" />
  <img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/settings.jpg" width="150" alt="设置" />
</p>

---

## 简介

本项目是 **[Hydrogen Music](https://github.com/ldx123000/HydrogenMusic)**（Electron + Vue 3 桌面播放器）
的 **Android 移植版**。

做法是**保留上游的 Vue 前端**，把 Electron 主进程承担的原生能力改由 Android Java 插件实现：

```
WebView（页面 https://localhost）
  Vue 3 前端  ←─ Capacitor Bridge ─→  Java 插件
                    ↕
         Capacitor 本地服务器（同源 https，可流式读 content://）
                    ↕
        SAF / MediaStore / ContentResolver
```

**前端业务代码没有改动** —— 通过一层桥接（`src/utils/webBridge.js`）把 Electron 的
`window.api.*` 在 Android 上重新实现了一遍。

---

## 功能

| 功能 | 说明 |
|---|---|
| 在线播放 / 歌单 / 搜索 / 每日推荐 / 评论 | 复用上游前端 + 内嵌 Node 运行时转发网易云 API |
| **本地音乐扫描** | `MediaStore`（Android 10+）/ SAF（更低版本） |
| **本地音乐播放** | 经 Capacitor `/_capacitor_content_` 代理流式播放 |
| **专辑封面** | 内嵌图片；无内嵌则找同目录同名图片 |
| **歌词** | 内嵌歌词 → 同目录同名 `.lrc` |
| **音乐下载** | 原生 HTTP 下载 + 手写 ID3v2.3 / FLAC Vorbis Comment 标签 |
| **通知栏 / 锁屏控制** | 前台服务 + MediaSession |
| **返回键** | 逐级返回，根路由退出应用 |
| **深色模式 / 移动端布局** | 统一在 `src/assets/css/mobile.css` 覆盖桌面写死尺寸 |

---

## 构建

### 环境要求

| 组件 | 说明 |
|---|---|
| Node.js | 18 或更高 |
| JDK | 21（可用 `JAVA_HOME` 覆盖） |
| Android SDK | 需要 `android-36` 平台与 build-tools |
| Gradle 缓存 | 可用 `GRADLE_USER_HOME` 覆盖 |

### 步骤

```bash
# 1. 安装依赖
npm install
cd mobile-runtime && npm install && cd ..

# 2. 一键构建（vite build + 注入 Node 运行时 + gradle assembleDebug）
npm run android

# 3. 安装到设备
adb install -r HydrogenMusic.apk
```

### 常用参数

```bash
# 只检查环境，不构建
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -CheckOnly

# 深度清理后构建（多次构建后建议执行）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Clean
```

> **为什么要 `-Clean`**：`vite` 的 `emptyOutDir` 在构建时被关闭（一次性删除几千个产物会触发
> 构建环境的批量删除保护），而增量清理每轮只清 40 个文件，追不上新增速度。实测未清理时
> `dist/` 会累积 **2700+ 个重复文件（约 86 MB）**并打进 APK。`-Clean` 会一次性清空
> `dist/` 与 `assets/public/assets/`（保留 `nodejs` 运行时），让构建回到干净状态。

产物约 **209 MB**（含内嵌 Node 运行时的三个 CPU 架构库）。

---

## 目录结构

```
├── src/                         Vue 3 前端（与上游共享）
│   ├── utils/webBridge.js       ★ Electron windowApi 的 Android 重实现
│   ├── utils/backButton.js      ★ Android 返回键路由策略
│   ├── composables/useIsMobile.js  移动端判定（同步 <html data-hm-mobile>）
│   └── assets/css/mobile.css    ★ 移动端样式覆盖（主要改动集中在此）
├── android/                     Android 原生工程
│   └── app/src/main/java/com/hydrogen/music/
│       ├── MainActivity.java               插件装配 + 返回键
│       ├── LocalMusicPlugin.java           本地扫描 / 封面 / 歌词
│       ├── MusicDownloadPlugin.java        下载 + 标签写入
│       ├── MediaNotificationPlugin.java    通知栏
│       ├── MediaPlaybackService.java       前台服务
│       └── AppControlPlugin.java           退出应用
├── mobile-runtime/              内嵌 Node 运行时（网易云 API 转发）
├── scripts/                     构建脚本
├── tools/
│   ├── md-to-pdf.cjs            Markdown → PDF 工具
│   └── device-debug/            真机调试脚本（CDP over adb）
└── docs/                        文档
```

---

## 文档

| 文档 | 内容 |
|---|---|
| **[docs/发布说明.pdf](docs/发布说明.pdf)** | 发布说明：版本信息、构建、产物构成、已知问题 |
| **[docs/交付说明.html](docs/交付说明.html)** | 用户向：安装须知、改动摘要、测试结果 |
| [docs/参考-Android构建与架构.md](docs/参考-Android构建与架构.md) | 构建流程、数据流、目录职责 |
| [docs/01-技术记录-关键结论与踩坑.md](docs/01-技术记录-关键结论与踩坑.md) | 关键结论与踩坑溯源 |
| [docs/02-改动清单.md](docs/02-改动清单.md) | 按文件列出的完整改动 |
| [docs/03-待办与已知问题.md](docs/03-待办与已知问题.md) | 未完成与未确认事项 |
| [docs/04-真机调试手册.md](docs/04-真机调试手册.md) | 真机调试环境与流程 |
| [docs/参考-上游README.md](docs/参考-上游README.md) | 上游原始 README（存档） |

---

## 已知问题

- **跨设备布局差异**：项目里有 249 处 `vw/vh`（桌面端当等比缩放用），不同屏幕宽度下比例会变。
  这是**屏幕尺寸差异，不是渲染引擎差异**，打包浏览器内核无法解决。
  可行解法：把 `vw` 基准改为标准设计宽度（`--hm-vw: calc(100vw / 406)`）。
- **移动端判定边界**：`(max-width: 900px), (pointer: coarse) and (max-width: 1024px)`，
  平板 / 横屏 / 宽视口可能误走桌面分支。
- **下载暂停不是断点续传**：目前是「原地等待」，未实现 HTTP Range 续传。
- **首次启动较慢**：需解压约 4800 个内嵌运行时文件，40～60 秒，期间白屏属正常。

---

## 许可与致谢

### 声明

本项目仅供个人学习与研究使用，禁止用于商业用途或任何非法用途。项目内涉及的音乐、歌词、评论、图片、视频等内容版权归其权利方所有。

本项目基于上游 **[Hydrogen Music](https://github.com/ldx123000/HydrogenMusic)**
（作者 **ldx123000**，MIT License）修改而来。

- 上游 `LICENSE` 与署名**完整保留**（见 `LICENSE` 与本应用设置页）
- Android 适配部分同样以 **MIT License** 发布

```
Made by ldx123000 | Modified from Hydrogen Music
Android port by CY
```

### 致谢

本项目能落地，离不开以下朋友的帮助，在此一并致谢：

- **羟醛缩合可以增长碳链** —— 与我共同开发
- **东东**（[ldx123000](https://github.com/ldx123000)）—— Hydrogen Music 复活版作者、上游维护者
- **P3T、Winston、灰牌哲翰、蒲兰、北川、钱白玉** 等朋友提供的帮助
- 以及 **DeepSeek、GLM** —— 开发过程中的 AI 助手

感谢以上朋友提供的帮助。

