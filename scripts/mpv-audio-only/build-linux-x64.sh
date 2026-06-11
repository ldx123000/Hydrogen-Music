#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLATFORM="linux-x64"
WORK_DIR="${MPV_AUDIO_ONLY_WORKDIR:-$REPO_ROOT/.cache/mpv-audio-only/$PLATFORM}"
OUT_DIR="${MPV_AUDIO_ONLY_OUTDIR:-$REPO_ROOT/resources/mpv/$PLATFORM}"
JOBS="${JOBS:-$(nproc 2>/dev/null || echo 4)}"
MPV_REF="${MPV_REF:-release}"
FFMPEG_REF="${FFMPEG_REF:-release}"
MPV_BUILD_REPO="${MPV_BUILD_REPO:-https://github.com/mpv-player/mpv-build.git}"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
git clone --depth 1 "$MPV_BUILD_REPO" "$WORK_DIR/mpv-build"

cd "$WORK_DIR/mpv-build"

if [ "$MPV_REF" = "release" ]; then
  ./use-mpv-release
elif [ "$MPV_REF" != "master" ]; then
  ./use-mpv-custom "$MPV_REF"
fi

if [ "$FFMPEG_REF" = "release" ]; then
  ./use-ffmpeg-release
elif [ "$FFMPEG_REF" != "master" ]; then
  ./use-ffmpeg-custom "$FFMPEG_REF"
fi

cp "$SCRIPT_DIR/ffmpeg_options.txt" ffmpeg_options

./update --skip-selfupdate
bash "$SCRIPT_DIR/compose-mpv-options.sh" "$PLATFORM" "$SCRIPT_DIR" "$PWD/mpv" > mpv_options
./clean
./build "-j$JOBS"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
install -m 755 mpv/build/mpv "$OUT_DIR/mpv"
strip "$OUT_DIR/mpv" 2>/dev/null || true

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$OUT_DIR/mpv" > "$OUT_DIR/mpv.sha256"
fi

du -h "$OUT_DIR/mpv"
