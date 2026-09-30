<p align="center">
  <img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/icon.png" width="96" alt="Hydrogen Music" />
</p>

<h1 align="center">Hydrogen Music 复活版</h1>

<p align="center">
  <strong>基于 Electron 与 Vue 3 的明日方舟风格网易云播放器</strong>
  <br />
  这个版本延续原项目的视觉方向，继续补齐登录、播放、下载、歌词、评论、云盘、私人漫游、本地音乐和桌面端集成。
</p>

<p align="center">
  <a href="https://github.com/ldx123000/Hydrogen-Music/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/ldx123000/Hydrogen-Music?style=for-the-badge&label=Release" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/ldx123000/Hydrogen-Music?style=for-the-badge" /></a>
  <img alt="Electron" src="https://img.shields.io/badge/Electron-38-47848F?style=for-the-badge&logo=electron&logoColor=white" />
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3-42B883?style=for-the-badge&logo=vuedotjs&logoColor=white" />
</p>

<p align="center">
  <a href="#项目定位">项目定位</a>
  ·
  <a href="#功能总览">功能总览</a>
  ·
  <a href="#截图预览">截图预览</a>
  ·
  <a href="#安装使用">安装使用</a>
  ·
  <a href="#开发与构建">开发与构建</a>
  ·
  <a href="#声明与致谢">声明与致谢</a>
</p>

<p align="center">
  <img src="img/home.png" alt="Hydrogen Music Home" />
</p>

## 项目定位

Hydrogen Music 是一个第三方桌面音乐播放器。当前仓库在原 Hydrogen Music 的基础上继续维护，主要目标是让应用重新具备可用、稳定、完整的桌面端体验。

目前主要维护这些部分：

- 恢复并增强账号登录、曲库访问、播放解析、下载、云盘等基础功能。
- 加上私人漫游、评论区、桌面歌词、音乐视频、本地音乐、塞壬唱片等功能。
- 完善桌面端集成，包括托盘、全局快捷键、Dock 菜单、Linux MPRIS、媒体信息、自动更新与多平台安装包。
- 保持简洁克制的界面风格，同时加入深色模式、自定义字体、音频可视化、背景封面模糊等可选设置。

## 功能总览

### 账号与服务

- 支持网易云音乐二维码、手机号登录。
- 内置增强版网易云 API 服务，应用启动后自动拉起本地服务。
- 支持账号状态隔离、登录信息清理、VIP 信息展示与会话迁移。
- 可同步最近播放记录，让官方客户端里也能看到这边的播放历史。

### 播放

- 音质偏好覆盖标准、较高、极高、无损、Hi-Res、高清环绕声、沉浸环绕声、杜比全景声、超清母带等档位。
- 可播放歌单、专辑、歌手热门歌曲、每日推荐、搜索结果、私人漫游、本地音乐、电台节目与塞壬唱片音源。
- 提供顺序、循环、单曲循环、随机播放，播放队列会持久化，也支持断点恢复。
- 可开启歌曲无缝衔接，通过预缓冲下一首音频降低切歌空隙。
- 提供音频可视化、背景封面模糊、歌词模糊等可选效果。

### 曲库与搜索

- 提供歌单、专辑、歌手、MV、每日推荐等常用曲库入口。
- 可搜索歌曲、专辑、歌手、歌单和 MV。
- 歌单、专辑、歌手、本地音乐等列表支持搜索过滤。
- 支持收藏歌单管理、喜欢歌曲、添加到歌单、下一首播放、显示专辑等常用操作。

### 私人漫游

- 内置私人漫游页面，支持默认推荐、熟悉偏好、探索发现、场景推荐与 AI DJ 模式。
- 场景推荐支持运动、专注、夜晚情绪等子模式。
- 内置近期去重队列，减少短时间内反复推荐同一首歌。
- 支持上一首、下一首、喜欢、不喜欢、封面轮播与候选歌曲预取。

### 歌词与评论

- 播放器右侧可以在歌词和评论区之间切换。
- 歌词支持原文、翻译、罗马音、间奏提示、字体大小与显示偏好设置。
- 桌面歌词支持独立窗口、置顶显示、拖动、锁定、缩放、当前句与下一句展示。
- 评论区支持精彩评论、最新评论、楼层回复、点赞、回复、发送与复制评论。

### 下载、本地音乐与云盘

- 支持歌曲下载、下载队列、暂停/恢复/取消与窗口进度展示。
- 下载时可写入基础标签、封面、歌词标签，并可选择额外生成独立 LRC 文件。
- 可选择下载目录，也可为每首下载歌曲创建独立文件夹。
- 支持扫描多个本地音乐目录，并按文件夹、歌手、专辑维度浏览。
- 支持云盘列表、容量信息、上传、删除、播放与常见音频/视频文件识别。

