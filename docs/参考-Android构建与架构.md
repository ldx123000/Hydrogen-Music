# Android 端构建与架构说明

> 本文说明 Hydrogen Music 的 **Android APK** 是怎么来的：架构、数据流、目录职责、
> 构建流程，以及踩过的坑和排障方法。
>
> 前端/桌面端本身的说明见根目录 [`README.md`](../README.md)。

---

## 1. 一句话概览

Electron 本身**不支持 Android**，所以手机端换了个壳：
用 **Capacitor 8** 把已经写好的 Vue 前端装进 WebView，再用
**`@capawesome/capacitor-nodejs`（Node.js for Mobile Apps）** 在 App 进程里
内嵌一个真正的 Node 运行时，把「内置网易云 API」原样跑起来。

结果是一个**完全独立、离线可用**的 App——不依赖电脑、不依赖局域网。

---

## 2. 三种运行形态

同一份前端代码（`src/`）跑在三个环境里，区别只在「谁来提供网易云 API」：

| 形态 | 入口 | API 来源 | 前端请求地址 |
|---|---|---|---|
| **桌面客户端** | Electron（`background.js`） | 主进程内置 API | 经 preload 的 `windowApi.requestNcmApi` 走 IPC |
| **手机浏览器** | `npm run mobile`（`server/mobile-server.cjs`） | 电脑上起的 API | 同源 `/api`（由本地服务反向代理） |
| **Android APK** | Capacitor + 内嵌 Node | **App 内部**的 Node 进程 | `http://127.0.0.1:36531` |

分流逻辑在 [`src/utils/request.js`](../src/utils/request.js) 的 `resolveApiBaseURL()`：

```
在 Electron 里？          → 走 IPC（windowApi.requestNcmApi）
有 window.__HM_APP__？    → http://127.0.0.1:36531   ← APK 用这条
能拿到 window.Capacitor？ → 同上（兜底）
否则                      → /api（浏览器同源代理）
```

`window.__HM_APP__` 由构建脚本注入到 `index.html`，不依赖原生桥的注入时机，判定比探测
`window.Capacitor` 更稳。

---

## 3. APK 内部架构

```
┌─────────────────────────────────────────────────────────────┐
│  Android App 进程 (com.hydrogen.music)                       │
│                                                             │
│  ┌────────────────────────┐      ┌───────────────────────┐  │
│  │  WebView               │      │  Node 运行时 (libnode) │  │
│  │  页面: https://localhost│      │                       │  │
│  │  （前端 dist 产物）     │      │  ① 内置网易云 API      │  │
│  │                        │      │     127.0.0.1:36530    │  │
│  │  axios baseURL =       │      │          ▲            │  │
│  │  http://127.0.0.1:36531│─────▶│  ② CORS 转发层         │  │
│  └────────────────────────┘      │     127.0.0.1:36531   │  │
│              │                   └───────────────────────┘  │
│              │                              │               │
└──────────────┼──────────────────────────────┼───────────────┘
               │                              ▼
        屏幕 / 扬声器                  music.163.com（外网）
```

### 为什么要多一层转发（36531）

上游 API 不带 CORS 头，而 WebView 页面（`https://localhost`）访问另一个端口属于跨域请求。
又因为上游 API 在 `serveNcmApi()` 返回时**已经 listen 完成**，没法再往它的路由链前面挂中间件。
所以单独起一层转发服务最省事、也最可控。

转发层负责：
- 补齐 CORS 头（`Access-Control-Allow-Origin` 等）
- 清掉上游 `Set-Cookie` 上的 `Domain` / `Secure`，否则 WebView 存不下

两个服务都**只监听 `127.0.0.1`**（回环），不会暴露到局域网。

### 前端启动时的就绪等待

内嵌 Node 冷启动约需 **2~3 秒**（`libnode.so` 有 50MB，还要把 4800+ 个运行时文件
从 APK 解压到 App 私有目录）。而 WebView 会立刻加载并发请求。

如果不做处理，**首批请求会全部失败且不会重试**。所以 `src/utils/request.js` 里
`ensureNcmApiReady()` 对原生 App 加了分支：发首个请求前先轮询
`http://127.0.0.1:36531/__hm_ready`，拿到任意 HTTP 响应（哪怕 404）就说明端口已在监听，
最长等 20 秒。

---

## 4. 目录与文件职责

### 移动端相关的新增/改动

