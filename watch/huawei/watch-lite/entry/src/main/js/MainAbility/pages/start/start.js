// SPDX-License-Identifier: GPL-3.0-only
// Minimal cold-start shelf: metadata only, with no storage or Wear imports.
import router from '@system.router';
import { BOOKS as CATALOG } from '../../books/BookCatalog.g.js';

export default {
  data: {
    title: '素阅',
    books: [],
    status: '正在准备书架和传书接收器…'
  },
  onInit() {
    var books = [];
    for (var i = 0; i < CATALOG.length; i++) {
      var row = CATALOG[i];
      if (Array.isArray(row)) {
        books.push({ bookId: row[0], title: row[1], bytes: row[2] });
      } else if (row && typeof row.bookId === 'string') {
        books.push({ bookId: row.bookId, title: row.title,
          bytes: row.bytes });
      }
    }
    this.books = books;
    if (books.length === 0) {
      this.status = '正在读取本地书架…';
    }
  },
  onShow() {
    // Give the metadata-only first page a visible lifecycle before loading
    // storage and Wear Engine code. This is bounded to one route attempt.
    if (!this.bootstrapStarted) this.openShelf();
  },
  routeToStorage(selectedBookId, resume) {
    if (this.bootstrapStarted) return;
    this.bootstrapStarted = true;
    try {
      router.replace({ uri: 'pages/storage/storage', params: {
        selectedBookId: selectedBookId || '',
        resume: resume || '1'
      } });
    } catch (error) {
      this.bootstrapStarted = false;
      this.status = '书架初始化失败，请点按重试';
      console.error('[suyue] E_START_STORAGE_ROUTE ' + error);
    }
  },
  openBook(bookId) {
    this.routeToStorage(bookId, '0');
  },
  openShelf() {
    this.routeToStorage('', '1');
  }
};