### 视频、电台与扩展音源

- 支持网易云 MV 播放。
- 音乐视频功能可绑定 B 站账号和下载 BV 号视频内容，支持选择分 P 与清晰度，也可以设置音频和视频的时间段同步、缓存视频文件。
- 支持收藏电台与电台节目播放，播放器会展示电台节目简介。
- 支持 Monster Siren 塞壬唱片官方音源专区。

### 桌面端

- 支持浅色、深色、跟随系统主题。
- 支持自定义字体与系统字体选择。
- 支持全局快捷键、系统托盘、退出行为设置。
- macOS 支持原生窗口交通灯、Dock 菜单与歌曲信息展示。
- Linux 支持 MPRIS 媒体控制。
- Windows / macOS / Linux 均提供打包配置。

## 截图预览

<table>
  <tr>
    <td><img src="img/home.png" alt="首页" /></td>
    <td><img src="img/lyric.png" alt="歌词" /></td>
  </tr>
  <tr>
    <td><img src="img/comment.png" alt="评论区" /></td>
    <td><img src="img/privateFM.png" alt="私人漫游" /></td>
  </tr>
  <tr>
    <td><img src="img/desktop-lyric.png" alt="桌面歌词" /></td>
    <td><img src="img/music_video.png" alt="音乐视频" /></td>
  </tr>
  <tr>
    <td colspan="2"><img src="img/dark_mode.png" alt="深色模式" /></td>
  </tr>
</table>

## 安装使用

