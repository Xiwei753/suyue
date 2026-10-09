// SPDX-License-Identifier: GPL-3.0-only
// 静态结构检查，不调用 SDK、不能取代两端 HAP 编译。
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const watchConfig = JSON.parse(read('apps/watch/entry/src/main/config.json'));
const phoneManifest = read('apps/phone/entry/src/main/module.json5');
const phoneIndex = read('apps/phone/entry/src/main/ets/pages/Index.ets');
const phoneAppJson = JSON.parse(read('apps/phone/AppScope/app.json5'));
const watchPages = watchConfig.module.js[0].pages;
assert.equal(watchConfig.module.deviceType[0], 'liteWearable');
assert.deepEqual(watchPages, ['pages/index/index', 'pages/reader/reader']);
for (const page of watchPages) {
  for (const ext of ['js', 'hml', 'css']) {
    assert.ok(existsSync('apps/watch/entry/src/main/js/MainAbility/' + page + '.' + ext));
  }
}
assert.equal(watchConfig.module.abilities[0].icon, '$media:icon');
assert.ok(existsSync('apps/watch/entry/src/main/resources/base/media/icon.png'));
assert.ok(existsSync('apps/watch/entry/src/main/resources/base/media/icon_small.png'));
assert.ok(phoneManifest.includes('stageMode') === false, 'module is a Stage manifest, not a lite JS manifest');
assert.ok(phoneIndex.includes('DocumentViewPicker'), 'phone must expose a real document picker');
assert.ok(phoneIndex.includes('importBook'), 'phone index must run a real import flow');
assert.ok(phoneIndex.includes('BookRepository'), 'phone index must list a real library');
assert.ok(phoneIndex.includes('素阅'), 'displayed app name');
assert.equal(JSON.parse(read('apps/watch/entry/src/main/resources/base/element/string.json')).string[0].value, '素阅');
assert.ok(phoneAppJson.app.icon === '$media:app_icon', 'phone app icon must exist');
assert.ok(existsSync('apps/phone/AppScope/resources/base/media/app_icon.png'));
for (const svc of ['BookImportService', 'TextDecodeService',
  'EpubImportService', 'BookRepository', 'ZipReader',
  'WearDeviceService', 'BookTransferService']) {
  assert.ok(existsSync('apps/phone/entry/src/main/ets/services/' + svc + '.ets'),
    'phone service missing: ' + svc);
}
assert.ok(existsSync('apps/phone/entry/src/main/ets/model/BookModels.ets'));
assert.ok(existsSync('apps/phone/entry/src/main/ets/model/TransferModels.ets'));
const phoneIndexFull = read('apps/phone/entry/src/main/ets/pages/Index.ets');
assert.ok(phoneIndexFull.includes('listDevices'),
  'phone index must discover devices');
assert.ok(phoneIndexFull.includes('registerMessageReceiver'),
  'phone index must register for watch RESULT');
assert.ok(phoneIndexFull.includes('RESULT'),
  'phone must wait for watch RESULT receipt');
assert.ok(phoneIndexFull.includes('transferService'),
  'phone index must use BookTransferService');
assert.ok(read('README.md').startsWith('# 素阅 · suyue'));
assert.ok(read('docs/BUILD_AND_TRANSFER.md').includes('尚未产出任何 HAP'));
const protocolReadme = read('shared/protocol/README.md');
for (const t of ['BOOK_META', 'CHUNK', 'ACK', 'FINISH', 'RESULT',
  'RESUME', 'ERROR', 'E_MISSING_CHUNKS', 'E_DIGEST_MISMATCH']) {
  assert.ok(protocolReadme.includes(t),
    'protocol spec must define ' + t);
}
for (const ex of ['hello', 'book-meta', 'chunk', 'ack', 'result',
  'resume', 'error']) {
  assert.ok(existsSync('shared/protocol/examples/' + ex + '.json'),
    'protocol example missing: ' + ex);
}
// 手表端：新书库/接收器/工具模块必须存在，且页面
// 不再引用 getDemoBook 作为阅读入口。
const watchFiles = [
  'storage/BookStorage.js',
  'storage/LibraryIndex.js',
  'storage/ProgressStore.js',
  'wear/IncomingBookReceiver.js',
  'wear/TransferLogic.js',
  'wear/WearReceiver.js',
  'util/Sha256.js',
  'util/Utf8.js',
  'util/Base64.js',
  'reader/PageLayout.js',
  'reader/ReaderSettings.js',
  'reader/CrownInput.js'
];
for (const rel of watchFiles) {
  assert.ok(existsSync('apps/watch/entry/src/main/js/MainAbility/' + rel),
    'watch module missing: ' + rel);
}
const watchReader = read('apps/watch/entry/src/main/js/MainAbility/pages/reader/reader.js');
assert.ok(!watchReader.includes('getDemoBook'),
  'reader must open by bookId, not the demo getter');
