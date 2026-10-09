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
# 未配置 signingConfigs 时 hvigor 只产出
# entry-default-unsigned.hap（名字里没有 buildMode 段，本机实测），
# 这与"根本没有产物"是两件事：前者要明确报"未签名、不可安装"，
# 后者才是构建失败。
HAP="$(find "$OUT_DIR" -name "entry-default-$MODE-*.hap" -type f 2>/dev/null | head -n 1)"
UNSIGNED=0
if [ -z "$HAP" ]; then
  HAP="$(find "$OUT_DIR" -name 'entry-default-unsigned.hap' -type f 2>/dev/null | head -n 1)"
  UNSIGNED=1
fi
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

if [ "$UNSIGNED" = "1" ]; then
  cat >&2 <<'MSG'

========================================================================
注意：本次产物是 **未签名 HAP**，不可安装到 GT 4。
build-profile.json5 里 signingConfigs 为空，hvigor 跳过了签名
（日志中的 "Will skip sign 'hos_hap'"）。要让阶段验收成立，需要
素阅自己的华为签名材料（.p12 / .cer / .profile），经
tools/inject_signing.py 注入；素笺的证书不能复用（包名与 profile
不匹配，议题 #2 也明确要求本项目独立证书）。
因此：本轮构建成功 ≠ 第 1 阶段验收通过。
========================================================================
MSG
fi
