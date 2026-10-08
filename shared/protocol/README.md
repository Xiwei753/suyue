# 双端传书协议 v0 草案

**状态：设计中，未和 Wear Engine 绑定，也未经 GT 4 真机验证。**

## 基本原则

- 手机负责解析 TXT/EPUB，并统一输出 UTF-8 章节文本；手表负责落盘与阅读。
- 每一本书有稳定 `bookId`，每次传输有唯一 `transferId`。
- 大文本按 **UTF-8 字节**切分；按原始字节恢复后再解码，不要把一个 UTF-8 汉字拆成两个独立字符串。
- 每个 CHUNK 有 `index` 和 `total`，接收方对同 `transferId + index` 重复消息幂等确认。
- 收到全部块后校验 `sha256`，成功才把临时文件变成正式书籍文件。
- `chunkBytes` 不预设为 4KB；需先实测手机与 GT 4 各自可用的消息/文件通道。

## 消息结构（逻辑层，接口绑定后可能微调）

共同字段：`v`（协议版本，目前为 0）、`type`、`transferId`。

| type | 方向 | 必要数据 | 说明 |
| --- | --- | --- | --- |
| HELLO | 双向 | capabilities | 告知客户端/协议能力 |
| BOOK_META | 手机 → 表 | bookId、title、encoding、bytes、sha256、chunks | 书籍元数据 |
| CHUNK | 手机 → 表 | bookId、index、total、payload | 二进制数据块；payload 编码形式待具体 API 确认 |
| ACK | 表 → 手机 | bookId、index、ok | 收到的块及校验结果 |
| FINISH | 手机 → 表 | bookId | 发送完毕，请求整体校验 |
| RESULT | 表 → 手机 | bookId、ok、reason | 是否成功保存 |
| RESUME | 双向 | bookId、received | 中断恢复，返回已有块索引 |

## 错误处理

- 丢块或超时：只重试缺失的块，限制重试次数，报告失败原因。
- SHA-256 不匹配：不得把临时文件变成可读书籍。
- 空间不足：明确提示、可清理暂存文件。
- 完成后写入书籍元信息及默认阅读进度。再次发送同一书籍时避免覆盖旧阅读进度。

## 对接前要验证

- GT 4 Lite Wearable 的设备配对、Wear Engine 收/发能力、签名和权限；
- HarmonyOS NEXT 手机端是否能使用匹配的 Wear Engine 通信接口；
- 消息和文件通道在真实设备上的上限、行为及回调时序；
- 后台/锁屏状态下的发送和接收；
- Unicode、GBK 等由手机处理后，手表上的中文显示与换页行为。
