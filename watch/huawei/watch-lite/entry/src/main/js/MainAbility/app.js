// SPDX-License-Identifier: GPL-3.0-only
import { beginReceive, stopReceive,
  reportAppLifecycle, getReceiveStatus,
  setReceiveStatusHandler, getReceiverStatus,
  setReceiverStatusHandler, onReceiverPageShow,
  onReceiverPageHide, markPageNavigation,
  clearPageNavigation, configureReceiverServices,
  setBookReceiver, setProgressSync,
  setApplyHandler, clearApplyHandler,
  takePendingApply, setActiveBook,
  clearActiveBook, sendMessage,
  reportReceiveStatus } from './wear/WearReceiver';
import { isLowerHex } from './util/Validate';
import { ensureDirs as ensureBookDirs, deleteBook as deleteStoredBook,
  openBook as openStoredBook, readBytes as readStoredBytes,
  commitVerifiedBook, copyFile, deleteFile, fileSize, readWindow,
  tempPath } from './storage/BookStorage';
import { listBooks, removeBook, getBook, addBook } from './storage/LibraryIndex';
import { loadLastBook, clearProgress, loadProgress, saveProgress,
  saveLastBook, loadSyncBase, saveSyncBase } from './storage/ProgressStore';

export default {
  // The app bundle owns the one Wear Engine subscription. The shelf installs
  // book and progress handlers with its injected storage adapters.
  data: {
    wearBridge: {
      getReceiveStatus,
      setReceiveStatusHandler,
      getReceiverStatus,
      setReceiverStatusHandler,
      onReceiverPageShow,
      onReceiverPageHide,
      markPageNavigation,
      clearPageNavigation,
      configureReceiverServices,
      setBookReceiver,
      setProgressSync,
      setApplyHandler,
      clearApplyHandler,
      takePendingApply,
      setActiveBook,
      clearActiveBook,
      sendMessage,
      reportReceiveStatus,
      isLowerHex,
      bookStorage: {
        ensureDirs: ensureBookDirs,
        deleteBook: deleteStoredBook,
        openBook: openStoredBook,
        readBytes: readStoredBytes,
        commitVerifiedBook,
        copyFile,
        deleteFile,
        fileSize,
        readWindow,
        tempPath
      },
      libraryIndex: {
        listBooks,
        removeBook,
        getBook,
        addBook
      },
      progressStore: {
        loadLastBook,
        clearProgress,
        loadProgress,
        saveProgress,
        saveLastBook,
        loadSyncBase,
        saveSyncBase
      }
    }
  },
  onCreate() {
    console.info('GT4 Reader: app created');
    reportAppLifecycle('app.onCreate 已执行');
    // Keep the single Wear Engine subscription alive across route changes,
    // including cold-start resume directly into the reader.
    beginReceive('app.onCreate');
  },
  onDestroy() {
    reportAppLifecycle('app.onDestroy 已执行');
    stopReceive();
    console.info('GT4 Reader: app destroyed');
  }
};
