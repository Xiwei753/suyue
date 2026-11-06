// SPDX-License-Identifier: GPL-3.0-only
// Keep cold-start imports small. The first visible route starts the bounded
// storage/receiver setup flow after it has been shown; the shelf remains
// usable when the optional Wear Engine setup fails.
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
