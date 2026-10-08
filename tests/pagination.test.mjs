// SPDX-License-Identifier: GPL-3.0-only
// Run: node --experimental-default-type=module tests/pagination.test.mjs
import assert from 'node:assert/strict';
import { TextEncoder } from 'node:util';
import { decodeAt, takePage } from '../apps/watch/entry/src/main/js/MainAbility/reader/PageLayout.js';

const encode = new TextEncoder();
const sample = '第一章：你好，世界！ 2026 ABC\n第二行😀\n'.repeat(50);
const raw = encode.encode(sample);
let position = 0;
let reconstructed = '';
let count = 0;
while (position < raw.length) {
  const page = takePage(raw.subarray(position, position + 2048), position, 14, 7);
  assert.ok(page.nextOffset > position, 'pager must advance');
  assert.ok(page.text.length > 0, 'page must contain text');
  reconstructed += page.text;
  position = page.nextOffset;
  count++;
  assert.ok(count < 2000, 'pager must terminate');
}
assert.equal(reconstructed.replace(/\r/g, ''), sample.replace(/\r/g, ''), 'all characters must survive pagination');
assert.equal(decodeAt(encode.encode('😀'), 0)?.size, 4);
assert.equal(decodeAt(encode.encode('你'), 0)?.size, 3);
assert.equal(decodeAt(new Uint8Array([0xe4,0xbd]), 0), null, 'incomplete UTF-8 must not be consumed');
assert.equal(takePage(encode.encode(''), 0, 14, 7).nextOffset, 0);
console.info('PASS: UTF-8 Chinese/emoji, page boundary, reversibility, termination; pages=' + count);
