# Android APK 工程状态与验收（议题 #3）

本文件记录 `apps/android` 的工程决策、诚实边界与分阶段验收清单。
面向用户的构建/安装说明见 [apps/android/README.md](../apps/android/README.md)。

## 1. 与议题 #2 / 分支的关系

- 本工程在分支 `auto-issue-3` 上提交。该分支当前 **包含议题 #2 的全部改动**
  （手表包名 `con.xiwei.suyue.gt4`、手机包名 `com.xiwei.suyue`）；本工程的身份名
  与之一致，因此 Android 端「手机」身份 `com.xiwei.suyue` 与手表端登记的手机身份
  对得上。
- 按议题约束：**#2 未收敛前，不与 #2 并行修改 `apps/watch`、`apps/phone`、
  `tools/build_watch_lite.sh`、`signing/`、CI 的手表/手机 workflow。** 本工程只新增
  `apps/android/**`、`tools/build_android_apk.sh`、`.github/workflows/android_apk.yml`、
  Android 相关测试/示例/文档，并对 `README.md` 做少量追加说明。
- 议题「一题一分支」：本分支的 Android 交付独立于 #2 的手表侧工作；如后续需要
  纯净基线，可再基于 `main` 重建。

## 2. 身份与签名（P0）

| 项 | 值 | 来源 |
| --- | --- | --- |
| Android `applicationId` | `com.xiwei.suyue` | `app/build.gradle.kts` |
| 手表对端 bundle | `con.xiwei.suyue.gt4` | `wear/PeerIdentity.kt` |
| 手表指纹注入占位 | `""`（构建期注入，构建后还原） | `wear/PeerIdentityConfig.kt` |

- **同包名 ≠ 同签名**：合法的 Android 签名证书可以有多个，但手表端
  `supportLists` / Wear Engine 只认**登记的指纹**。因此：
  - 若复用现有证书：需先在设备上验证其指纹是否被手表接受；
  - 否则：另配 Android keystore，并在 AGC 完成 Wear Engine 登记，注入对应指纹。
- 本工程 **不修改** 手表侧 `PeerConfig.js` / `config.json`（那是 #2 的范围）；
  也 **不要求** 用户重签手表证书或改手表 App ID。
- HAP 的 `.p7b` profile **不用于** APK；APK 独立签名。私钥/口令/keystore 绝不入库。

## 3. 已实现（源码级）

- 导入：TXT（BOM/UTF-8/GBK 识别）与 no-DRM EPUB（ZIP 解包、容器/OPF/spine/NCX），
  规范化 UTF-8 写入沙箱并**写后复核大小+SHA-256**；选择 URI ≠ 成功。
- 书库：`library.json` 原子写、按 `bookId` 去重、删除、状态标记；重启不丢。
- 发送：官方 Android Wear Engine（权限、设备发现、手动选择、ping 区分
  未安装/未运行、消息+文件通道、回执按 `transferId` 关联、取消发 `E_CANCELLED`）。
- 协议：`shared/protocol` v0，字段与 HarmonyOS 侧一致（Android 额外带 `encoding`）。
- 构建：独立 Gradle 工程，本机 `BUILD SUCCESSFUL`。

## 4. 分阶段验收状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 1 | Android APK 最小闭环（真实编译 + 产物信息 + 导入/持久化） | ✅ 编译验证；⚠️ nova 真机安装待验证 |
| 2 | Wear Engine 连接（授权/设备列表/错误区分/指纹比对） | ⚠️ 代码就绪，真机待验证（阻塞于 AGC 注册与正式指纹） |
| 3 | 同机调测与真实传书（RESULT ok=true） | ⛔ 未验证；依赖 #2 的手表端 HAP 与真机 |
| 4 | 功能对齐（EPUB、编码恢复、删除/重发、上限、标题一致） | ⚠️ 代码就绪，真机待验证 |
| 5 | 文档（三端 + 获取/安装 APK + 日志路径） | ✅ |

**当前结论：暂不可关闭。** 编译/静态检查通过，但真机配对与端到端传书未验证。

## 5. 阻塞项

- AGC「Wear Engine 服务」权限 + 正式签名指纹登记（否则无法真机测试 SDK）。
- GT 4 上可运行的手表端素阅（来自 #2；若 #2 HAP 仍「解压失败」，需分别报告
  「Android 侧可接受」与「被 #2 阻塞」，**不得伪造成端到端成功**）。
- nova 7 Pro 实机：安装、授权、配对、传书均待验证。

## 6. 诊断

```bash
adb logcat -s suyue/Main suyue/Transfer suyue/WearEngine
```
