# GT 4 46mm 安装与构建说明（已编译并签名，未实机安装）

> 状态（issue #2 更新）：**手表 Lite 工程已在本机真实编译并签名成功**，
> 产出 `entry-default-release-signed.hap`（215,323 字节），`signed=yes`，
> `verify-app` 报 `Digest verify result: true` / `verify: Verify success`；
> 包内嵌的是手表自己的 profile（`bundle-name: con.xiwei.suyue.gt4`，
> 授权设备含 GT 4 的 UDID）。
> 但**从未在 GT 4 上安装**——签名有效不等于设备接受安装。
> 第 1 阶段验收：**暂不通过**，剩下的阻断只有真机安装与运行验证。

## 前置条件

1. HUAWEI WATCH GT 4 46mm（466×466 圆屏），确认系统版本。
2. 已注册的华为开发者账号；设备已登记为调试设备。
3. **已验证可用**的 Lite Wearable 工具链：HarmonyOS Command Line
   Tools 26.0.0.821（Linux x64）。关键路径：
   - `$HOME/.harmony-cli/bin/hvigorw`（包装脚本，自动设置
     `DEVECO_NODE_HOME` 与 `DEVECO_SDK_HOME`）
   - `$HOME/.harmony-cli/sdk/default/openharmony/js` —— Lite JS SDK，
     含 `@system.file` / `@system.device` / `@system.router` /
     `@system.storage` / `@system.prompt`
   - `$HOME/.harmony-cli/sdk/default/openharmony/js/build-tools/ace-loader/bin/jerry-snapshot`
   - `$HOME/.harmony-cli/sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar`
   - `$HOME/.harmony-cli/tool/node`（hvigor 自带的 Node）
4. 签名材料放在仓库内 **gitignore 掉的** `signing/` 目录（或用
   `WATCH_SIGN_*` 环境变量指向别处）。按用途分目录，详细说明见
   [signing/README.md](../signing/README.md)：

   ```text
   signing/shared/  两端共用：私钥 shared-signing-key.p12、
                    账号级调试证书链 debug.cer、口令 credentials.env
   signing/watch/   手表 (con.xiwei.suyue.gt4) 的 debug.p7b
   signing/phone/   手机 (com.xiwei.suyue) 的 debug.p7b
   ```

   - 私钥可复用：与素笺**共用同一对密钥**（公钥指纹 `3df9743c…` 实测一致）；
   - 证书**也可以复用**：它是**账号级**的——把两张 profile 内嵌的
     `development-certificate` 取出来算 DER-SHA256，结果完全相同
     （`fbdee2e1…`）。真正不同的是 `app-identifier`。
   - Profile `.p7b` **按应用签发**，不能跨应用顶替。手机那个
     （`bundle-name: com.xiwei.suyue`、2 个 UDID）不能签手表。
   - 手表的 profile 已就位：`bundle-name: con.xiwei.suyue.gt4`、
     `app-identifier: 6917618615525663621`、授权设备 1 个（GT 4 的 UDID）、
     有效期到 2027-10-09。**注意 `con` 不是笔误**，见
     [signing/README.md](../signing/README.md)。

## 本地构建（已验证）

```bash
tools/build_watch_lite.sh release    # 或 debug
```

脚本要求 `hvigorw` 存在于 PATH；缺失时明确报错退出，不会把 Node
静态检查伪装成构建成功。构建成功后输出 HAP 路径、大小与 SHA-256。

**新包名的实测结果（`tools/build_watch_lite.sh release`）**：

```text
Signing entry-default-unsigned.hap -> entry-default-release-signed.hap
sign-app success
Verifying signature of entry-default-release-signed.hap
Digest verify result: true, DigestAlgorithm: SHA-256
verify: Verify success
HAP_OK path=.../entry-default-release-signed.hap manifest=config.json
       size=215323 mode=release signed=yes
```

签名 HAP 内嵌的 profile（`verify-app -outProfile` 取出后解析）：

```text
bundle-name : con.xiwei.suyue.gt4
app-id      : 6917618615525663621
type        : debug
授权设备    : 90D08F2ED3A4387E0F0561C82A39B87B28E0F32BAE51F0CC634FBC1B7124A459
```

> 更能说明问题的是：拿**另一个应用**的 profile 去签，`hap-sign-tool`
> 照样报 `Sign Hap success!`、`verify-app` 也报 `Verify success`，
> 但设备按包名校验会拒绝安装。所以脚本现在会在签名前比对包名，
> 不匹配直接拒绝签名——`signed=yes` 必须同时意味着包名一致。

- 包内快照齐全：`app.bc` (806 B)、`pages/index/index.bc` (29,938 B)、
  `pages/reader/reader.bc` (21,802 B)。