assert.ok(watchReader.includes('router.getParams'),
  'reader must read bookId from router params');
assert.ok(watchReader.includes('normalizeSettings'),
  'reader must use ReaderSettings as single truth');
assert.ok(watchReader.includes('crownSupported'),
  'reader must gate crown input behind capability check');
const crownInput = read('apps/watch/entry/src/main/js/MainAbility/reader/CrownInput.js');
assert.ok(crownInput.includes('return false'),
  'crown input must not claim support without SDK verification');
const watchIndex = read('apps/watch/entry/src/main/js/MainAbility/pages/index/index.js');
assert.ok(watchIndex.includes('listBooks'),
  'index page must list the real library');
assert.ok(watchIndex.includes('askDelete'),
  'index page must support delete');

// ---- 施工单复核（issue #1 第二轮）静态检查 ----
// P0-1/P0-2：双端身份分离，手机不得把
// 自己的包名当 remoteApp。
const peerIdentity = read(
  'apps/phone/entry/src/main/ets/model/PeerIdentity.ets');
assert.ok(peerIdentity.includes('PHONE_SELF'),
  'PeerIdentity must define PHONE_SELF');
assert.ok(peerIdentity.includes('WATCH_PEER'),
  'PeerIdentity must define WATCH_PEER');
assert.ok(
  peerIdentity.includes(
    "'com.xiwei753.gt4reader.phone'") &&
  peerIdentity.includes(
    "'com.xiwei753.gt4reader.watch'"),
  'both peer bundle names must be defined');
assert.ok(!phoneIndexFull.includes('phoneFingerprint'),
  'phone index must not carry a loose phoneFingerprint');
assert.ok(phoneIndexFull.includes('WATCH_PEER'),
  'phone index must use the watch peer identity');
assert.ok(phoneIndexFull.includes('isConfigured'),
  'phone index must gate sending on identity config');
const transferService = read(
  'apps/phone/entry/src/main/ets/services/BookTransferService.ets');
assert.ok(transferService.includes('peer: { bundleName'),
  'sendBook must take the peer identity object');
// remoteApp 只能由对端身份构造。
assert.ok(!transferService.includes(
  "registerMessageReceiver(device, BUNDLE_NAME"),
  'phone must not pass its own bundle as remoteApp');

// P0-3：BookMeta 携带消息通道分块描述。
const bookModels = read(
  'apps/phone/entry/src/main/ets/model/BookModels.ets');
assert.ok(bookModels.includes('chunks: number'),
  'BookMeta must declare chunks');
assert.ok(bookModels.includes('chunkBytes: number'),
  'BookMeta must declare chunkBytes');
const importService = read(
  'apps/phone/entry/src/main/ets/services/BookImportService.ets');
assert.ok(importService.includes('chunks,'),
  'import must populate chunks in the meta');
assert.ok(importService.includes('chunkBytes:'),
  'import must populate chunkBytes in the meta');

// P0-4：摘要必须对 normalized 字节计算，
// 且写后复核。
assert.ok(importService.includes(
  'sha256Hex(normalized)'),
  'digest must be computed over normalized bytes');
assert.ok(importService.includes('readFileBytes'),
  'import must verify the written file (post-write check)');
assert.ok(!importService.includes(
  'const digest = await sha256Hex(raw)'),
  'digest must not be computed over the raw file');

// P0-5：文件通道必须复制落盘后校验，不能
// 直接 commit 外部 tempUri。
const watchReceiver = read(
  'apps/watch/entry/src/main/js/MainAbility/wear/WearReceiver.js');
assert.ok(watchReceiver.includes('isFileType'),
  'watch receiver must handle the file channel branch');
assert.ok(watchReceiver.includes('receiveFile('),
  'watch receiver must route files to the receiver');
const incomingReceiver = read(
  'apps/watch/entry/src/main/js/MainAbility/wear/IncomingBookReceiver.js');
assert.ok(incomingReceiver.includes('copyFile('),
  'file channel must copy the received file into the sandbox');
assert.ok(incomingReceiver.includes('verifyFile('),
  'file channel must verify size and digest');
assert.ok(incomingReceiver.includes('deleteFile('),
  'file channel must clean up on failure');

// P0-6：RESULT 必须经 wearengine.sendMsg 回手机。
assert.ok(watchReceiver.includes('wearengine.sendMsg'),
  'watch must send RESULT via wearengine.sendMsg');
assert.ok(incomingReceiver.includes('sendToPhone'),
  'receiver must have a phone response channel');
assert.ok(!incomingReceiver.includes('reply('),
  'receiver must not use a second response channel');

