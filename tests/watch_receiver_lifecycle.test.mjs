// SPDX-License-Identifier: GPL-3.0-only
// Bounded recovery for the single application-level Wear Engine receiver.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSystemFileStub } from './helpers/system_file_stub.mjs';
import { createWatchLoader, writeRouterStub, writeStorageStub }
  from './helpers/watch_module_loader.mjs';

const peerConfig = `
export const PHONE_BUNDLE_NAME = 'com.xiwei.suyue';
export const PHONE_APP_ID = 'test-phone-app-id';
export const WATCH_BUNDLE_NAME = 'con.xiwei.suyue.gt4';
`;

function createHarness(failVersion) {
  const tmp = mkdtempSync(join(tmpdir(), 'suyue-wear-lifecycle-'));
  const disk = mkdtempSync(join(tmpdir(), 'suyue-wear-lifecycle-fs-'));
  const wearengineStubPath = join(tmp, 'wearengine_lifecycle_stub.mjs');
  writeFileSync(wearengineStubPath, `
export const control = { failVersion: ${failVersion}, calls: [] };
const stub = {
  getWearEngineVersion(o) {
    control.calls.push('getWearEngineVersion');
    if (control.failVersion) o && o.fail && o.fail('service unavailable', 206);
    else o && o.complete && o.complete('5.0.2.401');
  },
  setPackageName(o) {
    control.calls.push('setPackageName');
    o && o.complete && o.complete();
  },
  setFingerprint(o) {
    control.calls.push('setFingerprint');
    o && o.complete && o.complete();
  },
  subscribeMsg(o) {
    control.calls.push('subscribeMsg');
    o && o.success && o.success({ isRegister: true });
  },
  unsubscribeMsg() { control.calls.push('unsubscribeMsg'); },
  sendMsg(o) { o && o.success && o.success(); }
};
export default stub;
`);
  const stubPath = writeSystemFileStub(tmp, disk);
  const routerStubPath = writeRouterStub(tmp);
  const storageStubPath = writeStorageStub(tmp);
  const load = createWatchLoader({
    tmpDir: tmp,
    stubPath,
    wearengineStubPath,
    routerStubPath,
    storageStubPath,
    sourceOverrides: { 'wear/PeerConfig.js': peerConfig }
  });
  return { tmp, disk, load, wearengineStubPath };
}

function calls(control, name) {
  return control.calls.filter((call) => call === name).length;
}

const harnesses = [];
try {
  // app.onCreate fails before subscribeMsg. The first shelf page gets one
  // bounded retry even though app.onCreate was observed; repeated onShow
  // without a hide must not retry again.
  {
    const h = createHarness(true);
    harnesses.push(h);
    const app = (await h.load('app.js')).default;
    const receiver = await h.load('wear/WearReceiver.js');
    const { control } = await import(h.wearengineStubPath);

    app.onCreate();
    assert.equal(calls(control, 'getWearEngineVersion'), 1);
    assert.equal(receiver.getReceiverStatus(), '读取版本失败 code=206');

    receiver.onReceiverPageShow('pages/index/index');
    assert.equal(calls(control, 'getWearEngineVersion'), 2,
      'first page must retry one failed app.onCreate registration');
    assert.equal(receiver.getReceiverStatus(), '读取版本失败 code=206');

    receiver.onReceiverPageShow('pages/index/index');
    assert.equal(calls(control, 'getWearEngineVersion'), 2,
      'a repeated visible-page callback must not trigger another retry');
    app.onDestroy();
  }

  // A successful single receiver survives the shelf/reader route changes.
  {
    const h = createHarness(false);
    harnesses.push(h);
    const app = (await h.load('app.js')).default;
    const receiver = await h.load('wear/WearReceiver.js');
    const { control } = await import(h.wearengineStubPath);

    app.onCreate();
    assert.equal(calls(control, 'getWearEngineVersion'), 1);
    assert.equal(calls(control, 'subscribeMsg'), 1);
    receiver.onReceiverPageShow('pages/index/index');

    receiver.markPageNavigation('pages/reader/reader');
    receiver.onReceiverPageHide();
    receiver.onReceiverPageShow('pages/reader/reader');
    receiver.onReceiverPageShow('pages/reader/reader');

    receiver.markPageNavigation('pages/index/index');
    receiver.onReceiverPageHide();
    receiver.onReceiverPageShow('pages/index/index');
    assert.equal(calls(control, 'getWearEngineVersion'), 1);
    assert.equal(calls(control, 'subscribeMsg'), 1,
      'route changes must retain exactly one app-level subscription');
    assert.equal(calls(control, 'unsubscribeMsg'), 0,
      'route changes must not cancel the receiver');

    app.onDestroy();
    assert.equal(calls(control, 'unsubscribeMsg'), 1,
      'app destruction must unregister the one receiver');
  }

  console.info('PASS: first-page retry is bounded; shelf/reader routes keep one receiver');
} finally {
  for (const h of harnesses) {
    rmSync(h.tmp, { recursive: true, force: true });
    rmSync(h.disk, { recursive: true, force: true });
  }
}
