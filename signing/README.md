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
| `suyue-debug.cer` | 现有调试证书，和 `.p12` 私钥匹配 | 同一账号下用途兼容时可跨应用复用 |
| `suyue-debug.p7b` | **手机**的**调试** provisioning profile | 按应用签发 |
| `credentials.env` | p12 的别名与口令（`KEY_ALIAS`/`STORE_PASSWORD`/`KEY_PASSWORD`） | — |

## 私钥和匹配证书可以复用，但 profile 不能跨包名复用

这一点此前文档写成了"素笺的证书不能复用"，容易读成整套材料都不能用，
**不准确**。实际情况是：AGC 的调试证书是从提交的 CSR 签发的，只要
**同一对密钥**可以在用途与签名类型兼容时跨应用使用同一有效证书，
但各包名必须分别申请匹配的 profile（.p7b）。

用公钥指纹实测核对（`openssl pkey -pubin -outform DER | openssl dgst -sha256`）：

```text
素笺 p12 内的证书公钥        : 3df9743c1798f495ca22e2960affe26289d9a1fdf229abc16c9b67f460a61360
素阅 suyue-debug.p7b 内开发证书: 3df9743c1798f495ca22e2960affe26289d9a1fdf229abc16c9b67f460a61360
```

两者完全一致 → 素笺那把私钥就是素阅的私钥，签名可以直接用。

但 **profile 是按应用走的**：`suyue-debug.p7b` 里

- `bundle-name`: `com.xiwei.suyue`
- `type`: `debug`，`device-ids` 绑定了 2 个 UDID（`device-id-type: udid`）
- `validity`: 2026-10-09 → 2027-10-09
- `developer-id`: `70086000204331993`，`issuer`: `app_gallery`

profile 绑定包名，**它授权的是 `com.xiwei.suyue`**。

## ⚠️ 这套材料是**手机**的，不是手表的

`suyue-debug.p7b` 的 `bundle-info.bundle-name` 是 **`com.xiwei.suyue`**，
这就是**手机应用**的包名（AGC 证书里写定的）。因此：

- 手机包名已按证书对齐为 `com.xiwei.suyue`
  （`AppScope/app.json5`、`PeerIdentity.ets` 的 `PHONE_SELF`、
  手表侧作为对端的 `PeerConfig.PHONE_BUNDLE_NAME` 与 `config.json`
  的 `supportLists`）。
- **手表包名暂未定**，仍保留历史值 `com.xiwei753.gt4reader.watch`，
  等确认后再改。手表与手机的包名由
  `tests/source-contract.test.mjs` 断言「两处一致且互不相同」。
- **本目录的 profile 不能用来签手表 HAP**。`tools/build_watch_lite.sh`
  已加包名预检：profile 授权的包名与 HAP 不一致时**拒绝签名**并退回
  未签名产物。这个坑很隐蔽——拿手机的 profile 签手表 HAP，
  `hap-sign-tool` 照样报 `Sign Hap success!`，但设备按包名校验会拒绝安装。
- 手表自己的 profile 一旦按手表包名签发，可配合现有有效且用途兼容的证书；放进来即可自动启用签名
  （文件名不限，取目录下第一个 `.p12` / `.cer` / `.p7b`）。

## 用法

- **手表（本地已跑通）**：`tools/build_watch_lite.sh release`。脚本按
  `WATCH_SIGN_*` 环境变量 → `signing/` 目录 的顺序找材料，找到且
  **包名匹配**时自动走：未签名构建 → `hap-sign-tool sign-app` →
  `verify-app`，产物 `entry-default-<mode>-signed.hap`。
- **不要用 hvigor 的 `signingConfigs`**：本机实测在该 legacy Lite 工程上
  `SignHap` 直接失败（`00308018 ENOENT: stat '<dir>/material'`），
  即使配置形状与 Stage 工程一致。素笺 CI 用的也是下面的绕行路径。
- **CI（源码已修，仍待 runner 执行）**：`watch_lite_hap.yml` 改用
  `inject_signing.py --external-signing` 只注入身份/Manifest，并将签名凭据
  放在临时目录；`build_watch_lite.sh` 负责 `sign-app` + `verify-app`。
  自托管 runner 尚未执行，不能视为 CI 成功。
- 注意 `verify-app` 的 `-outCertChain` 必须用 `.cer` 后缀；
  用 `.crt` 会报 `Error Message: Not support file`（实测）。
