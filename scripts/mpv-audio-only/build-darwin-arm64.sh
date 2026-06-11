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

is_macos_system_library() {
  case "$1" in
    /System/Library/*|/usr/lib/*) return 0 ;;
    *) return 1 ;;
  esac
}

resolve_macos_dependency_path() {
  local dep="$1"
  local loader_dir="$2"
  local candidate

  case "$dep" in
    @loader_path/*)
      candidate="$loader_dir/${dep#@loader_path/}"
      [ -f "$candidate" ] && printf '%s\n' "$candidate"
      return
      ;;
    @executable_path/*)
      candidate="$RUNTIME_DIR/${dep#@executable_path/}"
      [ -f "$candidate" ] && printf '%s\n' "$candidate"
      return
      ;;
    @rpath/*)
      local name="${dep#@rpath/}"
      for candidate in \
        "$loader_dir/$name" \
        "$RUNTIME_DIR/$name" \
        "$RUNTIME_DIR/libs/$name" \
        "/opt/homebrew/lib/$name" \
        "/opt/homebrew/opt"/*"/lib/$name"; do
        [ -f "$candidate" ] && printf '%s\n' "$candidate" && return
      done
      return
      ;;
    /*)
      [ -f "$dep" ] && printf '%s\n' "$dep"
      return
      ;;
  esac
}

list_macos_dependencies() {
  otool -L "$1" 2>/dev/null | tail -n +2 | awk '{ print $1 }'
}

rewrite_macos_dependency() {
  local binary="$1"
  local original_dep="$2"
  local dep_name="$3"
  local relative_dep="@loader_path/libs/$dep_name"

  if [ "$(dirname "$binary")" = "$RUNTIME_DIR/libs" ]; then
    relative_dep="@loader_path/$dep_name"
  fi

  install_name_tool -change "$original_dep" "$relative_dep" "$binary" 2>/dev/null || true
}

copy_runtime_dependencies() {
  local runtime_dir="$1"
  local libs_dir="$runtime_dir/libs"
  local queue=("$runtime_dir/mpv")
  local index=0
  local binary dep dep_path dep_name target_path
  local copied_paths_file
  copied_paths_file="$(mktemp)"

  mkdir -p "$libs_dir"

  while [ "$index" -lt "${#queue[@]}" ]; do
    binary="${queue[$index]}"
    index=$((index + 1))
    [ -f "$binary" ] || continue

    while IFS= read -r dep || [ -n "$dep" ]; do
      [ -n "$dep" ] || continue
      [ "$dep" = "$binary" ] && continue
      is_macos_system_library "$dep" && continue

      dep_path="$(resolve_macos_dependency_path "$dep" "$(dirname "$binary")" | head -n 1)"
      if [ -z "$dep_path" ]; then
        echo "Warning: runtime dylib not found: $dep" >&2
        continue
      fi

      dep_name="$(basename "$dep_path")"
      target_path="$libs_dir/$dep_name"
      if ! grep -Fxq "$dep_path" "$copied_paths_file"; then
        cp -L "$dep_path" "$target_path"
        chmod u+w "$target_path" 2>/dev/null || true
        install_name_tool -id "@loader_path/$dep_name" "$target_path" 2>/dev/null || true
        printf '%s\n' "$dep_path" >> "$copied_paths_file"
        queue+=("$target_path")
      fi

      rewrite_macos_dependency "$binary" "$dep" "$dep_name"
    done < <(list_macos_dependencies "$binary")
  done

  rm -f "$copied_paths_file"
}

ad_hoc_codesign_runtime() {
  if ! command -v codesign >/dev/null 2>&1; then
    return
  fi

  find "$RUNTIME_DIR" -type f \( -name '*.dylib' -o -name 'mpv' \) -print0 \
    | while IFS= read -r -d '' file_path; do
        codesign --force --sign - --timestamp=none "$file_path" >/dev/null 2>&1 || true
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
ad_hoc_codesign_runtime

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

tar -C "$RUNTIME_PARENT" -czf "$OUT_DIR/mpv-audio-only-darwin-arm64.tar.gz" mpv-audio-only

shasum -a 256 "$OUT_DIR/mpv-audio-only-darwin-arm64.tar.gz" > "$OUT_DIR/mpv-audio-only-darwin-arm64.tar.gz.sha256"
echo "Bundled macOS runtime files:"
find "$RUNTIME_DIR" -maxdepth 2 -type f -print | sed "s#^$RUNTIME_DIR/##" | sort
du -h "$OUT_DIR/mpv-audio-only-darwin-arm64.tar.gz"
