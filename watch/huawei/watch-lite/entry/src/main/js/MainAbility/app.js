// SPDX-License-Identifier: GPL-3.0-only
// Keep the Lite app entry small: the first route is a metadata-only shelf.
// The full storage and Wear Engine runtime is initialized only after the user
// enters the functional bookshelf.
export default {
  data: {
    stopWatchReceiver: null
  },
  onCreate() {
    console.info('GT4 Reader: app created');
  },
  onDestroy() {
    const stop = this.data && this.data.stopWatchReceiver;
    if (typeof stop === 'function') {
      try {
        stop();
      } catch (error) {
        console.error('[suyue] E_WEAR_STOP ' + error);
      }
    }
    console.info('GT4 Reader: app destroyed');
  }
};
