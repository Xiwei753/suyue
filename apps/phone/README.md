# 手机端 · HarmonyOS NEXT

独立 **ArkTS Stage** 工程，优先面向 Pocket 2（HarmonyOS 7 / API 26）。

当前仅实现启动页骨架，显示“书库”“手机传书”两块功能边界；导入 TXT/EPUB、书籍保存和 Wear Engine 传输**尚未实现**。

- UI: `entry/src/main/ets/pages/Index.ets`
- Ability: `entry/src/main/ets/entryability/EntryAbility.ets`
- 后续服务位置：`entry/src/main/ets/services/`（实际实现时新增）
- 共享协议：`../../shared/protocol/README.md`

编译需在支持 HarmonyOS 7 / API 26 的 DevEco Studio 中打开本目录，配置签名并按 IDE 生成的应用工程模板补全必要图标/构建环境。当前未做真机验证。
