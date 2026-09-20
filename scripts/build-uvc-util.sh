#!/usr/bin/env bash
# Builds the vendored uvc-util (see third_party/uvc-util) and drops the
# resulting binary into the plugin's bin/ folder, where pixy-uvc.ts expects
# to find it at runtime.
#
# Requires macOS with Xcode Command Line Tools installed (`xcode-select
# --install`). Only needed for the PTZ Preset action -- every other action
# in this plugin works without it.
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "error: uvc-util only builds on macOS (it links against IOKit/Foundation)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$PROJECT_ROOT/third_party/uvc-util"
OUT_DIR="$PROJECT_ROOT/com.emeetpixy.pixycontrol.sdPlugin/bin"

mkdir -p "$OUT_DIR"

echo "Building uvc-util..."
gcc -o "$OUT_DIR/uvc-util" \
  -framework IOKit \
  -framework Foundation \
  "$SRC_DIR/uvc-util.m" \
  "$SRC_DIR/UVCController.m" \
  "$SRC_DIR/UVCType.m" \
  "$SRC_DIR/UVCValue.m"

chmod +x "$OUT_DIR/uvc-util"
echo "Built $OUT_DIR/uvc-util"
"$OUT_DIR/uvc-util" --version || true
