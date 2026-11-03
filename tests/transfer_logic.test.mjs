// SPDX-License-Identifier: GPL-3.0-only
// Run: node --experimental-default-type=module tests/transfer_logic.test.mjs
// 手表接收纯逻辑：BOOK_META、章节目录分片、文件通道摘要校验。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'suyue-tl-'));
// 递归加载手表 JS 模块：把相对 import 改写为绝对
// file:// 路径，使 @system.* 之外的纯逻辑模块可在
// Node 中直接运行。
const loaded = new Map();
const load = async (rel) => {
  if (loaded.has(rel)) return loaded.get(rel);
  const srcPath = join('watch/huawei/watch-lite/entry/src/main/js/MainAbility',
    rel);
  let src = readFileSync(srcPath, 'utf8');
  const importRe = /from\s+'([^']+)'/g;
  let m;
  const deps = [];
  while ((m = importRe.exec(src)) !== null) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    // 依赖路径保持相对 MainAbility，与 load() 的
    // 内部拼接一致。
    const depPath = join(rel, '..', spec);
    const depModule = await load(depPath);
    const depTmp = join(tmp,
      depPath.replaceAll('/', '_') + '.mjs');
    deps.push({ spec, depTmp, depModule });
  }
  const modPath = join(tmp, rel.replaceAll('/', '_') + '.mjs');
  for (const dep of deps) {
    src = src.replace("from '" + dep.spec + "'",
      "from '" + dep.depTmp + "'");
  }
  writeFileSync(modPath, src);
  const mod = await import(modPath);
  loaded.set(rel, mod);
  return mod;
};

const { validateBookMeta, beginTransfer, applyChapterChunk,
  assembleChapters, missingChapterIndices, createDigestVerifier } =
  await load('wear/TransferLogic.js');

const enc = new TextEncoder();
const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');

const bookText = '第一章：你好，世界！\r\n第二章：emoji 😀 混排。'
  .repeat(30);
const bookBytes = enc.encode(bookText);
const chunkSize = 97;

function makeMeta() {
  return {
    v: 0,
    transferId: 'tl-transfer-001',
    bookId: sha256(bookBytes).substring(0, 16),
    title: '《测试》书名\n带换行',
    encoding: 'utf-8',
    bytes: bookBytes.length,
    sha256: sha256(bookBytes),
    chunks: Math.ceil(bookBytes.length / chunkSize),
    chunkBytes: chunkSize,
    chapters: [{ title: '正文', offset: 0, length: bookBytes.length }]
  };
}

// ---------- BOOK_META 校验 ----------
const meta = makeMeta();
assert.equal(validateBookMeta(meta).ok, true);
assert.equal(validateBookMeta({ ...meta, chapters: undefined }).ok, true,
  'chapter directory is optional to the body metadata');
for (const broken of [
  { ...meta, v: 1 },
  { ...meta, bookId: 'XYZ' },
  { ...meta, encoding: 'gbk' },
  { ...meta, sha256: 'too-short' },
  { ...meta, chunks: 0 },
  { ...meta, bytes: -1 },
  { ...meta, title: 123 },
  { ...meta, transferId: '' }
]) {
  assert.equal(validateBookMeta(broken).ok, false,
    'must reject broken meta: ' + JSON.stringify(broken).substring(0, 60));
}

// ---------- 文件通道流式摘要校验 ----------
{
  const verifier = createDigestVerifier(meta.sha256);
  for (let offset = 0; offset < bookBytes.length; offset += chunkSize) {
    verifier.update(bookBytes.subarray(offset,
      Math.min(offset + chunkSize, bookBytes.length)));
  }
  assert.deepEqual(verifier.finish(bookBytes.length), { ok: true });
}
{
  const verifier = createDigestVerifier('00'.repeat(32));
  verifier.update(bookBytes);
  assert.deepEqual(verifier.finish(bookBytes.length), {
    ok: false, reason: 'E_DIGEST_MISMATCH'
  });
}
{
  const verifier = createDigestVerifier(meta.sha256);
  verifier.update(bookBytes);
  assert.deepEqual(verifier.finish(bookBytes.length + 1), {
    ok: false, reason: 'E_SIZE_MISMATCH'
  });
}

// ---------- 长章节目录 CHAPTERS 分片 ----------
{
  const chunkedMeta = Object.assign({}, makeMeta(), {
    chapters: [],
    chapterChunks: 2
  });
  assert.equal(validateBookMeta(chunkedMeta).ok, true);
  const state = beginTransfer(chunkedMeta).state;
  assert.equal(state.expectedChapterChunks, 2);
  const part1 = [
    { title: '第一章', offset: 0, length: 20 },
    { title: '第二章', offset: 20, length: 30 }
  ];
  const part2 = [
    { title: '第三章', offset: 50, length: bookBytes.length - 50 }
  ];
  assert.equal(applyChapterChunk(state, {
    transferId: chunkedMeta.transferId, bookId: chunkedMeta.bookId,
    index: 1, total: 2, chapters: part2
  }).ok, true, 'out-of-order chunk 1 is accepted');
  assert.equal(applyChapterChunk(state, {
    transferId: chunkedMeta.transferId, bookId: chunkedMeta.bookId,
    index: 0, total: 2, chapters: part1
  }).ok, true, 'chunk 0 completes the catalog');
  assert.equal(applyChapterChunk(state, {
    transferId: chunkedMeta.transferId, bookId: chunkedMeta.bookId,
    index: 0, total: 2, chapters: part1
  }).duplicate, true, 'duplicate chapter chunk is idempotent');
  const assembledChapters = assembleChapters(state);
  assert.equal(assembledChapters.ok, true);
  assert.deepEqual(assembledChapters.chapters.map((c) => c.title),
    ['第一章', '第二章', '第三章']);
  assert.equal(state.meta.chapters.length, 0,
    'assembled chunks are returned as one complete catalog without mutating BOOK_META');
}
{
  const chunkedMeta = Object.assign({}, makeMeta(), {
    chapters: [], chapterChunks: 2
  });
  const state = beginTransfer(chunkedMeta).state;
  applyChapterChunk(state, {
    transferId: chunkedMeta.transferId, bookId: chunkedMeta.bookId,
    index: 0, total: 2,
    chapters: [{ title: '第一章', offset: 0, length: 10 }]
  });
  assert.equal(assembleChapters(state).reason, 'E_MISSING_CHAPTERS');
  assert.deepEqual(missingChapterIndices(state), [1],
    'missing catalog indexes must be available for diagnostics');
  assert.equal(applyChapterChunk(state, {
    transferId: chunkedMeta.transferId, bookId: chunkedMeta.bookId,
    index: 2, total: 2,
    chapters: [{ title: '越界', offset: 0, length: 1 }]
  }).reason, 'E_PROTOCOL');
  const malformedCatalog = beginTransfer(Object.assign({}, chunkedMeta, {
    chapters: [{ title: '正文', offset: 0, length: 1 }]
  })).state;
  assert.equal(malformedCatalog.chapterCatalogInvalid, true,
    'malformed optional catalog data must be discarded without rejecting body metadata');
  assert.deepEqual(assembleChapters(malformedCatalog),
    { ok: false, reason: 'E_PROTOCOL' });
}

console.info('PASS: watch transfer logic (meta validation, streaming digest, ' +
  'chapter chunks)');
