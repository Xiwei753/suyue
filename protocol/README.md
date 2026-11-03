# 双端传书协议 v0

**状态：字段约定已落实到源码，GT 4 / 手机真机传输仍待验证。**
手机（ArkTS Stage）与手表（Lite JS）使用同一套 JSON 控制消息；
`tests/protocol.test.mjs` 校验当前支持的消息示例。

## 基本原则

- 手机解析 TXT/EPUB 并统一输出 UTF-8；手表负责校验、落盘和阅读。
- 每本书有稳定 `bookId`（内容 SHA-256 前 16 个小写十六进制字符）；
  每次传输有唯一 `transferId`。
- 正文通过 Wear Engine `transferFile` 作为一个完整文件发送。
  当前实现不支持消息分块正文或断点续传消息。
- 控制消息使用 JSON。长章节目录可以用多条 `CHAPTERS` 消息传递，
  但不得截断章节目录或把正文拆成消息块。
- 手表按固定窗口校验文件大小和整本 SHA-256；验证成功后才把暂存文件转正。
- 手机侧 `transferFile` 成功只表示文件发送回调成功，不表示手表已校验或入库。

## SDK 映射（以华为 Wear Engine 示例为准，待真机验证）

手机侧（ArkTS Stage，`@kit.WearEngine`）：

- 控制消息（HELLO/BOOK_META/CHAPTERS/ERROR 等 JSON）：
  `p2pClient.sendMessage(device.randomId, appParam,
  P2pMessage{content: Uint8Array})`。
- 整本正文：`p2pClient.transferFile(device.randomId,
  appParam, P2pFile{file: fs.openSync(path)},
  (error, result) => …)`；`COMMUNICATION_SUCCESS` 仅表示文件已发送。
- 消息接收：`p2pClient.registerMessageReceiver(
  device.randomId, appParam, callback)`，供控制消息和阅读进度同步。
- 取消：`p2pClient.cancelFileTransfer(device.randomId, appParam, P2pFile)`；
  取消后发送 `ERROR code=E_CANCELLED`，手表清理在途状态。
- `appParam = { remoteApp: { bundleName, fingerprint } }`，手机 fingerprint
  必须与手表 `supportLists` 配置一致。

手表侧（Lite JS，`@system.wearengine`）：

- 消息订阅：`wearengine.subscribeMsg`，`data.message` 为 JSON 控制消息。
- 文件到达：`data.isFileType` 分支携带文件路径。候选字段为
  `file`/`name`/`uri`/`filePath`（上游示例使用 `data.file`，需真机核对）；
  收到后复制入沙箱并校验大小和 SHA-256。
- 取消和阅读进度消息共用反向消息通道。手机仅以自己的
  `transferFile` 回调报告发送状态。
- Manifest 授权：`config.json` 的
  `metaData.customizeData[supportLists]` 必须是
  `<手机包名>:<手机 APP ID>`；HarmonyOS 原生手机使用
  `bundle-info.app-identifier`，不是证书 SHA-256。
  构建时由 `tools/inject_signing.py` 注入真实 APP ID。
  手机发往手表的 `remoteApp` 则使用 GT4 Lite 公钥身份，方向不同。

## 消息 envelope

传书控制消息必含 `v`（当前为 `0`）与 `type`；除 `HELLO` 外含
`transferId`。阅读进度消息独立于传书状态机，不携带 `transferId`。
字符串使用 UTF-8；书名等字段只由 JSON 序列化转义一次。

### HELLO（双向）

`capabilities` 包含 `formats`、`ack`、`chunkBytes` 和 `fileChannel`。
正文传输要求双方报告文件通道能力；`chunkBytes` 是现有元数据字段，
不用于拆分传输正文。

