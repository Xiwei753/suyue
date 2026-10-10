#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# 共用：用本机 hap-sign-tool 给已构建好的 HAP 做外部签名 + 验签。
#
# 为什么单独抽出来：手表（Lite）和手机（Stage）是两个不同的华为应用，
# 签名前必须比对 profile 授权的包名与 HAP 声明的包名，且验证必须真做。
# 这套规则只写一份，避免两个构建脚本各写一遍后慢慢漂移。
#
# 为什么不用 hvigor 的 signingConfigs：本机实测在 legacy Lite 工程上
# SignHap 直接失败（00308018 ENOENT: stat '<dir>/material'）；
# Stage 工程的 signingConfigs 也为空。素笺 CI 用的是同一条绕行路径。
set -euo pipefail

IN=""
OUT=""
EXPECT_BUNDLE=""
P12=""
CER=""
PROFILE=""
ALIAS=""
KEY_PWD=""
STORE_PWD=""
TOOL=""
SOURCE_MANIFEST=""  # Lite 单 .bin 容器无顶层 config.json，必须绑定本次源码清单
HAP_KIND="unknown"

while [ $# -gt 0 ]; do
  case "$1" in
    --in) IN="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --bundle) EXPECT_BUNDLE="$2"; shift 2 ;;
    --p12) P12="$2"; shift 2 ;;
    --cer) CER="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --alias) ALIAS="$2"; shift 2 ;;
    --key-pwd) KEY_PWD="$2"; shift 2 ;;
    --store-pwd) STORE_PWD="$2"; shift 2 ;;
    --tool) TOOL="$2"; shift 2 ;;
    --source-manifest) SOURCE_MANIFEST="$2"; shift 2 ;;
    *) echo "sign_hap.sh: 未知参数 $1" >&2; exit 2 ;;
  esac
done

for v in IN OUT EXPECT_BUNDLE P12 CER PROFILE ALIAS KEY_PWD STORE_PWD TOOL; do
  if [ -z "${!v}" ]; then
    echo "sign_hap.sh: 缺少参数 --$(echo "$v" | tr 'A-Z_' 'a-z-')" >&2
    exit 2
  fi
done
[ -f "$IN" ] || { echo "sign_hap.sh: 输入 HAP 不存在：$IN" >&2; exit 1; }
[ -f "$TOOL" ] || { echo "sign_hap.sh: 找不到 hap-sign-tool.jar：$TOOL" >&2; exit 1; }

WORK="$(dirname "$OUT")"

# ---------- 包名预检 ----------
# 拿另一个应用的 profile 去签，hap-sign-tool 照样报 "Sign Hap success!"、
# verify-app 也报 Verify success，但设备按包名校验会拒绝安装。
# 那种"签名成功"是假绿灯，所以这里先比对，不匹配直接拒绝。
if command -v python3 >/dev/null 2>&1; then
  PROFILE_JSON="$WORK/.profile-check.json"
  java -jar "$TOOL" verify-profile -inFile "$PROFILE" \
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
  # 普通 Stage/Lite 多文件 HAP 直接读归档内 manifest；
  # legacy Lite debug 的 HAP 顶层可能只有一个 *.bin，不能据此把包名认作空。
  # 仅对严格单 .bin 结构，允许从**同一次构建**的源码 config.json
  # 交叉核对包名与 deviceType。这是源码身份校验，不谎称从 bin 反解出包名。
  if ! HAP_IDENTITY="$(python3 - "$IN" "$SOURCE_MANIFEST" <<'PY'
import json, sys, zipfile
hap, source = sys.argv[1:]
with zipfile.ZipFile(hap) as z:
    names = [item.filename for item in z.infolist()]
    lite_bin = (len(names) == 1 and names[0].endswith(".bin")
                and "/" not in names[0] and "\\" not in names[0])
    if lite_bin:
        if not source:
            raise ValueError("Lite single-bin HAP requires --source-manifest")
        with open(source, encoding="utf-8") as f:
            d = json.load(f)
        if "liteWearable" not in (d.get("module", {}).get("deviceType") or []):
            raise ValueError("source manifest is not a Lite Wearable manifest")
        kind = "lite-bin"
    else:
        d = None
        for cand in ("config.json", "module.json", "modules.json"):
            if cand in names:
                d = json.loads(z.read(cand).decode("utf-8"))
                break
        if d is None:
            raise ValueError("HAP has no recognized manifest and is not a single-bin Lite HAP")
        kind = "manifest"
    bundle = (d.get("app") or {}).get("bundleName", "")
    if not bundle:
        raise ValueError("HAP/source manifest has no app.bundleName")
    print(kind)
    print(bundle)
