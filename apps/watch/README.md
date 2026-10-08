# 手表端 · GT 4 46 mm

独立 **Lite Wearable / JS FA** DevEco 工程。入口为 `entry/src/main/config.json`，JS 入口为 `entry/src/main/js/MainAbility/app.js`。

## 初始页面

- 只提供**内置测试文本的阅读页**，点击圆屏中心翻页（最后一页回到第一页，仅用于演示）。
- 466 × 466 圆屏，初始阅读文本盒 316px 宽；尚未校准实际安全区域/字体。
- 没有外部 SDK、没有书籍接收、没有持久化存储。不会假装成功传书。
- 预留使用 `@system.file` 的本地阅读器和 Wear Engine 接收端，先验证对应设备和 SDK。

## 构建

用具有 Lite Wearable 支持的 DevEco Studio 打开本目录；配置证书/设备、安装可用的 HarmonyOS Lite Wearable SDK，并补齐 IDE 需要的默认工程生成项和资源图标。此骨架**尚未真机构建**。不把完整 Stage 鸿蒙应用套到 GT 4 上。
