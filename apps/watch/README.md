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
- `reader/ReaderSettings.js`：字号/行距/主题的单一真相；列数/行数由
  其推导，改变设置按当前字节位置重排，不丢字、不重复、不跳页。
- `reader/CrownInput.js`：表冠输入。已按上游 MIT 示例
  `sportwatch-how-to-use-crown` 的机制接入——`reader.hml` 里放一个
  1×1 透明 `<slider ref="crownProxy">`，`onShow` 调
  `rotation({focus:true})` 抢占表冠焦点，旋转经 `onchange` 进入
  `createCrownTracker()` 换算成前后翻页（绝对档位→相对步进，
  超程跳变丢弃，不足一页的余量保留）。**GT4 真机是否真的送达旋转
  事件、每页需要转几格，都还没验证**，因此 `crownStatus()` 返回
  `'unverified'`，阅读页保留触屏上页/下页，不伪造“已支持”。
- `pages/index`：真实书架（列书名、打开、二次确认删除、空书架提示）；
  首次启动把旧演示书迁入新书库（迁移桥接，设备验证后删除）。
- `pages/reader`：按路由 `bookId` 打开；字号 A-/A+、日间/夜间主题、
  行距随设置重排；未知 bookId 不崩溃。
- `wear/WearReceiver.js`：Wear Engine 适配层，版本检查 + 手机指纹门控，消息路由到 `IncomingBookReceiver`。
- `wear/PeerConfig.js` 和 `config.json` 的 `supportLists` 里有待填写的手机端证书指纹位置。**两处值必须按真实应用签名配置一致**，不能把占位文本当作生产值。

## Lite 运行时限制（本机实测，issue #2）

工具链：HarmonyOS Command Line Tools 26.0.0.821（Linux x64），
Lite JS SDK 在 `$HOME/.harmony-cli/sdk/default/openharmony/js`。
用包里的 `bin/jerry-snapshot`、`bin/jerry` 直接实测得到：

- **没有 RegExp**：正则字面量 `/abc/` 在解析期就 `SyntaxError`；
  `new RegExp('a')` 运行期 `ReferenceError`；`'x'.replace('a','b')`
  抛 `TypeError`（replace 仍依赖正则实现）。手表端所有格式校验因此
  走 `util/Validate.js` 的字符比较。
- 其它实测缺失项：`padStart` / `padEnd` / `DataView`。
- 可正常使用：JSON、数组 `forEach/map/filter/indexOf/slice`、
  `String.split/trim/indexOf/slice/repeat/startsWith`、`Object.keys/assign`、
  `Uint8Array`（含 `set`/`subarray`）、`ArrayBuffer`、闭包、原型继承、
  `Object.defineProperty`、位运算。

**为什么这条限制很危险**：`ace-loader` 的 `lite-snapshot-plugin` 把每个
页面 JS 用 `jerry-snapshot` 编成 `.bc` 快照，但转换失败时**只打印一行
`Failed to convert ... to a snapshot.`，并不会让构建失败**。结果是
`BUILD SUCCESSFUL`、HAP 也产出了，但缺少该页 `.bc`，手表上根本打不开。
本项目就踩过：`reader.js`、`TransferLogic.js`、`BookStorage.js` 里的
5 处正则曾让 `index.bc`/`reader.bc` 双双缺失。

两道守门防止复发：
`tests/source-contract.test.mjs` 扫描手表源码禁止正则与上述缺失 API；
`tests/build_artifact_check.sh` 在 Lite 产物上校验每个页面 JS 都有配对
`.bc`，把"绿色构建掩盖坏应用"变成硬失败。

## 构建与安装

- 工程结构已对齐 Lite Wearable 参考示例（`build-profile.json5` 含 `signingConfig`/`strictMode`、`hvigor/hvigor-config.json5`、`entry/hvigorfile.ts`、`resources/base/media/icon{,_small}.png`、`config.json` 的 `"$media:icon"`）。
- 本地构建：`tools/build_watch_lite.sh debug|release`；需要 DevEco `hvigorw` 与 Lite Wearable SDK，缺失时明确报错，不用 Node 检查冒充构建。
- **本机已真实编译成功；签名目前被拒绝，产物是未签名的**（release）：
  `entry-default-unsigned.hap`，192,409 字节。原因不是缺材料，而是
  `signing/` 里现有的 Profile 授权**手机**（包名 `com.xiwei.suyue`），
  与手表 HAP 的包名不一致，脚本按包名预检**拒绝签名**并退回未签名产物。
  这个坑很隐蔽：拿手机 profile 签手表 HAP，`hap-sign-tool` 照样报
  `Sign Hap success!`，但设备按包名校验会拒绝安装——"签名成功"没有意义。
  **手表包名专属的 Profile 尚未签发**；有效且用途匹配的 `.p12` / `.cer` 可复用。
  包内快照齐全：`app.bc` (806 B)、`pages/index/index.bc` (29,938 B)、
  `pages/reader/reader.bc` (21,802 B)。
