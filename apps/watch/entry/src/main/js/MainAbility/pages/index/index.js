// SPDX-License-Identifier: GPL-3.0-only
// 原创演示页：仅内置几段短文本，不代表长文本分页已经完成。
const DEMO_PAGES = [
  '这是 GT 4 圆屏阅读测试。\n\n文字尽量留在表盘内侧，避免被圆形边缘裁掉。\n\n点击屏幕翻到下一页。',
  '第二页：\n\n手表只负责阅读 UTF-8 文本。\n\n手机负责解析 TXT 和 EPUB，再将内容发送到手表。',
  '第三页：\n\n离线书库、章节目录、进度保存和表冠翻页都还没有实现。\n\n下一次点击回到第一页。'
];

export default {
  data: {
    bookTitle: '阅读演示',
    pageText: DEMO_PAGES[0],
    pageLabel: '1 / 3',
    pageIndex: 0
  },
  nextPage() {
    const next = (this.pageIndex + 1) % DEMO_PAGES.length;
    this.pageIndex = next;
    this.pageText = DEMO_PAGES[next];
    this.pageLabel = `${next + 1} / ${DEMO_PAGES.length}`;
  }
};
