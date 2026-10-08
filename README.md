# GT4 Reader

面向 **HUAWEI WATCH GT 4 46 mm（466 × 466 圆屏）** 的个人离线阅读器，以及配套的鸿蒙手机传书应用。

> 当前状态：**手表本地阅读原型；未编译、未实机验证；手机传书仍未接通。** 没有可直接安装的 HAP。

## 项目目标

- **手表端**（HarmonyOS Lite Wearable，JS/HML/CSS）：圆屏安全区排版、离线 TXT 阅读、进度保存、以后支持表冠翻页/目录/字号。
- **手机端**（HarmonyOS NEXT / ArkTS）：TXT / EPUB 导入与转换、章节整理、Wear Engine 传书。
- **共享协议**：手机→手表的分块、回执、校验、失败恢复。

## 结构

```text
apps/
  watch/       Lite Wearable 工程：书架、文件操作、分页、进度、Wear Engine 接收入口
  phone/       ArkTS Stage 手机端静态首页（导入/传书待实现）
shared/
  protocol/    双端传书协议草案
docs/
  ARCHITECTURE.md
  REFERENCES.md
third_party/
  NOTICE.md    MIT 示例来源及版权保留
  licenses/    所借鉴源码的对应许可证
```

## 已实现（源码级，非真机已验证）

- 手表首页进入本地中文测试书；首次启动向 `internal://app/gt4reader` 写入一份超过 4096 字节的 TXT。
- 通过 `@system.file.readArrayBuffer` 按文件**字节偏移**读取，`PageLayout` 解码 UTF-8 并形成估算长度的一页；前后翻页，保存最近进度。
- 接入 Wear Engine 消息订阅入口；当真实签名指纹未配置时会明确停用。收到文件不自动信任或导入。
- 参考 [3 个 GT 4 Lite Wearable MIT 示例](docs/REFERENCES.md) 的文件和通信接口；第三方来源、原版权及完整 MIT 条款详见 [NOTICE](third_party/NOTICE.md)。
- 轻量分页逻辑附不依赖第三方包的 Node 回归测试：`node --experimental-default-type=module tests/pagination.test.mjs`。

## 还没有完成

- 从手机导入 TXT/EPUB、转换、发送书籍，以及手表接收后验证并加入书架的整套链路。
- 多书书架、真正的章节目录、表冠翻页、屏幕字形像素测量、存储/耗电压力测试。
- GT 4 专用 DevEco 构建、签名、安装验证；目前不能保证 HAP 能一次通过。

## 构建与安装

手表端用支持 Lite Wearable 的 DevEco Studio 打开 `apps/watch`；手机端用支持 ArkTS Stage 的 DevEco Studio 打开 `apps/phone`。二者签名分别配置，证书/私钥不可提交。**目前不提供“下载即用”的安装包。**

## 授权

原创代码按 [GPL-3.0-only](LICENSE) 发布；借鉴或改造的 MIT 示例保留原许可证及版权声明；未打包原华为 Wear Engine SDK wrapper（Apache-2.0）。见 [REFERENCES](docs/REFERENCES.md)。
