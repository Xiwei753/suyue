// SPDX-License-Identifier: GPL-3.0-only
// Run: node --experimental-default-type=module tests/watch_utils.test.mjs
// 手表端纯 JS 工具与 Node 互验：
//   - Utf8.decodeUtf8Bytes 与 TextDecoder 一致（含非法序列替换）
//   - Base64.decodeBase64 与 Buffer base64 一致（含非法字符/填充）
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'suyue-wu-'));
const load = (rel) => {
  const p = join(tmp, rel.replaceAll('/', '_') + '.mjs');
  writeFileSync(p, readFileSync(
    'apps/watch/entry/src/main/js/MainAbility/' + rel, 'utf8'));
  return import(p);
};

const enc = new TextEncoder();
const { decodeUtf8Bytes } = await load('util/Utf8.js');
const { decodeBase64 } = await load('util/Base64.js');

// UTF-8 解码
const texts = [
  '',
  'abc',
  '你好，世界！',
  'emoji 😀 混排',
  'a\nb\tc',
  '《》“”‘’，。：；？！'
];
for (const t of texts) {
  const bytes = enc.encode(t);
  assert.equal(decodeUtf8Bytes(bytes), t,
    'utf8 decode must round-trip: ' + JSON.stringify(t));
}
// 非法序列：截断的 3 字节字符 → 替换符
assert.equal(decodeUtf8Bytes(new Uint8Array([0xe4, 0xbd])), '�');
// 非法首字节
assert.equal(decodeUtf8Bytes(new Uint8Array([0xff, 0xfe])), '��');
// 混合：有效 + 非法 + 有效
assert.equal(
  decodeUtf8Bytes(new Uint8Array([0xe4, 0xbd, 0xa0, 0xff, 0x41])),
  '你�A');

// Base64 解码
const b64cases = [
  '',
  'a',
  'ab',
  'abc',
  'abcd',
  'hello world 你好',
  '素阅 suyue 😀'
];
for (const t of b64cases) {
  const bytes = enc.encode(t);
  const b64 = Buffer.from(bytes).toString('base64');
  assert.deepEqual(Buffer.from(decodeBase64(b64)), Buffer.from(bytes),
    'base64 decode must match Buffer: ' + t);
}
// 带填充
assert.deepEqual(Buffer.from(decodeBase64('aGVsbG8=')),
  Buffer.from('hello'));
// 非法字符被忽略
assert.deepEqual(Buffer.from(decodeBase64('aGVs\nbG8=')),
  Buffer.from('hello'));
// 标准字符集完整性：'+/' 解码为 0xFB（尾部 4 位不足一字节，丢弃）。
assert.deepEqual(Buffer.from(decodeBase64('+/')),
  Buffer.from([0xfb]));

console.info('PASS: watch Utf8/Base64 utils match Node references');
