// SPDX-License-Identifier: GPL-3.0-only
// 书架页：读取真实书库索引，列书名；打开/删除。
// 迁移桥接：首次启动把旧演示书（demo.txt）迁入
// 新书库结构后，BookFiles.js 不再被页面引用。
//
// 迁移条件（施工单 P2-14）：仅当旧演示文件
// 确实存在且移动成功才登记；元数据必须是
// 真实字节数与摘要，绝不用 bytes:0/sha256:''
// 的假元数据。用户清空书库后绝不自动重造。
import router from '@system.router';
import file from '@system.file';
import { initializeLibrary } from '../../storage/BookFiles';
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
    this.prepareLibrary();
    beginReceive((message) => {
      this.transferStatus = message;
    });
  },
  onDestroy() {
    stopReceive();
  },
  // 迁移：旧演示书 → books/<bookId>.txt + 索引条目。
  // 设备验证迁移成功后，按施工单删除 BookFiles.js
  // 与本桥接逻辑（当前不能一刀切删）。
  prepareLibrary() {
    ensureDirs((dirs) => {
      if (!dirs.ok) {
        this.status = '书库目录创建失败';
        return;
      }
      listBooks((books) => {
        if (books.length > 0) {
          this.books = books;
          this.status = '本地书库就绪';
          return;
        }
        initializeLibrary((result) => {
          if (!result.ok) {
            this.status = '本地文件初始化失败：' +
              result.reason;
            this.books = [];
            return;
          }
          this.migrateDemo();
        });
      });
    });
  },
  // 一次性迁移：旧文件存在 + 移动成功才登记。
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
        // 旧文件不存在：不重造测试书。
        this.status = '书库为空，等待手机传书';
      }
    });
  },
  // 移动成功后统计真实字节数与摘要，
  // 再登记索引（拒绝假元数据）。
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
