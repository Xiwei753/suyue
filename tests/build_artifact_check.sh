#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Verify a built HAP artifact (施工单 P1-8 / 第二轮 P1-6)：
#   - HAP 容器：必须是 ZIP（PK 魔数），
#     且包含模块清单（modules.json /
#     config.json）；
#   - 包名与期望 bundleId 一致；
#   - 目标设备类型一致（liteWearable /
#     phone）；
#   - buildMode 与文件名匹配：release
#     不得验到 debug 或旧产物；
#   - 可选：Manifest 中必须出现期望指纹，
#     且不得残留占位符；
#   - 非零字节，报告大小与 SHA-256。
#
# 注意：本脚本只做**容器/清单级**检查，
# 不做证书签名验证。签名验证必须由官方
# hap-sign-tool 在真实工具链上完成
# （workflow 中的 verify-signature 步骤）。
set -euo pipefail

HAP="${1:?usage: build_artifact_check.sh <path-to.hap> [--bundle ID] [--device TYPE] [--mode debug|release] [--expect-fingerprint VALUE]}"
shift || true

BUNDLE=""
DEVICE=""
MODE=""
EXPECT_FINGERPRINT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --bundle) BUNDLE="${2:?--bundle needs a value}"; shift 2 ;;
    --device) DEVICE="${2:?--device needs a value}"; shift 2 ;;
    --mode) MODE="${2:?--mode needs a value}"; shift 2 ;;
    --expect-fingerprint) EXPECT_FINGERPRINT="${2:?--expect-fingerprint needs a value}"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [ ! -f "$HAP" ]; then
  echo "FAIL: HAP not found: $HAP" >&2
  exit 1
fi

SIZE="$(stat -c%s "$HAP" 2>/dev/null || stat -f%z "$HAP")"
if [ "$SIZE" -le 0 ]; then
  echo "FAIL: HAP is empty (0 bytes): $HAP" >&2
  exit 1
fi

# 1) 容器：HAP 是 ZIP。
MAGIC="$(head -c 4 "$HAP" | od -An -tx1 | tr -d ' \n')"
if [ "$MAGIC" != "504b0304" ]; then
  echo "FAIL: HAP is not a ZIP container (magic=$MAGIC): $HAP" >&2
  exit 1
fi

# 2) 模块清单存在（Stage: modules.json；
#    Lite FA: config.json）。
if unzip -l "$HAP" modules.json >/dev/null 2>&1; then
  MANIFEST="modules.json"
elif unzip -l "$HAP" config.json >/dev/null 2>&1; then
  MANIFEST="config.json"
else
  echo "FAIL: HAP contains neither modules.json nor config.json: $HAP" >&2
  exit 1
fi

MANIFEST_TEXT="$(unzip -p "$HAP" "$MANIFEST" 2>/dev/null)"

# 3) 包名。
if [ -n "$BUNDLE" ]; then
  case "$MANIFEST" in
    modules.json)
      if ! printf '%s' "$MANIFEST_TEXT" | grep -q "\"app\":[^}]*\"bundleName\"[[:space:]]*:[[:space:]]*\"$BUNDLE\""; then
        echo "FAIL: HAP bundleName != $BUNDLE ($MANIFEST): $HAP" >&2
        exit 1
      fi
      ;;
    config.json)
      if ! printf '%s' "$MANIFEST_TEXT" | grep -q "\"bundleName\"[[:space:]]*:[[:space:]]*\"$BUNDLE\""; then
        echo "FAIL: HAP bundleName != $BUNDLE ($MANIFEST): $HAP" >&2
        exit 1
      fi
      ;;
  esac
fi

# 4) 目标设备类型。
if [ -n "$DEVICE" ]; then
  case "$MANIFEST" in
    modules.json)
      if ! printf '%s' "$MANIFEST_TEXT" | grep -q "\"deviceTypes\"[^]]*\"$DEVICE\""; then
        echo "FAIL: HAP deviceTypes does not include $DEVICE: $HAP" >&2
        exit 1
      fi
      ;;
    config.json)
      if ! printf '%s' "$MANIFEST_TEXT" | grep -q "\"deviceType\"[^]]*\"$DEVICE\""; then
        echo "FAIL: HAP deviceType does not include $DEVICE: $HAP" >&2
        exit 1
      fi
      ;;
  esac
fi

# 5) buildMode 与文件名匹配：release
#    不得验到 debug 产物，反之亦然。
if [ -n "$MODE" ]; then
  BASENAME="$(basename "$HAP")"
  case "$BASENAME" in
    *"-$MODE-"*) : ;;
    *) echo "FAIL: HAP filename does not match requested buildMode '$MODE': $BASENAME" >&2
       exit 1 ;;
  esac
  OTHER="debug"; [ "$MODE" = "debug" ] && OTHER="release"
  case "$BASENAME" in
    *"-$OTHER-"*) echo "FAIL: HAP filename matches the wrong buildMode ('$OTHER'): $BASENAME" >&2
       exit 1 ;;
  esac
fi

# 6) Manifest 指纹注入校验（手表侧）：
#    期望指纹必须出现，占位符必须消失。
if [ -n "$EXPECT_FINGERPRINT" ]; then
  if printf '%s' "$MANIFEST_TEXT" | grep -q 'CONFIGURE_WITH_SIGNED_PHONE_FINGERPRINT'; then
    echo "FAIL: HAP manifest still contains the fingerprint placeholder: $HAP" >&2
    exit 1
  fi
  if ! printf '%s' "$MANIFEST_TEXT" | grep -qF "$EXPECT_FINGERPRINT"; then
    echo "FAIL: HAP manifest does not contain the injected fingerprint: $HAP" >&2
    exit 1
  fi
fi

SHA="$(sha256sum "$HAP" | awk '{print $1}')"
echo "HAP_OK path=$HAP manifest=$MANIFEST size=$SIZE mode=${MODE:-unknown} sha256=$SHA note=container-and-manifest-check-only"