PY
  )"; then
    echo "ERROR: 无法确认 HAP 类型/包名；拒绝签名。" >&2
    exit 3
  fi
  HAP_KIND="$(printf '%s\n' "$HAP_IDENTITY" | head -n 1)"
  HAP_BUNDLE="$(printf '%s\n' "$HAP_IDENTITY" | tail -n 1)"
  if [ "$HAP_KIND" = "lite-bin" ] && [ -z "$PROFILE_BUNDLE" ]; then
    echo "ERROR: Lite 单 bin 包无法读取内嵌清单，必须成功解析 profile 包名才可签名。" >&2
    exit 3
  fi
  if [ -z "$PROFILE_BUNDLE" ]; then
    echo "WARN: 无法从 profile 解析 bundle-name，跳过包名预检。" >&2
  elif [ "$PROFILE_BUNDLE" != "$HAP_BUNDLE" ]; then
    cat >&2 <<MSG

========================================================================
拒绝签名：签名 profile 授权的包名与本 HAP 不一致。
   profile 授权 : $PROFILE_BUNDLE
   HAP 声明     : $HAP_BUNDLE
签出来的包证书链有效，但设备按包名校验会拒绝安装——"签名成功"
在这里没有意义。本次退回**未签名产物**。
正确做法：把该应用自己的 profile 放进 signing/ 对应目录
（signing/watch/ 或 signing/phone/）。
========================================================================
MSG
    exit 3
  fi
  if [ -n "$EXPECT_BUNDLE" ] && [ "$EXPECT_BUNDLE" != "$HAP_BUNDLE" ]; then
    echo "sign_hap.sh: HAP 包名 $HAP_BUNDLE 与期望的 $EXPECT_BUNDLE 不符" >&2
    exit 1
  fi
else
  echo "ERROR: 没有 python3，无法验证 HAP/profile 身份；拒绝签名。" >&2
  exit 1
fi

# ---------- 签名 ----------
echo "Signing $(basename "$IN") -> $(basename "$OUT")"
java -jar "$TOOL" sign-app \
  -keyAlias "$ALIAS" \
  -signAlg SHA256withECDSA \
  -mode localSign \
  -appCertFile "$CER" \
  -profileFile "$PROFILE" \
  -inFile "$IN" \
  -keystoreFile "$P12" \
  -outFile "$OUT" \
  -keyPwd "$KEY_PWD" \
  -keystorePwd "$STORE_PWD" \
  2>&1 | sed -e "s|$KEY_PWD|<redacted>|g" -e "s|$STORE_PWD|<redacted>|g" | tail -3
if [ ! -s "$OUT" ]; then
  echo "ERROR: hap-sign-tool 报成功但没有产出 signed HAP。" >&2
  exit 1
fi

# ---------- 验签（必须真做，不能用 ZIP/清单检查代替）----------
# -outCertChain 必须用 .cer 后缀：写成 .crt 会报
# "Not support file: ...verify.crt"（本机实测）。
echo "Verifying signature of $(basename "$OUT")"
if ! java -jar "$TOOL" verify-app \
    -inFile "$OUT" \
    -outCertChain "$WORK/.verify.cer" \
    -outProfile "$WORK/.verify.p7b" > "$WORK/.verify.log" 2>&1; then
  echo "ERROR: verify-app 失败，签名未通过校验——拒绝标记为成功。" >&2
  tail -5 "$WORK/.verify.log" >&2
  exit 1
fi
if ! grep -q 'verify-app success' "$WORK/.verify.log"; then
  echo "ERROR: verify-app 没有报告 success——拒绝标记为成功。" >&2
  tail -5 "$WORK/.verify.log" >&2
  exit 1
fi
# Lite 单 bin 的签名只能增加签名信息，不得修改包内文件形状或原始 bin。
# 如果签名工具把 ZIP 改成多条目，HDEA 依然会说 "not one standard hap"。
if [ "$HAP_KIND" = "lite-bin" ]; then
  if ! python3 - "$IN" "$OUT" <<'PY'
import hashlib, sys, zipfile
def extract(hap):
    with zipfile.ZipFile(hap) as z:
        files = z.infolist()
        if len(files) != 1 or not files[0].filename.endswith(".bin"):
            raise ValueError("signed Lite HAP must contain exactly one .bin")
        if "/" in files[0].filename or "\\" in files[0].filename:
            raise ValueError("single .bin must be at the HAP root")
        data = z.read(files[0])
        return files[0].filename, hashlib.sha256(data).digest()
if extract(sys.argv[1]) != extract(sys.argv[2]):
    raise ValueError("signing modified the Lite .bin payload")
print("LITE_BIN_SIGNED_OK: exactly one unchanged .bin")
PY
  then
    echo "ERROR: 签名后单 bin 的内容或布局发生变化，拒绝发布。" >&2
    exit 1
  fi
fi

grep -E 'Digest verify result|verify:' "$WORK/.verify.log" \
  | sed 's/^[0-9-]* [0-9:.]* *INFO - //'
rm -f "$WORK/.verify.cer" "$WORK/.verify.p7b" "$WORK/.verify.log"
echo "SIGNED_HAP=$OUT"
