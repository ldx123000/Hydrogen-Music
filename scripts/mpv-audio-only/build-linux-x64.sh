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

is_linux_system_library() {
  local name
  name="$(basename "$1")"
  case "$name" in
    linux-vdso.so*|ld-linux*.so*) return 0 ;;
    libc.so*|libdl.so*|libm.so*|libpthread.so*|libresolv.so*|librt.so*|libutil.so*) return 0 ;;
    *) return 1 ;;
  esac
}

list_linux_dependency_paths() {
  ldd "$1" 2>/dev/null \
    | awk '
        /=>/ && $3 ~ /^\// { print $3; next }
        $1 ~ /^\// { print $1; next }
      '
}

copy_runtime_dependencies() {
  local runtime_dir="$1"
  local libs_dir="$runtime_dir/libs"
  local queue=("$runtime_dir/mpv")
  local index=0
  local binary dep dep_name target_path
  declare -A copied_paths=()

  mkdir -p "$libs_dir"

  while [ "$index" -lt "${#queue[@]}" ]; do
    binary="${queue[$index]}"
    index=$((index + 1))
    [ -f "$binary" ] || continue

    while IFS= read -r dep || [ -n "$dep" ]; do
      [ -n "$dep" ] || continue
      [ -f "$dep" ] || continue
      is_linux_system_library "$dep" && continue
      [ -n "${copied_paths[$dep]:-}" ] && continue

      dep_name="$(basename "$dep")"
      target_path="$libs_dir/$dep_name"
      cp -L "$dep" "$target_path"
      chmod 755 "$target_path" 2>/dev/null || true
      copied_paths[$dep]=1
      queue+=("$target_path")
    done < <(list_linux_dependency_paths "$binary")
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

RUNTIME_PARENT="$WORK_DIR/mpv-runtime"
RUNTIME_DIR="$RUNTIME_PARENT/mpv-audio-only"
rm -rf "$RUNTIME_PARENT"
mkdir -p "$RUNTIME_DIR"
install -m 755 mpv/build/mpv "$RUNTIME_DIR/mpv"
strip "$RUNTIME_DIR/mpv" 2>/dev/null || true
copy_runtime_dependencies "$RUNTIME_DIR"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
tar -C "$RUNTIME_PARENT" -czf "$OUT_DIR/mpv-audio-only-linux-x64.tar.gz" mpv-audio-only

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$OUT_DIR/mpv-audio-only-linux-x64.tar.gz" > "$OUT_DIR/mpv-audio-only-linux-x64.tar.gz.sha256"
fi

echo "Bundled Linux runtime files:"
find "$RUNTIME_DIR" -maxdepth 2 -type f -printf '%P\n' | sort
du -h "$OUT_DIR/mpv-audio-only-linux-x64.tar.gz"
