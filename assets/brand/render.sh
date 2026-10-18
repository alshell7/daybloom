#!/usr/bin/env bash
# Re-renders every shipped icon from the SVG sources in this folder.
# Needs Google Chrome (accurate SVG filters + transparency) and ImageMagick.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
ICONS="$ROOT/src-tauri/icons"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# render <svg> <css-size> <scale> <out.png>
render() {
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --force-device-scale-factor="$3" --window-size="$2,$2" --user-data-dir="$TMP/profile" \
    --screenshot="$4" "file://$(cd "$(dirname "$1")" && pwd)/$(basename "$1")" >/dev/null 2>&1
}

# macOS-style tile (transparent margin + soft shadow) -> full Tauri icon set.
render icon.svg 1024 1 icon-1024.png
(cd "$ROOT" && npx tauri icon assets/brand/icon-1024.png -o src-tauri/icons)
rm -rf "$ICONS/android" "$ICONS/ios"

# Windows expects icons that fill the canvas: crop to the tile, drop the shadow.
sed -e 's/ filter="url(#shadow)"//' -e 's/viewBox="0 0 1024 1024"/viewBox="96 96 832 832"/' \
  icon.svg > "$TMP/icon-win.svg"
render "$TMP/icon-win.svg" 1024 1 "$TMP/icon-win.png"
(cd "$ROOT" && npx tauri icon "$TMP/icon-win.png" -o "$TMP/win" >/dev/null)
cp "$TMP/win/icon.ico" "$ICONS/icon.ico"

# Monochrome template glyph for the macOS menu bar.
render tray.svg 32 1 "$ICONS/tray.png"
render tray.svg 32 2 "$ICONS/tray@2x.png"
echo "icons written to $ICONS"
