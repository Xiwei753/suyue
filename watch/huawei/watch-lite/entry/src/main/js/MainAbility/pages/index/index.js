// SPDX-License-Identifier: GPL-3.0-only
// 完整书架（issue #10）：只由轻量启动书架按需进入。
//
// 设计：内置书单在构建期生成（books/BookCatalog.g.js，仅元数据），
// onInit 里先同步显示内置书目，再初始化文件和通信服务。外部（手机
// 传书）书目作为独立来源在后台合并；初始化失败时保留书架页面。
//
// 关键：本页只负责完整书架；冷启动的 pages/start/start 不加载本页依赖。
// 小说正文按需读取（issue #10）。
import router from '@system.router';
import { BOOKS as CATALOG } from '../../books/BookCatalog.g.js';
import { isLowerHex } from '../../util/Validate';

function appData() {
  if (typeof getApp !== 'function') return null;
  try {
    const app = getApp();
    return app && app.data && typeof app.data === 'object' ? app.data : null;
  } catch (error) {
    return null;
  }
}

function wearBridge() {
  const data = appData();
  return data && data.wearBridge ? data.wearBridge : null;
}

function isValidBookId(bookId) {
  return typeof bookId === 'string' && isLowerHex(bookId, 16);
}

function catalogBooks() {
  var books = [];
  for (var i = 0; i < CATALOG.length; i++) {
    var row = CATALOG[i];
    if (Array.isArray(row)) {
      books.push({ bookId: row[0], title: row[1], bytes: row[2],
        chapters: [], origin: 'builtin' });
    } else if (row && typeof row.bookId === 'string') {
      books.push({ bookId: row.bookId, title: row.title,
        bytes: row.bytes, chapters: row.chapters || [], origin: 'builtin' });
    }
  }
  return books;
}

