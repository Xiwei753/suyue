# GT 4 46mm 安装与构建说明（已编译，未签名，未实机安装）

> 状态（issue #2 更新）：**手表 Lite 工程已在本机真实编译成功**，产出
> **旧包名构建**的 `entry-default-unsigned.hap`（192,409 字节，含完整页面快照）。
> 当前源码包名已更新为 `com.xiwei.suyue.gt4`，尚无新包名版本的构建与安装记录。
> **但产物未签名**：`signing/` 里现有的证书/profile 属于**手机**
> （Profile 包名 `com.xiwei.suyue`），与手表 HAP 包名不一致，签名脚本按包名
> 预检**拒绝签名**并退回未签名产物。手表专属的 Profile 尚未签发。
> 也**从未在 GT 4 上安装**。
> 第 1 阶段验收：**暂不通过**，阻断是手表签名材料 + 真机验证。

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
4. 签名材料放在仓库内 **gitignore 掉的** `signing/` 目录
   （或用 `WATCH_SIGN_*` 环境变量指向别处）。详细说明见
   [signing/README.md](../signing/README.md)：
   - 私钥：与素笺**共用同一对密钥**（公钥指纹 `3df9743c…` 实测一致），
     可以复用；
   - 证书 `.cer`：同一账号下有效且用途匹配时，可以与私钥一起跨应用复用；
   - Profile `.p7b`：必须按手表应用包名另行申请，不能拿手机 Profile 顶替。
     **现有 `suyue-debug.p7b` 是手机的**（`bundle-name: com.xiwei.suyue`，
     debug 类型、绑定 2 个 UDID、有效期到 2027-10-09），**不能用来签手表**。
   - 手表专属的 Profile 尚未签发；获得匹配手表包名和 GT4 UDID 的
     `.p7b` 后，结合现有可复用的 `.p12` / `.cer`，即可执行签名。

## 本地构建（已验证）

```bash
tools/build_watch_lite.sh release    # 或 debug
```

脚本要求 `hvigorw` 存在于 PATH；缺失时明确报错退出，不会把 Node
静态检查伪装成构建成功。构建成功后输出 HAP 路径、大小与 SHA-256。

**改包名前的历史实测结果（`tools/build_watch_lite.sh release`，仅作旧包名构建记录）**：

```text
拒绝签名：签名 profile 授权的包名与本 HAP 不一致。
   profile 授权 : com.xiwei.suyue
   HAP 声明     : com.xiwei753.gt4reader.watch
WARN: HAP is unsigned (no signingConfigs): entry-default-unsigned.hap
HAP_OK path=.../entry-default-unsigned.hap manifest=config.json
       size=192409 mode=release signed=no
```

- 包内快照齐全：`app.bc` (806 B)、`pages/index/index.bc` (29,938 B)、
  `pages/reader/reader.bc` (21,802 B)。
- 资源：`icon.png.bin` 43,272 B、`icon_small.png.bin` 33,864 B。
- **包名预检是刻意的**：拿手机的 profile 签手表 HAP，`hap-sign-tool`
  照样报 `Sign Hap success!`、`verify-app` 也报 `Verify success`，
  但设备按包名校验会拒绝安装——那种"签名成功"是假绿灯，所以脚本
  在不匹配时直接不签。
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
- **手表专属调试 Profile 尚未签发**：现有 Profile 是手机的，不能顶替。没有它
  就产不出可安装的手表 HAP，因此第 1 阶段"可安装"验收**尚未达成**，
  不能关闭议题 #2。
- **真机安装尚未做**：签名通过也只证明 HAP 完整、证书链有效。设备端还会
  校验 profile 的包名、`debug-info.device-ids`（需要手表的 UDID）、
  有效期与设备调试状态。这几项都没在 GT 4 上验证过。
- **CI 的签名代码已同步**：`watch_lite_hap.yml` 已改为 unsigned HAP →
  `hap-sign-tool sign-app` → `verify-app`，但自托管 Runner 仍排队，尚无新包名构建证据。
- 手机包名已改为 `com.xiwei.suyue`（对应现有 AGC 应用与证书），
  但**手机 HAP 仍未构建**；手表包名已改为 `com.xiwei.suyue.gt4`，
  需要在 AGC 注册相同包名并签发包含 GT4 UDID 的独立调试 Profile。
