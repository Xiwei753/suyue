// SPDX-License-Identifier: GPL-3.0-only
// 书架页（issue #10）：**开机即书架**。
//
// 设计：内置书单在构建期生成（books/BookCatalog.g.js，仅元数据），
// onInit 里**同步**取出并渲染，不等待任何文件接口 / 队列 / 导入 /
// 权限 / 探测。外部（手机传书）书目作为**独立第二来源**在后台异步
// 合并；它失败、超时或不存在，都不会让内置书架失效或卡住启动。
//
// 关键：书架从 app bridge 取得编译期元数据，在本页配置 rawfile
// 窗口访问器（不含正文）再传给阅读页；小说正文按需读取（issue #10）。
import router from '@system.router';
import { BOOKS as CATALOG } from '../../books/BookCatalog.g.js';
import { configureBooks, isBundled, bundledEntry,
  readBundledWindow } from '../../storage/BundledBookSource.js';
import { configureServices as configureProgressSync,
  handleMessage as handleProgressMessage,
  setApplyHandler as setProgressApplyHandler,
  clearApplyHandler as clearProgressApplyHandler,
  takePendingApply as takePendingProgressApply,
  setActiveBook as setProgressActiveBook,
  clearActiveBook as clearProgressActiveBook } from '../../wear/ProgressSync';
import { IncomingBookReceiver } from '../../wear/IncomingBookReceiver';
import { beginTransfer, applyChapterChunk, assembleChapters,
  missingChapterIndices, createDigestVerifier } from '../../wear/TransferLogic';

function wearBridge() {
  return getApp().data.wearBridge;
}

export default {
  data: {
    title: '素阅',
    books: [],
    status: '书架就绪',
    transferStatus: '',
    receiverStatus: '接收器：尚未启动',
    confirmId: '',
    // 从阅读页显式返回时传 resume=0，避免又自动打开同一本书。
    resume: '1'
  },
  onInit() {
    // 1) 同步渲染内置书单：这一句之后书架已经可用。
    this.token = (this.token || 0) + 1;
    this.external = [];
    this.resumeWanted = this.resume !== '0';
    this.resumeLoaded = false;
    this.resumeDone = false;
    this.externalLoaded = false;
    this.lastBookId = '';
    const wear = wearBridge();
    const bundledBooks = configureBooks(CATALOG);
    const bundledSource = {
      books: bundledBooks,
      isBundled: isBundled,
      bundledEntry: bundledEntry,
      readBundledWindow: readBundledWindow
    };
    getApp().data.bundledBookSource = bundledSource;
    this.bookStorage = wear.bookStorage;
    this.libraryIndex = wear.libraryIndex;
    this.progressStore = wear.progressStore;
    const storage = this.bookStorage;
    const library = this.libraryIndex;
    const progress = this.progressStore;
    const readerStorage = {
      getBook: library.getBook,
      openBook: storage.openBook,
      readBytes: storage.readBytes,
      listBooks: library.listBooks,
      bundledBooks: bundledSource.books,
      isBundled: bundledSource.isBundled,
      bundledEntry: bundledSource.bundledEntry,
      readBundledWindow: bundledSource.readBundledWindow,
      loadProgress: progress.loadProgress,
      saveProgress: progress.saveProgress,
      saveLastBook: progress.saveLastBook,
      loadSyncBase: progress.loadSyncBase,
      saveSyncBase: progress.saveSyncBase,
      isLowerHex: wear.isLowerHex,
      commitVerifiedBook: storage.commitVerifiedBook,
      copyFile: storage.copyFile,
      deleteFile: storage.deleteFile,
      fileSize: storage.fileSize,
      readWindow: storage.readWindow,
      tempPath: storage.tempPath,
      addBook: library.addBook
    };
    getApp().data.readerStorage = readerStorage;
    wear.setBookReceiver(new IncomingBookReceiver(
      (message) => wear.reportReceiveStatus(message),
      (message) => wear.sendMessage(message),
      { storage: readerStorage, transferLogic: {
        beginTransfer: beginTransfer,
        applyChapterChunk: applyChapterChunk,
        assembleChapters: assembleChapters,
        missingChapterIndices: missingChapterIndices,
        createDigestVerifier: createDigestVerifier
      } }));
    configureProgressSync(readerStorage);
    wear.setProgressSync({
      handleMessage: handleProgressMessage,
      setApplyHandler: setProgressApplyHandler,
      clearApplyHandler: clearProgressApplyHandler,
      takePendingApply: takePendingProgressApply,
      setActiveBook: setProgressActiveBook,
      clearActiveBook: clearProgressActiveBook
    });
    wear.configureReceiverServices();
    this.transferStatus = wear.getReceiveStatus();
    this.receiverStatus = wear.getReceiverStatus();
    wear.setReceiveStatusHandler((message) => {
      this.handleReceiveStatus(message);
    });
    wear.setReceiverStatusHandler((message) => {
      this.receiverStatus = message;
    });
    this.refreshShelf();
    // 2) 后台合入外部（手机传书）书目，绝不阻塞上面的书架。
    this.loadExternal();
    // 3) 上次阅读记录也异步读取；书架先显示，绝不永久等待。
    this.loadResume();
  },
  // 从阅读页返回时刷新外部书目（内置书单固定）。
  onShow() {
    wearBridge().onReceiverPageShow('pages/index/index');
    this.loadExternal();
    this.tryAutoResume();
  },
  onHide() {
    wearBridge().onReceiverPageHide();
  },
  onDestroy() {
    const wear = wearBridge();
    wear.setReceiveStatusHandler(null);
    wear.setReceiverStatusHandler(null);
  },
  // 内置书单（同步）：只做一次轻量拷贝，带上 origin。
  bundledList() {
    var out = [];
    var catalog = getApp().data.bundledBookSource.books;
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
    if (!this.resumeWanted || this.resumeDone || !this.resumeLoaded) return;
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
    if (typeof bookId !== 'string' || !isLowerHex(bookId, 16)) {
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
    this.resumeDone = true;
    this.status = '正在打开《' + book.title + '》';
    wearBridge().markPageNavigation('pages/reader/reader');
    try {
      router.replace({
        uri: 'pages/reader/reader',
        params: { bookId: book.bookId }
      });
    } catch (error) {
      wearBridge().clearPageNavigation();
      this.status = '打开失败：路由异常（E_ROUTE_UNSUPPORTED）';
      console.error('[suyue] E_ROUTE_UNSUPPORTED ' + error);
    }
  },
  // 二次确认删除：第一次点击标记，第二次点击执行。
  // 内置书籍是构建期打进来的静态书单，不可从设备删除。
  askDelete(bookId) {
    if (typeof bookId !== 'string' || !isLowerHex(bookId, 16)) {
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
