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

# 2) 模块清单存在。实测三种叫法都要认：
#      module.json  —— Stage HAP（本仓库手机端；内含 app + module）
#      modules.json —— 部分 HSP/旧打包
#      config.json  —— Lite FA（本仓库手表端）
if unzip -l "$HAP" module.json >/dev/null 2>&1; then
  MANIFEST="module.json"
elif unzip -l "$HAP" modules.json >/dev/null 2>&1; then
  MANIFEST="modules.json"
elif unzip -l "$HAP" config.json >/dev/null 2>&1; then
  MANIFEST="config.json"
else
  echo "FAIL: HAP contains no module.json / modules.json / config.json: $HAP" >&2
  exit 1
fi

MANIFEST_TEXT="$(unzip -p "$HAP" "$MANIFEST" 2>/dev/null)"

# 3) 包名。
if [ -n "$BUNDLE" ]; then
  case "$MANIFEST" in
    module.json|modules.json)
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
    module.json|modules.json)
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
#    例外：未配置 signingConfigs 时 hvigor 产出
#    entry-default-unsigned.hap，名字里没有 buildMode
#    段（本机实测）。这种产物**不可安装**，mode 无从
#    核对，因此这里跳过 mode 交叉检查，但把 signed=no
#    记进结论行，绝不当作签名成功。
SIGNED_STATE="unknown"
if [ -n "$MODE" ]; then
  BASENAME="$(basename "$HAP")"
  case "$BASENAME" in
    *-unsigned.hap)
      SIGNED_STATE="no"
      echo "WARN: HAP is unsigned (no signingConfigs): $BASENAME" >&2
      echo "      未签名产物不可安装到 GT 4；本轮不能据此宣称阶段验收通过。" >&2
      ;;
    *)
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
      case "$BASENAME" in
        *-signed.hap) SIGNED_STATE="yes" ;;
      esac
      ;;
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

# 7) Lite Wearable 快照完整性（issue #2 新增）。
#    ace-loader 的 lite-snapshot-plugin 逐个调用 jerry-snapshot，
#    把每个页面 JS 编译成 .bc 快照；**失败时只打印一行
#    "Failed to convert ... to a snapshot."，并不会让构建失败**。
#    结果是 BUILD SUCCESSFUL、HAP 也产出了，但缺少该页 .bc，
#    手表上打不开这个页面——绿色构建掩盖了坏应用。
#    实测触发原因：该 JerryScript 构建没有 RegExp，正则字面量在
#    解析期报 SyntaxError（详见 apps/watch/.../util/Validate.js）。
#    这里把"缺快照"变成硬失败，不再靠人眼翻构建日志。
if [ "$DEVICE" = "liteWearable" ]; then
  ENTRIES="$(unzip -Z1 "$HAP" 2>/dev/null)" || ENTRIES=""
  if [ -z "$ENTRIES" ]; then
    echo "FAIL: cannot list HAP entries (unzip -Z1 unavailable): $HAP" >&2
    exit 1
  fi
  MISSING=""
  for entry in $ENTRIES; do
    case "$entry" in
      *.js)
        base="${entry%.js}"
        if ! printf '%s\n' "$ENTRIES" | grep -qxF "$base.bc"; then
          MISSING="$MISSING $base.bc"
        fi
        ;;
    esac
  done
  if [ -n "$MISSING" ]; then
    echo "FAIL: Lite HAP is missing JerryScript snapshots for:$MISSING" >&2
    echo "      hvigor 会报 BUILD SUCCESSFUL，但这些页面在设备上起不来。" >&2
    echo "      lite-snapshot-plugin 只打印错误，不会让构建失败；" >&2
    echo "      排查方向见 apps/watch/entry/src/main/js/MainAbility/util/Validate.js。" >&2
    exit 1
  fi
fi

SHA="$(sha256sum "$HAP" | awk '{print $1}')"
echo "HAP_OK path=$HAP manifest=$MANIFEST size=$SIZE mode=${MODE:-unknown} signed=$SIGNED_STATE sha256=$SHA note=container-and-manifest-check-only"
