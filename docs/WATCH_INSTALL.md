# GT 4 46mm 安装与构建说明（编译已通过，安装未验证）

> 状态（issue #2 更新）：**手表 Lite 工程已在本机真实编译成功**，
> 产出含完整 JerryScript 快照的 HAP；但该 HAP **未签名**，
> 因此**尚不能安装**，GT 4 实机步骤仍是待验证。
> 第 1 阶段验收：**暂不可通过**——缺口是签名材料，不是构建环境。

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
4. 手表应用签名材料（`.p12`/`.cer`/`.profile`），通过仓库 Secrets 注入，**不提交到 Git**。
   **必须是素阅自己的证书**（profile 绑定包名 `com.xiwei753.gt4reader.watch`）：
   素笺的 `.p12`/`.cer`/`.p7b` 不能复用，议题 #2 也明确要求本项目独立证书。

## 本地构建（已验证）

```bash
tools/build_watch_lite.sh release    # 或 debug
```

脚本要求 `hvigorw` 存在于 PATH；缺失时明确报错退出，不会把 Node
静态检查伪装成构建成功。构建成功后输出 HAP 路径、大小与 SHA-256。

**本机实测结果（`tools/build_watch_lite.sh release`）**：

```text
HAP_PATH=apps/watch/entry/build/default/outputs/default/entry-default-unsigned.hap
HAP_OK manifest=config.json size=192447 mode=release signed=no
       sha256=8626dd671e200cb638fc9a7fb2172c659e1c728d09bdeb5caec722c85ac725fe
```

- HAP 内快照齐全：`app.bc` (806 B)、`pages/index/index.bc` (29,938 B)、
  `pages/reader/reader.bc` (21,802 B)。
- 资源：`icon.png.bin` 43,272 B、`icon_small.png.bin` 33,864 B。
- `signed=no`：`build-profile.json5` 的 `signingConfigs` 为空，
  hvigor 日志为 `Will skip sign 'hos_hap'`。脚本会在末尾显式打印
  "未签名 HAP 不可安装，本轮不能宣称验收通过"。

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
- **签名材料缺失**：没有素阅自己的 `.p12`/`.cer`/`.profile`，只能产出
  未签名 HAP（`signed=no`）。未签名 HAP 装不上 GT 4，因此第 1 阶段
  "可安装"验收**明确未达成**，不能关闭议题 #2。