- **包名**：手表仍是历史值 `com.xiwei753.gt4reader.watch`，**待确认后另改**；
  手机已按 AGC 证书对齐为 `com.xiwei.suyue`。
- 签名走的是**未签名构建 + `hap-sign-tool sign-app` + `verify-app`**：
  hvigor 的 `signingConfigs` 在这个 legacy Lite 工程上实测失败
  （`SignHap` → `00308018 ENOENT: stat '<dir>/material'`），
  与素笺 CI 采用同一条绕行路径。材料放在 gitignore 掉的
  `signing/` 目录，说明见 [signing/README.md](../../signing/README.md)。
- **从未在真机安装验证**：签名（一旦包名匹配）也只证明包完整、证书链有效，
  不代表 GT 4 接受安装（profile 是 debug 类型、绑定 UDID，
  且设备端还会校验包名/UDID/有效期）。
- 图标必须小尺寸：`tools/gen_watch_icons.py` 曾生成 1024×1024 的
  `icon.png`，Lite 资源转换把它展成原始 RGBA（1024²×4+8 = 4,194,312
  字节）塞进 HAP，整包膨胀到 4.45 MB。改成与上游示例一致的
  104×104 / 92×92 后，`.bin` 降到 43,272 / 33,864 字节，HAP 只有
  190 KB 量级。
- CI：`.github/workflows/watch_lite_hap.yml`（自托管 `hmos-deveco` runner；签名材料经 `secrets.WATCH_SIGNING_MATERIAL` 注入；产物只上传 HAP）。**注意该 job 目前在排队而非运行**：GitHub 托管机装不了 Lite SDK，必须先注册带工具链的自托管 runner。该 workflow 的源码现已改成先产出未签名 Lite HAP，再用 `hap-sign-tool sign-app` 签名并 `verify-app` 验签；**但自托管 Runner 仍未运行，暂不能称 CI 构建通过**。
- 安装步骤与待验证清单：[../../docs/WATCH_INSTALL.md](../../docs/WATCH_INSTALL.md)。
- **尚未在任何真机上安装或运行；`6.1.1(24)` 版本号待 GT 4 真机核对。**

## 未完成

- 手机发书 → 手表接收文件 → 校验 → 加入书架的完整闭环；Wear Engine 文件通道回调字段待真机确认。
- **签名**：现有签名材料属于手机（`com.xiwei.suyue`），**手表自己的
  Profile 尚未签发**，所以手表只能产出未签名 HAP；包名匹配后签名
  与"可安装"状态才谈得上验证。
- 表冠翻页：机制已接入并通过纯逻辑单测，但 **GT4 是否真的下发旋转事件、
  每页阈值多少，必须真机实测**（见 `reader/CrownInput.js` 顶部说明）。
- 圆屏真实像素分页（当前为估算字宽，待 GT4 46mm 真机校准）。
- 在 GT 4 46mm 上安装、启动、翻页、恢复进度，并核对
  `targetSdkVersion`/`compatibleSdkVersion` 的 `6.1.1(24)`
  是否为 GT 4 开发安装实际可用的版本。**编译通过不等于真机适配通过。**
- 迁移收尾：演示书桥接已删除（`storage/BookFiles.js` 已移除；空书库不再自动重造测试书，只在旧 `demo.txt` 真实存在时迁移）。仍待真机验证迁移路径本身。

## 引用及许可证

代码基于三个 [Lite Wearable MIT 示例](../../docs/REFERENCES.md) 所介绍的接口与处理方式改造；`WearReceiver.js` 保留了来源声明。完整 MIT 条款及原作者声明放在 [third_party/NOTICE.md](../../third_party/NOTICE.md) 和相应许可文件中。华为 SDK wrapper 的第三方实现没有打包进来。

## 开发提示

使用支持 Lite Wearable 的 DevEco 打开本目录，配置本机签名以及匹配的 Lite Wearable SDK。`readArrayBuffer` 字节窗口、FA HML 的 `for` 循环与 `$idx` 事件参数、中文分页均需真机测试。不提交签名密钥。
