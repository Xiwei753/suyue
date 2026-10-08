// SPDX-License-Identifier: GPL-3.0-only
// 手表侧书籍接收入口：按 shared/protocol v0 处理
// BOOK_META / CHUNK / FINISH / RESUME / ERROR。
// 纯逻辑在 ./TransferLogic.js（Node 可测）；本文件
// 只做 Lite JS I/O 包装。
//
// 消息通道在内存拼接整本后统一解码落盘（受手表内存
// 限制，适合中小书籍）；大书应走 Wear Engine 文件通道
// （receiveFileChannel）。
import { decodeUtf8Bytes } from '../util/Utf8.js';
import { decodeBase64 } from '../util/Base64.js';
import { ensureDirs, saveTempBook,
  commitVerifiedBook } from '../storage/BookStorage.js';
import { addBook } from '../storage/LibraryIndex.js';
import { beginTransfer, applyChunk,
  assembleBytes, verifyDigest } from './TransferLogic.js';

export function IncomingBookReceiver(onStatus) {
  const notify = (message) => {
    if (typeof onStatus === 'function') onStatus(message);
  };
  const transfers = {};   // transferId → state

  function result(transferId, bookId, ok, reason) {
    const message = {
      v: 0, type: 'RESULT', transferId: transferId,
      bookId: bookId, ok: ok
    };
    if (!ok) message.reason = reason;
    notify(JSON.stringify(message));
    return message;
  }

  function cleanup(transferId) {
    delete transfers[transferId];
  }

  this.onMessage = function (messageText, respond) {
    let message;
    try {
      message = JSON.parse(messageText);
    } catch (e) {
      return notify('收到非协议消息');
    }
    if (message.v !== 0) return notify('协议版本不支持');
    switch (message.type) {
      case 'BOOK_META': {
        const started = beginTransfer(message);
        if (!started.ok) {
          cleanup(message.transferId);
          return result(message.transferId, message.bookId,
            false, started.reason);
        }
        transfers[message.transferId] = started.state;
        notify('接收《' + message.title + '》');
        break;
      }
      case 'CHUNK': {
        const state = transfers[message.transferId];
        if (!state) {
          return result(message.transferId, message.bookId,
            false, 'E_PROTOCOL');
        }
        const payload = decodeBase64(message.payloadB64 || '');
        const applied = applyChunk(state, message, payload);
        if (!applied.ok) {
          cleanup(message.transferId);
          return result(message.transferId, message.bookId,
            false, applied.reason);
        }
        if (typeof respond === 'function') {
          respond({
            v: 0, type: 'ACK', transferId: message.transferId,
            bookId: message.bookId, index: message.index,
            ok: true
          });
        }
        break;
      }
      case 'FINISH': {
        const state = transfers[message.transferId];
        if (!state) {
          return result(message.transferId, message.bookId,
            false, 'E_PROTOCOL');
        }
        const assembled = assembleBytes(state);
        if (!assembled.ok) {
          cleanup(message.transferId);
          return result(message.transferId, state.meta.bookId,
            false, assembled.reason);
        }
        if (!verifyDigest(assembled.bytes, state.meta.sha256)) {
          cleanup(message.transferId);
          return result(message.transferId, state.meta.bookId,
            false, 'E_DIGEST_MISMATCH');
        }
        const text = decodeUtf8Bytes(assembled.bytes);
        persistTransfer(state, text, (saved) => {
          cleanup(message.transferId);
          return result(message.transferId, state.meta.bookId,
            saved.ok, saved.reason);
        });
        break;
      }
      case 'RESUME': {
        const state = transfers[message.transferId];
        if (!state) {
          notify('未知传输：' + message.transferId);
          break;
        }
        // 消息通道按序到达：RESUME 回报当前已收字节数，
        // 发送方从该偏移继续。
        if (typeof respond === 'function') {
          respond({
            v: 0, type: 'RESUME',
            transferId: message.transferId,
            bookId: state.meta.bookId,
            received: [state.receivedCount]
          });
        }
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

  function persistTransfer(state, text, cb) {
    ensureDirs((dirs) => {
      if (!dirs.ok) {
        return cb({ ok: false, reason: 'E_SPACE' });
      }
      saveTempBook(state.meta.transferId, text, (saved) => {
        if (!saved.ok) {
          return cb({ ok: false, reason: 'E_SPACE' });
        }
        commitVerifiedBook(state.meta.transferId,
          state.meta.bookId, (committed) => {
            if (!committed.ok) {
              return cb({ ok: false,
                reason: 'E_SPACE' });
            }
            addBook({
              bookId: state.meta.bookId,
              title: state.meta.title,
              encoding: state.meta.encoding,
              bytes: state.meta.bytes,
              sha256: state.meta.sha256,
              chunks: state.meta.chunks,
              chunkBytes: state.meta.chunkBytes,
              chapters: state.meta.chapters
            }, (added) => {
              cb(added.ok ? { ok: true } :
                { ok: false, reason: 'E_SPACE' });
            });
          });
      });
    });
  }

  // 文件通道：Wear Engine 已把整本书落到 tempUri，
  // 这里读取、核验摘要后转正。
  this.receiveFileChannel = function (tempUri, meta, fileApi,
    cb) {
    const started = beginTransfer(meta);
    if (!started.ok) return cb({ ok: false,
      reason: started.reason });
    fileApi.readArrayBuffer({
      uri: tempUri,
      position: 0,
      length: meta.bytes,
      success: (data) => {
        const bytes = new Uint8Array(data.buffer);
        if (!verifyDigest(bytes, meta.sha256)) {
          return cb({ ok: false, reason: 'E_DIGEST_MISMATCH' });
        }
        commitVerifiedBook(meta.transferId, meta.bookId,
          (committed) => {
            if (!committed.ok) {
              return cb({ ok: false, reason: 'E_SPACE' });
            }
            addBook({
              bookId: meta.bookId,
              title: meta.title,
              encoding: meta.encoding,
              bytes: meta.bytes,
              sha256: meta.sha256,
              chunks: meta.chunks,
              chunkBytes: meta.chunkBytes,
              chapters: meta.chapters
            }, cb);
          });
      },
      fail: (data, code) => cb({ ok: false,
        reason: 'read_failed:' + code })
    });
  };
}
