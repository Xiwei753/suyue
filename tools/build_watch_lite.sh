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

# ---- 签名（issue #2 实测路径）----------------------------------------
# 为什么不用 hvigor 的 signingConfigs：在 Lite（legacyAppTasks/
# legacyHapTasks）工程上实测失败——
#   ERROR: Failed :entry:default@SignHap
#   Error Code: 00308018  ENOENT: stat '<dir>/material'
# 即使 build-profile.json5 里的 signingConfigs 形状与该 SDK 的 Stage
# 工程完全一致，legacy Lite 的 SignHap 仍去找一个不存在的 material
# 目录。素笺的 CI 早就改成同一套绕行方案：**先出未签名包，再用
# hap-sign-tool sign-app 直接签名**。这里采用同一条已验证路径。
#
# 材料来源（按优先级）：
#   1. 环境变量 WATCH_SIGN_P12 / WATCH_SIGN_CER / WATCH_SIGN_PROFILE
#      + WATCH_SIGN_KEY_ALIAS / WATCH_SIGN_KEY_PASSWORD /
#        WATCH_SIGN_STORE_PASSWORD（CI 用，来自 Secrets）
#   2. $REPO_ROOT/signing/（本地，内容已被 .gitignore 挡住）
# 两者都缺就保持未签名，并明确报"不可安装"，绝不假装签名成功。
SIGNING_DIR="${WATCH_SIGNING_DIR:-$REPO_ROOT/signing}"
SIGN_P12="${WATCH_SIGN_P12:-}"
SIGN_CER="${WATCH_SIGN_CER:-}"
SIGN_PROFILE="${WATCH_SIGN_PROFILE:-}"
SIGN_ALIAS="${WATCH_SIGN_KEY_ALIAS:-}"
SIGN_KEY_PWD="${WATCH_SIGN_KEY_PASSWORD:-}"
SIGN_STORE_PWD="${WATCH_SIGN_STORE_PASSWORD:-}"

if [ -z "$SIGN_P12" ] && [ -d "$SIGNING_DIR" ]; then
  # 本地目录约定：见 signing/README.md
  [ -f "$SIGNING_DIR/credentials.env" ] && {
    set -a; . "$SIGNING_DIR/credentials.env"; set +a
    SIGN_ALIAS="${WATCH_SIGN_KEY_ALIAS:-${KEY_ALIAS:-$SIGN_ALIAS}}"
    SIGN_KEY_PWD="${WATCH_SIGN_KEY_PASSWORD:-${KEY_PASSWORD:-$SIGN_KEY_PWD}}"
    SIGN_STORE_PWD="${WATCH_SIGN_STORE_PASSWORD:-${STORE_PASSWORD:-$SIGN_STORE_PWD}}"
  }
  P12_CANDIDATE="$(find "$SIGNING_DIR" -maxdepth 1 -name '*.p12' -type f 2>/dev/null | head -n 1)"
  CER_CANDIDATE="$(find "$SIGNING_DIR" -maxdepth 1 -name '*.cer' -type f 2>/dev/null | head -n 1)"
  PROFILE_CANDIDATE="$(find "$SIGNING_DIR" -maxdepth 1 -name '*.p7b' -type f 2>/dev/null | head -n 1)"
  [ -n "$P12_CANDIDATE" ] && SIGN_P12="$P12_CANDIDATE"
  [ -n "$CER_CANDIDATE" ] && SIGN_CER="$CER_CANDIDATE"
  [ -n "$PROFILE_CANDIDATE" ] && SIGN_PROFILE="$PROFILE_CANDIDATE"
fi

HAP_SIGN_TOOL="${HAP_SIGN_TOOL_JAR:-}"
if [ -z "$HAP_SIGN_TOOL" ]; then
  for candidate in \
    "$HOME/.harmony-cli/sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar" \
    "$HOME/command-line-tools/sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar" \
    /opt/deveco/toolchains/lib/hap-sign-tool.jar; do
    [ -f "$candidate" ] && HAP_SIGN_TOOL="$candidate" && break
  done
fi

SIGNED_HAP=""
if [ -n "$SIGN_P12" ] || [ -n "$SIGN_CER" ] || [ -n "$SIGN_PROFILE" ]; then
  missing=""
  [ -f "$SIGN_P12" ] || missing="$missing WATCH_SIGN_P12"
  [ -f "$SIGN_CER" ] || missing="$missing WATCH_SIGN_CER"
  [ -f "$SIGN_PROFILE" ] || missing="$missing WATCH_SIGN_PROFILE"
  [ -n "$SIGN_ALIAS" ] || missing="$missing WATCH_SIGN_KEY_ALIAS"
  [ -n "$SIGN_KEY_PWD" ] || missing="$missing WATCH_SIGN_KEY_PASSWORD"
  [ -n "$SIGN_STORE_PWD" ] || missing="$missing WATCH_SIGN_STORE_PASSWORD"
  if [ -n "$missing" ]; then
    echo "ERROR: 签名材料不完整，缺少：$missing" >&2
    echo "       拒绝用残缺材料签名（半套材料签出来的包不能装，却看着像成功）。" >&2
    exit 1
  fi
  if [ -z "$HAP_SIGN_TOOL" ]; then
    echo "ERROR: 找不到 hap-sign-tool.jar（可用 HAP_SIGN_TOOL_JAR 指定）。" >&2
    exit 1
  fi

  # 包名预检：profile 授权的包名必须等于本 HAP 的包名。
  # 本机实测过这个坑：拿**手机**的 profile（com.xiwei.suyue）去签
  # **手表** HAP（com.xiwei753.gt4reader.watch），hap-sign-tool 照样
  # 报 "Sign Hap success!"——证书链有效，但设备按包名校验会拒绝安装。
  # 所以签名前先比对，不匹配就**不签**，退回未签名并说明原因。
  SIGN_MISMATCH=""
  if command -v python3 >/dev/null 2>&1; then
    PROFILE_JSON="$OUT_DIR/profile-check.json"
    java -jar "$HAP_SIGN_TOOL" verify-profile -inFile "$SIGN_PROFILE" \
      -outFile "$PROFILE_JSON" >/dev/null 2>&1 || true
    PROFILE_BUNDLE=""
    if [ -s "$PROFILE_JSON" ]; then
      PROFILE_BUNDLE="$(python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
