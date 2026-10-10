// SPDX-License-Identifier: GPL-3.0-only
// 手机端双端身份装配：从 CI 生成的
// PeerIdentityConfig.g.ts 注入指纹。
// 本地未生成时保持空（发送/接收明确禁用）。
import { PHONE_SELF, WATCH_PEER,
  injectFingerprint } from '../model/PeerIdentity';
import { INJECTED_PHONE_FINGERPRINT,
  INJECTED_WATCH_FINGERPRINT } from './PeerIdentityConfig.g';

export function loadPeerIdentities(): void {
  if (INJECTED_PHONE_FINGERPRINT.length > 0) {
    injectFingerprint('phone', INJECTED_PHONE_FINGERPRINT);
  }
  if (INJECTED_WATCH_FINGERPRINT.length > 0) {
    injectFingerprint('watch', INJECTED_WATCH_FINGERPRINT);
  }
}

export { PHONE_SELF, WATCH_PEER };
