// SPDX-License-Identifier: GPL-3.0-only
import router from '@system.router';
import { initializeLibrary, getDemoBook } from '../../storage/BookFiles';
import { beginReceive, stopReceive } from '../../wear/WearReceiver';

export default {
  data: {
    title: 'GT4 Reader',
    demoTitle: '中文阅读测试',
    status: '正在准备本地书库',
    ready: false,
    transferStatus: '传书未配置'
  },
  onInit() {
    this.demoTitle = getDemoBook().title;
    initializeLibrary((result) => {
      this.ready = result.ok;
      this.status = result.ok ? '本地测试书已就绪' : '本地文件初始化失败：' + result.reason;
    });
    beginReceive((message) => { this.transferStatus = message; });
  },
  onDestroy() {
    stopReceive();
  },
  openDemo() {
    if (!this.ready) {
      this.status = '书籍尚未准备好，无法打开';
      return;
    }
    router.push({ uri: 'pages/reader/reader', params: { bookId: 'demo' } });
  }
};
