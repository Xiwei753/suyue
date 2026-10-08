# 素阅：GT 4 / 鸿蒙手机开发、打包与安装路线

> 本文是开发路线，不是已执行的构建日志。当前没有签名 HAP，不能称为“可安装”或“实机验证通过”。

## 两个工程不能直接套一个流水线

| | 手表 GT 4 46mm | 手机 Pocket 2 |
| --- | --- | --- |
| 运行时 | Lite Wearable / JS FA，HML + CSS | HarmonyOS NEXT / ArkTS Stage |
| 项目入口 | `apps/watch/entry/src/main/config.json` | `apps/phone/entry/src/main/module.json5` |
| 构建 | 需要匹配 Lite Wearable 的旧式/兼容 SDK、Hvigor Legacy 或对应 DevEco 环境 | 适配 Stage 的 Hvigor + 鸿蒙 CLI |
| 安装 | 需先验证开发者注册、签名和 DevEco Assistant/HDEA 手机中转安装路径 | HAP 可通过 hdc 安装到手机 |
| CI 状态 | 已建立 Lite HAP 打包 workflow（自托管 DevEco runner，未实际运行）；尚未产出任何 HAP | 已建立 Stage HAP 打包 workflow（自托管 DevEco runner，未实际运行）；尚未产出任何 HAP |

## 为什么不直接搬其他端内核

华为轻智能手表的 JS 运行环境与手机的 ArkTS/Native Rust 不同。素笺已有 Rust `writer_core` 偏向写作、章节和工程管理，用来做 GT 4 TXT 阅读既不能原样加载，也会带来不必要的代码和构建体积。

合理复用：TXT/EPUB 结构解析思路、书籍 ID/目录、分页/进度算法、手机传输层的错误处理策略。手表端只留轻量 JS 的文件读写、UTF-8 解码、文本排版和交互。

## GT 4 Lite HAP：应先解决的事情

工程结构已按 Lite Wearable 参考示例补齐（`signingConfig`、`strictMode`、`hvigor/hvigor-config.json5`、`entry/hvigorfile.ts`、`media/icon{,_small}.png`、`config.json` 的 `"$media:icon"`）。打包流程为 `tools/build_watch_lite.sh` + `.github/workflows/watch_lite_hap.yml`（自托管 `hmos-deveco` runner，签名材料经 Secrets 注入）。**目前尚未在任何环境实际运行该流程，未产出 HAP。**

1. 根据真实 GT 4 系统、开发者注册情况确定 Lite Wearable 对应 SDK 和 DevEco 环境，核对 `targetSdkVersion` / `compatibleSdkVersion` 是否适用于开发安装渠道。
2. 与 [Lite Wearable 大文本读取示例](https://github.com/Explore-In-HMOS-Wearable/sportwatch-how-to-read-large-text-files) 对齐工程格式，不混入 ArkTS Stage 插件。
3. 通过该环境在本机或可复现构建机生成 **Lite Wearable HAP**，确认真实文件名与哈希，再添加仅上传所需 HAP 的 CI artifact。
4. 核对开发者证书、设备与应用注册。社区 2026 年 [Lite Wearable 安装指南](https://github.com/justvladcreate/Guide-to-develop-Litewearables-2026) 在 GT3/API6 设备上使用 DevEco 3.1.1、较旧 SDK 和 HDEA；此指南明确未覆盖全部新表，**不能擅自当作 GT 4 的最终确定配置**。
5. HAP 经手机中转安装到 GT 4 前，应先确认 Pocket 2 上能否运行相应安装助手；不行时寻找实际兼容的安卓/鸿蒙旧手机做中转。
6. 实机验证中文、`readArrayBuffer` 的位置语义、本地进度恢复、圆屏 466×466 安全区域和表冠事件。

## 手机端实现顺序

1. `DocumentViewPicker` 获取 TXT/EPUB 的文件 URI（已实现选择）。
2. TXT：`TextDecodeService` 识别编码（BOM/UTF-8 校验/GBK 候选），
   `BookImportService` 复制进沙箱并规范化 UTF-8；GBK 解码可用性**待真机验证**。
3. EPUB：`ZipReader`（纯 JS inflate，含穿越/bomb/CRC 防护）+
   `EpubImportService` 按 OPF/spine 顺序清洗章节；仅无 DRM。
4. `BookRepository` 维护 `library.json` 索引，重启不丢书。
5. 用 [Wear Engine Kit 手机侧 ArkTS API](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/wearengine_api) 做设备发现与授权（阶段 5，尚未实现）。
6. 将书籍规范化、写入临时文件，调用手机侧 `P2pClient.transferFile`；也可使用 `sendMessage` 发送控制/ACK 消息。API 支持并不保证当前 GT 4 配对与签名权限已经打通。
7. 手表注册接收、校验大小/摘要，安全落盘并更新书架，成功后由手表回执，不能只凭手机侧回调就认定入库成功。

手机端打包：`tools/build_phone_hap.sh` + `.github/workflows/phone_hap.yml`
（自托管 `hmos-deveco` runner，签名材料经 Secrets 注入）。**目前尚未在任何环境实际运行该流程，未产出 HAP。**

## 实施状态（auto-issue-1 分支）

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 1 | GT4 Lite 工程 + HAP 打包/CI | 源码完成；无 DevEco 环境，未产出 HAP |
| 2 | 手机 TXT/EPUB 导入沙箱 | 源码完成；Node 验证 ZIP/inflate；DevEco 编译待做 |
| 3 | 传输协议 v0 + 示例 + 测试 | 完成；tests/protocol.test.mjs 通过 |
| 4 | 手表多书书架 + 接收校验 | 源码完成；SHA-256/接收逻辑 Node 互验；真机待验证 |
| 5 | 手机 Wear Engine 发送 | 源码完成（API 形状按华为示例）；真机互通待验证 |
| 6 | 圆屏阅读体验 | 源码完成；分页回归扩展通过；表冠明确不支持（待 SDK 核对） |

**仍阻断真机验收的环境**：自托管 `hmos-deveco` runner、
`WATCH_SIGNING_MATERIAL`/`PHONE_SIGNING_MATERIAL`
Secrets、GT 4 46mm 与 Pocket 2 真机、Wear Engine
文件通道回调字段核对、手机签名指纹配置。

## 现有源码不能直接认定兼容的地方

- `apps/watch/build-profile.json5` 暂时采用轻智能手表示例的 `6.1.1(24)` 模板数值，但**没有确认为 GT 4 开发安装实际可用的版本**。
- HML 页面的几何大小和字号尚未经真机校准；UTF-8 分页是估算字宽，不是字体像素测量。
- `wear/WearReceiver.js` 有手机端签名指纹占位，若缺少有效配对将停用消息接收。
- 目前只有 Node 测试（`tests/`）。Node 通过不代表 Lite JS 编译器/ArkTS 编译器通过，也不代表 Wear Engine 真机互通。
- 两套应用包名保留历史命名，以避免与签名注册和传输配置脱节。

## 可关闭条件（项目总体）

- [ ] GT 4 签名 Lite HAP 能由 CI 可重复构建并下载，且安装成功
- [ ] HarmonyOS 7 手机签名 HAP 能由 CI 可重复构建并安装
- [ ] 手机 TXT/EPUB 导入、格式转换和进度数据结构成功
- [ ] 选定 GT 4，手机→表发送、表侧校验落盘、ACK 全链路通过
- [ ] 圆屏不裁字、长篇不卡顿、退出后恢复进度
- [ ] 文档记录实际真机与构建版本，不以 Node 结果代替真机测试
