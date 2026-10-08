# 素阅手机端 · HarmonyOS NEXT

独立 **ArkTS Stage** 工程，优先面向 Pocket 2（HarmonyOS 7 / API 26）。

现在：`entry/src/main/ets/pages/Index.ets` 已调用官方 `DocumentViewPicker`，可以选择 TXT/EPUB 的系统 URI（尚未编译或真机验证）。

**注意：仅选择文件，不等于导入成功。** 复制文件到沙箱、TXT/EPUB 解析、书库数据和 Wear Engine `transferFile` 尚未实现。

- UI：`entry/src/main/ets/pages/Index.ets`
- Ability：`entry/src/main/ets/entryability/EntryAbility.ets`
- 共享协议：`../../shared/protocol/README.md`
- 构建/安装准备：`../../docs/BUILD_AND_TRANSFER.md`

项目需使用支持 HarmonyOS 7 / API26 的开发工具、匹配签名和所需资源，当前没有编译产物。
