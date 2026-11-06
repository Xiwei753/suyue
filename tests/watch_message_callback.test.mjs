// SPDX-License-Identifier: GPL-3.0-only
// Exercise the actual subscribeMsg callback path without device logs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeSystemFileStub } from './helpers/system_file_stub.mjs';
import { createWatchLoader, writeWearEngineStub,
  writeRouterStub, writeStorageStub } from './helpers/watch_module_loader.mjs';
import { initializeWatchRuntime } from './helpers/watch_runtime.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'suyue-message-callback-'));
const disk = mkdtempSync(join(tmpdir(), 'suyue-message-callback-fs-'));
try {
  const systemFilePath = writeSystemFileStub(tmp, disk);
  const wearengineStubPath = writeWearEngineStub(tmp);
  const routerStubPath = writeRouterStub(tmp);
  const storageStubPath = writeStorageStub(tmp);
  const load = createWatchLoader({
    tmpDir: tmp,
    stubPath: systemFilePath,
    wearengineStubPath,
    routerStubPath,
    storageStubPath,
    sourceOverrides: {
      'wear/PhonePeerConfig.g.js':
        "export const INJECTED_PHONE_APP_ID = '1234567890123456789';"
    }
  });
  const wear = await load('wear/WearReceiver.js');
  const wearengine = (await import(pathToFileURL(wearengineStubPath).href))
    .default;
  const { app, page } = await initializeWatchRuntime(load, { resume: '0' });
  page.onShow();

  const waitFor = async (fn, timeoutMs = 2000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (fn()) return true;
      await new Promise((resolve) => setTimeout(resolve, 4));
    }
    return fn();
  };
  assert.equal(await waitFor(() => page.externalLoaded), true);
  assert.equal(page.receiverStatus,
    '注册回调：isRegister=true（可达性待验）');

  const hello = JSON.stringify({ v: 0, type: 'HELLO' });
  wearengine.__emit({ isRegister: false, isFileType: false,
    message: hello });
  assert.match(page.receiverStatus, /^消息回调: m=string\//);
  assert.match(page.receiverStatus, /json=ok:HELLO$/);
  assert.equal(page.transferStatus, '',
    'HELLO must not surface as unknown or start a transfer');
  assert.equal(wearengine.__calls.filter((call) =>
    call[0] === 'sendMsg').length, 0,
  'HELLO must not emit an application-level reply');

  const badJson = '{"v":0,"type":';
  wearengine.__emit({ isRegister: false, isFileType: false,
    message: badJson });
  assert.match(page.receiverStatus, /json=json-syntax/);
  assert.equal(page.transferStatus, '收到非协议消息');
  assert.ok(!page.receiverStatus.includes(badJson),
    'message diagnostics must not expose raw JSON');

  wearengine.__emit({ isRegister: false, isFileType: false,
    message: JSON.stringify({ type: 'BOOK_META' }) });
  assert.match(page.receiverStatus, /json=invalid-envelope$/);
  assert.equal(page.transferStatus, '协议消息格式无效');

  const body = Buffer.from('callback path small TXT body\n', 'utf8');
  const source = join(disk, 'inbox', 'callback.txt');
  mkdirSync(join(source, '..'), { recursive: true });
  writeFileSync(source, body);
  const sourceUri = 'internal://app/inbox/callback.txt';

  // A file callback before any valid BOOK_META cannot enter storage.
  wearengine.__emit({ isRegister: false, isFileType: true,
    file: sourceUri });
  assert.match(page.receiverStatus, /^文件回调: file=file/);
  assert.ok(!page.receiverStatus.includes(sourceUri),
    'file callback status must not expose a local path');
  assert.equal(page.transferStatus, '传书失败：E_PROTOCOL');

  // Non-string SDK messages are diagnosed but deliberately not decoded.
  wearengine.__emit({ isRegister: false, isFileType: false,
    message: new Uint8Array([123, 34, 118, 34]) });
  assert.match(page.receiverStatus,
    /^消息回调: m=Uint8Array\/4 edge=short .*json=not-string$/);
  assert.equal(page.transferStatus, '消息格式异常：message 不是字符串');

  const digest = createHash('sha256').update(body).digest('hex');
  const bookId = digest.slice(0, 16);
  const meta = {
    v: 0, type: 'BOOK_META', transferId: 'callback-good', bookId,
    title: '回调夹具书', encoding: 'utf-8', bytes: body.length,
    sha256: digest, chunks: 1, chunkBytes: 65536,
    chapters: [{ title: '正文', offset: 0, length: body.length }]
  };
  wearengine.__emit({ isRegister: false, isFileType: false,
    message: JSON.stringify(meta) });
  assert.match(page.receiverStatus, /json=ok:BOOK_META$/);
  assert.ok(!page.receiverStatus.includes(meta.title),
    'message callback summary must not expose a book title');
  assert.equal(page.transferStatus, '接收《回调夹具书》');

  wearengine.__emit({ isRegister: false, isFileType: true,
    file: sourceUri });
  assert.equal(await waitFor(() =>
    page.transferStatus === '接收成功，已加入书架'), true,
  'a valid callback file must be verified and imported');
  assert.equal(page.books.some((book) => book.bookId === bookId), true,
    'verified callback import must appear on the shelf');
  assert.deepEqual(readFileSync(join(disk,
    'gt4reader/books/' + bookId + '.txt')), body);

  const badShaMeta = Object.assign({}, meta, {
    transferId: 'callback-bad-sha', sha256: '00'.repeat(32)
  });
  wearengine.__emit({ isRegister: false, isFileType: false,
    message: JSON.stringify(badShaMeta) });
  wearengine.__emit({ isRegister: false, isFileType: true,
    file: sourceUri });
  assert.equal(await waitFor(() =>
    page.transferStatus === '传书失败：E_DIGEST_MISMATCH'), true,
  'a wrong callback-file SHA must be rejected');
  assert.equal(page.books.filter((book) => book.bookId === bookId).length, 1,
    'a wrong SHA must not add a duplicate shelf entry');
  assert.equal(existsSync(join(disk,
    'gt4reader/temp/callback-bad-sha')), false,
  'a rejected callback transfer must clean its temporary file');

  page.onDestroy();
  app.onDestroy();
  console.info('PASS: subscribeMsg parses once, dispatches HELLO, summarizes safe callback data, and verifies callback file imports');
} finally {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(disk, { recursive: true, force: true });
}
