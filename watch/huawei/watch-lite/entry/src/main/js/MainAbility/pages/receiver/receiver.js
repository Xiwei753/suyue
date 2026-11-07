// SPDX-License-Identifier: GPL-3.0-only
// Loaded on demand after the metadata-only start route. It owns the single
// Wear subscription and returns to the full bookshelf after setup.
import router from '@system.router';
import { STARTUP_DIAGNOSTIC } from '../../StartupDiagnosticConfig.g.js';
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
    status: '正在准备阅读服务',
    receiverStatus: '',
    startupDiagnostic: STARTUP_DIAGNOSTIC,
    normalMode: !STARTUP_DIAGNOSTIC,
    connectionStarted: false,
    canStartConnection: STARTUP_DIAGNOSTIC
  },
  onInit() {
    if (STARTUP_DIAGNOSTIC) {
      this.status = 'C: 接收器页面已显示；尚未连接';
      return;
    }
    this.initializeReceiver(false);
  },
  connectWear() {
    if (!STARTUP_DIAGNOSTIC || this.connectionStarted) return;
    this.connectionStarted = true;
    this.canStartConnection = false;
    this.status = 'D: 正在初始化 Wear 接收';
    setReceiverStatusHandler((message) => {
      this.receiverStatus = String(message || '状态暂不可用').slice(0, 24);
    });
    this.initializeReceiver(true);
  },
  initializeReceiver(stayOnPage) {
    const app = appData();
    var initializationFailed = false;
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
      initializationFailed = true;
      if (app) {
        app.receiverStatus = '接收器初始化失败';
        app.wearRuntimeInitialized = true;
      }
      this.status = STARTUP_DIAGNOSTIC ?
        'D: Wear 接收初始化失败' : '阅读服务初始化失败';
      console.error('[suyue] E_WEAR_INIT ' + error);
    }
    if (stayOnPage) {
      if (!initializationFailed) this.status = 'D: Wear 接收初始化已触发';
      return;
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
