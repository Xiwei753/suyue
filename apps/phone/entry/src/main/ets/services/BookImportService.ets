// SPDX-License-Identifier: GPL-3.0-only
// TXT/EPUB 导入：读取系统文件选择器授权的 URI → 规范化 UTF-8 →
// 写入应用私有目录 → 登记书库。任何一步失败都不登记为成功。
import { common } from '@kit.AbilityKit';
import { fileIo } from '@kit.CoreFileKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { util } from '@kit.ArkTS';
import { BookMeta, BookKind, BookStatus, ImportResult,
  newBookId, toArrayBuffer } from '../model/BookModels';
import { decodeToText } from './TextDecodeService';
import { importEpub, EpubChapter } from './EpubImportService';
import { BookRepository } from './BookRepository';

const READ_CHUNK = 1024 * 1024;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = cryptoFramework.createHash('SHA256');
  hash.update({ data: toArrayBuffer(bytes) });
  const digest = await hash.digest();
  const view = new Uint8Array(digest.data);
  let hex = '';
  for (let i = 0; i < view.length; i++) {
    hex += view[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// 分块读取授权 URI 的全部字节。
// 待验证：DocumentViewPicker 返回的 URI 在重启后是否仍可打开；
// 导入流程内立即读取，避免依赖持久化授权。
export function readUriBytes(uri: string): Uint8Array {
  const file = fileIo.openSync(uri, fileIo.OpenMode.READ_ONLY);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const buf = new Uint8Array(READ_CHUNK);
      const read = fileIo.readSync(file.fd, buf.buffer,
        { offset: total, length: READ_CHUNK });
      if (read <= 0) break;
      chunks.push(buf.subarray(0, read));
      total += read;
    }
  } finally {
    fileIo.closeSync(file.fd);
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

function extensionOf(uri: string): string {
  const path = decodeURIComponent(uri.split('?')[0]);
  const lower = path.toLowerCase();
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.epub')) return 'epub';
  return '';
}

// 防 ../ 、重复名、奇怪 URI：只取最后一段作为展示名。
export function displayFilename(uri: string): string {
  const path = decodeURIComponent(uri.split('?')[0]);
  const parts = path.split('/');
  const name = parts[parts.length - 1] || '未命名书籍';
  if (name.includes('..') || name.length === 0) {
    throw new Error('非法文件名：' + name);
  }
  return name;
}

function writeNormalizedFile(path: string, bytes: Uint8Array): void {
  const file = fileIo.openSync(path,
    fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE |
    fileIo.OpenMode.TRUNC);
  try {
    fileIo.writeSync(file.fd, toArrayBuffer(bytes));
  } finally {
    fileIo.closeSync(file.fd);
  }
}

function utf8Bytes(text: string): Uint8Array {
  return new util.TextEncoder().encode(text);
}

// 把 EPUB 章节合并为单一规范化 UTF-8 文件，并返回章节字节区间。
function packChapters(chapters: EpubChapter[]):
  { bytes: Uint8Array; offsets: Array<{ title: string; offset: number; length: number }> } {
  const encoded = chapters.map((c) => ({
    title: c.title,
    bytes: utf8Bytes(c.text)
  }));
  let total = 0;
  for (const e of encoded) total += e.bytes.length;
  const out = new Uint8Array(total);
  const offsets: Array<{ title: string; offset: number; length: number }> = [];
  let pos = 0;
  for (const e of encoded) {
    out.set(e.bytes, pos);
    offsets.push({ title: e.title, offset: pos, length: e.bytes.length });
    pos += e.bytes.length;
  }
  return { bytes: out, offsets };
}

export async function importBook(context: common.UIAbilityContext,
  uri: string): Promise<ImportResult> {
  const ext = extensionOf(uri);
  if (!ext) {
    return { ok: false, reason: '仅接受 TXT / EPUB 文件' };
  }
  let raw: Uint8Array;
  try {
    raw = readUriBytes(uri);
  } catch (e) {
    return { ok: false, reason: '读取文件失败：' + String(e) };
  }
  if (raw.length === 0) {
    return { ok: false, reason: '文件为空' };
  }

  const digest = await sha256Hex(raw);
  const bookId = newBookId(digest, '');

  try {
    let title: string;
    let chapters: Array<{ title: string; offset: number; length: number }>;
    let normalized: Uint8Array;

    if (ext === 'txt') {
      const decoded = decodeToText(raw);
      if (!decoded) {
        return { ok: false,
          reason: '编码识别失败（GBK/GB18030 解码在当前系统不可用），未导入' };
      }
      normalized = utf8Bytes(decoded.text);
      chapters = [{
        title: '正文', offset: 0, length: normalized.length
      }];
      title = displayFilename(uri).replace(/\.[^.]+$/, '');
    } else {
      const epub = importEpub(raw);
      const packed = packChapters(epub.chapters);
      normalized = packed.bytes;
      chapters = packed.offsets;
      title = epub.title;
    }

    const repository = new BookRepository(context);
    const booksDir = context.filesDir + '/books';
    fileIo.mkdirSync(booksDir, true);
    const filePath = booksDir + '/' + bookId + '.txt';
    writeNormalizedFile(filePath, normalized);

    const now = Date.now();
    const meta: BookMeta = {
      bookId,
      title,
      kind: ext === 'txt' ? BookKind.TXT : BookKind.EPUB,
      filePath,
      bytes: normalized.length,
      sha256: digest,
      chapters,
      importedAt: now,
      updatedAt: now,
      status: BookStatus.READY
    };
    repository.register(meta);
    return { ok: true, book: meta };
  } catch (e) {
    return { ok: false, reason: '导入失败：' + String(e) };
  }
}
