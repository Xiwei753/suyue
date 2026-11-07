// SPDX-License-Identifier: GPL-3.0-only
// Loaded on demand from the metadata-only shelf. It exposes storage services
// to the reader, then hands off to the separately bundled Wear initializer.
import router from '@system.router';
import { STARTUP_DIAGNOSTIC } from '../../StartupDiagnosticConfig.g.js';
import { BOOKS as CATALOG } from '../../books/BookCatalog.g.js';
import { configureBooks, isBundled, bundledEntry,
  readBundledWindow } from '../../storage/BundledBookSource.js';
import { isLowerHex } from '../../util/Validate';
import { ensureDirs, deleteBook, openBook, readBytes,
  commitVerifiedBook, copyFile, deleteFile, fileSize, readWindow,
  tempPath } from '../../storage/BookStorage';
import { listBooks, removeBook, getBook, addBook }
  from '../../storage/LibraryIndex';
import { loadLastBook, clearProgress, loadProgress, saveProgress,
  saveLastBook, loadSyncBase, saveSyncBase }
  from '../../storage/ProgressStore';

function appData() {
  if (typeof getApp !== 'function') return null;
  try {
    const app = getApp();
    return app && app.data && typeof app.data === 'object' ? app.data : null;
  } catch (error) {
    return null;
  }
}

export default {
  data: {
    resume: '1',
    selectedBookId: '',
    status: '正在准备书库',
    startupDiagnostic: STARTUP_DIAGNOSTIC,
    normalMode: !STARTUP_DIAGNOSTIC,
    storageReady: false,
    storageFailed: false,
    canEnterReceiver: false,
    canReturnToStart: false
  },
  onInit() {
    const app = appData();
    try {
      if (!app) throw new Error('application data unavailable');
      const books = configureBooks(CATALOG);
      app.readerStorage = {
        ensureDirs,
        deleteBook,
        getBook,
        openBook,
        readBytes,
        listBooks,
        removeBook,
        addBook,
        bundledBooks: books,
        isBundled,
        bundledEntry,
        readBundledWindow,
        isLowerHex,
        loadLastBook,
        clearProgress,
        loadProgress,
        saveProgress,
        saveLastBook,
        loadSyncBase,
        saveSyncBase,
        commitVerifiedBook,
        copyFile,
        deleteFile,
        fileSize,
        readWindow,
        tempPath
      };
      app.storageRuntimeError = '';
      app.storageRuntimeInitialized = true;
      this.storageReady = true;
      this.canEnterReceiver = STARTUP_DIAGNOSTIC;
      this.status = STARTUP_DIAGNOSTIC ?
        'B: 本地存储页已显示' : '书库已准备';
      if (STARTUP_DIAGNOSTIC) return;
      router.replace({ uri: 'pages/receiver/receiver', params: {
        resume: this.resume || '1',
        selectedBookId: this.selectedBookId || ''
      } });
    } catch (error) {
      if (app) {
        app.storageRuntimeError = '阅读存储初始化失败';
        app.storageRuntimeInitialized = true;
      }
      this.storageFailed = true;
      this.canReturnToStart = STARTUP_DIAGNOSTIC;
      this.status = STARTUP_DIAGNOSTIC ?
        'B: 本地存储初始化失败' : '阅读存储初始化失败';
      console.error('[suyue] E_STORAGE_INIT ' + error);
      if (STARTUP_DIAGNOSTIC) return;
      this.returnToShelf();
    }
  },
  enterReceiver() {
    if (!STARTUP_DIAGNOSTIC || !this.storageReady) return;
    try {
      router.replace({ uri: 'pages/receiver/receiver', params: {
        resume: this.resume || '1',
        selectedBookId: this.selectedBookId || ''
      } });
    } catch (error) {
      this.status = 'B: 进入接收页失败';
    }
  },
  returnToStart() {
    try {
      router.replace({ uri: 'pages/start/start' });
    } catch (error) {
      this.status = 'B: 返回首屏失败';
    }
  },
  returnToShelf() {
    try {
      router.replace({ uri: 'pages/index/index', params: {
        resume: this.resume || '1',
        selectedBookId: this.selectedBookId || ''
      } });
    } catch (error) {
      this.status = '初始化未完成，请返回书架';
      console.error('[suyue] E_STORAGE_RETURN ' + error);
    }
  }
};