前往 [Releases](https://github.com/ldx123000/Hydrogen-Music/releases) 下载对应平台的安装包。

当前构建配置支持：

- Windows：NSIS 安装包、Portable、Zip。
- macOS：DMG。
- Linux：AppImage、Deb、RPM。

Arch Linux 用户可通过 AUR 安装：

```shell
yay -S hydrogen-music-bin
```

首次使用建议先登录网易云账号。部分功能依赖账号权限、VIP 权益或第三方服务登录状态。

## 手机端使用

这套前端不只能跑在 Electron 里，也可以直接在手机浏览器中使用。

做法是把原本只跑在 Electron 主进程里的两块能力搬到独立进程：内置的增强版网易云 API，以及前端构建产物的静态托管。两者挂在同一个源上，于是 /api 请求天然同源，不需要任何跨域配置，Cookie 与登录态也能正常工作。

### 启动

```shell
npm run mobile:serve
```

该命令会先构建前端，再启动服务。终端会打印可访问地址：

```text
  本机:     http://localhost:8080
  局域网:   http://192.168.x.x:8080   <- 手机浏览器打开这个
```

手机需与本机处于同一 Wi-Fi；打不开时先检查系统防火墙是否放行该端口。

产物已构建过时，可以跳过构建：

```shell
npm run build
npm run mobile
```

端口可通过环境变量调整：

```shell
HM_WEB_PORT=8090 npm run mobile
```

### 开发调试

```shell
# 终端一：只启动内置网易云 API
npm run api

# 终端二：Vite 开发服务（已开启 host，手机可直连；/api 自动代理到上面的 API）
npm run dev:mobile
```

### 手机视口下的自测

仓库带了一个基于 DevTools 协议的无头测试驱动，用系统自带的 Chromium 内核浏览器以
390 × 844 的手机视口打开页面，采集控制台异常并截图：

```shell
node scripts/mobile-test/cdp.cjs "http://127.0.0.1:8080/#/search?keywords=周杰伦" 搜索结果
```

第三个参数可选，传入 `scripts/mobile-test/setup-*.js` 里的注入脚本即可伪造播放列表，
用来验证播放页、评论、迷你播放条等需要先有歌曲的界面。截图与诊断信息输出到同目录。

### 手机端做了什么

- 底部 Tab 导航 + 移动端顶栏；桌面专属的窗口控件、可视化、自动更新弹窗自动隐藏
- 全屏播放页改为「封面 / 歌词 / 评论」三视图切换，带返回按钮与醒目的大封面
- 适配刘海屏安全区（`env(safe-area-inset-*)`），支持「添加到主屏幕」独立运行
- 迷你播放条精简为封面 + 歌曲信息 + 播放控制 + 播放列表入口
- 首页、搜索页、歌单页、设置页在窄屏下改为单列堆叠，字号改用固定像素（原设计大量使用 vw，手机上会缩到不可读）

渲染层原本完全依赖 `preload` 注入的 `windowApi` / `electronAPI` / `playerApi`，在浏览器里由 `src/utils/webBridge.js` 补齐降级实现，因此组件代码无需改动。

### 手机端界面

下表为真机实拍截图。

<table>
  <tr>
    <td><img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/home.jpg" alt="首页" width="210" /></td>
    <td><img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/player.jpg" alt="播放页" width="210" /></td>
    <td><img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/lyrics.jpg" alt="歌词" width="210" /></td>
  </tr>
  <tr>
    <td><img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/comments.jpg" alt="评论" width="210" /></td>
    <td><img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/fm.jpg" alt="私人漫游" width="210" /></td>
    <td><img src="https://github.com/1CYcat1/Hydrogen-Music/releases/download/android-v1.0.2/settings.jpg" alt="设置" width="210" /></td>
  </tr>
</table>

### 手机端的限制

以下能力依赖 Electron 主进程，浏览器中不可用，界面上已做降级处理：

- 本地音乐扫描与下载管理
- 桌面歌词独立窗口
- 本地音乐 HiFi 输出（MPV 后端）
- 音乐视频下载（B 站）、应用自动更新

在线播放、搜索、歌单、评论、歌词、云盘、私人漫游等依赖账号的功能不受影响。手机上建议使用「手机验证码登录」，扫码登录需要另一台设备配合。

### 打包成 Android APK

上面的「手机浏览器」方案需要电脑常开来提供 API。如果想做一个**完全独立**的手机 App，
可以把前端装进 Android WebView，并在 App 进程里内嵌一个 Node 运行时来跑内置网易云 API
（Capacitor + `@capawesome/capacitor-nodejs`），得到的 APK 不依赖电脑、也不依赖局域网。

```shell
# 一条命令：同步源码到构建目录 → 构建前端 → 放运行时 → gradle 打包 → 拷到桌面
bash run-full-build.sh
```

真机排查（装包 + 抓 Node 运行时日志）：

```bat
scripts\android-device-diag.bat
```

完整说明——架构与数据流、目录职责、构建环境（**为什么必须用纯 ASCII 路径**）、
真机专属的六个坑、排障手册——见 **[`docs/ANDROID.md`](docs/ANDROID.md)**。

## 开发与构建

### 环境要求

- Node.js `20.19.0+` 或 `22.12.0+`
- npm

项目使用 Vite 7、Vue 3、Electron 38 与 electron-builder。开发时需要同时启动 Vite 服务与 Electron 客户端。

### 本地开发

```shell
npm ci
```

终端一启动前端开发服务：

```shell
npm run dev
```

终端二启动 Electron：

```shell
npm start
```

开发环境下主窗口会加载 `http://localhost:5173/`，桌面歌词窗口会加载 `http://localhost:5173/desktop-lyric.html`。应用内置网易云 API 服务默认使用本地端口 `36530`。

### 本地 HiFi 输出与 MPV 后端

本地音乐的 HiFi 输出使用 MPV 作为后端。普通在线播放和默认本地播放不依赖 MPV；只有在「设置 - 音乐 - 本地音乐 HiFi 输出」开启后，才会走这个后端。

仓库提供了音频专用 MPV 构建脚本，生成的运行时放在 `resources/mpv/<platform-arch>/` 下。开发或打包前，建议先下载对应平台的构建产物：

MPV 构建由 `.github/workflows/build-mpv-audio-only.yml` 负责。这个 workflow 会在 `scripts/mpv-audio-only/**`、`resources/mpv/README.md` 或 workflow 自身变化时自动运行，也可以在 GitHub Actions 页面手动运行。手动运行时可以指定 `mpv_ref` 和 `ffmpeg_ref`，默认都是 `release`。

每次 workflow 会分别构建并上传这些 artifact：

- `mpv-audio-only-linux-x64`
- `mpv-audio-only-darwin-arm64`
- `mpv-audio-only-win32-x64`
- `mpv-audio-only-all-platforms`

下面的下载命令不会在本机重新编译 MPV，只会把 GitHub Actions 已经构建好的 artifact 拉到 `resources/mpv`：

```shell
npm run mpv:download
```

如果要一次性准备 Windows、macOS、Linux 三端资源：

```shell
npm run mpv:download:all
```

GitHub Actions artifact 的下载接口需要认证。如果命令提示 `Requires authentication`，先设置有 `Actions: Read-only` 权限的 `GH_TOKEN` 或 `GITHUB_TOKEN`。已安装 GitHub CLI 时，可以这样临时使用当前登录凭据：

```shell
GH_TOKEN="$(gh auth token)" npm run mpv:download:all
```

下载后会得到类似这些目录：

- `resources/mpv/win32-x64`
- `resources/mpv/darwin-arm64`
- `resources/mpv/linux-x64`

`electron-builder` 打包时只会带上当前目标平台对应的 MPV 目录。运行时会优先使用内置 MPV；如果没有内置资源，可以在设置里手动选择 MPV 可执行文件，也可以通过 `HYDROGEN_MPV_PATH` 指定路径。

如需自己构建精简 MPV，需要在目标系统上执行对应脚本：

```shell
# Linux x64
bash scripts/mpv-audio-only/build-linux-x64.sh

# macOS Apple Silicon
bash scripts/mpv-audio-only/build-darwin-arm64.sh

# Windows x64，需要在 MSYS2 MINGW64 shell 中运行
bash scripts/mpv-audio-only/build-win32-x64.sh
```

更多构建细节见 [scripts/mpv-audio-only/README.md](scripts/mpv-audio-only/README.md) 和 [resources/mpv/README.md](resources/mpv/README.md)。

### 构建前端资源

```shell
npm run build
```

### 打包当前平台客户端

```shell
npm run dist
```

打包产物会输出到 `release/<version>/`。

如需指定平台，可将参数透传给构建脚本：

```shell
npm run dist -- --win
npm run dist -- --mac
npm run dist -- --linux
```

## 技术栈

- 桌面框架：Electron
- 前端框架：Vue 3、Vue Router、Pinia
- 构建工具：Vite、electron-builder
- 音频播放：Howler、Web Audio API
- 视频播放：Plyr
- 本地元数据：music-metadata、node-id3、metaflac-js、ffmpeg-static
- 桌面集成：electron-store、electron-updater、electron-win-state、mpris-service

## 项目结构

```text
Hydrogen-Music
├─ background.js                 # Electron 主进程入口
├─ electron-builder.config.cjs   # 多平台打包配置
├─ index.html                    # 前端入口（桌面与手机共用）
├─ run-full-build.sh             # 一键构建 Android APK
├─ capacitor.config.json         # Capacitor 配置（Android 端）
├─ android                       # Android 原生工程（含竖屏/包名/明文 HTTP 等手工改动）
├─ mobile-runtime
│  └─ index.js                   # 内嵌 Node 运行时入口（起 API + CORS 转发层）
├─ docs
│  └─ ANDROID.md                 # Android 构建与架构说明（架构/目录/构建/坑/排障）
├─ server
│  ├─ api-server.cjs             # 单独启动内置网易云 API（开发调试用）
│  └─ mobile-server.cjs          # 手机端服务：静态托管 + 同源 /api 代理
├─ src
│  ├─ api                        # 网易云、MV、电台、云盘、塞壬等接口封装
│  ├─ assets/css/mobile.css      # 移动端样式覆盖层（仅在窄屏/触屏下生效）
│  ├─ components
│  │  └─ mobile                  # 移动端专用组件（底部导航等）
│  ├─ composables                # 组合式函数（含移动端布局判定）
│  ├─ electron                   # IPC、下载、本地音乐、托盘、MPRIS 等主进程模块
│  ├─ store                      # Pinia 状态管理
│  ├─ utils
│  │  └─ webBridge.js            # 浏览器环境补齐 windowApi 等注入对象
│  └─ views                      # 页面级视图
├─ img                           # README 截图资源（img/mobile 为手机端截图）
└─ scripts
   ├─ build-android.cjs          # Android 构建核心：前端 → 安卓资源 → 运行时 → 注入标记
   ├─ patch-path-to-regexp.cjs   # 修 small-icu 不支持 \p{...} 正则的问题
   ├─ sync-to-build.cjs          # 源码镜像到纯 ASCII 构建目录
   ├─ android-device-diag.bat    # 真机诊断（装包 + 抓 Node 日志）
   ├─ mobile-test
   │  └─ cdp.cjs                 # 手机视口无头测试驱动（截图 + 控制台异常采集）
   └─ ...                        # 其它构建辅助脚本
```

## 声明与致谢

本项目仅供个人学习与研究使用，禁止用于商业用途或任何非法用途。项目内涉及的音乐、歌词、评论、图片、视频等内容版权归其权利方所有。

本仓库基于原 [Hydrogen-Music](https://github.com/Kaidesuyo/Hydrogen-Music) 的创意与方向继续维护，感谢原作者的设计与实现。如原作者或相关权利方认为本仓库存在不妥，请联系维护者处理。

代码基于 [MIT License](LICENSE) 开源。
