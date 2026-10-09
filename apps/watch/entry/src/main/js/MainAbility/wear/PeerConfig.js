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
  'com.xiwei.suyue';
export const PHONE_CERT_FINGERPRINT =
  INJECTED_PHONE_FINGERPRINT;
// 注意：这里是 **con**.xiwei.suyue.gt4，不是 com。
// 这是 AGC 里手表应用**实际注册**的包名（当初录入时打错，已确认保留）：
// 华为的 bundleName 注册后不能改，而 HAP 的包名必须与 profile 授权的
// 包名逐字相同才能安装。别"顺手修正"成 com —— 一改就签不过、
// 也装不上（构建脚本的包名预检会直接拒绝签名）。
//
// 手表与手机是华为侧两个独立应用，Wear Engine 靠
// (包名, 证书指纹) 识别对端，所以两者**必须不同**。
export const WATCH_BUNDLE_NAME =
  'con.xiwei.suyue.gt4';