| 路径 | 职责 |
|---|---|
| `mobile-runtime/index.js` | **内嵌 Node 运行时入口**。启动 36530 API + 36531 转发层；修正 tmpdir；启动前生成网易云配置 |
| `mobile-runtime/package.json` | 运行时的独立依赖（只装 API 包，`npm install` 在该目录下单独执行） |
| `src/utils/request.js` | 三种环境的 API 地址分流 + 原生 App 的就绪等待 |
| `src/utils/webBridge.js` | 非 Electron 环境下补齐 preload 注入的全局对象（`windowApi` 等） |
| `src/assets/css/mobile.css` | 移动端样式覆盖层，规则全部限定在 `html[data-hm-mobile='true']` 下，桌面端零影响 |
| `src/composables/useIsMobile.js` | 移动端判定（matchMedia 单例） |
| `src/components/mobile/*` | 移动端专属组件（底部 Tab 栏等） |
| `server/mobile-server.cjs` | **手机浏览器**形态用的同源服务（托管 dist + 反代 `/api`） |
| `capacitor.config.json` | Capacitor 配置（见下） |
| `android/` | 原生工程（含手工改动，**要提交**） |

### 构建与运维脚本（`scripts/`）

| 脚本 | 职责 |
|---|---|
| `build-android.cjs` | **Android 构建的核心准备脚本**：构建前端 → 合并进安卓资源目录 → 放入 Node 运行时 → 打补丁 → 注入环境标记 |
| `patch-path-to-regexp.cjs` | 修掉 small-icu 不支持 `\p{...}` 的问题（见 §6-C） |
| `patch-ncm-api.cjs` | 桌面端 & 内嵌运行时共用的 API 依赖补丁（`postinstall` 自动跑） |
| `sync-to-build.cjs` | 把源码镜像到纯 ASCII 构建目录（见 §5） |
| `android-device-diag.bat` | **真机诊断**：装 APK、唤醒屏幕、抓 Node 启动日志与统计 |
| `mobile-test/` | 手机视口下的自动化自测（CDP 驱动 Edge） |
| `prepare-mobile-runtime.cjs` | ⚠️ **已废弃**：早期把运行时放进 `dist/nodejs` 的方案，已被 `build-android.cjs` 的 `copyRuntime()` 取代，当前无任何地方调用 |

### Android 原生工程里含手工改动的文件

| 文件 | 改动 |
|---|---|
| `android/app/src/main/AndroidManifest.xml` | `screenOrientation="portrait"`（竖屏锁定）、`usesCleartextTraffic="true"`（允许明文 HTTP，因为要访问 `http://127.0.0.1`）、`windowSoftInputMode="adjustResize"` |
| `android/app/build.gradle` | `namespace` / `applicationId` 改为 `com.hydrogen.music` |
| `android/app/src/main/res/values/strings.xml` | 应用名 "Hydrogen Music"、package_name、custom_url_scheme |
| `android/app/src/main/java/com/hydrogen/music/MainActivity.java` | 包名同步为 `com.hydrogen.music` |
| `android/gradle.properties` | `org.gradle.jvmargs=-Xmx3072m`（编译 libnode 的 JNI 层会 OOM）、`android.overridePathCheck=true` |
| `android/gradle/wrapper/gradle-wrapper.properties` | Gradle 发行版走腾讯镜像 |
| `android/local.properties` | `sdk.dir`，**机器相关、已 gitignore**，不要提交 |

#### 源码树里的 `android/` 应该长什么样

**只放源码，不放产物**。当前刚好 54 个文件：

| 类别 | 内容 |
|---|---|
| Gradle 配置 | `build.gradle`、`settings.gradle`、`variables.gradle`、`gradle.properties`、`capacitor.settings.gradle`、`gradle/wrapper/*`、`gradlew`、`gradlew.bat` |
| App 模块 | `app/build.gradle`、`app/capacitor.build.gradle`、`app/proguard-rules.pro` |
| 清单与代码 | `app/src/main/AndroidManifest.xml`、`app/src/main/java/com/hydrogen/music/MainActivity.java` |
| 资源 | `app/src/main/res/**`（图标、启动图、布局、`values/`、`xml/file_paths.xml`） |
| 测试骨架 | `app/src/{test,androidTest}/java/com/hydrogen/music/*` |
| 本地配置 | `local.properties`（`sdk.dir`，机器相关，保留但不提交） |

下面这些**不该出现在源码树里**（`android/.gitignore` 已全部声明为产物），
它们由 `cap sync` 或 gradle 生成，只应存在于构建目录 `C:/hydrogen-build`：

