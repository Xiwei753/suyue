// SPDX-License-Identifier: GPL-3.0-only
// 阅读页：按路由参数 bookId 打开对应书籍；
// 每本书独立进度与设置；字号/行距/主题可调，
// 按当前字节位置重排（不丢字、不重复、不跳页）。
// 分页唯一真相：reader/PageLayout.takePage
// （字节偏移、列数、行数）；列数/行数由
// ReaderSettings 推导。
import router from '@system.router';
import { getBook } from '../../storage/LibraryIndex';
import { openBook, readBytes } from '../../storage/BookStorage';
import { loadProgress,
  saveProgress } from '../../storage/ProgressStore';
import { takePage } from '../../reader/PageLayout';
import { normalizeSettings, columnsFor,
  rowsFor } from '../../reader/ReaderSettings';
import { crownSupported } from '../../reader/CrownInput';

export default {
  data: {
    title: '',
    body: '正在读取本地文本……',
    pageHint: '请稍候',
    offset: 0,
    nextOffset: 0,
    fontSize: 20,
    lineHeightRatio: 1.55,
    theme: 'night',
    crown: false,
    isBusy: true,
    // 设置收进二级交互（P2-13）：主操作
    // 只保留上页/下页，避免控件互相挤占。
    settingsOpen: false
  },
  onInit() {
    this.history = [];
    this.bookId = '';
    this.settings = normalizeSettings(null);
    this.crown = crownSupported();
    const params = router.getParams() || {};
    const bookId = params.bookId;
    if (typeof bookId !== 'string' ||
        !/^[0-9a-f]{16}$/.test(bookId)) {
      this.pageHint = '未知书籍，请返回书架选择';
      this.isBusy = false;
      return;
    }
    this.bookId = bookId;
    openBook(bookId, (state) => {
      if (!state.ok) {
        this.pageHint = '书籍不存在或已删除';
        this.isBusy = false;
        return;
      }
      getBook(bookId, (entry) => {
        this.title = entry ? entry.title : '未知书名';
        loadProgress(bookId, (progress) => {
          this.history = progress.history;
          this.applySettings(progress.settings);
          this.loadPage(progress.offset);
        });
      });
    });
  },
  applySettings(settings) {
    this.settings = normalizeSettings(settings);
    this.fontSize = this.settings.fontSize;
    this.lineHeightRatio = this.settings.lineHeightRatio;
    this.theme = this.settings.theme;
  },
  currentSettings() {
    return {
      fontSize: this.fontSize,
      lineHeightRatio: this.lineHeightRatio,
      theme: this.theme
    };
  },
  loadPage(offset, previousOffset) {
    if (this.isLoading || !this.bookId) return;
    this.isLoading = true;
    this.isBusy = true;
    readBytes(this.bookId, offset, 2048, (data) => {
      this.isLoading = false;
      if (!data.ok) {
        this.pageHint = '读取失败：' + data.reason;
        this.isBusy = false;
        return;
      }
      const page = takePage(data.bytes, data.offset,
        columnsFor(this.currentSettings()),
        rowsFor(this.currentSettings()));
      if (!page.text) {
        this.pageHint = '已经读到末尾';
        this.isBusy = false;
        return;
      }
      if (typeof previousOffset === 'number') {
        this.history.push(previousOffset);
        this.history = this.history.slice(-60);
      }
      this.body = page.text;
      this.offset = page.offset;
      this.nextOffset = page.nextOffset;
      this.pageHint = '字节位置 ' + this.offset +
        (this.crown ? ' · 表冠翻页' : '');
      // 进度写完才允许继续翻页，避免多个异步写覆盖更晚的进度。
      saveProgress(this.bookId, this.offset, this.history,
        this.currentSettings(), (state) => {
          if (!state.ok) this.pageHint = '进度保存失败';
          this.isBusy = false;
        });
    });
  },
  nextPage() {
    if (this.isBusy || this.nextOffset <= this.offset) return;
    this.loadPage(this.nextOffset, this.offset);
  },
  previousPage() {
    if (this.isBusy || !this.history.length) return;
    const previous = this.history.pop();
    this.loadPage(previous);
  },
  // 改变字号：列数/行数随之变化，按当前字节
  // 位置重排，不丢字、不跳页。
  changeFont(delta) {
    if (this.isBusy || !this.bookId) return;
    const next = this.fontSize + delta;
    if (next < 14 || next > 32) return;
    this.fontSize = next;
    this.loadPage(this.offset);
  },
  // 切换日间/夜间主题（仅配色，不影响排版）。
  toggleTheme() {
    this.theme = this.theme === 'night' ? 'day' : 'night';
  },
  // 展开/收起设置行（字号、主题）。
  toggleSettings() {
    this.settingsOpen = !this.settingsOpen;
  },
  backToLibrary() {
    router.back();
  }
};
