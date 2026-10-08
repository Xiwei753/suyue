// SPDX-License-Identifier: GPL-3.0-only
@Entry
@Component
struct Index {
  build() {
    Column({ space: 18 }) {
      Text('GT4 Reader')
        .fontSize(30)
        .fontWeight(FontWeight.Bold)
        .fontColor('#f2f2f2')

      Text('手机传书端 · 开发骨架')
        .fontSize(15)
        .fontColor('#9ca3af')

      Column({ space: 8 }) {
        Text('我的书库').fontSize(22).fontWeight(FontWeight.Medium).fontColor('#f2f2f2')
        Text('后续接入 TXT / EPUB 导入、章节整理与书籍管理。')
          .fontSize(15).fontColor('#a7abb4')
      }
      .alignItems(HorizontalAlign.Start)
      .padding(20)
      .width('100%')
      .backgroundColor('#20242c')
      .borderRadius(18)

      Column({ space: 8 }) {
        Text('发送到 GT 4').fontSize(22).fontWeight(FontWeight.Medium).fontColor('#f2f2f2')
        Text('Wear Engine 配对、传输和回执尚未接入；暂不提供无效的发送按钮。')
          .fontSize(15).fontColor('#a7abb4')
      }
      .alignItems(HorizontalAlign.Start)
      .padding(20)
      .width('100%')
      .backgroundColor('#20242c')
      .borderRadius(18)

      Text('目标设备：HUAWEI WATCH GT 4 46 mm')
        .fontSize(13).fontColor('#8f98a3')
    }
    .alignItems(HorizontalAlign.Start)
    .padding(24)
    .width('100%')
    .height('100%')
    .backgroundColor('#101114')
  }
}
