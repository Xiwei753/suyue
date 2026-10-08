// SPDX-License-Identifier: GPL-3.0-only
import router from '@system.router';
import { getDemoBook, loadProgress, readPageBytes, saveProgress } from '../../storage/BookFiles';
import { takePage } from '../../reader/PageLayout';

export default {
  data: {
    title: '中文阅读测试',
    body: '正在读取本地文本……',
    pageHint: '请稍候',
    offset: 0,
    nextOffset: 0,
    isBusy: true
  },
  onInit() {
    this.history = [];
    this.title = getDemoBook().title;
    loadProgress((state) => {
      this.history = state.history;
      this.loadPage(state.offset);
    });
  },
  loadPage(offset, previousOffset) {
    if (this.isLoading) return;
    this.isLoading = true;
    this.isBusy = true;
    readPageBytes(offset, (data) => {
      this.isLoading = false;
      if (!data.ok) {
        this.pageHint = '读取失败：' + data.reason;
        this.isBusy = false;
        return;
      }
      const page = takePage(data.bytes, data.offset, 14, 7);
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
      saveProgress(this.offset, this.history, (state) => {
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
  backToLibrary() {
    router.back();
  }
};
