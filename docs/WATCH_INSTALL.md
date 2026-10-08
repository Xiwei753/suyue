# GT 4 46mm 安装与构建说明（未实机验证）

> 状态：工程已对齐 Lite Wearable 参考示例结构，**尚未在任何环境完成签名 HAP 构建与 GT 4 实机安装**。以下为待验证步骤。

## 前置条件（待验证）

1. HUAWEI WATCH GT 4 46mm（466×466 圆屏），确认系统版本。
2. 已注册的华为开发者账号；设备已登记为调试设备。
3. Lite Wearable DevEco 环境（含 `hvigorw` 与 Lite Wearable SDK）。
   社区指南（[Guide-to-develop-Litewearables-2026](https://github.com/justvladcreate/Guide-to-develop-Litewearables-2026)）在 GT3/API6 设备上使用 DevEco 3.1.1、较旧 SDK 与 HDEA；该指南**未覆盖 GT 4**，不能直接当作最终配置。
4. 手表应用签名材料（`.p12`/`.cer`/profile），通过仓库 Secrets 注入，**不提交到 Git**。

## 本地构建

```bash
tools/build_watch_lite.sh debug    # 或 release
```

脚本要求 `hvigorw` 存在于 PATH 或 `apps/watch/hvigorw`；缺失时明确报错退出，
不会把 Node 静态检查伪装成构建成功。构建成功后输出 HAP 路径、大小与 SHA-256。

## CI

- `.github/workflows/watch_lite_hap.yml` 运行在自托管 runner（label：`hmos-deveco`）。
- 签名材料从 `secrets.WATCH_SIGNING_MATERIAL` 注入，临时落盘、构建后删除、日志不回显。
- 缺少签名材料时构建失败并明确报出“签名不可用”，不会报告“签名成功”。
- Artifact 仅上传 HAP 本体，不包含工具链目录。

## 安装到 GT 4（待验证路径）

候选路径（按优先级）：
1. DevEco Assistant / HDEA 经配对手机中转安装到 GT 4。
2. 若 Pocket 2（HarmonyOS 7）无法运行对应安装助手，寻找实际兼容的安卓/鸿蒙旧手机做中转。

安装后验证清单：
- [ ] 应用出现在手表桌面，名称为「素阅」
- [ ] 本地测试书可打开、前后翻页、退出重进恢复进度
- [ ] 圆屏 466×466 安全区域内文字不被裁切
- [ ] 表冠事件是否可用（不支持则触屏翻页，不伪造“已支持”）

## 已知未决

- `targetSdkVersion` / `compatibleSdkVersion` 的 `6.1.1(24)` 来自轻智能手表示例模板，
  **尚未确认为 GT 4 开发安装实际可用的版本**；需在真实 DevEco 环境中核对。
- Wear Engine 接收依赖手机端证书指纹，尚未配置（见 `wear/PeerConfig.js`）。
