// SPDX-License-Identifier: GPL-3.0-only
// 静态结构检查，不调用 SDK、不能取代两端 HAP 编译。
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const watchConfig = JSON.parse(read('apps/watch/entry/src/main/config.json'));
const phoneManifest = read('apps/phone/entry/src/main/module.json5');
const phoneIndex = read('apps/phone/entry/src/main/ets/pages/Index.ets');
const watchPages = watchConfig.module.js[0].pages;
assert.equal(watchConfig.module.deviceType[0], 'liteWearable');
assert.deepEqual(watchPages, ['pages/index/index', 'pages/reader/reader']);
for (const page of watchPages) {
  for (const ext of ['js', 'hml', 'css']) {
    assert.ok(existsSync('apps/watch/entry/src/main/js/MainAbility/' + page + '.' + ext));
  }
}
assert.ok(phoneManifest.includes('stageMode') === false, 'module is a Stage manifest, not a lite JS manifest');
assert.ok(phoneIndex.includes('DocumentViewPicker'), 'phone must expose a real document picker');
assert.ok(phoneIndex.includes('素阅'), 'displayed app name');
assert.equal(JSON.parse(read('apps/watch/entry/src/main/resources/base/element/string.json')).string[0].value, '素阅');
assert.ok(read('README.md').startsWith('# 素阅 · suyue'));
assert.ok(read('docs/BUILD_AND_TRANSFER.md').includes('未建立 Lite HAP'));
console.log('PASS: repo structure, watch JS routes, phone picker and branding (static only)');
