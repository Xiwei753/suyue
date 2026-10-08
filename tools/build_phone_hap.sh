#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Local/reproducible Stage HAP build for suyue phone (Pocket 2 / API 26).
# Requires a DevEco environment that provides `hvigorw` and the
# HarmonyOS Stage SDK. Never fabricates success: missing toolchain
# or signing material fails loudly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/apps/phone"

MODE="${1:-debug}"   # debug | release
PRODUCT="${PRODUCT:-default}"

if [ "$MODE" != "debug" ] && [ "$MODE" != "release" ]; then
  echo "usage: $0 [debug|release]" >&2
  exit 2
fi

if ! command -v hvigorw >/dev/null 2>&1 && [ ! -x "./hvigorw" ]; then
  echo "ERROR: hvigorw not found. Build with the HarmonyOS Stage" >&2
  echo "       DevEco toolchain (API 26). Node-only checks cannot" >&2
  echo "       produce a Stage HAP." >&2
  exit 1
fi

HVIGORW="$(command -v hvigorw || echo ./hvigorw)"
"$HVIGORW" --mode module -p product="$PRODUCT" -p buildMode="$MODE" assembleHap --no-daemon

HAP="$(find entry/build/default/outputs/default -name 'entry-default-*.hap' -type f 2>/dev/null | head -n 1)"
if [ -z "$HAP" ]; then
  echo "ERROR: hvigor reported success but no HAP was produced under" >&2
  echo "       entry/build/default/outputs/default/" >&2
  exit 1
fi

echo "HAP_PATH=$REPO_ROOT/apps/phone/$HAP"
"$REPO_ROOT/tests/build_artifact_check.sh" "$REPO_ROOT/apps/phone/$HAP"
