// SPDX-License-Identifier: GPL-3.0-only
import { beginReceive, stopReceive,
  reportAppLifecycle } from './wear/WearReceiver';

export default {
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
