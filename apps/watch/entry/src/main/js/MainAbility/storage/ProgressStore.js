// SPDX-License-Identifier: GPL-3.0-only
// 每本书独立的阅读进度与设置：字节偏移、
// 翻页历史、字号、行距、主题。
// 不同书互不串书；写入失败明确回报。
import file from '@system.file';
import { progressPath, isSafeBookId, complete }
  from './BookStorage.js';
import { DEFAULT_SETTINGS } from '../reader/ReaderSettings.js';

function normalizeNumber(value, min, max, fallback) {
  const num = Number(value);
  return isFinite(num) ?
    Math.max(min, Math.min(max, Math.floor(num))) :
    fallback;
}

export function loadProgress(bookId, cb) {
  if (!isSafeBookId(bookId)) {
    return complete(cb, { ok: true, offset: 0,
      history: [], settings: DEFAULT_SETTINGS });
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
        const rawSettings = state.settings;
        complete(cb, {
          ok: true,
          offset: isFinite(offset) && offset >= 0 ?
            Math.floor(offset) : 0,
          history: history.filter((x) => typeof x === 'number' &&
            isFinite(x) && x >= 0 && Math.floor(x) === x)
            .slice(-60),
          settings: {
            fontSize: normalizeNumber(
              rawSettings && rawSettings.fontSize,
              14, 32, DEFAULT_SETTINGS.fontSize),
            lineHeightRatio: (function () {
              const ratio = Number(rawSettings &&
                rawSettings.lineHeightRatio);
              return isFinite(ratio) ?
                Math.max(1.3, Math.min(2.0,
                  Math.round(ratio * 100) / 100)) :
                DEFAULT_SETTINGS.lineHeightRatio;
            })(),
            theme: (rawSettings &&
              (rawSettings.theme === 'day' ||
                rawSettings.theme === 'night')) ?
              rawSettings.theme : DEFAULT_SETTINGS.theme
          }
        });
      } catch (e) {
        complete(cb, { ok: true, offset: 0, history: [],
          settings: DEFAULT_SETTINGS });
      }
    },
    fail: () => complete(cb, { ok: true, offset: 0,
      history: [], settings: DEFAULT_SETTINGS })
  });
}

export function saveProgress(bookId, offset, history,
  settings, cb) {
  if (!isSafeBookId(bookId)) {
    return complete(cb, { ok: false, reason: 'unsafe_book_id' });
  }
  const state = JSON.stringify({
    bookId: bookId,
    offset: Math.max(0, Math.floor(offset)),
    history: history.slice(-60),
    settings: {
      fontSize: normalizeNumber(settings && settings.fontSize,
        14, 32, DEFAULT_SETTINGS.fontSize),
      lineHeightRatio: settings &&
        isFinite(Number(settings.lineHeightRatio)) ?
        Math.max(1.3, Math.min(2.0,
          Math.round(Number(settings.lineHeightRatio) * 100) /
          100)) : DEFAULT_SETTINGS.lineHeightRatio,
      theme: (settings &&
        (settings.theme === 'day' ||
          settings.theme === 'night')) ?
        settings.theme : DEFAULT_SETTINGS.theme
    }
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
