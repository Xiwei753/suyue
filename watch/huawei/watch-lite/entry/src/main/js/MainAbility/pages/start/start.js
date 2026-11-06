// SPDX-License-Identifier: GPL-3.0-only
// Minimal cold-start shelf: metadata only, with no storage or Wear imports.
import router from '@system.router';
import { BOOKS as CATALOG } from '../../books/BookCatalog.g.js';

export default {
  data: {
    title: '素阅',
    books: [],
    status: '选择一本书进入阅读'
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
      this.status = '内置书单为空，可进入完整书架';
    }
  },
  openBook(bookId) {
    try {
      router.replace({ uri: 'pages/index/index', params: {
        selectedBookId: bookId,
        resume: '0'
      } });
    } catch (error) {
      this.status = '进入阅读失败，请重开素阅';
      console.error('[suyue] E_START_ROUTE ' + error);
    }
  },
  openShelf() {
    try {
      router.replace({ uri: 'pages/index/index', params: { resume: '1' } });
    } catch (error) {
      this.status = '打开书架失败，请重开素阅';
      console.error('[suyue] E_START_SHELF_ROUTE ' + error);
    }
  }
};