- 资源：`icon.png.bin` 43,272 B、`icon_small.png.bin` 33,864 B。
- **包名预检是刻意的**：拿手机的 profile 签手表 HAP，`hap-sign-tool`
  照样报 `Sign Hap success!`、`verify-app` 也报 `Verify success`，
  但设备按包名校验会拒绝安装——那种"签名成功"是假绿灯，所以脚本
  在不匹配时直接不签。本次能签成，正因为包名与 profile 逐字一致。
- **不要用 hvigor 的 `signingConfigs`**：本机实测在该 legacy Lite 工程上
  `SignHap` 直接失败——
  `Error Code: 00308018 ENOENT: no such file or directory, stat '<dir>/material'`。
  素笺 CI 用的是同一条绕行路径（未签名构建 + `hap-sign-tool sign-app`）。
- **`verify-app` 的输出文件必须用 `.cer` 后缀**：写成 `.crt` 会报
  `Error Message: Not support file`（实测）。
- **SHA-256 不可复现**：同一源码重编两次字节数相同但摘要不同
  （打包写入时间戳）。验收请比对 `.bc` 条目与体积。

## CI

- `.github/workflows/watch_lite_hap.yml` 运行在自托管 runner（label：`hmos-deveco`）。
- 签名材料从 `secrets.WATCH_SIGNING_MATERIAL` 注入，临时落盘、构建后删除、日志不回显。
- 缺少签名材料时构建失败并明确报出“签名不可用”，不会报告“签名成功”。
- Artifact 仅上传 HAP 本体，不包含工具链目录。
- `runs-on: [self-hosted, hmos-deveco]` 需要真实注册一台装了 Lite SDK 的
  runner。**没有 runner 时 job 只会长期排队：既不是“构建通过”，也不是
  “构建失败”，而是“从未运行”**——不能把排队当作绿灯。GitHub 托管机
  装不了 Lite SDK（Huawei 的 command-line-tools 需先接受其许可），所以
  在 runner 注册之前，构建证据只能来自本机 `tools/build_watch_lite.sh`。
- 源码级检查（`.github/workflows/pagination-test.yml`）跑在 ubuntu-latest，
  用 glob 执行 `tests/*.test.mjs` 全量用例，其中
  `tests/source-contract.test.mjs` 会拦下"正则字面量"这类会让快照静默失败的写法。

## 安装到 GT 4（待验证路径）

候选路径（按优先级）：
1. DevEco Assistant / HDEA 经配对手机中转安装到 GT 4。
2. 若 Pocket 2（HarmonyOS 7）无法运行对应安装助手，寻找实际兼容的安卓/鸿蒙旧手机做中转。

安装后验证清单：
- [ ] 应用出现在手表桌面，名称为「素阅」
- [ ] 本地测试书可打开、前后翻页、退出重进恢复进度
- [ ] 圆屏 466×466 安全区域内文字不被裁切
- [ ] 表冠旋转是否真的下发到 `onCrownChange`（读 `pageHint` 是否出现
      "表冠待真机验证"即可确认隐藏 slider 挂载成功）；未送达则维持触屏
      翻页，并按实测手感调整 `reader/CrownInput.js` 的 `STEPS_PER_PAGE`
- [ ] `font-size` 是否真能取 14–32px 的连续值（SDK 的 CSS 配置对
      `line-height` 标注支持 v3.0，但 `font-size` 条目写着"仅支持
      30px 和 38px"，该说明归属哪个组件尚不明确，需真机核对；
      `line-height` 在编译期会出非致命告警）

## 已知未决

- `targetSdkVersion` / `compatibleSdkVersion` 的 `6.1.1(24)` 来自轻智能手表示例模板，
  **尚未确认为 GT 4 开发安装实际可用的版本**；需在真实 DevEco 环境中核对。
- Wear Engine 接收依赖手机端证书指纹，尚未配置（见 `wear/PeerConfig.js`）。
- **真机安装与运行尚未做**：签名通过只证明 HAP 完整、证书链有效、
  包名与 profile 一致。设备端还会校验该 UDID 是否在授权列表、有效期与
  设备调试状态。这些都没在 GT 4 上验证过，因此第 1 阶段"可安装"验收
  **尚未达成**，不能关闭议题 #2。
- **回执通道的 `deviceId` 是占位值**：`wear/WearReceiver.js` 里
  `deviceId: 'remote'` 取自上游 Lite 示例、**从未真机确认**。现已改为
  优先采用从订阅回调探测到的真实 `deviceId`，探测不到才回退并告警一次；
  这条回执路径仍未验证。
- **CI 的签名代码已同步**：`watch_lite_hap.yml` 已改为 unsigned HAP →
  `hap-sign-tool sign-app` → `verify-app`，但自托管 Runner 仍排队，尚无新包名构建证据。
- 手机包名已改为 `com.xiwei.suyue`（对应现有 AGC 应用与证书），
  但**手机 HAP 仍未构建**；手表包名已改为 `con.xiwei.suyue.gt4`，
  需要在 AGC 注册相同包名并签发包含 GT4 UDID 的独立调试 Profile。
