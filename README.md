# 素阅 · suyue

面向 **HUAWEI WATCH GT 4 46 mm（466 × 466 圆屏）** 的个人离线小说阅读器，以及配套的鸿蒙手机传书应用。

> 当前状态：**源码原型，尚无可安装 HAP**。Watch 仅有本地测试书，手机仅有系统文件选择器；传书、书籍格式转换与双端编译验证均未完成。

## 两个不同的运行环境

- **手表（`apps/watch`）**：HarmonyOS Lite Wearable 的 JS FA（HML/CSS/JS）。不能直接运行 Rust writer_core、ArkTS Stage HAP 或 Wear OS APK。
- **手机（`apps/phone`）**：HarmonyOS NEXT / ArkTS Stage（优先 Pocket 2）。手机适合做 TXT/EPUB 转换与书籍管理。
- **`shared/protocol`**：双端约定的协议文档，非直接共享可执行的二进制核心。

## 已写入的源码

- 手表本地生成一份长中文测试书、按字节读取与估算分页、前后翻页和进度 JSON；未实机验证。
- 手表端多书书架：书籍索引、每书独立进度与设置、纯 JS SHA-256 接收校验、按 bookId 阅读、删除确认、日间/夜间主题、字号/行距重排；接收协议按 `shared/protocol` v0 落地（Node 可测部分已互验）。
- 手机端实现 TXT/EPUB 导入：文档选择器 → 授权 URI 分块读取 → 编码识别/EPUB 解包 → 规范化 UTF-8 写入沙箱 → 书库索引；**尚未在 DevEco 编译或真机验证**。
- 手机端 Wear Engine 发送：设备发现、显式选择目标、`transferFile` 文件通道、等待手表 RESULT 回执才认定入库；进度/取消/超时/重试齐备；**Wear Engine 真机互通待验证**。
- Wear Engine 消息接收入口在手机指纹尚未配置时停用；未完成真实传书。
- 第三方示例借鉴、原作者 MIT 声明：[来源说明](docs/REFERENCES.md)、[版权说明](third_party/NOTICE.md)。
- Node 回归测试（分页/ZIP/协议/SHA-256/工具/接收逻辑）可运行；**CI 通过不等于 HAP 构建成功，也不等于真机互通**。

## 目标流程

手机选择 TXT/EPUB → 手机解析、转换为 UTF-8 章节 → Wear Engine 传给 GT 4 → 手表核对并保存 → 圆屏离线阅读。

## 开发与构建

- 手表 Lite Wearable 与手机 Stage 必须分开编译、分开签名，不要混用构建工具链。
- 手表打包：`tools/build_watch_lite.sh` + `.github/workflows/watch_lite_hap.yml`（自托管 DevEco runner；签名材料经 Secrets 注入）。**尚未实际运行，未产出 HAP**；安装与待验证清单见 [docs/WATCH_INSTALL.md](docs/WATCH_INSTALL.md)。
- 手机打包：`tools/build_phone_hap.sh` + `.github/workflows/phone_hap.yml`（自托管 DevEco runner；签名材料经 Secrets 注入）。**尚未实际运行，未产出 HAP**。
- 首先验证 GT 4 46mm 支持哪组 Lite SDK/IDE + 签名 + DevEco Assistant 安装流程，才配置真正能产生 signed HAP 的 CI。
- 手机端可借鉴已有鸿蒙 NEXT CLI 构建流程，**但需要独立应用证书和本项目构建配置**；素笺的打包脚本不能原封不动使用。
- 详细状态、环境差异和验收清单见 [开发与安装路线](docs/BUILD_AND_TRANSFER.md)。
- 当前仅有源码检查与分页/ZIP 测试，尚未进行两端 DevEco 编译或设备验证。

## 项目目录

```text
apps/watch/       Lite Wearable 手表应用
apps/phone/       ArkTS Stage 手机应用
shared/protocol/  双端通信协议草案
docs/             架构、参考项目、构建说明
third_party/      MIT 原作者声明和许可证
tests/            与系统 SDK 无关的静态检查/分页测试
```

## 名称和包名

产品名称为「素阅」，仓库名为 `suyue`。为避免签名指纹、配对设置和以后阅读进度路径发生无谓变化，历史包名 `com.xiwei753.gt4reader.watch`、`com.xiwei753.gt4reader.phone` 以及应用内部文件路径暂不改动。**显示名称改了，不等于应用包名也要改。**

## 授权

原创代码按 [GPL-3.0-only](LICENSE) 发布。借鉴的 MIT 源码片段保留原许可证及版权声明，详见 [REFERENCES](docs/REFERENCES.md)。
