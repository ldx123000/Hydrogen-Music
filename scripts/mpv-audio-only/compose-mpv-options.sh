#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <platform> <script-dir> <mpv-source-dir>" >&2
  exit 2
fi

PLATFORM="$1"
SCRIPT_DIR="$2"
MPV_SOURCE_DIR="$3"
MESON_OPTIONS="$MPV_SOURCE_DIR/meson.options"

if [ ! -f "$MESON_OPTIONS" ]; then
  echo "mpv meson.options not found: $MESON_OPTIONS" >&2
  exit 1
fi

SUPPORTED_OPTIONS="$(mktemp)"
trap 'rm -f "$SUPPORTED_OPTIONS"' EXIT

grep -o "option('[^']*'" "$MESON_OPTIONS" \
  | sed -e "s/^option('//" -e "s/'$//" \
  | sort -u > "$SUPPORTED_OPTIONS"

cat "$SCRIPT_DIR/mpv_options.common.txt" "$SCRIPT_DIR/mpv_options.$PLATFORM.txt" \
  | while IFS= read -r line || [ -n "$line" ]; do
      line="${line%$'\r'}"
      [ -z "$line" ] && continue

      option_name="$(printf '%s' "$line" | sed -n 's/^-D\([^=]*\)=.*/\1/p')"
      if [ -n "$option_name" ] && ! grep -Fxq "$option_name" "$SUPPORTED_OPTIONS"; then
        echo "Skipping unsupported mpv option for this ref: $line" >&2
        continue
      fi

      printf '%s\n' "$line"
    done
