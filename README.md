# GT4 Reader

面向 **HUAWEI WATCH GT 4 46 mm（466 × 466 圆屏）** 的个人离线阅读器，以及配套的鸿蒙手机传书应用。

> 状态：**开发骨架 / 尚未真机验证**。本仓库目前不包含可直接安装的 HAP，也不声称手机与 GT 4 之间的文件传输已经打通。

## 项目目标

- **手表端**（HarmonyOS Lite Wearable，JS/HML/CSS）：圆屏安全区域排版、离线 TXT 阅读、进度保存，后续支持表冠翻页、目录和字号调整。
- **手机端**（HarmonyOS NEXT / ArkTS）：导入 TXT、EPUB；在手机端转换文本和拆分章节；通过 Wear Engine 将书发送到 GT 4。
- **共享协议**：规定设备发现、分块传输、确认、校验和断点恢复的消息格式；所有上限以真机验证结果为准。

## 仓库结构

```text
apps/
  watch/       GT 4 Lite Wearable 的独立 DevEco 工程（示例阅读页）
  phone/       鸿蒙 NEXT 手机端的独立 DevEco 工程（首页骨架）
shared/
  protocol/    双端传书协议草案
docs/
  ARCHITECTURE.md    实现边界与开发顺序
  REFERENCES.md      借鉴项目、来源与许可证说明
```

## 当前能做什么

- 手表端是**内置测试文本的圆屏阅读演示**，可以点击翻到下一页；不是完整书籍阅读器。
- 手机端是**书库/传书入口的界面骨架**；目前不执行文件导入、传输。
- 两个端暂时**没有连接**。代码内保留明确的待实现边界，不用假传书按钮冒充完成。

## 开发顺序

1. 在 GT 4 46 mm 真机上编译、安装并校准圆屏字体和手势。
2. 手表端完成本地文本分块读取、书籍目录、页码与进度存取。
3. 手机端完成 TXT 导入、UTF-8 转换和 EPUB 转章节；加上手机端书库。
4. 完成双端 Wear Engine 配对、分块传输、校验、失败恢复。
5. 接入表冠翻页、字号设置、进度同步，再考虑额外功能。

详见 [架构与验收](docs/ARCHITECTURE.md)、[协议草案](shared/protocol/README.md) 和 [参考项目](docs/REFERENCES.md)。

## 构建提示

- `apps/watch` 使用 Lite Wearable（**不是** ArkTS Stage 或 Wear OS），需在支持该类型设备的 DevEco Studio 中打开工程并配置开发者签名。
- `apps/phone` 使用 ArkTS Stage 手机应用工程，需配置自己的证书及设备调试环境。
- 本仓库不提交证书、私钥、HAP、构建产物和第三方 SDK。**当前未进行 CI / 真机编译验证**。

## 许可证

本项目原创代码采用 **GNU GPL v3.0 only**，见 [LICENSE](LICENSE)（SPDX: `GPL-3.0-only`）。

参考项目不代表已作为本仓库的源码、库或依赖引入。以后如复制 MIT 授权的源文件，需要同时保留对应的原作者版权声明与 MIT 许可证文字，详见 [docs/REFERENCES.md](docs/REFERENCES.md)。