export default {
  data: {
    title: '素阅',
    books: [],
    status: '书架就绪',
    transferStatus: '',
    receiverStatus: '接收器：尚未启动',
    confirmId: '',
    selectedBookId: '',
    // 从阅读页显式返回时传 resume=0，避免又自动打开同一本书。
    resume: '1'
  },
  onInit() {
    // This route stays small and displays metadata before runtime setup.
    this.token = (this.token || 0) + 1;
    this.runtimeReady = false;
    this.hasShownShelf = false;
    this.external = [];
    this.resumeWanted = this.resume !== '0' && !this.selectedBookId;
    this.resumeLoaded = false;
    this.resumeDone = false;
    this.externalLoaded = false;
    this.lastBookId = '';
    this.bundledBooks = catalogBooks();
    this.refreshShelf();

    const app = appData();
    if (!app) {
      this.status = '阅读服务尚未就绪';
      return;
    }

    // Storage and receiver bundles load only after this screen is selected.
    if (!app.storageRuntimeInitialized) {
      try {
        router.replace({ uri: 'pages/storage/storage', params: {
          resume: this.resume,
          selectedBookId: this.selectedBookId || ''
        } });
        return;
      } catch (error) {
        this.status = '阅读服务初始化失败';
        console.error('[suyue] E_STORAGE_ROUTE ' + error);
        return;
      }
    }

    this.readerStorage = app.readerStorage || null;
    if (!this.readerStorage) {
      this.receiverStatus = app.storageRuntimeError || '阅读存储不可用';
      this.status = '书架已显示；阅读服务未就绪';
      return;
    }
    this.bookStorage = {
      ensureDirs: this.readerStorage.ensureDirs,
      deleteBook: this.readerStorage.deleteBook
    };
    this.libraryIndex = {
      listBooks: this.readerStorage.listBooks,
      removeBook: this.readerStorage.removeBook
    };
    this.progressStore = {
      loadLastBook: this.readerStorage.loadLastBook,
      clearProgress: this.readerStorage.clearProgress
    };
    this.runtimeReady = true;

    if (!app.wearRuntimeInitialized) {
      try {
        router.replace({ uri: 'pages/receiver/receiver', params: {
          resume: this.resume,
          selectedBookId: this.selectedBookId || ''
        } });
        return;
      } catch (error) {
        app.receiverStatus = '接收器初始化失败';
        console.error('[suyue] E_WEAR_ROUTE ' + error);
      }
    }

    const wear = wearBridge();
    if (wear) {
      try {
        this.transferStatus = wear.getReceiveStatus();
        this.receiverStatus = wear.getReceiverStatus();
        wear.setReceiveStatusHandler((message) => {
          this.handleReceiveStatus(message);
        });
        wear.setReceiverStatusHandler((message) => {
          this.receiverStatus = message;
        });
      } catch (error) {
        this.receiverStatus = '接收器初始化失败';
        console.error('[suyue] E_WEAR_STATUS ' + error);
      }
    } else {
      this.receiverStatus = app.receiverStatus || '接收器未启动';
    }

    this.refreshShelf();
    this.loadExternal();
    if (this.selectedBookId) {
      const selectedBookId = this.selectedBookId;
      this.selectedBookId = '';
      this.openBook(selectedBookId);
    } else {
      this.loadResume();
    }
  },
  // 从阅读页返回时刷新外部书目（内置书单固定）。
  onShow() {
    const wear = wearBridge();
    if (wear && typeof wear.onReceiverPageShow === 'function') {
      wear.onReceiverPageShow('pages/index/index');
    }
    // onShow can run on an index instance that is about to route through
    // storage/receiver. Do not turn that early lifecycle into a false
    // completed external-library load.
    if (!this.runtimeReady) return;
    if (!this.hasShownShelf) {
      this.hasShownShelf = true;
      return;
    }
    this.loadExternal();
    this.tryAutoResume();
  },
  onHide() {
    const wear = wearBridge();
    if (wear && typeof wear.onReceiverPageHide === 'function') {
      wear.onReceiverPageHide();
    }
  },
  onDestroy() {
    const wear = wearBridge();
    if (wear && typeof wear.setReceiveStatusHandler === 'function') {
      wear.setReceiveStatusHandler(null);
    }
    if (wear && typeof wear.setReceiverStatusHandler === 'function') {
      wear.setReceiverStatusHandler(null);
    }
  },
  // 内置书单（同步）：只做一次轻量拷贝，带上 origin。
  bundledList() {
    var out = [];
    var catalog = this.bundledBooks || [];
    for (var i = 0; i < catalog.length; i++) {
      out.push({
        bookId: catalog[i].bookId,
        title: catalog[i].title,
        bytes: catalog[i].bytes,
        chapters: catalog[i].chapters || [],
        origin: 'builtin'
      });
    }
    return out;
  },
  mergeShelf() {
    var merged = this.bundledList();
    var seen = {};
    var i;
    for (i = 0; i < merged.length; i++) seen[merged[i].bookId] = true;
    var ext = this.external || [];
    for (i = 0; i < ext.length; i++) {
      if (seen[ext[i].bookId]) continue;
      merged.push(ext[i]);
    }
    return merged;
  },
  refreshShelf() {
    this.books = this.mergeShelf();
    this.status = this.books.length > 0 ?
      '书架就绪（' + this.books.length + ' 本）' :
      '书架为空：可从手机传书';
  },
  // 后台加载外部书目。任何失败都只记录，不影响内置书架。
  loadExternal() {
    if (!this.runtimeReady || !this.bookStorage || !this.libraryIndex) return;
    const token = this.token;
    try {
      this.bookStorage.ensureDirs((dirs) => {
        if (token !== this.token) return;
        if (!dirs.ok) {
          console.error('[suyue] E_EXTERNAL_DIRS ' +
            (dirs.stage || '') + ' code=' + (dirs.code || dirs.reason || '?'));
          this.externalLoaded = true;
          this.tryAutoResume();
          return;
        }
        try {
          this.libraryIndex.listBooks((books) => {
            if (token !== this.token) return;
            this.external = books;
            this.externalLoaded = true;
            this.refreshShelf();
            this.tryAutoResume();
          });
        } catch (error) {
          this.externalLoaded = true;
          this.tryAutoResume();
          console.error('[suyue] E_EXTERNAL_THROW ' + error);
        }
      });
    } catch (error) {
      this.externalLoaded = true;
      this.tryAutoResume();
      console.error('[suyue] E_EXTERNAL_THROW ' + error);
    }
  },
  // 冷启动续读：只读一个轻量 bookId；书架已经先渲染，存储失败也不阻塞。
  loadResume() {
    if (!this.runtimeReady || !this.progressStore) return;
    try {
      this.progressStore.loadLastBook((state) => {
        this.resumeLoaded = true;
        if (state && state.ok && state.bookId) {
          this.lastBookId = state.bookId;
        }
        this.tryAutoResume();
      });
    } catch (error) {
      this.resumeLoaded = true;
      this.tryAutoResume();
    }
  },
  tryAutoResume() {
    if (!this.runtimeReady || !this.resumeWanted || this.resumeDone ||
        !this.resumeLoaded) return;
    if (!this.lastBookId) {
      if (this.externalLoaded) this.resumeDone = true;
      return;
    }
    var available = null;
    for (var i = 0; i < this.books.length; i++) {
      if (this.books[i].bookId === this.lastBookId) {
        available = this.books[i];
        break;
      }
    }
    if (!available) {
      // 外部书要等异步书目；内置书找不到则立即留在书架。
      if (this.externalLoaded) this.resumeDone = true;
      return;
    }
    this.resumeDone = true;
    this.openBook(this.lastBookId);
  },
  handleReceiveStatus(message) {
    if (typeof message !== 'string') return;
    try {
      const event = JSON.parse(message);
      if (event && event.type === 'RESULT') {
        if (event.ok) {
          this.transferStatus = '接收成功，已加入书架';
          this.loadExternal();
        } else {
          this.transferStatus = '传书失败：' +
            (event.reason || '未知错误');
        }
        return;
      }
      // ACK 等协议消息不覆盖界面提示。
      return;
    } catch (error) {
      this.transferStatus = message;
    }
  },
  // 查找当前书架里指定的书（bookId 必须是 16 位小写十六进制）。
  findBook(bookId) {
    if (!isValidBookId(bookId)) {
      this.status = '打开失败：参数无效（E_BOOK_ID_INVALID）';
      console.error('[suyue] E_BOOK_ID_INVALID ' + bookId);
      return null;
    }
    for (let i = 0; i < this.books.length; i++) {
      if (this.books[i].bookId === bookId) return this.books[i];
    }
    this.status = '打开失败：未找到该书（E_BOOK_MISSING）';
    console.error('[suyue] E_BOOK_MISSING ' + bookId);
    return null;
  },
  // 打开阅读页：直接传唯一 bookId（不依赖 $idx 隐式绑定），
  // 并用 Lite Wearable 支持的 router.replace 切页（不用 push）。
  openBook(bookId) {
    const book = this.findBook(bookId);
    if (!book) return;
    const wear = wearBridge();
    this.resumeDone = true;
    this.status = '正在打开《' + book.title + '》';
    if (wear && typeof wear.markPageNavigation === 'function') {
      wear.markPageNavigation('pages/reader/reader');
    }
    try {
      router.replace({
        uri: 'pages/reader/reader',
        params: { bookId: book.bookId }
      });
    } catch (error) {
      if (wear && typeof wear.clearPageNavigation === 'function') {
        wear.clearPageNavigation();
      }
      this.status = '打开失败：路由异常（E_ROUTE_UNSUPPORTED）';
      console.error('[suyue] E_ROUTE_UNSUPPORTED ' + error);
    }
  },
  // 二次确认删除：第一次点击标记，第二次点击执行。
  // 内置书籍是构建期打进来的静态书单，不可从设备删除。
  askDelete(bookId) {
    if (!isValidBookId(bookId)) {
      this.status = '删除失败：参数无效（E_BOOK_ID_INVALID）';
      return;
    }
    var book = null;
    for (let i = 0; i < this.books.length; i++) {
      if (this.books[i].bookId === bookId) book = this.books[i];
    }
    if (!book) {
      this.status = '删除失败：未找到该书（E_BOOK_MISSING）';
      return;
    }
    if (!this.libraryIndex || !this.bookStorage) {
      this.status = '删除失败：阅读服务未就绪';
      return;
    }
    if (book.origin === 'builtin') {
      this.status = '《' + book.title + '》是内置书籍，不可删除';
      return;
    }
    if (this.confirmId !== book.bookId) {
      this.confirmId = book.bookId;
      this.status = '再次点击「删除」确认移除《' +
        book.title + '》';
      return;
    }
    this.confirmId = '';
    this.bookStorage.deleteBook(book.bookId, (state) => {
      if (state.ok) {
        this.progressStore.clearProgress(book.bookId, () => {
          this.libraryIndex.removeBook(book.bookId, () => {
            this.status = '已删除《' + book.title + '》';
            this.loadExternal();
          });
        });
      } else {
        this.status = '删除失败：' + state.reason;
      }
    });
  }
};
