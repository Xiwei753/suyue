// SPDX-License-Identifier: GPL-3.0-only
// Run: node --experimental-default-type=module tests/protocol.test.mjs
// Validate examples for the current file-channel transfer protocol.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const examples = new URL('../protocol/examples/', import.meta.url);
const files = readdirSync(examples).filter((f) => f.endsWith('.json'));
const supportedTypes = new Set([
  'HELLO', 'BOOK_META', 'CHAPTERS', 'ERROR',
  'READ_PROGRESS_GET', 'READ_PROGRESS_STATE', 'READ_PROGRESS_APPLY'
]);
assert.ok(files.includes('hello.json'), 'hello example required');
for (const file of files) {
  const message = JSON.parse(readFileSync(new URL(file, examples), 'utf8'));
  assert.equal(message.v, 0, file + ': protocol version must be 0');
  assert.ok(supportedTypes.has(message.type),
    file + ': unsupported message type ' + message.type);
  if (message.type === 'HELLO' ||
      message.type.indexOf('READ_PROGRESS_') === 0) continue;
  assert.equal(typeof message.transferId, 'string',
    file + ': transferId required');
  if (message.type === 'ERROR') {
    assert.equal(typeof message.code, 'string', file + ': code required');
  }
  if (message.type === 'BOOK_META') {
    assert.match(message.bookId, /^[0-9a-f]{16}$/,
      file + ': bookId must be the content digest prefix');
    assert.match(message.sha256, /^[0-9a-f]{64}$/,
      file + ': sha256 must be lowercase hex');
    assert.equal(message.encoding, 'utf-8');
    assert.ok(message.bytes > 0);
    assert.ok(message.chunks >= 1);
    assert.ok(message.chunkBytes >= 1);
    if (message.chapters?.length) {
      let offset = 0;
      for (const chapter of message.chapters) {
        assert.equal(chapter.offset, offset,
          file + ': chapter ranges must be contiguous');
        offset += chapter.length;
      }
      assert.equal(offset, message.bytes,
        file + ': chapters must cover the body bytes');
    }
  }
  if (message.type === 'CHAPTERS') {
    assert.ok(message.index >= 0 && message.index < message.total);
    assert.ok(message.chapters.length > 0);
    assert.ok(Buffer.byteLength(JSON.stringify(message), 'utf8') <= 4096,
      file + ': chapter control message exceeds Wear Engine limit');
  }
}
for (const removed of ['ack.json', 'chunk.json', 'result.json',
  'resume.json', 'android-result.json']) {
  assert.ok(!files.includes(removed),
    removed + ': legacy message-body example must stay removed');
}

console.info('PASS: current protocol examples (file-channel body, control, chapters, progress)');