// P1-7：签名材料跨 step 持久，结束步骤
// if: always() 清理。
const watchWf = read('.github/workflows/watch_lite_hap.yml');
const phoneWf = read('.github/workflows/phone_hap.yml');
for (const wf of [watchWf, phoneWf]) {
  assert.ok(!wf.includes("trap 'rm"),
    'workflow must not delete signing material mid-step');
  assert.ok(wf.includes('if: always()'),
    'workflow must clean up signing material unconditionally');
  assert.ok(wf.includes('inject_signing.py'),
    'workflow must stage real signingConfigs');
  assert.ok(wf.includes('$RUNNER_TEMP/suyue-signing'),
    'signing material must persist across steps');
}
assert.ok(existsSync('tools/inject_signing.py'),
  'signing injection helper must exist');

// P1-8：HAP 检查必须验证容器/包名/设备/模式。
const artifactCheck = read('tests/build_artifact_check.sh');
assert.ok(artifactCheck.includes('504b0304'),
  'artifact check must verify the ZIP magic');
assert.ok(artifactCheck.includes('bundleName'),
  'artifact check must verify the bundle name');
assert.ok(artifactCheck.includes('deviceTypes'),
  'artifact check must verify the device type');
assert.ok(artifactCheck.includes('buildMode'),
  'artifact check must verify the build mode');
const watchBuild = read('tools/build_watch_lite.sh');
const phoneBuild = read('tools/build_phone_hap.sh');
for (const script of [watchBuild, phoneBuild]) {
  assert.ok(script.includes('rm -rf entry/build'),
    'build must clean its own output first');
  assert.ok(script.includes('entry-default-$MODE-'),
    'build must pick the HAP matching the requested mode');
}

// P1-9：transferFile 句柄只在终态关闭。
assert.ok(transferService.includes('let settled = false'),
  'transferFile must settle once');
assert.ok(transferService.includes('fs.closeSync(p2pFile.file)'),
  'transferFile must close the handle');
assert.ok(!transferService.includes(
  '} finally {\n              try {\n                fs.closeSync'),
  'transferFile must not close on every progress callback');

// P1-10：RESULT waiter 在发送之前注册。
const sendBookBody = transferService.slice(
  transferService.indexOf('async sendBook'));
assert.ok(sendBookBody.indexOf('registerWaiter') <
  sendBookBody.indexOf('sendMessage'),
  'waiter must be registered before any send');

// P1-11：流式 SHA-256 与导入上限。
const sha256Module = read(
  'apps/watch/entry/src/main/js/MainAbility/util/Sha256.js');
assert.ok(sha256Module.includes('createSha256'),
  'Sha256 must expose a streaming hasher');
assert.ok(transferLogicSrc().includes('createDigestVerifier'),
  'TransferLogic must expose a streaming digest verifier');
assert.ok(importService.includes('MAX_BOOK_BYTES'),
  'import must enforce a book size cap');

// P1-12：索引原子写 + 串行化 + 回滚。
const libraryIndex = read(
  'apps/watch/entry/src/main/js/MainAbility/storage/LibraryIndex.js');
assert.ok(libraryIndex.includes('INDEX_TMP'),
  'index must write to a temp file first');
assert.ok(libraryIndex.includes('enqueue'),
  'index writes must be serialized');
assert.ok(libraryIndex.includes('rollback'),
  'index must roll back on write failure');

// P2-13：阅读器设置收进二级交互。
const readerJs = read(
  'apps/watch/entry/src/main/js/MainAbility/pages/reader/reader.js');
const readerHml = read(
  'apps/watch/entry/src/main/js/MainAbility/pages/reader/reader.hml');
assert.ok(readerJs.includes('settingsOpen'),
  'reader must gate settings behind a toggle');
const mainControls = readerHml.slice(
  readerHml.indexOf('主操作'),
  readerHml.indexOf('二级交互'));
assert.ok(mainControls.includes('上页') &&
  mainControls.includes('下页'),
  'reader main row must keep prev/next');
assert.ok(!mainControls.includes('A+'),
  'reader main row must not hold font controls');

// P2-14：demo 迁移必须条件化，不得回造假元数据。
assert.ok(watchIndex.includes('migrateDemo'),
  'index must migrate the demo conditionally');
assert.ok(watchIndex.includes('file.access'),
  'migration must check the legacy file exists');
assert.ok(!watchIndex.includes('fail: () => this.registerDemo()'),
  'migration must not register on failure');
assert.ok(!watchIndex.includes('bytes: 0'),
  'migration must not fabricate metadata');

// P2-15：表冠保持诚实的不支持声明。
// （crownInput 已在上方检查过 return false。）
assert.ok(crownInput.includes('return false'),
  'crown must stay unsupported until SDK-verified');

console.log('PASS: repo structure, watch JS routes, phone import stack and branding (static only)');

// TransferLogic 源码（静态检查用）。
function transferLogicSrc() {
  return read(
    'apps/watch/entry/src/main/js/MainAbility/wear/TransferLogic.js');
}
