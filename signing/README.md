# 签名材料目录（内容不入库）

**本目录下的密钥、证书、profile、口令一律不提交。**
`.gitignore` 用两条独立规则兜底：`/signing/*`（本目录只放行本 README）
以及按扩展名的 `*.p12` / `*.cer` / `*.p7b` / `*.csr`。
新增文件后请用 `git check-ignore -v <文件>` 复核，别只看 `git status`
（被忽略的文件在 `git status` 里本来就不显示，容易误判为"已提交"）。

## 文件

| 文件 | 是什么 | 能否复用 |
|---|---|---|
| `shared-signing-key.p12` | ECDSA P-256 私钥。别名 `sujian_signing_20261007` | **可复用**（见下） |
| `suyue-debug.cer` | 素阅的**调试**证书（华为签发） | 按应用签发 |
| `suyue-debug.p7b` | 素阅的**调试** provisioning profile | 按应用签发 |
| `credentials.env` | p12 的别名与口令（`KEY_ALIAS`/`STORE_PASSWORD`/`KEY_PASSWORD`） | — |

## 为什么私钥可以复用，证书和 profile 不能

这一点此前文档写成了"素笺的证书不能复用"，容易读成整套材料都不能用，
**不准确**。实际情况是：AGC 的调试证书是从提交的 CSR 签发的，只要
**同一对密钥**就可以为不同应用分别签发证书和 profile。

用公钥指纹实测核对（`openssl pkey -pubin -outform DER | openssl dgst -sha256`）：

```text
素笺 p12 内的证书公钥        : 3df9743c1798f495ca22e2960affe26289d9a1fdf229abc16c9b67f460a61360
素阅 suyue-debug.p7b 内开发证书: 3df9743c1798f495ca22e2960affe26289d9a1fdf229abc16c9b67f460a61360
```

两者完全一致 → 素笺那把私钥就是素阅的私钥，签名可以直接用。

但 **证书和 profile 是按应用走的**：`suyue-debug.p7b` 里

- `bundle-name`: `com.xiwei.suyue`
- `type`: `debug`，`device-ids` 绑定了 2 个 UDID（`device-id-type: udid`）
- `validity`: 2026-10-09 → 2027-10-09
- `developer-id`: `70086000204331993`，`issuer`: `app_gallery`

profile 绑定包名，**它授权的是 `com.xiwei.suyue`**。

## 包名已对齐（issue #2）

profile 授权 `com.xiwei.suyue`，手表工程原先用历史包名
`com.xiwei753.gt4reader.watch`，两者不一致。已按指示把**手表 HAP 的包名**
改成 `com.xiwei.suyue`，四处同步：

| 位置 | 值 |
|---|---|
| `apps/watch/entry/src/main/config.json` → `app.bundleName` | `com.xiwei.suyue` |
| `apps/watch/.../wear/PeerConfig.js` → `WATCH_BUNDLE_NAME` | `com.xiwei.suyue` |
| `apps/phone/.../model/PeerIdentity.ets` → `WATCH_PEER.bundleName` | `com.xiwei.suyue` |
| `tools/build_watch_lite.sh` / `watch_lite_hap.yml` 的 `--bundle` | `com.xiwei.suyue` |

`tests/source-contract.test.mjs` 现在会强制校验这三处一致，
避免以后只改一处。

**手机端包名仍是 `com.xiwei753.gt4reader.phone`**，它作为对端被手表
`config.json` 的 `supportLists` 与 `PeerConfig.PHONE_BUNDLE_NAME` 引用
（14 处）。若以后也要改名，必须同样整体同步，并且需要 AGC 为它单独
建应用、签发 profile。

## 用法

CI 走 `tools/inject_signing.py`（`secrets.WATCH_SIGNING_MATERIAL`，JSON +
base64），把材料落盘、写 `signingConfigs`、注入指纹，构建后清理并
`git checkout` 还原配置。本地调试可直接改 `apps/watch/build-profile.json5`
的 `signingConfigs` 后运行 `tools/build_watch_lite.sh release`，
**构建完记得 `git checkout -- apps/watch/build-profile.json5` 还原**，
不要把签名路径和口令留在被跟踪的文件里。
