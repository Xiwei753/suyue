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
console.log('PASS: repo structure, watch JS routes, phone import stack and branding (static only)');
