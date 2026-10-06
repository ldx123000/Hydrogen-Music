# 专用 FFmpeg

桌面端通过 `src/electron/ffmpeg.js` 使用这里的运行时，替代通用 `ffmpeg-static`。
保留下载封面转 PNG、视频背景 HEVC 转 H.264 两条调用路径；本地音乐和 HiFi 仍使用现有播放后端。

## 构建

在目标系统安装编译工具后运行：

```sh
# macOS
brew install meson ninja nasm pkg-config

# Ubuntu / Debian
sudo apt-get install build-essential meson ninja-build nasm pkg-config zlib1g-dev

npm run ffmpeg:build
npm run dist
```

Windows 在 MSYS2 **MINGW64** 环境安装以下包，再运行 `bash scripts/ffmpeg/build.sh`：

```sh
pacman -S --needed make diffutils perl mingw-w64-x86_64-gcc \
  mingw-w64-x86_64-meson mingw-w64-x86_64-ninja mingw-w64-x86_64-nasm \
  mingw-w64-x86_64-pkgconf mingw-w64-x86_64-zlib
```

Windows 构建完毕后，可以在普通终端执行 `npm run dist`。
发布工作流会在三个系统各自构建后再打包，并上传运行时。

输出目录按平台和架构区分：`darwin-arm64/`、`win32-x64/`、`linux-x64/`。
打包时只复制目标平台和架构的目录。生成文件不提交到 Git。
开发模式同样需要先构建一次运行时；缺失文件会明确报错。

构建缓存位于 `.cache/ffmpeg/<platform>-<arch>/`。可用 `HYDROGEN_FFMPEG_WORKDIR` 和
`HYDROGEN_FFMPEG_OUTDIR` 指定缓存和输出目录。

## 构建内容

- x264 静态链接，只构建应用输出需要的 8-bit YUV 4:2:0 编码。
- dav1d 静态链接，保留 AVIF 封面的 AV1 解码能力。
- 保留 WebP、PNG、JPEG、GIF、TIFF 等图片解码和 PNG 编码。
- 保留 HEVC/H.264 解码、MP4 封装、缩放、像素格式转换和自动旋转需要的滤镜。
- 不编入网络协议、音频编解码器、音频设备、FFplay、FFprobe 和其他无关能力。
- 运行时目录包含许可证、源码地址和构建选项；编译脚本在 `scripts/ffmpeg/`。
