// SPDX-License-Identifier: GPL-3.0-only
// 多书索引：books.json。只有文件真实存在且校验通过的
// 书籍才对用户可见；索引与文件不一致时以文件为准清理。
import file from '@system.file';
import { INDEX_FILE, bookPath, isSafeBookId, complete }
  from './BookStorage.js';

function parseEntries(text) {
  try {
    const parsed = JSON.parse(text || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => e && isSafeBookId(e.bookId) &&
      typeof e.title === 'string');
  } catch (e) {
    return [];
  }
}

export function loadIndex(cb) {
  file.readText({
    uri: INDEX_FILE,
    length: 65536,
    position: 0,
    success: (data) => complete(cb, parseEntries(data.text)),
    fail: () => complete(cb, [])
  });
}

export function saveIndex(entries, cb) {
  file.writeText({
    uri: INDEX_FILE,
    text: JSON.stringify(entries),
    append: false,
    success: () => complete(cb, { ok: true }),
    fail: (data, code) => complete(cb,
      { ok: false, reason: 'write_index', code: code })
  });
}

export function listBooks(cb) {
  loadIndex((entries) => {
    // 逐本确认文件存在；不存在的条目从索引清除。
    let pending = entries.length;
    const alive = [];
    if (pending === 0) return complete(cb, []);
    entries.forEach((entry) => {
      file.access({
        uri: bookPath(entry.bookId),
        success: () => {
          alive.push(entry);
          if (--pending === 0) {
            if (alive.length === entries.length) {
              return complete(cb, alive);
            }
            saveIndex(alive, () => complete(cb, alive));
          }
        },
        fail: () => {
          if (--pending === 0) {
            saveIndex(alive, () => complete(cb, alive));
          }
        }
      });
    });
  });
}

export function getBook(bookId, cb) {
  if (!isSafeBookId(bookId)) return complete(cb, null);
  loadIndex((entries) => {
    const found = entries.filter((e) => e.bookId === bookId);
    if (found.length === 0) return complete(cb, null);
    file.access({
      uri: bookPath(bookId),
      success: () => complete(cb, found[0]),
      fail: () => complete(cb, null)
    });
  });
}

// 重复发送同一书籍（同 bookId）时不覆盖阅读进度：
// 只更新元信息，保留 addedAt。
export function addBook(entry, cb) {
  loadIndex((entries) => {
    const idx = entries.findIndex((e) => e.bookId === entry.bookId);
    if (idx >= 0) {
      const previous = entries[idx];
      entries[idx] = Object.assign({}, entry, {
        addedAt: previous.addedAt
      });
    } else {
      entries.push(Object.assign({}, entry, {
        addedAt: Date.now()
      }));
    }
    saveIndex(entries, (state) => {
      if (!state.ok) return complete(cb, state);
      complete(cb, { ok: true });
    });
  });
}

export function removeBook(bookId, cb) {
  loadIndex((entries) => {
    const kept = entries.filter((e) => e.bookId !== bookId);
    saveIndex(kept, (state) => complete(cb, state));
  });
}
