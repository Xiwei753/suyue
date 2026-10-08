// SPDX-License-Identifier: GPL-3.0-only
// Run: node --experimental-default-type=module tests/sha256.test.mjs
// 手表端纯 JS SHA-256 与 Node crypto 互验：
// 空输入、ASCII、CJK、emoji、超长文本、跨 64 字节块边界。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'suyue-sha-'));
const modPath = join(tmp, 'Sha256.mjs');
writeFileSync(modPath, readFileSync(
  'apps/watch/entry/src/main/js/MainAbility/util/Sha256.js', 'utf8'));
const { sha256Bytes } = await import(modPath);

const enc = new TextEncoder();
const ref = (bytes) => createHash('sha256').update(bytes).digest('hex');

const cases = [
  new Uint8Array(0),
  enc.encode('abc'),
  enc.encode('你好，世界！'),
  enc.encode('emoji 😀 mixed 中文'),
  enc.encode('a'.repeat(55)),   // 恰好跨块边界
  enc.encode('a'.repeat(56)),
  enc.encode('a'.repeat(64)),
  enc.encode('a'.repeat(65)),
  enc.encode('a'.repeat(1000)),
  enc.encode('第一章：你好。\n'.repeat(5000))
];
for (const c of cases) {
  assert.equal(sha256Bytes(c), ref(Buffer.from(c)),
    'sha256 must match node:crypto');
}
// 已知向量
assert.equal(sha256Bytes(enc.encode('')),
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934' +
  'ca495991b7852b855');
assert.equal(sha256Bytes(enc.encode('abc')),
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9c' +
  'b410ff61f20015ad');
// 大输入（> 1MB）分块一致性
const big = new Uint8Array(2 * 1024 * 1024);
for (let i = 0; i < big.length; i++) big[i] = (i * 31) & 0xff;
assert.equal(sha256Bytes(big), ref(Buffer.from(big)));

console.info('PASS: pure-JS SHA-256 matches node:crypto on all cases');
