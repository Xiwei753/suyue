// SPDX-License-Identifier: GPL-3.0-only
// Source/runtime-stub check for cold start: the metadata-only first route must
// reach storage, start the sole receiver, then expose external books. This is
// not GT4 lifecycle or device acceptance evidence.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSystemFileStub } from './helpers/system_file_stub.mjs';
import { createWatchLoader, writeRouterStub, writeStorageStub,
  writeWearEngineStub } from './helpers/watch_module_loader.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'suyue-startup-flow-'));
const disk = mkdtempSync(join(tmpdir(), 'suyue-startup-flow-fs-'));
try {
  const stubPath = writeSystemFileStub(tmp, disk);
  const wearengineStubPath = writeWearEngineStub(tmp);
  const routerStubPath = writeRouterStub(tmp);
  const storageStubPath = writeStorageStub(tmp);
  const load = createWatchLoader({
    tmpDir: tmp, stubPath, wearengineStubPath, routerStubPath,
    storageStubPath,
    sourceOverrides: {
      'wear/PhonePeerConfig.g.js':
        "export const INJECTED_PHONE_APP_ID = 'test-phone-app-id';"
    }
  });
  const app = (await load('app.js')).default;
  const startMod = await load('pages/start/start.js');
  const router = (await import(routerStubPath)).default;
  const wearengine = (await import(wearengineStubPath)).default;
  app.onCreate();

  // A transient index lifecycle before storage setup must not be mistaken for
  // a completed external-library read.
  const indexMod = await load('pages/index/index.js');
  const earlyShelf = Object.create(indexMod.default);
  earlyShelf.data = Object.assign({}, indexMod.default.data);
  earlyShelf.onInit();
  earlyShelf.onShow();
  assert.equal(earlyShelf.externalLoaded, false);
  assert.equal(earlyShelf.resumeLoaded, false);
  router.__calls.length = 0;

  const start = Object.create(startMod.default);
  start.data = Object.assign({}, startMod.default.data);
  start.onInit();
  start.onShow();
  assert.equal(router.__calls[0][0], 'replace');
  assert.equal(router.__calls[0][1], 'pages/storage/storage',
    'the default visible page must bootstrap without a user tap');

  const id = 'aaaaaaaaaaaaaaaa';
  mkdirSync(join(disk, 'gt4reader/books'), { recursive: true });
  writeFileSync(join(disk, 'gt4reader/books', id + '.txt'), 'local text');
  writeFileSync(join(disk, 'gt4reader/books.json'), JSON.stringify([
    { bookId: id, title: '手机传入的书', bytes: 10, addedAt: 1 }
  ]));

  const storageMod = await load('pages/storage/storage.js');
  const storagePage = Object.create(storageMod.default);
  storagePage.data = Object.assign({}, storageMod.default.data);
  storagePage.onInit();
  assert.equal(router.__calls[1][1], 'pages/receiver/receiver');

  const receiverMod = await load('pages/receiver/receiver.js');
  const receiverPage = Object.create(receiverMod.default);
  receiverPage.data = Object.assign({}, receiverMod.default.data);
  receiverPage.onInit();
  assert.equal(router.__calls[2][1], 'pages/index/index');

  const shelf = Object.create(indexMod.default);
  shelf.data = Object.assign({}, indexMod.default.data);
  shelf.token = 0;
  shelf.external = [];
  shelf.onInit();
  shelf.onShow();
  const waitFor = async (fn, timeoutMs = 1500) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (fn()) return true;
      await new Promise((resolve) => setTimeout(resolve, 4));
    }
    return fn();
  };
  assert.equal(await waitFor(() => shelf.externalLoaded), true);
  assert.ok(shelf.books.some((book) => book.bookId === id),
    'external phone-imported books must be visible after cold start');
  assert.equal(wearengine.__calls.filter((call) =>
    call[0] === 'subscribeMsg').length, 1,
  'the default route must register exactly one message receiver');

  // A missing Wear bridge must not stop an already stored book from opening.
  app.data.wearBridge = null;
  router.__calls.length = 0;
  shelf.openBook(id);
  assert.equal(router.__calls[0][1], 'pages/reader/reader');

  const readerMod = await load('pages/reader/reader.js');
  app.data.readerStorage = {
    isLowerHex: () => true,
    isBundled: () => true,
    bundledEntry: () => ({ title: '离线本地书', bytes: 0, chapters: [] })
  };
  const reader = Object.create(readerMod.default);
  reader.bookId = id;
  reader.startReading = () => { reader.started = true; };
  reader.onInit();
  assert.equal(reader.started, true,
    'reader initialization must work without Wear Engine');
  assert.equal(reader.title, '离线本地书');

  app.onDestroy();
  console.info('PASS: automatic cold-start receiver, external shelf, and offline reader paths');
} finally {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(disk, { recursive: true, force: true });
}
