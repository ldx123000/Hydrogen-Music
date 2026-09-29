# Hydrogen Music Android

从 `hydrogen-music-Android-github.rar` 迁入的 Vue 3 + Capacitor 8 应用。手机内嵌 Node.js 和网易云 API，无需连接电脑提供服务。保留原包名 `com.hydrogen.music`。应用版本与桌面端统一，当前为 `0.6.3`，Android 升级序号 `versionCode = 4`。

## 目录与维护边界

- `src/`：Android 界面、移动样式、播放器和浏览器/原生桥接。
- `android/`：原生工程；`app/src/main/java/com/hydrogen/music/` 提供返回键、媒体通知、前台播放服务、SAF 本地音乐和下载插件。
- `mobile-runtime/`：内嵌 API 入口、跨域转发服务和独立锁定的服务端依赖。
- `scripts/`：跨平台构建、Node 移动运行时所需的正则补丁。
- `../../src/assets/`：通过 Vite 的 `@shared-assets` 别名共用字体、图片和图标；Gradle 从本体 PNG 生成启动器及启动画面资源。
- `../../src/shared/` 和纯工具模块：直接复用设置默认值与校验、歌曲链接解析、一起听协议及主题逻辑。
- `../../scripts/patch-ncm-api.cjs`：与桌面端共用 API 补丁，可指定依赖目录。

桌面应用仍使用仓库根目录的 `src/`、`package.json` 和原有打包流程。Android 保留手机布局、触屏操作与原生能力适配；歌曲链接、一起听和播放器修复已同步。修改有平台依赖的业务代码时仍需分别验证两端。

## 环境

- Node.js **22.12+**、npm。
- JDK **21**；设置 `JAVA_HOME`。
- Android SDK；设置 `ANDROID_HOME`，或在 `android/local.properties` 中配置 `sdk.dir`（此文件不提交）。
- SDK 组件：`platforms;android-36`、`build-tools;36.0.0`、`ndk;27.0.12077973`、`cmake;3.22.1`、`platform-tools`。
- Gradle Wrapper 自动下载 Gradle 8.14.3；首次构建还会下载 Node.js Mobile 原生库。