```
.gradle/                                     Gradle 状态
app/build/                                   gradle 产物
capacitor-cordova-android-plugins/           cap sync 生成
app/src/main/assets/public/                  前端 + 内嵌运行时的拷贝
app/src/main/assets/capacitor.{config,plugins}.json
app/src/main/res/xml/config.xml
```

> ⚠️ 由于本项目**不再跑 `cap sync`**（原因见 §5），上面这些产物必须一直留在构建目录里。
> 如果构建目录被清空过、或要在新机器上从零构建，需先手动跑一次
> `npx cap sync android` 把它们生成出来，否则 gradle 会因为找不到
> `capacitor-cordova-android-plugins` 而报错。

`capacitor.config.json` 的关键项：

```json
{
  "appId": "com.hydrogen.music",
  "webDir": "dist",
  "server": { "androidScheme": "https" },
  "android": { "allowMixedContent": true, "webContentsDebuggingEnabled": true },
  "plugins": { "Nodejs": { "nodeDir": "nodejs", "startMode": "auto" } }
}
```

- `androidScheme: "https"` → 页面跑在 `https://localhost`，所以访问 `http://127.0.0.1`
  属于混合内容，必须 `allowMixedContent: true`（Manifest 的 `usesCleartextTraffic` 配合）。
- `plugins.Nodejs.nodeDir: "nodejs"` → 运行时项目放在 `assets/public/nodejs`。
- `startMode: "auto"` → App 启动即拉起 Node。

---

## 5. 构建

### 环境要求

| 组件 | 默认路径 | 说明 |
|---|---|---|
| JDK 21 | `C:/jdk-21` | **Capacitor 8 要求 JDK 21**（不是 17） |
| Android SDK | `C:/android-sdk` | 需含 NDK（27/28）、CMake（3.22+）、build-tools、`platforms;android-36` |
| Gradle 缓存 | `C:/hydrogen-gradle` | **必须是纯 ASCII 路径** |
| Node | 22.x | 项目根与 `mobile-runtime/` 下都要 `npm install` |

### ⚠️ 为什么必须用纯 ASCII 路径

- AGP 会**直接拒绝**在含中文的路径下构建。
- 更隐蔽的是：NDK/CMake 编译 `libnode` 的 JNI 层时，如果 `GRADLE_USER_HOME`
  落在中文路径（如 `C:\Users\<中文名>\.gradle`），也会失败。

所以本项目采用**双目录**方案：

```
工作区（源码主副本，路径可能含中文，比如桌面）
   │
   │  ① scripts/sync-to-build.cjs 单向镜像（只覆盖、不删除）
   ▼
C:/hydrogen-build（纯 ASCII，真正跑 gradle 的地方，含 node_modules 等重量级产物）
```

**镜像只同步源码**（`src/`、`scripts/`、`server/`、`mobile-runtime/index.js`、
Android 原生配置等），**不会碰**构建目录里的 `node_modules/`、`android/app/build/`、
`android/app/src/main/assets/`、`local.properties`。

#### 首次初始化构建目录（只需一次）

如果 `C:/hydrogen-build` 还不存在，先把它搭出来：

```bash
# 1) 复制工程到纯 ASCII 路径
cp -r "/c/Users/<你>/Desktop/Hydrogen-Music-main/Hydrogen-Music-main" /c/hydrogen-build
rm -rf /c/hydrogen-build/node_modules                 # 依赖在构建目录里重装

# 2) 重装依赖（这两个目录都要）
cd /c/hydrogen-build && npm install
cd /c/hydrogen-build/mobile-runtime && npm install

# 3) 指向本机 Android SDK（机器相关，已在 .gitignore 里）
#    确认 android/local.properties 内容为：sdk.dir=C:/android-sdk
```

之后每次构建都只要 `bash run-full-build.sh`——它会自动把源码镜像过去。
`run-full-build.sh` 找不到构建目录时也会把这套初始化命令打印出来。

> 也可以完全跳过双目录：直接把工程放在纯 ASCII 路径下开发，
> 那么 `run-full-build.sh` 检测不到中文路径，会原地构建。

### 构建命令

```bash
# 在项目根目录（哪个目录都行）
bash run-full-build.sh
```

脚本会自动判断：如果当前路径含中文，先同步到 `C:/hydrogen-build` 再在那里构建；
如果已经在 ASCII 路径下，直接构建。产物默认拷到桌面 `HydrogenMusic.apk`。

可用环境变量覆盖：`HM_BUILD_DIR`、`NODE_BIN`、`OUT_DIR`、`JAVA_HOME`、
`ANDROID_SDK_ROOT`、`GRADLE_USER_HOME`。

