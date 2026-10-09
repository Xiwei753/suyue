#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Local/reproducible Lite Wearable HAP build for suyue watch (GT 4 46mm).
# Requires a DevEnvStudio/DevEco environment that provides `hvigorw` and the
# Lite Wearable SDK. This script does NOT fabricate success: any missing
# toolchain or signing material fails the build loudly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/apps/watch"

MODE="${1:-debug}"   # debug | release
PRODUCT="${PRODUCT:-default}"

if [ "$MODE" != "debug" ] && [ "$MODE" != "release" ]; then
  echo "usage: $0 [debug|release]" >&2
  exit 2
fi

if ! command -v hvigorw >/dev/null 2>&1 && [ ! -x "./hvigorw" ]; then
  echo "ERROR: hvigorw not found. Build with the Lite Wearable DevEco toolchain" >&2
  echo "       (see docs/WATCH_INSTALL.md). Node-only checks cannot produce a HAP." >&2
  exit 1
fi

HVIGORW="$(command -v hvigorw || echo ./hvigorw)"

# 清理本次输出：不能从历史产物中
# 捡到旧 HAP（施工单 P1-8）。
OUT_DIR="entry/build/default/outputs/default"
rm -rf entry/build
mkdir -p "$OUT_DIR"

"$HVIGORW" --mode module -p product="$PRODUCT" -p buildMode="$MODE" assembleHap --no-daemon

# 按请求的 buildMode 挑选：release
# 构建不得验到 debug 产物。
HAP="$(find "$OUT_DIR" -name "entry-default-$MODE-*.hap" -type f 2>/dev/null | head -n 1)"
if [ -z "$HAP" ]; then
  echo "ERROR: hvigor reported success but no $MODE HAP was produced under" >&2
  echo "       $OUT_DIR/" >&2
  exit 1
fi

echo "HAP_PATH=$REPO_ROOT/apps/watch/$HAP"
"$REPO_ROOT/tests/build_artifact_check.sh" \
  "$REPO_ROOT/apps/watch/$HAP" \
  --bundle 'com.xiwei753.gt4reader.watch' \
  --device liteWearable \
  --mode "$MODE"
