// SPDX-License-Identifier: GPL-3.0-only
// 表冠输入：当前 Lite Wearable SDK 没有可在
// 源码层确认的 GT4 表冠旋转 API，**不能伪造
// “已支持”**。
//
// 真机核对路径（待验证）：
//   1. 在 DevEco 中确认 GT4 Lite SDK 是否暴露
//      表冠/旋转事件（如 @system.sensor 或
//      rotary 类模块）；
//   2. 若存在，在 onCrownDelta(delta) 中把
//      delta 映射为翻页（每 N 格一页）；
//   3. 若不存在，本文件保持禁用，阅读页使用
//      触屏「上页/下页」回退（已实现）。
export function crownSupported() {
  return false;
}

// 预留接入点：确认 SDK 后在此注册回调。
export function enableCrown(onPageDelta) {
  if (typeof onPageDelta !== 'function') return false;
  // 当前 SDK 未确认表冠能力，明确返回禁用。
  return false;
}