### 构建内部步骤

`scripts/build-android.cjs` 的顺序**不能乱**：

1. **`vite build`** —— 构建前端到 `dist/`
   （带 `HM_KEEP_DIST=1`，见 §6 关于批量删除保护的说明）
2. **`syncWebAssets()`** —— 把 `dist/` 增量合并进 `android/app/src/main/assets/public/`
3. **`copyRuntime()`** —— 把 `mobile-runtime/` 复制进 `assets/public/nodejs/`，
   覆盖桌面端已验证的 4 个 API 补丁文件，跑 `patch-path-to-regexp.cjs`，
   再限量清理多余文件
4. **`injectAppMarker()`** —— 往 `assets/public/index.html` 的 `<head>` 注入
   `<script>window.__HM_APP__ = true;</script>`
5. **`gradlew assembleDebug`** —— 打包

> **为什么不用 `cap sync`**：CLI 的 copy/update 任务会整体删除 `assets/public`
> （5000+ 文件）与 `capacitor-cordova-android-plugins`，撞上构建环境的批量删除保护会直接失败。
> 而它生成的那些文件（`capacitor.build.gradle`、`capacitor.settings.gradle`、
> `assets/capacitor.config.json`、`capacitor.plugins.json`）在插件集合不变时是稳定的，
> 工程里已存在，无需每轮重生成。
> **例外**：改了 `capacitor.config.json` 或增删 Capacitor 插件后，
> 仍需手动跑一次 `npx cap sync android`。

---

## 6. 六个真机专属的坑

这六个问题里，**后五个只在真机上出现，PC 上一个都不会触发**——
所以「PC 上跑通」绝不能当作交付标准。

| # | 现象 | 根因 | 修法 |
|---|---|---|---|
| **A** | Node 直接崩，`Cannot find module '.../pac-proxy-agent/dist/index.js'`；或 APK 里 `libnode.so` 体积为 0 | 依赖被安全机制改名成 `.DELETE.<hash>`；`capacitor.build.gradle` 丢失导致 `libnode.so` 没编进去 | 恢复依赖文件名；确保 `app/capacitor.build.gradle` 里有 `implementation project(':capawesome-capacitor-nodejs')` |
| **B** | `EACCES: permission denied, open '/tmp/anonymous_token'` | Android 没有可写的 `/tmp`。插件虽然设了 `TMPDIR`，但实测 Node 的 `os.tmpdir()` **仍返回 `/tmp`** | `mobile-runtime/index.js` 顶部探测可写目录（优先 `require('bridge').app.datadir()`）并改写 `os.tmpdir` |
| **C** | `Invalid regular expression: /^[$_\p{ID_Start}]$/: Invalid property name in character class` | nodejs-mobile 内嵌的 Node 是 **small-icu 构建**，缺 Unicode 属性表；而 Express 的路由依赖 `path-to-regexp v8` 启动必加载它 | `scripts/patch-path-to-regexp.cjs` 替换成 ASCII 等价写法，构建时自动执行 |
| **D** | 进去后「像连不到网」，前端控制台一堆 `AxiosError: Network Error` | **启动竞态**：WebView 立刻发请求，Node 要 ~2.5 秒才监听端口，且前端不重试 | `src/utils/request.js` 加就绪轮询（见 §3） |
| **E** | 偶发连接被拒 | 运行时只监听 IPv4 `127.0.0.1`，而请求 `localhost` 时 Android 可能优先解析到 IPv6 `::1` | `NATIVE_APP_API_BASE` 用 `http://127.0.0.1:36531`，不要用 `localhost` |
| **F** | 能进 App、歌单能加载，但**点歌拿不到播放地址、不能播**；日志 `[ERROR] /song/url/v1 { status: undefined, body: undefined }` | `/song/url/v1` 走 **xeapi** 加密，需要 `<tmpdir>/xeapi_public_key`。该文件由 API 包的 `generateConfig.js` 生成，**官方入口 `app.js` 会在启动 API 前调用它，自写的运行时入口很容易漏掉** | `mobile-runtime/index.js` 的 `prepareNcmConfig()`，在启动 API 前先跑 `generateConfig()` |

---

## 7. 排障手册

### 先跑诊断脚本

```bat
scripts\android-device-diag.bat
```

它会：定位 adb → 唤醒屏幕并保持常亮 → 安装 APK → 清日志 → 启动 → 等 70 秒 → 输出
Node 启动日志、成功请求数、Network Error 数、报错、播放地址接口成功数。

