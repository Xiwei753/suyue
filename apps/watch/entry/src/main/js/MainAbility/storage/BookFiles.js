// SPDX-License-Identifier: GPL-3.0-only
// Adapted for GT4 Reader using the @system.file patterns documented by
// Explore in HMOS Wearable (MIT). See third_party/NOTICE.md.
import file from '@system.file';

const ROOT = 'internal://app/gt4reader';
const DEMO = ROOT + '/demo.txt';
const PROGRESS = ROOT + '/progress.json';
const ID = 'demo';
const SAMPLE = [
  '这是 GT4 Reader 的中文长文本测试。手表读取本地文件，不依赖手机保持连接。',
  '一页一页向前翻，应该不会丢掉汉字，也不能让文字被圆形屏幕裁切。',
  '测试包含标点符号、英文字母 ABC、数字 123，以及换行。',
  '离线进度需要在退出后继续保留。真正的手机传书尚在对接中。'
].join('\n\n');

function complete(cb, value) {
  if (typeof cb === 'function') cb(value);
}

function ensureRoot(cb) {
  file.access({
    uri: ROOT,
    success: () => complete(cb, { ok: true }),
    fail: () => file.mkdir({
      uri: ROOT,
      success: () => complete(cb, { ok: true }),
      fail: (data, code) => complete(cb, { ok: false, reason: 'mkdir', code: code })
    })
  });
}

// 不在小内存手表 JS 堆里拼出整本书；每次只写一节、成功后继续下一节。
function generateNextSection(section, cb) {
  if (section > 45) {
    complete(cb, { ok: true });
    return;
  }
  const part = '【第' + section + '节】\n' + SAMPLE + '\n\n';
  file.writeText({
    uri: DEMO,
    text: part,
    append: section !== 1,
    success: () => generateNextSection(section + 1, cb),
    fail: (data, code) => complete(cb, { ok: false, reason: 'write_demo', code: code })
  });
}

export function initializeLibrary(cb) {
  ensureRoot((root) => {
    if (!root.ok) return complete(cb, root);
    file.access({
      uri: DEMO,
      success: () => complete(cb, { ok: true }),
      fail: () => generateNextSection(1, cb)
    });
  });
}

export function getDemoBook() {
  return { id: ID, title: '中文阅读测试', uri: DEMO };
}

// 文件 position 是字节偏移。二进制读取避免在中文 UTF-8 的中间截取字符串。
export function readPageBytes(position, cb) {
  const number = Number(position);
  const offset = typeof number === 'number' && isFinite(number) && number > 0 ?
    Math.floor(number) : 0;
  file.readArrayBuffer({
    uri: DEMO,
    position: offset,
    length: 2048,
    success: (data) => {
      if (!data || !data.buffer || typeof data.buffer.byteLength !== 'number') {
        return complete(cb, { ok: false, reason: 'invalid_buffer' });
      }
      complete(cb, { ok: true, offset: offset, bytes: new Uint8Array(data.buffer) });
    },
    fail: (data, code) => complete(cb, { ok: false, reason: 'read_failed', code: code })
  });
}

export function loadProgress(cb) {
  file.readText({
    uri: PROGRESS,
    length: 4096,
    position: 0,
    success: (data) => {
      try {
        const state = JSON.parse(data.text || '{}');
        const offset = Number(state.offset);
        const history = Array.isArray(state.history) ? state.history : [];
        complete(cb, {
          ok: true,
          offset: isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0,
          history: history.filter(x => typeof x === 'number' && isFinite(x) &&
            x >= 0 && Math.floor(x) === x).slice(-60)
        });
      } catch (e) {
        complete(cb, { ok: true, offset: 0, history: [] });
      }
    },
    fail: () => complete(cb, { ok: true, offset: 0, history: [] })
  });
}

export function saveProgress(offset, history, cb) {
  const state = JSON.stringify({
    id: ID,
    offset: Math.max(0, Math.floor(offset)),
    history: history.slice(-60)
  });
  file.writeText({
    uri: PROGRESS,
    text: state,
    append: false,
    success: () => complete(cb, { ok: true }),
    fail: (data, code) => complete(cb, { ok: false, code: code })
  });
}
