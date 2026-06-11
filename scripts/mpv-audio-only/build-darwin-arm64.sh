#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "build-darwin-arm64.sh must run on macOS." >&2
  exit 1
fi

if [ "$(uname -m)" != "arm64" ]; then
  echo "build-darwin-arm64.sh must run on an Apple Silicon arm64 runner." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLATFORM="darwin-arm64"
WORK_DIR="${MPV_AUDIO_ONLY_WORKDIR:-$REPO_ROOT/.cache/mpv-audio-only/$PLATFORM}"
OUT_DIR="${MPV_AUDIO_ONLY_OUTDIR:-$REPO_ROOT/resources/mpv/$PLATFORM}"
JOBS="${JOBS:-$(sysctl -n hw.ncpu 2>/dev/null || echo 4)}"
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

tr -d '\r' < "$SCRIPT_DIR/ffmpeg_options.txt" > ffmpeg_options

./update --skip-selfupdate
bash "$SCRIPT_DIR/compose-mpv-options.sh" "$PLATFORM" "$SCRIPT_DIR" "$PWD/mpv" > mpv_options
./clean
./build "-j$JOBS"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/mpv-audio-only"
install -m 755 mpv/build/mpv "$OUT_DIR/mpv-audio-only/mpv"
strip "$OUT_DIR/mpv-audio-only/mpv" 2>/dev/null || true

tar -C "$OUT_DIR" -czf "$OUT_DIR/mpv-audio-only-darwin-arm64.tar.gz" mpv-audio-only
rm -rf "$OUT_DIR/mpv-audio-only"

shasum -a 256 "$OUT_DIR/mpv-audio-only-darwin-arm64.tar.gz" > "$OUT_DIR/mpv-audio-only-darwin-arm64.tar.gz.sha256"
du -h "$OUT_DIR/mpv-audio-only-darwin-arm64.tar.gz"
