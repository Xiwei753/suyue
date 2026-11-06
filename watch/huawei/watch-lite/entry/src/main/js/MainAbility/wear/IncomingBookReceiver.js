// SPDX-License-Identifier: GPL-3.0-only
// 手表侧书籍接收入口：按 protocol v0 处理
// BOOK_META / CHAPTERS / ERROR 与 Wear Engine 文件通道
// （receiveFileChannel）。正文只走文件通道。
// 纯逻辑通过 options.transferLogic 注入（Node 可测）；本文件
// 只做 Lite JS I/O 包装，避免把协议状态机重复编进页面包。
//
// ERROR 与阅读进度消息经 Wear Engine sendMsg 发出；
// 传书文件通道不依赖应用层回执。
// 文件通道流式校验窗口（字节）。
var VERIFY_WINDOW = 64 * 1024;

export function IncomingBookReceiver(onStatus, sendToPhone, options) {
  const config = options || {};
  const storage = config.storage || {};
  const transferLogic = config.transferLogic || storage.transferLogic || {};
  // Bound abandoned phone metadata so a later user send is not left busy.
  const staleTimeoutMs = typeof config.staleTimeoutMs === 'number' &&
    isFinite(config.staleTimeoutMs) && config.staleTimeoutMs > 0 ?
    config.staleTimeoutMs : 7 * 60 * 1000;
  const now = typeof config.now === 'function' ?
    config.now : () => Date.now();
  const setTimer = typeof config.setTimeout === 'function' ?
    config.setTimeout : setTimeout;
  const clearTimer = typeof config.clearTimeout === 'function' ?
    config.clearTimeout : clearTimeout;
  const notify = (message) => {
    if (typeof onStatus === 'function') onStatus(message);
  };
  // 元信息错误仅更新本地状态；文件接收结果在本地由
  // receiveFileChannel 回调发布，不发传书应用层回执。
  const respond = (text) => {
    notify(text);
    if (typeof sendToPhone === 'function') {
      sendToPhone(text);
    }
  };
  const transfers = {};   // transferId → state
  const staleTimers = {}; // transferId → bounded cleanup timer
  const expiresAt = {};
  // 当前在途 transferId（单本互斥，P0-2）。
  function activeTransferId() {
    for (const id in transfers) {
      if (transfers[id]) return id;
    }
    return '';
  }

  function result(transferId, bookId, ok, reason) {
    const message = {
      v: 0, type: 'RESULT', transferId: transferId,
      bookId: bookId, ok: ok
    };
    if (!ok) message.reason = reason;
    respond(JSON.stringify(message));
    return message;
  }

  function cleanup(transferId) {
    if (staleTimers[transferId] !== undefined) {
      clearTimer(staleTimers[transferId]);
      delete staleTimers[transferId];
    }
    delete expiresAt[transferId];
    delete transfers[transferId];
  }

  function expireIfStale(transferId, expectedState) {
    if (transfers[transferId] !== expectedState) return;
    delete staleTimers[transferId];
    const remaining = expiresAt[transferId] - now();
    if (remaining > 0) {
      staleTimers[transferId] = setTimer(() =>
        expireIfStale(transferId, expectedState), remaining);
      return;
    }
    cleanup(transferId);
    console.warn('transfer expired reason=E_TIMEOUT');
    notify('传书状态超时，已清理');
  }

  function armStaleCleanup(transferId, state) {
    if (staleTimers[transferId] !== undefined) {
      clearTimer(staleTimers[transferId]);
    }
    expiresAt[transferId] = now() + staleTimeoutMs;
    staleTimers[transferId] = setTimer(() =>
      expireIfStale(transferId, state), staleTimeoutMs);
  }

  function expireStaleTransfers() {
    const currentTime = now();
    for (const transferId in transfers) {
      if (expiresAt[transferId] !== undefined &&
          expiresAt[transferId] <= currentTime) {
        expireIfStale(transferId, transfers[transferId]);
      }
    }
  }

  // 控制消息入口。正文仅通过 receiveFileChannel 到达。
  this.onMessage = function (messageInput) {
    let message;
    if (typeof messageInput === 'string') {
      try {
        message = JSON.parse(messageInput);
      } catch (e) {
        return notify('收到非协议消息');
      }
    } else if (messageInput && typeof messageInput === 'object' &&
        !Array.isArray(messageInput)) {
      // WearReceiver 已在 subscribeMsg 唯一入口解析过的对象直接复用。
      message = messageInput;
    } else {
      return notify('协议消息格式无效');
    }
    if (!message || typeof message !== 'object' ||
        Array.isArray(message) || typeof message.type !== 'string' ||
        message.type.length === 0 || message.type.length > 64 ||
        !Object.prototype.hasOwnProperty.call(message, 'v') ||
        typeof message.v !== 'number') {
      return notify('协议消息格式无效');
    }
    if (message.v !== 0) return notify('协议版本不支持');
    // A fresh user-initiated BOOK_META must not remain blocked by an old
    // transfer if a best-effort E_CANCELLED could not reach the watch.
    expireStaleTransfers();
    switch (message.type) {
      case 'HELLO':
        // 连接问候不改变传输状态，也不触发应用层回执。
        break;
      case 'BOOK_META': {
        const existing = transfers[message.transferId];
        if (existing && existing.fileReceiving) {
          return result(message.transferId, message.bookId,
            false, 'E_BUSY');
        }
        // 单本互斥：第二个不同 transferId 的
        // META 返回 E_BUSY，不得按错误元信息
        // 校验/登记（P0-2）。相同 id 视为重启，
        // 状态整份替换。
        const started = transferLogic.beginTransfer(message,
          activeTransferId());
        if (!started.ok) {
          if (started.reason !== 'E_BUSY') {
            cleanup(message.transferId);
          }
          return result(message.transferId, message.bookId,
            false, started.reason);
        }
        transfers[message.transferId] = started.state;
        armStaleCleanup(message.transferId, started.state);
        if (started.state.expectedChapterChunks > 0) {
          console.info('chapter chunks expected=' +
            started.state.expectedChapterChunks);
        }
        notify('接收《' + message.title + '》');
        break;
      }
      case 'CHAPTERS': {
        const state = transfers[message.transferId];
        if (!state) {
          console.warn('chapter chunk rejected reason=E_PROTOCOL');
          break;
        }
        const applied = transferLogic.applyChapterChunk(state, message);
        if (!applied.ok) {
          state.chapterCatalogInvalid = true;
          state.chapterChunks = {};
          state.chapterChunksReceived = 0;
          state.meta.chapters = [];
          console.warn('chapter chunk rejected reason=' + applied.reason);
          break;
        }
        console.info('chapter chunk index=' +
          (message.index + 1) + '/' + state.expectedChapterChunks +
          ' received=' + state.chapterChunksReceived);
        break;
      }
      case 'ERROR': {
        if (message.code === 'E_CANCELLED' &&
            message.transferId) {
          cleanup(message.transferId);
          notify('传输已取消');
        } else {
          notify('对端错误：' + (message.code || 'unknown'));
        }
        break;
      }
      default:
        notify('未知协议消息：' + message.type);
    }
  };

  // 文件通道（P0-5）：Wear Engine 把手机发来的
  // 文件送达 srcUri（回调给出路径）。这里把它
  // 拷入本应用沙箱 temp/<transferId> → 校验
  // 大小 + 流式 SHA-256 → 原子入库。
  // 任一步失败：清理暂存、绝不入书架。
  this.receiveFileChannel = function (srcUri, fileApi, cb) {
    const state = oldestPendingTransfer();
    if (!state) {
      const outcome = { ok: false,
        reason: 'E_PROTOCOL' };
      return cb(outcome);
    }
    const meta = state.meta;
    if (state.fileReceiving) {
      return cb({ ok: false, reason: 'E_BUSY' });
    }
    if (typeof storage.tempPath !== 'function' ||
        typeof storage.ensureDirs !== 'function' ||
        typeof storage.copyFile !== 'function' ||
        typeof storage.deleteFile !== 'function' ||
        typeof storage.commitVerifiedBook !== 'function' ||
        typeof storage.addBook !== 'function' ||
        typeof storage.fileSize !== 'function' ||
        typeof storage.readWindow !== 'function') {
      return cb({ ok: false, reason: 'E_STORAGE_UNAVAILABLE' });
    }
    // Prevent a second file callback from being associated with the same
    // oldest pending BOOK_META while its first body is being verified.
    state.fileReceiving = true;
    const dst = storage.tempPath(meta.transferId);
    const finish = (ok, reason) => {
      cb(ok ? { ok: true } :
        { ok: false, reason: reason });
    };
    storage.ensureDirs((dirs) => {
      if (!dirs.ok) {
        cleanup(meta.transferId);
        return finish(false, 'E_SPACE');
      }
      storage.copyFile(srcUri, dst, (copied) => {
        if (!copied.ok) {
          cleanup(meta.transferId);
          return finish(false, copied.reason);
        }
        verifyFile(dst, meta, (verified) => {
          if (!verified.ok) {
            // 校验失败：删除暂存，不入书架。
            storage.deleteFile(dst, () => {});
            cleanup(meta.transferId);
            return finish(false, verified.reason);
          }
          // Chapter messages can still be queued while the copied body is
          // being checked. Snapshot only after size/SHA succeeds so a late
          // complete catalog remains available for chapter jumps. The body
          // never waits for a catalog or an app-level acknowledgment.
          const assembledChapters = transferLogic.assembleChapters(state);
          const chapters = assembledChapters.ok ?
            assembledChapters.chapters : [];
          if (!assembledChapters.ok) {
            const missing = transferLogic.missingChapterIndices(state);
            console.warn('file channel proceeding without complete chapter catalog ' +
              'received=' + state.chapterChunksReceived + '/' +
              state.expectedChapterChunks + ' missing=' + missing.join(','));
          }
          storage.commitVerifiedBook(meta.transferId,
            meta.bookId, (committed) => {
              if (!committed.ok) {
                storage.deleteFile(dst, () => {});
                cleanup(meta.transferId);
                return finish(false, 'E_SPACE');
              }
              storage.addBook({
                bookId: meta.bookId,
                title: meta.title,
                encoding: meta.encoding,
                bytes: meta.bytes,
                sha256: meta.sha256,
                chunks: meta.chunks,
                chunkBytes: meta.chunkBytes,
                chapters: chapters
              }, (added) => {
                cleanup(meta.transferId);
                finish(added.ok,
                  added.ok ? undefined : 'E_SPACE');
              });
            });
        });
      });
    });
  };

  // 最早一个尚未完成的传输（BOOK_META 已建
  // 状态、文件通道尚未到达）。单本在途约束。
  function oldestPendingTransfer() {
    let oldest = null;
    for (const id in transfers) {
      if (transfers[id] && !oldest) {
        oldest = transfers[id];
      }
    }
    return oldest;
  }

  // 大小 + 流式 SHA-256 校验：固定窗口读取，
  // 峰值内存只有一个窗口（P1-11）。
  function verifyFile(uri, meta, cb) {
    storage.fileSize(uri, (stat) => {
      if (!stat.ok) {
        return cb({ ok: false, reason: stat.reason });
      }
      if (stat.size !== meta.bytes) {
        return cb({ ok: false,
          reason: 'E_SIZE_MISMATCH' });
      }
      const verifier = transferLogic.createDigestVerifier(meta.sha256);
      readNext(uri, 0, verifier, meta, cb);
    });
  }

  function readNext(uri, offset, verifier, meta, cb) {
    if (offset >= meta.bytes) {
      return cb(verifier.finish(meta.bytes));
    }
    const size = Math.min(VERIFY_WINDOW,
      meta.bytes - offset);
    storage.readWindow(uri, offset, size, (r) => {
      if (!r.ok) {
        return cb({ ok: false, reason: r.reason });
      }
      verifier.update(r.bytes);
      readNext(uri, offset + size, verifier, meta, cb);
    });
  }
}
