// SPDX-License-Identifier: GPL-3.0-only
// 多书索引：books.json。只有文件真实存在且校验通过的
// 书籍才对用户可见；索引与文件不一致时以文件为准清理。
//
// 可靠性（施工单 P1-12）：
//   - 原子写：books.json.tmp → move 覆盖，
//     不直接覆盖写 books.json；
//   - 写操作串行化：并发 addBook/removeBook
//     不再互相覆盖；
//   - 回滚：写失败时恢复最近一次成功写入
//     的索引内容；新增书籍写索引失败时
//     删除孤儿书籍文件。
import file from '@system.file';
import { INDEX_FILE, bookPath, isSafeBookId,
  complete, deleteFile } from './BookStorage.js';

var INDEX_TMP = INDEX_FILE + '.tmp';
var queue = [];
var running = false;
// 最近一次成功写入的索引内容。
var lastGood = [];

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
    success: (data) => {
      const entries = parseEntries(data.text);
      lastGood = entries;
      complete(cb, entries);
    },
    fail: () => complete(cb, [])
  });
}

// 原子写：tmp → move。
function saveIndexAtomic(entries, cb) {
  file.writeText({
    uri: INDEX_TMP,
    text: JSON.stringify(entries),
    append: false,
    success: () => {
      file.move({
        srcUri: INDEX_TMP,
        dstUri: INDEX_FILE,
        success: () => {
          lastGood = entries;
          complete(cb, { ok: true });
        },
        fail: (data, code) => complete(cb,
          { ok: false, reason: 'index_move', code: code })
      });
    },
    fail: (data, code) => complete(cb,
      { ok: false, reason: 'index_write', code: code })
  });
}

// 写操作串行化：同一时刻只有一个
// 索引写在进行。
function enqueue(task) {
  queue.push(task);
  if (!running) runNext();
}

function runNext() {
  if (queue.length === 0) {
    running = false;
    return;
  }
  running = true;
  const task = queue.shift();
  task(() => runNext());
}

// 写失败回滚：恢复上一份成功写入的
// 索引；若指定了孤儿书籍文件则删除。
function rollback(newEntry, cb) {
  saveIndexAtomic(lastGood, () => {
    if (newEntry && isSafeBookId(newEntry.bookId)) {
      deleteFile(bookPath(newEntry.bookId),
        () => complete(cb,
          { ok: false, reason: 'index_rolled_back' }));
    } else {
      complete(cb, { ok: false,
        reason: 'index_rolled_back' });
    }
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
            enqueue((done) => {
              saveIndexAtomic(alive, () => {
                done();
                complete(cb, alive);
              });
            });
          }
        },
        fail: () => {
          if (--pending === 0) {
            enqueue((done) => {
              saveIndexAtomic(alive, () => {
                done();
                complete(cb, alive);
              });
            });
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
  enqueue((done) => {
    loadIndex((entries) => {
      const idx = entries.findIndex((e) => e.bookId === entry.bookId);
      const isNew = idx < 0;
      if (!isNew) {
        const previous = entries[idx];
        entries[idx] = Object.assign({}, entry, {
          addedAt: previous.addedAt
        });
      } else {
        entries.push(Object.assign({}, entry, {
          addedAt: Date.now()
        }));
      }
      saveIndexAtomic(entries, (state) => {
        if (!state.ok) {
          // 新增失败 → 回滚索引并删除孤儿
          // 书籍文件；更新失败 → 回滚索引。
          rollback(isNew ? entry : null, () => {
            done();
            complete(cb, state);
          });
          return;
        }
        done();
        complete(cb, { ok: true });
      });
    });
  });
}

export function removeBook(bookId, cb) {
  enqueue((done) => {
    loadIndex((entries) => {
      const kept = entries.filter((e) => e.bookId !== bookId);
      saveIndexAtomic(kept, (state) => {
        if (!state.ok) {
          rollback(null, () => {
            done();
            complete(cb, state);
          });
          return;
        }
        done();
        complete(cb, state);
      });
    });
  });
}
