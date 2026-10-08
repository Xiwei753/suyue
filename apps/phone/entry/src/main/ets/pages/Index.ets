// SPDX-License-Identifier: GPL-3.0-only
// 手机端首个可调用的系统功能：文件选择。当前只持有用户选出的 URI。
// 解析内容、复制到沙箱、校验以及发送到手表，必须在后续实现。
import { common } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';

@Entry
@Component
struct Index {
  @State private pickedName: string = '尚未选择书籍';
  @State private pickStatus: string = '可选择 TXT 或 EPUB 文件';

  private async chooseBook(): Promise<void> {
    try {
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const documentPicker = new picker.DocumentViewPicker(context);
      const options = new picker.DocumentSelectOptions();
      const uris: Array<string> = await documentPicker.select(options);
      if (uris.length < 1) {
        this.pickStatus = '没有选择文件';
        return;
      }
      const uri = uris[0];
      const filename = decodeURIComponent(uri.substring(uri.lastIndexOf('/') + 1));
      const lowered = filename.toLowerCase();
      if (!lowered.endsWith('.txt') && !lowered.endsWith('.epub')) {
        this.pickStatus = '仅接受 TXT / EPUB 文件';
        return;
      }
      this.pickedName = filename;
      // 不将 URI 当成“已导入书籍”：获得文件句柄并复制到沙箱的逻辑尚未实现。
      this.pickStatus = '已选择文件；导入、解析和传书尚未实现';
    } catch (error) {
      this.pickStatus = '文件选择失败，请查看日志';
      console.error('suyue document picker error: ' + JSON.stringify(error));
    }
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
        Text('选择书籍').fontSize(22).fontWeight(FontWeight.Medium).fontColor('#f2f2f2')
        Text(this.pickedName).fontSize(16).fontColor('#e8eaf0')
        Text(this.pickStatus).fontSize(14).fontColor('#a7abb4')
        Button('选择 TXT / EPUB')
          .onClick(() => { this.chooseBook(); })
      }
      .alignItems(HorizontalAlign.Start)
      .padding(20)
      .width('100%')
      .backgroundColor('#20242c')
      .borderRadius(18)

      Column({ space: 8 }) {
        Text('发送到 GT 4').fontSize(22).fontWeight(FontWeight.Medium).fontColor('#f2f2f2')
        Text('文件传输、配对、回执尚未接通。请勿把文件选择当成传书成功。')
          .fontSize(15).fontColor('#a7abb4')
      }
      .alignItems(HorizontalAlign.Start)
      .padding(20)
      .width('100%')
      .backgroundColor('#20242c')
      .borderRadius(18)

      Text('未完成：文件复制/转换 · 传输 · 书架同步')
        .fontSize(13).fontColor('#8f98a3')
    }
    .alignItems(HorizontalAlign.Start)
    .padding(24)
    .width('100%')
    .height('100%')
    .backgroundColor('#101114')
  }
}
