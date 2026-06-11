# 内置 MPV

这个目录用于存放 Hydrogen Music 本地 HiFi 输出使用的 MPV 后端。

目录名按 Electron 的 `process.platform` 和架构命名：

- `win32-x64`
- `darwin-x64`
- `darwin-arm64`
- `linux-x64`
- `linux-arm64`

`electron-builder` 打包时只会把当前目标系统对应的目录放进安装包。运行时也会优先查找当前平台目录，找不到时再回退到系统 `PATH` 里的 `mpv`。

## 音频专用构建

为了减少安装包体积，建议使用 `scripts/mpv-audio-only/` 构建平台专用的精简 MPV。

这些构建只保留本地音频播放和 HiFi 输出需要的能力：

- Windows：WASAPI
- macOS：CoreAudio
- Linux：PipeWire，另保留 ALSA 作为备用输出

GitHub Actions 会生成一个合并后的 `mpv-audio-only-all-platforms` artifact。跑完后可以下载到本地：

```sh
npm run mpv:download
```

下载后本目录会得到对应平台资源，例如：

- `resources/mpv/win32-x64`
- `resources/mpv/darwin-arm64`
- `resources/mpv/linux-x64`