### BOOK_META（手机 → 表）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| bookId | string | 是 | 内容 SHA-256 前 16 个小写十六进制字符 |
| transferId | string | 是 | 本次传输的唯一标识 |
| title | string | 是 | 书名 |
| encoding | string | 是 | 当前仅 `utf-8` |
| bytes | number | 是 | 规范化正文的 UTF-8 字节数 |
| sha256 | string | 是 | 规范化正文的 SHA-256，小写 hex |
| chunks | number | 是 | 兼容元数据，不表示消息正文块 |
| chunkBytes | number | 是 | 兼容元数据，正文仍作为完整文件发送 |
| chapters | array | 否 | 按顺序的 `[{title, offset, length}]`，范围以字节计 |
| chapterChunks | number | 否 | 正数表示目录将由 `CHAPTERS` 分片补充 |

### CHAPTERS（手机 → 表，可选）

`BOOK_META.chapterChunks > 0` 时，手机在正文文件前按 `index` 发送目录片。
每条完整 JSON（UTF-8）不超过 4096 字节；手机等待 SDK 发送调用完成以保持
顺序，但不等待手表应用层 ACK。目录必须全部到齐且范围顺序有效才保存；
目录缺失或无效时，正文仍可独立校验并入库，目录留空。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| bookId / transferId | string | 是 | 必须与 `BOOK_META` 一致 |
| index | number | 是 | 0-based 分片序号 |
| total | number | 是 | 分片总数，等于 `BOOK_META.chapterChunks` |
| chapters | array | 是 | 本片非空的 `[{title, offset, length}]` |

### 正文文件（手机 → 表）

发送 `BOOK_META` 和可选目录后，手机通过 `transferFile` 发送完整正文。手表
复制到临时路径后校验总字节数与整本 SHA-256，成功才提交书架；失败会清理
暂存文件。当前没有消息分块或断线续传的正文路径。

### RESULT（表 → 手机，可选）

只用于拒绝 `BOOK_META`（例如 `E_BUSY` 或元数据错误）。成功/失败的文件接收
结果在手表本地显示；手机不等待传书 `RESULT`，也不把文件发送成功误报为入库成功。

### ERROR（双向）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| code | string | 是 | 见错误码表 |
| message | string | 否 | 可读描述 |
| transferId / bookId | string | 可知时必填 | - |

取消传输用 `ERROR code=E_CANCELLED`。

## 错误码

| code | 含义 |
| --- | --- |
| E_UNSUPPORTED_FORMAT | 格式不支持 |
| E_DECODE | 解码/清洗失败（如 EPUB 有 DRM） |
| E_SPACE | 手表空间不足 |
| E_TIMEOUT | 在途元数据超时并清理 |
| E_DIGEST_MISMATCH | 整本 SHA-256 不符 |
| E_DUPLICATE_TRANSFER | 同一传输标识状态冲突 |
| E_CANCELLED | 发送方取消 |
| E_PEER_UNAVAILABLE | 对端未配对、离线或不支持 |
| E_BUSY | 已有另一本在途，单本互斥 |
| E_PROTOCOL | 协议字段缺失或文件无对应元数据 |
| E_CHAPTER_TOO_LARGE | 目录分片仍超过 4096 字节，手机本地停止发送 |

## 单本在途

手表同一时刻只允许一个 `transferId` 处于接收中：

- 第二个不同 `BOOK_META` 返回 `RESULT ok=false reason=E_BUSY`，不改变当前状态。
- 相同 `transferId` 的 `BOOK_META` 视为重启，整份替换接收状态。
- 文件只能关联到当前待接收的 `BOOK_META`；没有在途元数据时不落盘。

## 时序

```text
手机 → 表  HELLO（capabilities，含 fileChannel）
表 → 手机 HELLO（capabilities 回应）
手机 → 表  BOOK_META
手机 → 表  CHAPTERS[index]（可选；每片 ≤4096 字节）
手机 → 表  transferFile(整本正文)
表       校验文件大小 + SHA-256 → 正文入库（完整目录有效时一并保存）
手机     transferFile 回调成功后显示“文件已发送；手表侧校验/入库未确认”
```

