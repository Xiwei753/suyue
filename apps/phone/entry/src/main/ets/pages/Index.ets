// SPDX-License-Identifier: GPL-3.0-only
// 手机端首页：真实书库列表 + TXT/EPUB 导入。
// 选择文件 ≠ 导入成功：只有复制进沙箱、解析、登记后才显示 READY。
// 发送到 GT 4 在 Wear Engine 接通前保持禁用并说明原因。
import { common } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';
import { promptAction } from '@kit.ArkUI';
import { BookMeta, BookStatus } from '../model/BookModels';
import { importBook } from '../services/BookImportService';
import { BookRepository } from '../services/BookRepository';

@Entry
@Component
struct Index {
  @State private books: BookMeta[] = [];
  @State private pickedName: string = '尚未选择书籍';
  @State private pickStatus: string = '可选择 TXT 或 EPUB 文件';
  @State private busy: boolean = false;
  private repository: BookRepository | null = null;

  private getRepository(): BookRepository {
    if (this.repository === null) {
      const context = this.getUIContext().getHostContext()
        as common.UIAbilityContext;
      this.repository = new BookRepository(context);
    }
    return this.repository;
  }

  onPageShow(): void {
    this.refresh();
  }

  private refresh(): void {
    this.books = this.getRepository().list();
  }

  private async chooseBook(): Promise<void> {
    if (this.busy) return;
    try {
      const context = this.getUIContext().getHostContext()
        as common.UIAbilityContext;
      const documentPicker = new picker.DocumentViewPicker(context);
      const options = new picker.DocumentSelectOptions();
      const uris: Array<string> = await documentPicker.select(options);
      if (uris.length < 1) {
        this.pickStatus = '没有选择文件';
        return;
      }
      const uri = uris[0];
      this.pickedName = decodeURIComponent(
        uri.substring(uri.lastIndexOf('/') + 1));
      this.pickStatus = '正在导入……';
      this.busy = true;
      const result = await importBook(context, uri);
      this.busy = false;
      if (!result.ok) {
        this.pickStatus = '导入失败：' + (result.reason || '未知原因');
        return;
      }
      this.pickStatus = '已导入：' + result.book!.title +
        '（' + result.book!.bytes + ' 字节，' +
        result.book!.chapters.length + ' 章）';
      this.refresh();
    } catch (error) {
      this.busy = false;
      this.pickStatus = '文件选择失败，请查看日志';
      console.error('suyue import error: ' + JSON.stringify(error));
    }
  }

  private async removeBook(book: BookMeta): Promise<void> {
    try {
      await promptAction.showAlertDialog({
        title: '删除书籍',
        message: '确定删除《' + book.title + '》？此操作不可恢复。',
        buttons: [
          { text: '取消', color: '#9ca3af' },
          { text: '删除', color: '#f87171' }
        ]
      }).then((result) => {
        if (result.index === 1) {
          this.getRepository().remove(book.bookId);
          this.refresh();
          this.pickStatus = '已删除《' + book.title + '》';
        }
      });
    } catch (error) {
      console.error('suyue remove error: ' + JSON.stringify(error));
    }
  }

  @Builder
  bookItem(book: BookMeta) {
    Row() {
      Column() {
        Text(book.title)
          .fontSize(16)
          .fontColor('#f2f2f2')
          .maxLines(1)
        Text(book.kind.toUpperCase() + ' · ' + book.bytes +
          ' 字节 · ' + book.chapters.length + ' 章')
          .fontSize(12)
          .fontColor('#9ca3af')
          .margin({ top: 4 })
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)

      Text(book.status)
        .fontSize(12)
        .fontColor(book.status === BookStatus.READY ?
          '#4ade80' : '#f87171')

      Text('删除')
        .fontSize(13)
        .fontColor('#f87171')
        .margin({ left: 16 })
        .onClick(() => { this.removeBook(book); })
    }
    .width('100%')
    .padding(14)
    .backgroundColor('#20242c')
    .borderRadius(14)
  }

  build() {
    Column({ space: 18 }) {
      Text('素阅')
        .fontSize(30)
        .fontWeight(FontWeight.Bold)
        .fontColor('#f2f2f2')

      Text('手机书库 · 配套 GT 4 46mm')
        .fontSize(15)
        .fontColor('#9ca3af')

      Column({ space: 12 }) {
        Text('导入书籍').fontSize(22)
          .fontWeight(FontWeight.Medium).fontColor('#f2f2f2')
        Text(this.pickedName).fontSize(16).fontColor('#e8eaf0')
        Text(this.pickStatus).fontSize(14).fontColor('#a7abb4')
        Button('选择 TXT / EPUB')
          .enabled(!this.busy)
          .onClick(() => { this.chooseBook(); })
      }
      .alignItems(HorizontalAlign.Start)
      .padding(20)
      .width('100%')
      .backgroundColor('#20242c')
      .borderRadius(18)

      Column({ space: 10 }) {
        Text('书架（' + this.books.length + ' 本）').fontSize(22)
          .fontWeight(FontWeight.Medium).fontColor('#f2f2f2')
        if (this.books.length === 0) {
          Text('书库为空。导入 TXT 或 EPUB 后会列在这里，重启不丢。')
            .fontSize(14)
            .fontColor('#a7abb4')
        }
        List() {
          ForEach(this.books, (book: BookMeta) => {
            ListItem() {
              this.bookItem(book)
            }
          }, (book: BookMeta) => book.bookId)
        }
        .width('100%')
        .divider({ strokeWidth: 8, color: '#101114' })
      }
      .alignItems(HorizontalAlign.Start)
      .padding(20)
      .width('100%')
      .backgroundColor('#16181d')
      .borderRadius(18)

      Column({ space: 8 }) {
        Text('发送到 GT 4').fontSize(22)
          .fontWeight(FontWeight.Medium).fontColor('#f2f2f2')
        Text('Wear Engine 传输尚未接通：设备发现、签名核对与 ' +
          'transferFile 未实现，发送保持禁用。')
          .fontSize(14)
          .fontColor('#a7abb4')
      }
      .alignItems(HorizontalAlign.Start)
      .padding(20)
      .width('100%')
      .backgroundColor('#20242c')
      .borderRadius(18)
    }
    .alignItems(HorizontalAlign.Start)
    .padding(24)
    .width('100%')
    .height('100%')
    .backgroundColor('#101114')
  }
}