### 看日志时先记住一件事

**手机熄屏后 App 会进后台，Node 运行时会被系统挂起。**
日志里表现为：

```
Capacitor: App paused
performDraw: Not drawing due to screen off
Capacitor: App stopped
```

这**非常容易**被误判成「插件没启动」。测试前务必：

```bash
adb shell input keyevent KEYCODE_WAKEUP
adb shell svc power stayon true
```

Node 的 `console.log` 在 logcat 里的 tag 是 **`NodejsPlugin`**。

### 按症状定位

| 症状 | 先看什么 |
|---|---|
| 装不上 / 解析包错误 | APK 是否完整（大小约 190MB）；`minSdk 24` 是否满足 |
| 启动即崩，进程都没有 | `adb logcat \| grep AndroidRuntime`；包名/签名是否与已装版本冲突（先 `uninstall`） |
| 白屏、一直转圈 | `adb logcat \| grep Capacitor/Console`，看前端 JS 异常 |
| 提示 API 请求错误 | 有没有 `[node] 网易云 API 已就绪`；没有就是 B/C 类问题 |
| 首批请求全失败、之后正常 | D 类竞态 |
| 能浏览但点歌不放 | `grep "song/url"` 看有没有 ERROR → F 类（xeapi 公钥） |
| 日志里找不到任何 NodejsPlugin 行 | 屏幕是不是熄了（先看上一节） |

### 手动抓日志

```bash
ADB=/c/android-sdk/platform-tools/adb.exe
"$ADB" logcat -d | grep -E "NodejsPlugin|node\]"          # Node 启动
"$ADB" logcat -d | grep -c "Request Success"              # 成功请求数
"$ADB" logcat -d | grep "Capacitor/Console" | grep "Network Error" | wc -l
```

⚠️ 日志里的请求 URL 会带 `cookie=MUSIC_U=...`（账号凭证）。
贴给别人看之前先过滤：`sed 's/cookie=[^ ]*/<ck>/'`.

### 正常启动应该长这样

```
[node] 临时目录已指向: /data/user/0/com.hydrogen.music/files
[node] 运行时启动中 (node v18.20.4)
[node] 网易云配置已就绪（anonymous_token / xeapi_public_key）
[node] 网易云 API 已就绪: http://127.0.0.1:36530
[node] 转发层已就绪: http://127.0.0.1:36531
```

---

## 8. 命令速查

```bash
# ---- 构建 ----
bash run-full-build.sh                     # 一键出 APK（自动同步 + 构建 + 拷到桌面）
node scripts/sync-to-build.cjs --dry-run   # 只看会同步哪些文件
node scripts/build-android.cjs             # 只做准备阶段（前端 + 运行时）

# ---- 真机 ----
scripts\android-device-diag.bat            # 装包 + 抓日志
adb install -r HydrogenMusic.apk           # 手动安装
adb shell am start -n com.hydrogen.music/.MainActivity
adb exec-out screencap -p > shot.png       # 截图

# ---- 本地跑内嵌运行时（不经手机，用于快速验证运行时本身）----
cd mobile-runtime && node index.js
curl "http://127.0.0.1:36531/search?keywords=test&type=1&limit=1"
curl "http://127.0.0.1:36531/song/url/v1?id=2650427950&level=lossless"
```

> `/search` **必须带 `type` 参数**，否则上游返回 400。

---

## 9. 环境备注

- **本机模拟器不可用**：Hyper-V / WHPX 均为 Disabled，AEHD 驱动未装（安装需管理员权限）。
  软件模拟（`-accel off`）启动极慢且常常起不来。**真机联调是唯一可靠路径。**
- 内嵌 Node 版本是 **Node 18 + small-icu**；PC 上开发用的是 Node 22。
  两边的差异正是 §6 里多个坑的根源。
- 已知历史：项目没有接入 git 版本控制，删除源码文件不可恢复，
  整理时对废弃文件采用「标注」而非「删除」。

---

## 10. 已知待办

- [ ] 每次启动都要把 4800+ 个运行时文件从 APK 解压到 App 私有目录，冷启动偏慢。
      可考虑首次解压后打标记跳过，或精简运行时依赖。
- [ ] `scripts/prepare-mobile-runtime.cjs` 已废弃。**已核验全工程无任何引用**
      （脚本 / 配置 / CI 里都搜不到），确认无需留档即可删除
      （注意：项目没有 git，删除不可恢复）。
- [ ] 目前只出 debug APK（用 debug keystore 签名）。要发布需配置 release 签名。
