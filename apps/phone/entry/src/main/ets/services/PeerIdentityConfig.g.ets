// SPDX-License-Identifier: GPL-3.0-only
// CI 指纹注入占位：提交的是空值安全默认。
// .github/workflows/*.yml 构建前从 Secrets 覆盖
// 写入真实证书指纹，构建完成后 git checkout 还原。
// 任何“看起来像指纹”的假值都不得提交。
export const INJECTED_PHONE_FINGERPRINT = '';
export const INJECTED_WATCH_FINGERPRINT = '';
