// SPDX-License-Identifier: GPL-3.0-only
// 书架页：读取真实书库索引，列书名；打开/删除。
//
// 迁移（施工单 P2-14 / 第二轮 P1-5）：直接检查旧
// 演示文件是否存在，存在才移动并登记，绝不在
// 空书库时自动重造测试书（旧实现在此调用生成
// 函数，用户删光后重开页面会再次生出演示书）。
import router from '@system.router';
import file from '@system.file';
import { ensureDirs, bookPath,
  deleteBook, fileSize, readWindow }
  from '../../storage/BookStorage';
import { listBooks, addBook,
  removeBook } from '../../storage/LibraryIndex';
import { beginReceive, stopReceive } from '../../wear/WearReceiver';
import { createSha256 } from '../../util/Sha256';

const DEMO_BOOK_ID = 'aaaa000000000001';
const DEMO_PATH = 'internal://app/gt4reader/demo.txt';
var MIGRATE_WINDOW = 64 * 1024;

export default {
  data: {
    title: '素阅',
    books: [],
    status: '正在准备本地书库',
    transferStatus: '传书未配置',
    confirmId: ''
  },
  onInit() {
    this.libraryReady = false;
    this.prepareLibrary();
    beginReceive((message) => {
      this.handleReceiveStatus(message);
    });
  },
  // 从阅读页返回书架时重新取索引，不依赖 onInit 再次执行。
  onShow() {
    if (this.libraryReady) this.refresh();
  },
  handleReceiveStatus(message) {
    if (typeof message !== 'string') return;
    try {
      const event = JSON.parse(message);
      if (event && event.type === 'RESULT') {
        if (event.ok) {
          this.transferStatus = '接收成功，已加入书架';
          this.refresh();
        } else {
          this.transferStatus = '传书失败：' +
            (event.reason || '未知错误');
        }
        return;
      }
      // ACK 等协议消息不覆盖界面提示。
      return;
    } catch (error) {
      this.transferStatus = message;
    }
  },
  onDestroy() {
    stopReceive();
  },
  prepareLibrary() {
    ensureDirs((dirs) => {
      if (!dirs.ok) {
        this.status = '书库目录创建失败';
        return;
      }
      listBooks((books) => {
        this.libraryReady = true;
        if (books.length > 0) {
          this.books = books;
          this.status = '本地书库就绪';
          return;
        }
        this.migrateDemo();
      });
    });
  },
  // 一次性迁移：先直接检查旧文件，存在且移动
  // 成功才登记；不调用任何生成函数。
  migrateDemo() {
    file.access({
      uri: DEMO_PATH,
      success: () => {
        file.move({
          srcUri: DEMO_PATH,
          dstUri: bookPath(DEMO_BOOK_ID),
          success: () => this.describeMovedDemo(),
          fail: (data, code) => {
            this.status = '旧演示书迁移失败：' + code;
          }
        });
      },
      fail: () => {
        // 旧文件不存在：显示空库，不重造。
        this.status = '书库为空，等待手机传书';
        this.books = [];
      }
    });
  },
  // 移动成功后统计真实字节数与摘要，再登记索引
  // （拒绝假元数据）。
  describeMovedDemo() {
    const dst = bookPath(DEMO_BOOK_ID);
    fileSize(dst, (stat) => {
      if (!stat.ok) {
        this.status = '迁移后校验失败：无法取得大小';
        return;
      }
      const hasher = createSha256();
      this.hashAll(dst, 0, stat.size, hasher,
        (digest) => {
          if (!digest) {
            // 读取失败：不写空摘要，不登记。
            this.status = '迁移后校验失败：摘要读取不完整';
            return;
          }
          addBook({
            bookId: DEMO_BOOK_ID,
            title: '中文阅读测试',
            encoding: 'utf-8',
            bytes: stat.size,
            sha256: digest,
            chunks: 0,
            chunkBytes: 0,
            chapters: []
          }, () => this.refresh());
        });
    });
  },
  hashAll(uri, offset, total, hasher, cb) {
    if (offset >= total) {
      return cb(hasher.digest());
    }
    const size = Math.min(MIGRATE_WINDOW,
      total - offset);
    readWindow(uri, offset, size, (r) => {
      if (!r.ok) {
        // 明确失败：返回空值，调用方不得写索引。
        return cb('');
      }
      hasher.update(r.bytes);
      this.hashAll(uri, offset + size, total,
        hasher, cb);
    });
  },
  refresh() {
    listBooks((books) => {
      this.books = books;
      this.status = books.length > 0 ?
        '本地书库就绪（' + books.length + ' 本）' :
        '书库为空，等待手机传书';
    });
  },
  // FA HML 的 for 循环里可用 $idx 传下标（真机待验证）。
  openBook(e) {
    const book = this.books[e];
    if (!book) return;
    router.push({
      uri: 'pages/reader/reader',
      params: { bookId: book.bookId }
    });
  },
  // 二次确认删除：第一次点击标记，第二次点击执行。
  askDelete(e) {
    const book = this.books[e];
    if (!book) return;
    if (this.confirmId !== book.bookId) {
      this.confirmId = book.bookId;
      this.status = '再次点击「删除」确认移除《' +
        book.title + '》';
      return;
    }
    this.confirmId = '';
    deleteBook(book.bookId, (state) => {
      if (state.ok) {
        removeBook(book.bookId, () => {
          this.status = '已删除《' + book.title + '》';
          this.refresh();
        });
      } else {
        this.status = '删除失败：' + state.reason;
      }
    });
  }
};
