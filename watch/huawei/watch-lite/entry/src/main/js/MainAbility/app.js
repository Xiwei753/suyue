// SPDX-License-Identifier: GPL-3.0-only
import { beginReceive, stopReceive,
  reportAppLifecycle, getReceiveStatus,
  setReceiveStatusHandler, getReceiverStatus,
  setReceiverStatusHandler, onReceiverPageShow,
  onReceiverPageHide, markPageNavigation,
  clearPageNavigation } from './wear/WearReceiver';
import { setApplyHandler, clearApplyHandler,
  takePendingApply, setActiveBook,
  clearActiveBook } from './wear/ProgressSync';

export default {
  // Page bundles use the Lite JS FA app object to reach the single receiver.
  // Keeping this bridge here prevents each page bundle from embedding the
  // receiver, transfer, and progress-sync dependency tree again.
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
      setApplyHandler,
      clearApplyHandler,
      takePendingApply,
      setActiveBook,
      clearActiveBook
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
