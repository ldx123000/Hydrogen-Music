#!/usr/bin/env bash
set -euo pipefail

case "${MSYSTEM:-}" in
  MINGW64|UCRT64) ;;
  CLANG64)
    echo "build-win32-x64.sh should run inside an MSYS2 MINGW64 shell." >&2
    echo "CLANG64 uses libc++, but mpv-build currently appends -lstdc++ for FFmpeg." >&2
    exit 1
    ;;
  *)
    echo "build-win32-x64.sh must run inside an MSYS2 MINGW64/UCRT64 shell." >&2
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLATFORM="win32-x64"
WORK_DIR="${MPV_AUDIO_ONLY_WORKDIR:-$REPO_ROOT/.cache/mpv-audio-only/$PLATFORM}"
OUT_DIR="${MPV_AUDIO_ONLY_OUTDIR:-$REPO_ROOT/resources/mpv/$PLATFORM}"
JOBS="${JOBS:-$(nproc 2>/dev/null || echo 4)}"
MPV_REF="${MPV_REF:-release}"
FFMPEG_REF="${FFMPEG_REF:-release}"
MPV_BUILD_REPO="${MPV_BUILD_REPO:-https://github.com/mpv-player/mpv-build.git}"

dump_build_logs() {
  local status="$?"
  if [ "$status" -ne 0 ]; then
    echo "Build failed with exit code $status. Dumping available build logs..." >&2
    local log
    for log in \
      "$WORK_DIR/mpv-build/ffmpeg_build/ffbuild/config.log" \
      "$WORK_DIR/mpv-build/mpv/build/meson-logs/meson-log.txt" \
      "$WORK_DIR/mpv-build/libplacebo/build/meson-logs/meson-log.txt" \
      "$WORK_DIR/mpv-build/libass/config.log"; do
      if [ -f "$log" ]; then
        echo "::group::$log" >&2
        tail -n "${MPV_AUDIO_ONLY_LOG_TAIL:-260}" "$log" >&2 || true
        echo "::endgroup::" >&2
      fi
    done
  fi
  exit "$status"
}
trap dump_build_logs EXIT

echo "MSYSTEM=$MSYSTEM"
for tool in gcc cc clang c++ g++ ld; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf '%s: ' "$tool"
    "$tool" --version 2>/dev/null | head -n 1 || true
  fi
done

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
mkdir -p "$OUT_DIR"
cp mpv/build/mpv.exe "$OUT_DIR/mpv.exe"
strip "$OUT_DIR/mpv.exe" 2>/dev/null || true

(cd "$OUT_DIR" && zip -9 -q mpv-audio-only-win32-x64.zip mpv.exe)
rm -f "$OUT_DIR/mpv.exe"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$OUT_DIR/mpv-audio-only-win32-x64.zip" > "$OUT_DIR/mpv-audio-only-win32-x64.zip.sha256"
fi

du -h "$OUT_DIR/mpv-audio-only-win32-x64.zip"
