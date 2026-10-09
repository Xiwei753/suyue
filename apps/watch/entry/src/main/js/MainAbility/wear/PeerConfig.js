// SPDX-License-Identifier: GPL-3.0-only
// 手表侧双端身份配置。
//
// 手表需要知道的是「手机身份」（PHONE_*）：
   //   - 用于 setPackageName/setFingerprint 门控
   //     消息来源（只有该手机能发来书）；
   //   - 用于 sendMsg 回执的目标包名。
// 手表自身身份（WATCH_BUNDLE_NAME）由手机侧
// 作为 remoteApp 校验，这里只作自述引用。
//
// 手机证书指纹由 CI 从签名材料注入
// （PhonePeerConfig.g.js 构建前覆盖写入，
// 构建后还原）；未注入时为空，通信明确禁用。
import { INJECTED_PHONE_FINGERPRINT }
  from './PhonePeerConfig.g.js';

export const PHONE_BUNDLE_NAME =
  'com.xiwei753.gt4reader.phone';
export const PHONE_CERT_FINGERPRINT =
  INJECTED_PHONE_FINGERPRINT;
export const WATCH_BUNDLE_NAME =
  'com.xiwei.suyue';
