# 第三方项目版权声明

本项目原创实现采用 GPL-3.0-only。

下列代码的文件操作和通信注册方式参考并改造了
[Explore in HMOS Wearable](https://github.com/Explore-In-HMOS-Wearable) 提供的示例（MIT）。

- 来源：[sportwatch-how-to-read-large-text-files](https://github.com/Explore-In-HMOS-Wearable/sportwatch-how-to-read-large-text-files)，原提交快照 `5583e3865901cac62bf88d70dd10db8fe1fa59d3`。参考的文件：`entry/src/main/js/MainAbility/FileService.js`。修改目标：`apps/watch/entry/src/main/js/MainAbility/storage/BookFiles.js`，将演示数据读写改造为书库、进度和字节分页接口。
- 来源：[sportwatch-how-to-do-file-operations](https://github.com/Explore-In-HMOS-Wearable/sportwatch-how-to-do-file-operations)，原提交快照 `264288a821b238215e2e396b4a209aa5818c688a`。参考 `@system.file` 的目录、读写、数组缓冲区操作。
- 来源：[sportwatch-wear-engine-lite-wearable-to-mobile](https://github.com/Explore-In-HMOS-Wearable/sportwatch-wear-engine-lite-wearable-to-mobile)，原提交快照 `8f1034cd616ff182cedf805297d5669895d9ac6b`。参考注册、peer 证书指纹等调用步骤；改造目标：`apps/watch/entry/src/main/js/MainAbility/wear/WearReceiver.js`。原项目携带的华为 SDK 包装文件为 Apache-2.0，**本仓库没有复制/打包该文件**。

原作者：Copyright (c) 2025 Explore in HMOS Wearable。
完整许可证：[licenses/Explore-In-HMOS-Wearable-MIT.txt](licenses/Explore-In-HMOS-Wearable-MIT.txt)。

[WatchReader](https://github.com/yingwang/WatchReader)（Copyright (c) 2026 Ying Wang，MIT）仅用作体验和架构设计参考，不复制 Wear OS 源码。