## 接收方约束

- 校验失败的半本书不得出现在书架；清理暂存文件。
- 完成后写入书籍元信息及默认阅读进度；重复发送同一 `bookId` 不覆盖原进度。
- 文件通道完成不依赖也不发送应用层成功回执。

## 阅读进度同步（独立于传书）

阅读进度同步复用 Wear Engine 的消息通道，但**不属于传书状态机**：
不带 `transferId`，不等待/发送 `RESULT`，不影响传书、签名或单本互斥。
每条 JSON 必须严格小于 **4096 字节**；只传摘要，不传正文、完整目录或书架。
所有偏移都是规范化 UTF-8 正文文件内的**字节偏移**，不是字符/页号。

### READ_PROGRESS_GET

```json
{"v":0,"type":"READ_PROGRESS_GET","source":"phone","requestId":"p...","ts":0}
```

请求对端发送当前已有书籍的进度摘要。收到后回 `READ_PROGRESS_STATE`。

### READ_PROGRESS_STATE

```json
{"v":0,"type":"READ_PROGRESS_STATE","source":"watch","requestId":"p...",
 "books":[{"bookId":"0123456789abcdef","sha256":"...64 hex...",
           "offset":4096,"updatedAt":0}],
 "lastBookId":"0123456789abcdef","lastUpdatedAt":0,
 "lastSha256":"...64 hex...",
 "batch":0,"batches":2}
```

- `books` 只包含本机真实存在、摘要完整且**已有进度**的书籍；
- 长列表按 `batch`/`batches` 分片，每片仍 <4096 字节；重复分片幂等；
- `lastBookId` 只用于更新“续读入口”，不强制跳书；`lastSha256`
  用于确认手表/手机上的同名书内容一致，缺失时按无摘要处理；
- 接收方必须先按 `bookId` + `sha256` 找到本地书籍；找不到或摘要不符
  时忽略，绝不因远端有书而创建空书。

### READ_PROGRESS_APPLY

```json
{"v":0,"type":"READ_PROGRESS_APPLY","source":"phone",
 "bookId":"0123456789abcdef","sha256":"...64 hex...",
 "offset":8192,"updatedAt":0}
```

请求把某本书的进度设为指定字节位置。接收方必须校验：

1. 本地存在该书且 `sha256` 完全一致；
2. `0 <= offset <= book.bytes`；
3. `offset` 落在 UTF-8 字符边界（不能是续字节 `10xxxxxx`）。

通过后清空不适用于新位置的上页历史，再用现有分页器重绘（若阅读页打开）。
应用远端进度**不得**再作为本地新阅读回发；重复消息按
`(bookId, sha256, offset)` 幂等忽略。

### 冲突与循环

- 每本书记录上次双方确认的 `syncedOffset`；不能只比较 offset 大小，
  回到上一章也是合法进度；
- 一边为空：采用另一边；一边仍等于基线：采用另一边的新进度；
- 两边都改过且不同：**不得静默覆盖**。手机端弹窗让用户选择保留手机
  或手表，再发 `READ_PROGRESS_APPLY`；手表端不覆盖，回传自己的摘要；
- 远端应用后不回发新进度；只在退出/切后台/重连/手动同步/真实位置变化时
  合并发送，避免每页一条消息；
- 同步失败只记录可诊断状态，不阻断本地阅读或传书；不承诺唤醒被系统
  杀掉的 Lite 应用，下次连接再交换。

## 对接前要验证

- GT 4 Lite Wearable 的设备配对、Wear Engine 收/发能力、签名和权限；
- HarmonyOS NEXT 手机端是否能使用匹配的 Wear Engine 通信接口；
- 消息和文件通道在真实设备上的上限、行为及回调时序；
- 后台/锁屏状态下的发送和接收；
- Unicode、GBK 等由手机处理后，手表上的中文显示与换页行为。
