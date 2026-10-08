# 素阅手机端 · HarmonyOS NEXT

独立 **ArkTS Stage** 工程，优先面向 Pocket 2（HarmonyOS 7 / API 26）。

## 已实现（源码级，未在 DevEco 编译/真机验证）

- `entry/src/main/ets/pages/Index.ets`：真实书库列表 + 文档选择器导入；
  选择文件 ≠ 导入成功，只有沙箱复制、解析、登记后才显示 `ready`。
- `services/BookImportService.ets`：读取授权 URI（分块）、SHA-256、
  规范化 UTF-8、写入应用私有 `files/books/<bookId>.txt`、登记书库。
- `services/TextDecodeService.ets`：UTF-8/UTF-16 BOM 与 UTF-8 校验，
  GBK/GB18030 尝试解码；解码不可用时明确报错，不静默乱码。
- `services/EpubImportService.ets`：无 DRM EPUB 解包（container.xml →
  OPF → spine 顺序）、XHTML 清洗为纯文本、保留章节标题。
- `services/ZipReader.ets`：纯 JS ZIP 中央目录 + inflate，含路径穿越、
  zip bomb、CRC-32 防护；由 `tests/zip_inflate.test.mjs` 在 Node 中验证。
- `services/BookRepository.ets`：`library.json` 索引，重启不丢书，
  重复导入幂等，删除同时清理索引与正文文件。
- `model/BookModels.ets`：BookMeta/Chapter/Status 统一模型。

## 未完成

- Wear Engine 设备发现与 `transferFile` 发送（阶段 5）。
- 在 Pocket 2 上编译、签名、安装与真机验证（当前没有编译产物）。
- GBK 解码在目标系统的实际可用性属于**待验证**项。

## 构建

- `tools/build_phone_hap.sh`（需要 DevEco `hvigorw` + API 26 SDK）。
- `.github/workflows/phone_hap.yml`：自托管 `hmos-deveco` runner，
  签名材料经 `secrets.PHONE_SIGNING_MATERIAL` 注入。

- UI：`entry/src/main/ets/pages/Index.ets`
- Ability：`entry/src/main/ets/entryability/EntryAbility.ets`
- 共享协议：`../../shared/protocol/README.md`
- 构建/安装准备：`../../docs/BUILD_AND_TRANSFER.md`
