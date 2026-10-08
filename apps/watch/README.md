# GT 4 46mm 轻量级手表端

本目录是 HarmonyOS Lite Wearable 的 **JS FA** 工程，不能按 ArkTS Stage 或 Wear OS 编译。

## 当前已经接线的能力

- `storage/BookStorage.js`：应用私有目录多书管理（books/、temp/、progress/），`readBytes` 按字节窗口流式读取，`commitVerifiedBook` 把校验通过的暂存书转正。
- `storage/LibraryIndex.js`：`books.json` 多书索引；只列文件真实存在的书；重复发送同一书籍不覆盖阅读进度。
- `storage/ProgressStore.js`：每本书独立进度（字节偏移/历史/字号），重启恢复且互不串书。
- `wear/TransferLogic.js` + `wear/IncomingBookReceiver.js`：按 `shared/protocol` v0 接收 BOOK_META/CHUNK/FINISH，整本 SHA-256 校验通过才入书架；缺块 `E_MISSING_CHUNKS`、摘要不符 `E_DIGEST_MISMATCH`、取消 `E_CANCELLED` 均有处理；失败清理暂存。
- `util/Sha256.js`：纯 JS SHA-256（Lite JS 无加密 API，ES5 兼容），Node 互验通过。
- `util/Utf8.js`、`util/Base64.js`：纯 JS UTF-8 解码与 base64 解码（运行时无 atob），Node 互验通过。
- `reader/PageLayout.js`：唯一分页器（编码边界/换行/上下页偏移）。
- `pages/index`：真实书架（列书名、打开、二次确认删除、空书架提示）；首次启动把旧演示书迁入新书库（迁移桥接，设备验证后删除）。
- `pages/reader`：按路由 `bookId` 打开；字号 A-/A+ 按当前位置重排；未知 bookId 不崩溃。
- `wear/WearReceiver.js`：Wear Engine 适配层，版本检查 + 手机指纹门控，消息路由到 `IncomingBookReceiver`。
- `wear/PeerConfig.js` 和 `config.json` 的 `supportLists` 里有待填写的手机端证书指纹位置。**两处值必须按真实应用签名配置一致**，不能把占位文本当作生产值。

## 构建与安装

- 工程结构已对齐 Lite Wearable 参考示例（`build-profile.json5` 含 `signingConfig`/`strictMode`、`hvigor/hvigor-config.json5`、`entry/hvigorfile.ts`、`resources/base/media/icon{,_small}.png`、`config.json` 的 `"$media:icon"`）。
- 本地构建：`tools/build_watch_lite.sh debug|release`；需要 DevEco `hvigorw` 与 Lite Wearable SDK，缺失时明确报错，不用 Node 检查冒充构建。
- CI：`.github/workflows/watch_lite_hap.yml`（自托管 `hmos-deveco` runner；签名材料经 `secrets.WATCH_SIGNING_MATERIAL` 注入；产物只上传 HAP）。
- 安装步骤与待验证清单：[../../docs/WATCH_INSTALL.md](../../docs/WATCH_INSTALL.md)。
- **尚未在任何环境完成签名 HAP 构建或 GT 4 实机安装；`6.1.1(24)` 版本号待 GT 4 真机核对。**

## 未完成

- 手机发书 → 手表接收文件 → 校验 → 加入书架的完整闭环；Wear Engine 文件通道回调字段待真机确认。
- 表冠翻页（待确认 GT4 Lite SDK 能力；不支持则触屏翻页，不伪造“已支持”）。
- 圆屏真实像素分页（当前为估算字宽，待 GT4 46mm 真机校准）。
- 在 GT 4 46mm 上编译、签名、安装、验证文件/通信接口。现在只是有对应的源文件，不能称为真机适配通过。
- 迁移收尾：设备验证成功后删除 `storage/BookFiles.js` 与 `pages/index` 的演示书桥接（施工单要求，不能一刀切删）。

## 引用及许可证

代码基于三个 [Lite Wearable MIT 示例](../../docs/REFERENCES.md) 所介绍的接口与处理方式改造；`BookFiles.js`、`WearReceiver.js` 保留了来源声明。完整 MIT 条款及原作者声明放在 [third_party/NOTICE.md](../../third_party/NOTICE.md) 和相应许可文件中。华为 SDK wrapper 的第三方实现没有打包进来。

## 开发提示

使用支持 Lite Wearable 的 DevEco 打开本目录，配置本机签名以及匹配的 Lite Wearable SDK。`readArrayBuffer` 字节窗口、FA HML 的 `for` 循环与 `$idx` 事件参数、中文分页均需真机测试。不提交签名密钥。