c = d.get("content")
if isinstance(c, str):
    c = json.loads(c)
print((c.get("bundle-info") or {}).get("bundle-name", ""))
' "$PROFILE_JSON" 2>/dev/null)"
    fi
    rm -f "$PROFILE_JSON"
    HAP_BUNDLE="$(unzip -p "$HAP" config.json 2>/dev/null | python3 -c '
import json, sys
print(json.load(sys.stdin).get("app", {}).get("bundleName", ""))
' 2>/dev/null)"
    if [ -z "$PROFILE_BUNDLE" ]; then
      echo "WARN: 无法从 profile 解析 bundle-name，跳过包名预检。" >&2
    elif [ "$PROFILE_BUNDLE" != "$HAP_BUNDLE" ]; then
      SIGN_MISMATCH="$PROFILE_BUNDLE != $HAP_BUNDLE"
    fi
  else
    echo "WARN: 没有 python3，跳过 profile 包名预检。" >&2
  fi

  if [ -n "$SIGN_MISMATCH" ]; then
    cat >&2 <<MSG

========================================================================
拒绝签名：签名 profile 授权的包名与本 HAP 不一致。
   profile 授权 : ${SIGN_MISMATCH%% != *}
   HAP 声明     : ${SIGN_MISMATCH##* != }
签出来的包证书链有效，但设备按包名校验会拒绝安装——"签名成功"
在这里没有意义。本次退回**未签名产物**。
正确做法：把手表自己的证书/profile 放进 signing/（或设 WATCH_SIGN_*），
不要用别的应用的 profile 顶替。
========================================================================
MSG
  else
  SIGNED_HAP="$OUT_DIR/entry-default-$MODE-signed.hap"
  echo "Signing $HAP -> $(basename "$SIGNED_HAP")"
  java -jar "$HAP_SIGN_TOOL" sign-app \
    -keyAlias "$SIGN_ALIAS" \
    -signAlg SHA256withECDSA \
    -mode localSign \
    -appCertFile "$SIGN_CER" \
    -profileFile "$SIGN_PROFILE" \
    -inFile "$HAP" \
    -keystoreFile "$SIGN_P12" \
    -outFile "$SIGNED_HAP" \
    -keyPwd "$SIGN_KEY_PWD" \
    -keystorePwd "$SIGN_STORE_PWD" \
    2>&1 | sed -e "s|$SIGN_KEY_PWD|<redacted>|g" -e "s|$SIGN_STORE_PWD|<redacted>|g" | tail -3
  if [ ! -s "$SIGNED_HAP" ]; then
    echo "ERROR: hap-sign-tool 报成功但没有产出 signed HAP。" >&2
    exit 1
  fi
  # 证书签名验证必须真做，不能用"ZIP/清单检查"代替。
  # 输出文件后缀必须是 .cer：只有 .crt 时 hap-sign-tool 会报
  # "Not support file: ...verify.crt"（本机 Lite HAP 实测）。
  echo "Verifying signature of $(basename "$SIGNED_HAP")"
  if ! java -jar "$HAP_SIGN_TOOL" verify-app \
      -inFile "$SIGNED_HAP" \
      -outCertChain "$OUT_DIR/verify.cer" \
      -outProfile "$OUT_DIR/verify.p7b" > "$OUT_DIR/verify.log" 2>&1; then
    echo "ERROR: verify-app 失败，签名未通过校验——拒绝标记为成功。" >&2
    tail -5 "$OUT_DIR/verify.log" >&2
    exit 1
  fi
  if ! grep -q 'verify-app success' "$OUT_DIR/verify.log"; then
    echo "ERROR: verify-app 没有报告 success——拒绝标记为成功。" >&2
    tail -5 "$OUT_DIR/verify.log" >&2
    exit 1
  fi
  grep -E 'Digest verify result|verify:' "$OUT_DIR/verify.log" | sed 's/^[0-9-]* [0-9:.]* *INFO - //'
  rm -f "$OUT_DIR/verify.cer" "$OUT_DIR/verify.p7b" "$OUT_DIR/verify.log"
  HAP="$SIGNED_HAP"
  UNSIGNED=0
  fi
fi

"$REPO_ROOT/tests/build_artifact_check.sh" \
  "$REPO_ROOT/apps/watch/$HAP" \
  --bundle 'com.xiwei753.gt4reader.watch' \
  --device liteWearable \
  --mode "$MODE"

if [ "$UNSIGNED" = "1" ]; then
  cat >&2 <<'MSG'

========================================================================
注意：本次产物是 **未签名 HAP**，不可安装到 GT 4。

两种原因之一（上面的日志会指明是哪种）：
  1. 没有找到签名材料：WATCH_SIGN_* 未设置，且
     $REPO_ROOT/signing/ 下没有 .p12/.cer/.p7b；
  2. 找到了 profile，但它授权的包名与本 HAP 不一致，已拒绝签名。

材料就位后本脚本会自动走已验证的路径：未签名构建 →
hap-sign-tool sign-app → verify-app，产物名为
entry-default-<mode>-signed.hap。

签名材料说明与包名注意事项见 signing/README.md。
本轮构建成功 ≠ 第 1 阶段验收通过。
========================================================================
MSG
fi
