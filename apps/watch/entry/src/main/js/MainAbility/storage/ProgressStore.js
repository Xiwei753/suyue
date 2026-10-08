// SPDX-License-Identifier: GPL-3.0-only
// 每本书独立的阅读进度：字节偏移、翻页历史、字号。
// 不同书互不串书；写入失败明确回报。
import file from '@system.file';
import { progressPath, isSafeBookId, complete }
  from './BookStorage.js';

export function loadProgress(bookId, cb) {
  if (!isSafeBookId(bookId)) {
    return complete(cb, { ok: true, offset: 0, history: [],
      fontSize: 20 });
  }
  file.readText({
    uri: progressPath(bookId),
    length: 4096,
    position: 0,
    success: (data) => {
      try {
        const state = JSON.parse(data.text || '{}');
        const offset = Number(state.offset);
        const history = Array.isArray(state.history) ?
          state.history : [];
        const fontSize = Number(state.fontSize);
        complete(cb, {
          ok: true,
          offset: isFinite(offset) && offset >= 0 ?
            Math.floor(offset) : 0,
          history: history.filter((x) => typeof x === 'number' &&
            isFinite(x) && x >= 0 && Math.floor(x) === x)
            .slice(-60),
          fontSize: isFinite(fontSize) && fontSize >= 14 &&
            fontSize <= 32 ? Math.floor(fontSize) : 20
        });
      } catch (e) {
        complete(cb, { ok: true, offset: 0, history: [],
          fontSize: 20 });
      }
    },
    fail: () => complete(cb, { ok: true, offset: 0, history: [],
      fontSize: 20 })
  });
}

export function saveProgress(bookId, offset, history, fontSize, cb) {
  if (!isSafeBookId(bookId)) {
    return complete(cb, { ok: false, reason: 'unsafe_book_id' });
  }
  const state = JSON.stringify({
    bookId: bookId,
    offset: Math.max(0, Math.floor(offset)),
    history: history.slice(-60),
    fontSize: Math.max(14, Math.min(32, Math.floor(fontSize)))
  });
  file.writeText({
    uri: progressPath(bookId),
    text: state,
    append: false,
    success: () => complete(cb, { ok: true }),
    fail: (data, code) => complete(cb,
      { ok: false, reason: 'write_progress', code: code })
  });
}
