// SPDX-License-Identifier: GPL-3.0-only
// CI 指纹注入占位：提交的是空值安全默认。
// .github/workflows/watch_lite_hap.yml 构建前
// 从 Secrets 覆盖写入手机证书指纹，构建完成
// 后 git checkout 还原。假值不得提交。
export const INJECTED_PHONE_FINGERPRINT = '';
