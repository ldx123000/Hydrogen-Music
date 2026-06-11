# 音频专用 MPV 构建

Hydrogen Music 只把 MPV 用作本地 HiFi 音频后端，不需要完整视频播放器能力。这个目录里的脚本用于构建三端更小的 MPV 运行时。

当前采用比较保守的精简策略：

- FFmpeg 使用 `--disable-everything` 起步，只开启常见本地音频格式的 demuxer、parser、decoder 和基础音频 filter。
- MPV 关闭 Lua/JavaScript 脚本、FFmpeg 网络访问、视频输出、GPU/硬解、DVD/Blu-ray/CDDA、archive、文档构建等能力。
- 每个平台只保留 Hydrogen Music 实际需要的音频输出：
  - Windows：WASAPI
  - macOS：CoreAudio
  - Linux：PipeWire，另保留 ALSA 作为备用输出

我没有找到维护良好的跨平台“音频专用 MPV”二进制发行版，所以这里走的是自己可复现构建，而不是依赖第三方包。

## 本地构建

需要在目标操作系统上构建对应平台的 MPV：

```sh
# Linux x64
bash scripts/mpv-audio-only/build-linux-x64.sh

# macOS Apple Silicon
bash scripts/mpv-audio-only/build-darwin-arm64.sh

# Windows x64，需要在 MSYS2 MINGW64 shell 中运行
bash scripts/mpv-audio-only/build-win32-x64.sh
```

默认输出位置：

- `resources/mpv/linux-x64/mpv-audio-only-linux-x64.tar.gz`
- `resources/mpv/darwin-arm64/mpv-audio-only-darwin-arm64.tar.gz`
- `resources/mpv/win32-x64/mpv-audio-only-win32-x64.zip`

可以指定 `mpv-build` 使用的 MPV / FFmpeg ref：

```sh
MPV_REF=release FFMPEG_REF=release bash scripts/mpv-audio-only/build-linux-x64.sh
MPV_REF=master FFMPEG_REF=master bash scripts/mpv-audio-only/build-linux-x64.sh
```

## GitHub Actions

`.github/workflows/build-mpv-audio-only.yml` 会在这些文件变化后自动构建三端 MPV：

- `.github/workflows/build-mpv-audio-only.yml`
- `resources/mpv/README.md`
- `scripts/mpv-audio-only/**`

也可以在 GitHub 的 Actions 页面手动运行。手动运行时可以输入 `mpv_ref` 和 `ffmpeg_ref`，默认都是 `release`。

每次构建会上传单平台 artifact，也会额外打包一个总 artifact：

- `mpv-audio-only-linux-x64`
- `mpv-audio-only-darwin-arm64`
- `mpv-audio-only-win32-x64`
- `mpv-audio-only-all-platforms`

## 下载构建产物

成功跑完 GitHub Actions 后，可以用下面命令把当前系统的 artifact 下载到本地 `resources/mpv` 对应目录：

```sh
npm run mpv:download
```

需要一次性下载三端：

```sh
npm run mpv:download:all
```

也可以手动指定平台：

```sh
npm run mpv:download -- --platform win32-x64
npm run mpv:download -- --platform darwin-arm64
npm run mpv:download -- --platform linux-x64
```

这个命令会直接通过 GitHub API 下载。GitHub Actions artifact 的列表信息可以公开读取，但 artifact zip 下载接口仍然需要认证；如果这里报 `Requires authentication`，需要设置 `GH_TOKEN` 或 `GITHUB_TOKEN`。

推荐在 GitHub 里创建 fine-grained personal access token：`Settings` -> `Developer settings` -> `Personal access tokens` -> `Fine-grained tokens`，仓库选 `Hydrogen-Music`，权限给 `Actions: Read-only` 即可。然后在当前 PowerShell 里临时设置：

```powershell
$env:GH_TOKEN="你的 GitHub token"
npm run mpv:download
```

下载指定 run：

```sh
npm run mpv:download -- --run-id 123456789
```

下载脚本默认会替换这些目录：

- 当前系统：只替换当前平台目录
- `--platform all`：替换 `resources/mpv/win32-x64`、`resources/mpv/darwin-arm64`、`resources/mpv/linux-x64`

## 存储建议

完整 Linux AppImage 往往超过 GitHub 普通 Git 单文件 100 MB 限制，不建议直接提交到仓库历史里。优先使用音频专用构建产物；如果以后仍需要放大文件，再考虑 GitHub Releases 或 Git LFS。

## 维护说明

`compose-mpv-options.sh` 会根据 `mpv-build` 实际拉下来的 MPV 源码过滤 Meson 选项。这样 MPV 的 master 和 release 选项不一致时，不会因为某个旧选项或新选项不存在而直接构建失败。
