// SPDX-License-Identifier: GPL-3.0-only
// 阅读页：按路由参数 bookId 打开对应书籍；
// 每本书独立进度；字号可调并按当前位置重排。
import router from '@system.router';
import { getBook } from '../../storage/LibraryIndex';
import { openBook, readBytes } from '../../storage/BookStorage';
import { loadProgress,
  saveProgress } from '../../storage/ProgressStore';
import { takePage } from '../../reader/PageLayout';

// 圆屏 466×466：正文区 316×242，安全边距内。
// 列数/行数按字号估算（真实像素分页待 GT4 真机校准）。
function columnsFor(fontSize) {
  return Math.max(8, Math.floor(300 / fontSize));
}
function rowsFor(fontSize) {
  return Math.max(4, Math.floor(230 / (fontSize * 1.55)));
}

export default {
  data: {
    title: '',
    body: '正在读取本地文本……',
    pageHint: '请稍候',
    offset: 0,
    nextOffset: 0,
    fontSize: 20,
    isBusy: true
  },
  onInit() {
    this.history = [];
    this.bookId = '';
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
          this.fontSize = progress.fontSize;
          this.loadPage(progress.offset);
        });
      });
    });
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
        columnsFor(this.fontSize), rowsFor(this.fontSize));
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
      this.pageHint = '字节位置 ' + this.offset;
      // 进度写完才允许继续翻页，避免多个异步写覆盖更晚的进度。
      saveProgress(this.bookId, this.offset, this.history,
        this.fontSize, (state) => {
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
  // 改变字号：按当前字节位置重排，不丢字、不跳页。
  changeFont(delta) {
    if (this.isBusy || !this.bookId) return;
    const next = this.fontSize + delta;
    if (next < 14 || next > 32) return;
    this.fontSize = next;
    this.loadPage(this.offset);
  },
  backToLibrary() {
    router.back();
  }
};
