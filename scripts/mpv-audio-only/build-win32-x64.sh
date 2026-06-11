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

is_windows_system_dll() {
  local name
  name="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$name" in
    api-ms-*.dll|ext-ms-*.dll) return 0 ;;
    advapi32.dll|avrt.dll|bcrypt.dll|comctl32.dll|comdlg32.dll|crypt32.dll) return 0 ;;
    dwmapi.dll|gdi32.dll|imm32.dll|kernel32.dll|msvcrt.dll|ntdll.dll) return 0 ;;
    ole32.dll|oleaut32.dll|rpcrt4.dll|secur32.dll|setupapi.dll) return 0 ;;
    shcore.dll|shell32.dll|shlwapi.dll|user32.dll|uxtheme.dll|version.dll) return 0 ;;
    winmm.dll|ws2_32.dll) return 0 ;;
    *) return 1 ;;
  esac
}

find_runtime_dll() {
  local name="$1"
  local search_dir
  for search_dir in \
    "${MSYSTEM_PREFIX:-}/bin" \
    "$(dirname "$(command -v gcc 2>/dev/null || echo /)")" \
    /mingw64/bin \
    /ucrt64/bin \
    /usr/bin; do
    [ -d "$search_dir" ] || continue
    find "$search_dir" -maxdepth 1 -type f -iname "$name" -print -quit
  done
}

list_import_dlls() {
  objdump -p "$1" 2>/dev/null | sed -n 's/^[[:space:]]*DLL Name: //p'
}

copy_runtime_dependencies() {
  local runtime_dir="$1"
  local queue=("$runtime_dir/mpv.exe")
  local index=0
  local binary dll lower dll_path target_path
  declare -A copied_dlls=()

  while [ "$index" -lt "${#queue[@]}" ]; do
    binary="${queue[$index]}"
    index=$((index + 1))
    [ -f "$binary" ] || continue

    while IFS= read -r dll || [ -n "$dll" ]; do
      [ -n "$dll" ] || continue
      lower="$(printf '%s' "$dll" | tr '[:upper:]' '[:lower:]')"
      is_windows_system_dll "$lower" && continue
      [ -n "${copied_dlls[$lower]:-}" ] && continue

      dll_path="$(find_runtime_dll "$dll" | head -n 1)"
      if [ -z "$dll_path" ]; then
        echo "Warning: runtime DLL not found: $dll" >&2
        continue
      fi

      target_path="$runtime_dir/$(basename "$dll_path")"
      cp "$dll_path" "$target_path"
      copied_dlls[$lower]=1
      queue+=("$target_path")
    done < <(list_import_dlls "$binary")
  done
}

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

RUNTIME_DIR="$WORK_DIR/mpv-runtime"
rm -rf "$RUNTIME_DIR"
mkdir -p "$RUNTIME_DIR"
cp mpv/build/mpv.exe "$RUNTIME_DIR/mpv.exe"
strip "$RUNTIME_DIR/mpv.exe" 2>/dev/null || true
copy_runtime_dependencies "$RUNTIME_DIR"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
(cd "$RUNTIME_DIR" && zip -9 -q "$OUT_DIR/mpv-audio-only-win32-x64.zip" ./*)

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$OUT_DIR/mpv-audio-only-win32-x64.zip" > "$OUT_DIR/mpv-audio-only-win32-x64.zip.sha256"
fi

echo "Bundled Windows runtime files:"
find "$RUNTIME_DIR" -maxdepth 1 -type f -printf '%f\n' | sort
du -h "$OUT_DIR/mpv-audio-only-win32-x64.zip"
