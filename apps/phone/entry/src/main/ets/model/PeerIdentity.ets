// SPDX-License-Identifier: GPL-3.0-only
// 双端 Peer 身份配置。
//
// 两个身份必须严格区分（施工单 P0-1/P0-2）：
//   PHONE_SELF：本应用（手机）身份，仅用于
//     让手表验证“消息来自哪部手机”；
//   WATCH_PEER：对端 GT 4 手表身份，手机用它
//     作为 remoteApp 发送与校验，绝不能用手机
//     自己的包名/指纹冒充。
//
// 指纹注入路径：CI 从 Secrets 生成
// services/PeerIdentityConfig.g.ets（gitignore，
// 不提交），本地未生成时指纹为空 —— 空指纹
// 明确禁用发送/接收，不会以假值混过。
export interface PeerIdentity {
  bundleName: string;
  // 签名证书指纹（hex 字符串）。空 = 未配置。
  fingerprint: string;
}

export const PHONE_SELF: PeerIdentity = {
  bundleName: 'com.xiwei.suyue',
  fingerprint: ''
};

export const WATCH_PEER: PeerIdentity = {
  bundleName: 'con.xiwei.suyue.gt4',
  fingerprint: ''
};

// CI 注入入口：仅允许把指纹写入对应身份，
// 并校验非空、十六进制、长度 64（SHA-256 证书
// 摘要形状）。不允许把一个身份的指纹赋给另一端。
export function injectFingerprint(
  target: 'phone' | 'watch',
  fingerprint: string): void {
  const normalized = String(fingerprint || '')
    .toLowerCase().replace(/[^0-9a-f]/g, '');
  if (normalized.length === 0) {
    throw new Error('fingerprint is empty');
  }
  if (normalized.length !== 64) {
    throw new Error('fingerprint must be 64 hex chars, got ' +
      normalized.length);
  }
  if (target === 'phone') {
    PHONE_SELF.fingerprint = normalized;
  } else {
    WATCH_PEER.fingerprint = normalized;
  }
}

export function isConfigured(identity: PeerIdentity): boolean {
  return identity.fingerprint.length === 64;
}
