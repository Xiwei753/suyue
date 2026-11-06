// SPDX-License-Identifier: GPL-3.0-only
// Loaded on demand after the metadata-only start route. It owns the single
// Wear subscription and returns to the full bookshelf after setup.
import router from '@system.router';
import { beginReceive, stopReceive, reportAppLifecycle,
  getReceiveStatus, setReceiveStatusHandler, getReceiverStatus,
  setReceiverStatusHandler, onReceiverPageShow, onReceiverPageHide,
  markPageNavigation, clearPageNavigation, configureReceiverServices,
  setBookReceiver, setProgressSync, setApplyHandler, clearApplyHandler,
  takePendingApply, setActiveBook, clearActiveBook, sendMessage,
  reportReceiveStatus } from '../../wear/WearReceiver';
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

function appData() {
  if (typeof getApp !== 'function') return null;
  try {
    const app = getApp();
    return app && app.data && typeof app.data === 'object' ? app.data : null;
  } catch (error) {
    return null;
  }
}

function createWearBridge() {
  return {
    getReceiveStatus,
    setReceiveStatusHandler,
    getReceiverStatus,
    setReceiverStatusHandler,
    onReceiverPageShow,
    onReceiverPageHide,
    markPageNavigation,
    clearPageNavigation,
    setBookReceiver,
    setProgressSync,
    setApplyHandler,
    clearApplyHandler,
    takePendingApply,
    setActiveBook,
    clearActiveBook,
    sendMessage,
    reportReceiveStatus
  };
}

export default {
  data: {
    resume: '1',
    selectedBookId: '',
    status: '正在准备阅读服务'
  },
  onInit() {
    const app = appData();
    try {
      if (!app || !app.readerStorage) {
        throw new Error('reader storage unavailable');
      }
      const wear = createWearBridge();
      app.wearBridge = wear;
      app.stopWatchReceiver = stopReceive;
      const readerStorage = app.readerStorage;
      setBookReceiver(new IncomingBookReceiver(
        (message) => reportReceiveStatus(message),
        (message) => sendMessage(message),
        { storage: readerStorage, transferLogic: {
          beginTransfer: beginTransfer,
          applyChapterChunk: applyChapterChunk,
          assembleChapters: assembleChapters,
          missingChapterIndices: missingChapterIndices,
          createDigestVerifier: createDigestVerifier
        } }));
      configureProgressSync(readerStorage);
      setProgressSync({
        handleMessage: handleProgressMessage,
        setApplyHandler: setProgressApplyHandler,
        clearApplyHandler: clearProgressApplyHandler,
        takePendingApply: takePendingProgressApply,
        setActiveBook: setProgressActiveBook,
        clearActiveBook: clearProgressActiveBook
      });
      configureReceiverServices();
      reportAppLifecycle('app.onCreate 已执行');
      beginReceive('pages/receiver/receiver.onInit');
      app.receiverStatus = getReceiverStatus();
      app.wearRuntimeInitialized = true;
      this.status = '阅读服务已准备';
    } catch (error) {
      if (app) {
        app.receiverStatus = '接收器初始化失败';
        app.wearRuntimeInitialized = true;
      }
      this.status = '阅读服务初始化失败';
      console.error('[suyue] E_WEAR_INIT ' + error);
    }
    this.returnToShelf();
  },
  returnToShelf() {
    const params = { resume: this.resume || '1' };
    if (this.selectedBookId) params.selectedBookId = this.selectedBookId;
    try {
      router.replace({ uri: 'pages/index/index', params: params });
    } catch (error) {
      this.status = '服务已准备，请返回书架';
      console.error('[suyue] E_WEAR_RETURN ' + error);
    }
  }
};