环境配置可参考 [Capacitor 文档](https://capacitorjs.com/docs/getting-started/environment-setup)。构建脚本可在 Windows、macOS 和 Linux 执行，无需旧工程中的固定 `C:` 盘目录、PowerShell 同步脚本或 Capacitor CLI 修改。

## 从仓库根目录执行

```sh
# 仅安装 Android 前端及内嵌 API 依赖，不需要先安装 Electron
npm run android:install

# 浏览器开发：两个终端分别执行
npm run android:api
npm run android:dev

# 只构建前端
npm run android:web

# 运行 API 转发层回归测试
npm --prefix apps/android test

# 构建前端、同步原生插件、打入 Node 运行时
npm run android:sync

# 完整构建可安装的 debug APK
npm run android:build

# 同步后用 Android Studio 打开原生工程
npm run android:open
```

开发时 Vite 将 `/api` 代理到本机 `127.0.0.1:36531`。APK 内由同一个入口启动 API（36530）和跨域转发（36531）。这两个端口应保持空闲；开发 API 与桌面应用的本地 API 不要同时启动。

`android:sync/build/release/bundle` 每次先运行 Vite 和标准 `cap sync android`，再复制内嵌运行时并应用补丁。会完整重建生成物，避免旧 chunk 和依赖残留。修改 Capacitor 配置、插件或依赖后仍使用这些命令；单独运行 `cap sync` 不会打入内嵌 API。

产物：`apps/android/release/<version>/Hydrogen.Music-Android-<version>-debug.apk`。

## 签名与发行

产品版本只在仓库根目录 `package.json` 的 `version` 中维护；两端设置页、Android Gradle 的 `versionName`、产物名和 Android CI 标签校验均从这里读取。本目录不再保留独立的 `version` 字段。Android 的 `androidVersionCode` 仍在本目录 `package.json` 中维护，每次发行必须递增；从旧包的 3 升至 4，确保显示版本改为 0.6.3 后仍能覆盖升级（签名需相同）。

在构建进程的环境变量中设置：

| 变量 | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_PATH` | 发行 keystore 的绝对路径 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | 签名 key alias |
| `ANDROID_KEY_PASSWORD` | key 密码 |

```sh
npm run android:release  # 签名 APK，直接安装分发
npm run android:bundle  # 签名 AAB，供商店分发
```

缺少签名配置时构建会明确失败。debug APK 使用开发证书，正式发行需使用并妥善保存固定证书；覆盖升级要求包名和签名证书一致。keystore、密码、本机 SDK 路径和生成物不进入 Git。

GitHub Actions 的 **Build Android** 工作流独立于桌面发行：

- 涉及 Android 的 PR 自动构建 debug APK。
- 手动选择 `debug` 或 `release`；产物可在 Actions 下载。
- 推送 `android-v0.6.3` 这类与仓库根目录版本一致的 tag，构建签名 APK/AAB 并创建 Android **草稿** Release。
- 手动 release 构建也可选择创建草稿；已有 Release 不自动覆盖。
- 正式构建需仓库 Secrets：`ANDROID_KEYSTORE_BASE64`（keystore 的 Base64）、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。

这里仅提供工作流配置，迁移不会推送 tag、设置远端 Secrets 或发布 Release。

## 迁移时的整理

- 去掉旧 Electron 主进程、桌面歌词入口、桌面打包/MPV 脚本及其依赖。
- 复用现有字体和图片，避免再次复制约 17 MB 的资源。
- 去掉压缩包中的构建缓存、`local.properties`、重复设备调试脚本、截图和历史交付文件。
- 删除废弃的运行时准备脚本、固定 Windows 路径和改写 Capacitor CLI 的同步方案。
- 使用标准同步生成插件接线和资源配置，不依赖压缩包内的旧生成文件。
- 合并版本来源，补齐发行签名和独立 CI；release WebView 使用 Capacitor 默认调试策略。
- 修复首次启动缺少 xeapi 公钥的报错，并将内置 API 绑定到回环地址。

## 继承的行为与待验证项

本次以保留压缩包的界面和功能为目标：竖屏、390px 设计视口、移动端布局及媒体控制保持原实现。浏览器预览不提供原生文件夹授权、通知、锁屏或后台服务。

原交付材料提到冷启动解压较慢、部分移动布局仍需调整，这些属于后续优化范围。音频可视化现在遵守与本体一致的开关和真实频谱逻辑；无法获得频谱时保持平线，不再显示模拟波形。材料中的真机验证记录不代表本次迁移后的真机验证。发布前需在目标设备检查：登录、在线播放、锁屏/后台播放、通知按钮、返回手势、本地目录授权及下载。应用商店的审核和上架要求需另行确认。

## 本次迁移验证（2026-09-30）

- `npm run android:install` 从锁文件安装；Android 依赖中无 Electron、FFmpeg、MPRIS。
- `npm run android:build` 成功；debug APK 为 181.6 MiB，包含 arm64-v8a、armeabi-v7a、x86_64 原生库。
- `apksigner verify`、`zipalign -c -P 16 4`、ZIP CRC 检查通过；APK 内运行时与当前源码一致。
- 临时测试证书的 release APK/AAB 构建和签名验证通过；缺少签名配置时 npm 和直接 Gradle 构建均明确失败。测试签名产物不作为发行包交付。
- 全新临时数据目录的 API 启动、xeapi 公钥生成、歌曲详情和播放地址请求通过（宿主 Node.js 测试）。
- Chrome 手机视口 320×568、390×844、430×932 下，浅色/深色页面、头像进入设置、设置保存后刷新、手机验证码/二维码界面切换、底部导航检查通过，无页面 JS 异常。
- 桌面 `npm run build` 通过；Android 工作流通过 actionlint 静态检查。

初次迁移验证时没有连接 Android 真机，也未运行模拟器；当时未验证实际登录、原生播放/后台服务/通知/文件授权/下载。后续真机检查见下文。Windows/Linux 的本地构建和 GitHub Actions 远端执行尚未运行。


### 手机验证码登录与共用请求链修复

- 根因：WebView 的 Axios 请求启用了 `withCredentials`，转发层却使用 `Access-Control-Allow-Headers: *`。浏览器不会把这个 `*` 解释为允许携带凭证的 JSON 请求头，`Content-Type` 预检失败，手机号发码和登录请求因此报 `Network Error`。现在按预检请求显式返回允许的请求头。
- 手机号登录现在等待会话和账号信息加载完成，再执行跳转；重复提交、发送失败却倒计时、缺少 Cookie/账号信息仍显示成功的情况均已修正。
- 验证码和登录接口的风控错误由登录界面提示，不再误触发自动退出；过期请求和过期登录流程无法清除新账号的会话。
- 二维码仅在页面和登录方式都激活时加载/轮询；切换方式或离开页面后，迟到的响应和跳转计时器不会继续操作当前页面。二维码登录同样等待会话初始化成功，并显示初始化失败。
- 内置 API 返回 502/503 或等待超时不会被缓存为已就绪。超时明确报错，后续请求重新检查服务；不会自动重发短信、收藏等写操作。

`npm --prefix apps/android test` 覆盖带凭证的预检、JSON 请求、业务错误、API 不可达、歌单参数和 multipart 文件转发，并已接入 Android CI。浏览器回归使用本地模拟接口覆盖登录成功/失败/慢响应和账号切换；没有向真实手机号发送短信或修改真实账号数据。真实 API 的 GET/JSON POST 读取接口均已验证。

修复后再次构建的 debug APK 已通过签名、16 KB ZIP 对齐和 CRC 检查，包内包含最新转发服务和登录代码；本轮 3 项转发层测试及 14 项浏览器回归场景均通过。真机短信收发、扫码授权和登录仍待实测。


### 与本体同步及手机交互

- 默认手机号验证码登录，二维码保留切换入口；只有显式 `mode=0` 才直接进入扫码。
- 启动器（普通及自适应图标）与启动画面使用本体黑色 `src/assets/icon/icon.png`；不再保留 Capacitor 模板图或另一套 PNG。构建时复制到 Gradle 生成目录，源图保持原样。自适应图标仅为外围裁切预留空间，保持与本体相近的标志占比，参考 [Android 图标图层说明](https://developer.android.com/reference/android/graphics/drawable/AdaptiveIconDrawable)。
- 歌曲列表支持单击播放和「…」操作入口；复制歌曲链接位于可滚动的底部菜单，支持点遮罩、取消和系统返回键关闭。粘贴网易云歌曲链接后直接搜索该歌曲，不触发文字联想。
- 一起听入口位于完整播放页；邀请关注的人、加入/恢复房间、播放同步和退出沿用本体逻辑。手机使用底部面板、44px 表单按钮、独立滚动和安全区留白；支持遮罩与系统返回键关闭。
- 同步静音暂停/续播、房间内切歌及启动恢复顺序的修复。主题、无缝播放、可视化、歌词和封面背景默认值与本体一致，保留已保存的用户选择。
- 本地目录授权、系统下载、媒体通知、后台服务、触摸进度条和手机导航保留原生适配；Electron 窗口和桌面歌词设置仍不在手机展示。


### 同步后的验证（2026-09-30）

- Android debug APK 和桌面前端构建通过；3 项 API 转发测试、14 项登录回归、7 组同步/手机交互检查通过；Android CI 通过 actionlint。
- 手机浏览器视口覆盖 320×568、390×844、430×932；验证默认手机号与二维码切换、链接搜索、底部菜单复制、实际音频静音暂停/续播、一起听模拟邀请/加入/远程进度同步、深色主题及失败后重试。
- 经用户授权，无线 ADB 连接 Xiaomi 15 Pro，保留数据覆盖安装 `0.6.3`（versionCode 4）。真机确认账号登录态保留、默认手机号表单、真实接口二维码生成、设置版本、真实歌曲链接搜索、剪贴板复制、在线播放、一起听入口/加入表单，以及系统返回键逐层关闭菜单和面板。WebView 未出现 JS 异常，测试后已暂停播放。
- 启动器自适应图标缩小了额外留白，已在真机应用信息页核对实际图标和版本；包内图标文件与本体 PNG 字节一致。最终 APK 的签名、16 KB ZIP 对齐及 CRC 检查通过。
- 真机未发送短信或重新授权登录，未向真实好友发送邀请；短信收发与双账号一起听完整链路、锁屏/后台长期播放和本地文件授权仍未在本轮端到端验证。
