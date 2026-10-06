#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
case "$(uname -s)" in
  Darwin) PLATFORM="darwin-$(uname -m)"; JOBS="${JOBS:-$(sysctl -n hw.ncpu)}" ;;
  Linux) PLATFORM="linux-$(uname -m)"; JOBS="${JOBS:-$(nproc)}" ;;
  MINGW*|MSYS*)
    case "${MSYSTEM:-}" in
      MINGW64|UCRT64) ;;
      *) echo "Build Windows FFmpeg in an MSYS2 MINGW64/UCRT64 shell." >&2; exit 1 ;;
    esac
    PLATFORM=win32-x64; JOBS="${JOBS:-$(nproc)}" ;;
  *) echo "Unsupported build host: $(uname -s)" >&2; exit 1 ;;
esac
PLATFORM="${PLATFORM/x86_64/x64}"
PLATFORM="${PLATFORM/aarch64/arm64}"
WORK_DIR="${HYDROGEN_FFMPEG_WORKDIR:-$REPO_ROOT/.cache/ffmpeg/$PLATFORM}"
OUT_DIR="${HYDROGEN_FFMPEG_OUTDIR:-$REPO_ROOT/resources/ffmpeg/$PLATFORM}"
mkdir -p "$WORK_DIR/sources" "$OUT_DIR"
WORK_DIR="$(cd "$WORK_DIR" && pwd)"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
PREFIX="$WORK_DIR/prefix"

FFMPEG_VERSION=6.1.6
X264_REVISION=b35605ace3ddf7c1a5d67a2eb553f034aef41d55
DAV1D_VERSION=1.5.3

fetch_source() {
  local name="$1" url="$2" sha256="$3"
  local archive="$WORK_DIR/sources/$name"
  if [ ! -f "$archive" ]; then
    curl --fail --location --retry 3 --output "$archive.download" "$url"
    mv "$archive.download" "$archive"
  fi
  printf '%s  %s\n' "$sha256" "$archive" | shasum -a 256 -c -
  tar -xf "$archive" -C "$WORK_DIR"
}

fetch_source "ffmpeg-$FFMPEG_VERSION.tar.xz" \
  "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz" \
  d4fcb164028dd3beee5d92c0ac72e46aac6973c75ea12dc14de07bf8f407370a
fetch_source x264.tar.gz \
  "https://code.videolan.org/videolan/x264/-/archive/$X264_REVISION/x264-$X264_REVISION.tar.gz" \
  cd71a7515b0e9a012e1ac9b1f8415bebcaf6fc97d4db32286642ac4c0fbe24f9
fetch_source "dav1d-$DAV1D_VERSION.tar.bz2" \
  "https://code.videolan.org/videolan/dav1d/-/archive/$DAV1D_VERSION/dav1d-$DAV1D_VERSION.tar.bz2" \
  e099f53253f6c247580c554d53a13f1040638f2066edc3c740e4c2f15174ce22

export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig"
export PKG_CONFIG_LIBDIR="$PREFIX/lib/pkgconfig"
if [[ "$PLATFORM" == darwin-* ]]; then
  export MACOSX_DEPLOYMENT_TARGET=11.0
fi

mkdir -p "$WORK_DIR/x264-build"
cd "$WORK_DIR/x264-build"
"$WORK_DIR/x264-$X264_REVISION/configure" --prefix="$PREFIX" \
  --enable-static --enable-pic --disable-cli --disable-opencl \
  --disable-avs --disable-swscale --disable-lavf --disable-ffms \
  --disable-gpac --disable-lsmash --bit-depth=8 --chroma-format=420
make -j"$JOBS"
make install-lib-static

meson setup --wipe "$WORK_DIR/dav1d-build" "$WORK_DIR/dav1d-$DAV1D_VERSION" \
  --prefix="$PREFIX" --libdir=lib --default-library=static --buildtype=minsize \
  -Db_ndebug=true -Denable_tools=false -Denable_tests=false -Denable_examples=false
meson compile -C "$WORK_DIR/dav1d-build" -j "$JOBS"
meson install -C "$WORK_DIR/dav1d-build"

mkdir -p "$WORK_DIR/ffmpeg-build"
cd "$WORK_DIR/ffmpeg-build"
options=()
while IFS= read -r option; do
  [ -z "$option" ] || options+=("$option")
done < "$SCRIPT_DIR/options.txt"
extra_options=(--extra-ldflags="-L$PREFIX/lib")
if [[ "$PLATFORM" == win32-* || "$PLATFORM" == linux-* ]]; then
  extra_options=(--extra-ldflags="-L$PREFIX/lib -static")
fi
"$WORK_DIR/ffmpeg-$FFMPEG_VERSION/configure" \
  --prefix="$PREFIX" --pkg-config-flags=--static \
  --extra-cflags="-I$PREFIX/include" \
  "${options[@]}" "${extra_options[@]}"
executable=ffmpeg
[[ "$PLATFORM" != win32-* ]] || executable=ffmpeg.exe
make -j"$JOBS" "$executable"

install -m 755 "$executable" "$OUT_DIR/$executable"
strip "$OUT_DIR/$executable"
if [[ "$PLATFORM" == darwin-* ]]; then
  codesign --force --sign - --timestamp=none "$OUT_DIR/$executable"
fi
mkdir -p "$OUT_DIR/licenses"
cp "$WORK_DIR/ffmpeg-$FFMPEG_VERSION/COPYING.GPLv2" "$OUT_DIR/licenses/FFmpeg-GPLv2.txt"
cp "$WORK_DIR/x264-$X264_REVISION/COPYING" "$OUT_DIR/licenses/x264-GPLv2.txt"
cp "$WORK_DIR/dav1d-$DAV1D_VERSION/COPYING" "$OUT_DIR/licenses/dav1d-BSD.txt"
cp "$SCRIPT_DIR/options.txt" "$OUT_DIR/build-options.txt"
cat > "$OUT_DIR/sources.json" <<EOF
{
  "ffmpeg": "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz",
  "x264": "https://code.videolan.org/videolan/x264/-/archive/$X264_REVISION/x264-$X264_REVISION.tar.gz",
  "dav1d": "https://code.videolan.org/videolan/dav1d/-/archive/$DAV1D_VERSION/dav1d-$DAV1D_VERSION.tar.bz2"
}
EOF
(cd "$OUT_DIR" && shasum -a 256 "$executable" > SHA256SUMS)
"$OUT_DIR/$executable" -version
du -h "$OUT_DIR/$executable"
