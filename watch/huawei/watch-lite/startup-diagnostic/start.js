// SPDX-License-Identifier: GPL-3.0-only
// Build-only first stage: keep the initial route small and wait for a tap.
import router from '@system.router';

export default {
  data: {
    status: 'A: 首屏已显示'
  },
  openStorage() {
    try {
      router.replace({ uri: 'pages/storage/storage', params: {
        resume: '0',
        selectedBookId: ''
      } });
    } catch (error) {
      this.status = 'A: 进入本地存储失败';
    }
  }
};
