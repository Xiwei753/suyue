# 借鉴项目与版权说明

> 本文件是设计参考的来源记录，**不是依赖清单**。本仓库当前没有复制下列项目的源文件，也未包含它们的库、字体或二进制产物。

## 阅读器体验（Wear OS，仅借鉴方案）

- [yingwang/WatchReader](https://github.com/yingwang/WatchReader)
- 许可：[MIT](https://github.com/yingwang/WatchReader/blob/main/LICENSE)，版权：Copyright (c) 2026 Ying Wang。
- 借鉴方向：手机整理 TXT/EPUB、圆屏排版、章节跳转、惰性分页、表冠翻页、阅读进度。
- **注意：不能直接在 GT 4 上运行**；原项目使用 Wear OS / Android Kotlin / Google Wearable Data Layer，这不是本项目的运行时和通信方式。

## GT 4 Lite Wearable 资料（华为轻量级手表）

- [Explore-In-HMOS-Wearable/sportwatch-how-to-read-large-text-files](https://github.com/Explore-In-HMOS-Wearable/sportwatch-how-to-read-large-text-files)
  - 许可：[MIT](https://github.com/Explore-In-HMOS-Wearable/sportwatch-how-to-read-large-text-files/blob/main/LICENSE)，版权：Copyright (c) 2025 Explore in HMOS Wearable。
  - 借鉴方向：`@system.file` 大文本分块读取。注意默认单次读取长度与传输上限是两回事。
- [Explore-In-HMOS-Wearable/sportwatch-how-to-do-file-operations](https://github.com/Explore-In-HMOS-Wearable/sportwatch-how-to-do-file-operations)
  - 许可：[MIT](https://github.com/Explore-In-HMOS-Wearable/sportwatch-how-to-do-file-operations/blob/main/LICENSE)，版权：Copyright (c) 2025 Explore in HMOS Wearable。
  - 借鉴方向：Lite Wearable 文件创建、读写、删除、移动和目录操作。
- [Explore-In-HMOS-Wearable/sportwatch-wear-engine-lite-wearable-to-mobile](https://github.com/Explore-In-HMOS-Wearable/sportwatch-wear-engine-lite-wearable-to-mobile)
  - 许可：[MIT](https://github.com/Explore-In-HMOS-Wearable/sportwatch-wear-engine-lite-wearable-to-mobile/blob/main/LICENSE)，版权：Copyright (c) 2025 Explore in HMOS Wearable。
  - 借鉴方向：GT 4 轻量级手表和手机间的 Wear Engine 消息/文件通信。
  - 原示例的手机端是 Android 示例，不能据此声称 HarmonyOS NEXT ArkTS 手机端已经完成兼容性验证。

## 后续引入源码的处理规则

1. 只参考结构或想法，不拷贝代码：保留以上来源说明即可。
2. 真正复制或改写 MIT 授权文件、代码实质内容：保留其原始版权声明和 MIT 许可文字，在 `third_party/NOTICE.md`（需要时新建）注明路径、来源、版本或 commit、修改范围；不能用本项目的 GPL 声明抹掉原作者版权。
3. 若引入其他许可证的代码，**先查兼容性**，确认后再引入。不要默认所有开源仓库都可以直接混用。
4. 不上传示例中的私钥、证书、SDK 二进制，也不把依赖包当作“源码参考”直接导入。

## 本项目许可

仓库原创代码按 [GNU GPL-3.0-only](../LICENSE) 发布。GPL 与 MIT 兼容，但从 MIT 源码派生的部分仍需保留原 MIT 声明。
