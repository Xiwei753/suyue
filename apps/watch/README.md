# GT 4 46mm 轻量级手表端

本目录是 HarmonyOS Lite Wearable 的 **JS FA** 工程，不能按 ArkTS Stage 或 Wear OS 编译。

## 当前已经接线的能力

- `storage/BookFiles.js`：`@system.file` 创建应用内书库、写入约数万字节中文测试文本、以 **2048 字节窗口**读取二进制、读写最近进度文件。
- `reader/PageLayout.js`：自行按 UTF-8 字节边界解码，保留正确的下一页 byteOffset，不在中文字符中间拆开；圆屏排版目前仍以估算字宽为准。
- `pages/index`、`pages/reader`：书架入口 → 本地阅读 → 前后翻页，重启可读取进度。
- `wear/WearReceiver.js`：根据参考项目对接 `@system.wearengine` 消息订阅的**受限入口**。没配置手机签名指纹时不会注册；收到文件也不会未经校验自动放入书架。
- `wear/PeerConfig.js` 和 `config.json` 的 `supportLists` 里有待填写的手机端证书指纹位置。**两处值必须按真实应用签名配置一致**，不能把占位文本当作生产值。

## 未完成

- 手机发书 → 手表接收文件 → 校验 → 加入书架的完整闭环；目前书库里只有内置示例书籍。
- 章节目录、表冠翻页、字体调整、可变宽度字体真实测量、自动导入多书、低功耗优化。
- 在 GT 4 46mm 上编译、签名、安装、验证文件/通信接口。现在只是有对应的源文件，不能称为真机适配通过。

## 引用及许可证

代码基于三个 [Lite Wearable MIT 示例](../../docs/REFERENCES.md) 所介绍的接口与处理方式改造；`BookFiles.js`、`WearReceiver.js` 保留了来源声明。完整 MIT 条款及原作者声明放在 [third_party/NOTICE.md](../../third_party/NOTICE.md) 和相应许可文件中。华为 SDK wrapper 的第三方实现没有打包进来。

## 开发提示

使用支持 Lite Wearable 的 DevEco 打开本目录，配置本机签名以及匹配的 Lite Wearable SDK。演示的 `readArrayBuffer` 字节窗口与预期的中文分页仍需真机测试。不提交签名密钥。
