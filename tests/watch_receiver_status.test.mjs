// SPDX-License-Identifier: GPL-3.0-only
// Watch shelf status must keep receiver identity and local receive results
// separate, especially before the first successful file import.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSystemFileStub } from './helpers/system_file_stub.mjs';
import { createWatchLoader, writeWearEngineStub,
  writeRouterStub, writeStorageStub } from './helpers/watch_module_loader.mjs';

function createHarness(phoneAppId) {
  const tmp = mkdtempSync(join(tmpdir(), 'suyue-receiver-status-'));
  const disk = mkdtempSync(join(tmpdir(), 'suyue-receiver-status-fs-'));
  const stubPath = writeSystemFileStub(tmp, disk);
  const wearengineStubPath = writeWearEngineStub(tmp);
  const routerStubPath = writeRouterStub(tmp);
  const storageStubPath = writeStorageStub(tmp);
  const loader = createWatchLoader({
    tmpDir: tmp,
    stubPath,
    wearengineStubPath,
    routerStubPath,
    storageStubPath,
    sourceOverrides: {
      'wear/PhonePeerConfig.g.js':
        "export const INJECTED_PHONE_APP_ID = '" + phoneAppId + "';"
    }
  });
  return { tmp, disk, loader };
}

const harnesses = [];
try {
  const h = createHarness('');
  harnesses.push(h);
  const receiver = await h.loader('wear/WearReceiver.js');
  const pageMod = await h.loader('pages/index/index.js');
  const page = Object.create(pageMod.default);
  page.data = Object.assign({}, pageMod.default.data);
  page.token = 0;
  page.external = [];
  page.resume = '0';
  page.onInit();

  assert.equal(page.transferStatus, '',
    'idle receive status must not claim that phone identity is missing');
  assert.equal(receiver.getReceiveStatus(), '',
    'receiver must start without a stale transfer/configuration message');
  receiver.beginReceive('test');
  assert.equal(page.receiverStatus, '接收器未配置：缺少手机 APP ID',
    'missing phone APP ID belongs in the receiver status');
  assert.equal(page.transferStatus, '',
    'missing phone APP ID must not appear as a transfer result');

  const good = createHarness('test-phone-app-id');
  harnesses.push(good);
  const goodReceiver = await good.loader('wear/WearReceiver.js');
  const goodPageMod = await good.loader('pages/index/index.js');
  const goodPage = Object.create(goodPageMod.default);
  goodPage.data = Object.assign({}, goodPageMod.default.data);
  goodPage.token = 0;
  goodPage.external = [];
  goodPage.resume = '0';
  goodPage.onInit();
  goodReceiver.beginReceive('test');
  assert.equal(goodPage.receiverStatus,
    '注册回调：isRegister=true（可达性待验）',
    'successful subscribe callback must be visible as receiver state');
  assert.equal(goodPage.transferStatus, '',
    'successful receiver registration must not leave a false transfer state');
  assert.equal(goodReceiver.getReceiveStatus(), '');

  goodReceiver.reportLocalReceiveOutcome({ ok: true });
  assert.equal(goodPage.transferStatus, '接收成功，已加入书架',
    'verified local import remains a separate shelf message');
  goodReceiver.reportLocalReceiveOutcome({
    ok: false, reason: 'E_DIGEST_MISMATCH'
  });
  assert.equal(goodPage.transferStatus, '传书失败：E_DIGEST_MISMATCH');

  const hml = readFileSync(
    'watch/huawei/watch-lite/entry/src/main/js/MainAbility/pages/index/index.hml',
    'utf8');
  assert.ok(hml.includes('if="{{ transferStatus !== \'\' }}"'),
    'idle transfer status row must be hidden on the small watch screen');
  assert.ok(!hml.includes('传书未配置'),
    'the shelf must not hard-code the old false configuration message');

  console.info('PASS: receiver configuration, registration, and local import status stay distinct');
} finally {
  for (const h of harnesses) {
    rmSync(h.tmp, { recursive: true, force: true });
    rmSync(h.disk, { recursive: true, force: true });
  }
}
