// SPDX-License-Identifier: GPL-3.0-only
// Run: node tests/wear_auth_policy.test.mjs
// issue #5 P0-A/P0-B：Wear Engine 授权 / 设备发现分类回归。
// 纯逻辑模块（无 SDK 依赖），复制为 .mjs 后动态导入。
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const POLICY = 'apps/phone/entry/src/main/ets/services/WearAuthPolicy.js';
const src = readFileSync(POLICY, 'utf8');
// 纯逻辑不得引入 SDK，否则 Node 无法测试。
assert.ok(!src.includes('@kit'),
  'policy must stay SDK-free so Node can test it');
assert.ok(!/^\s*import\s/m.test(src),
  'policy must not import other modules');

const tmp = mkdtempSync(join(tmpdir(), 'suyue-wear-'));
const modPath = join(tmp, 'WearAuthPolicy.mjs');
writeFileSync(modPath, src);
const { describeWearError, authNotice, deviceNotice, shorten } =
  await import(modPath);

// ---- 错误码分类：只认有官方依据的码，其余原样保留 ----
assert.equal(describeWearError('device_query', 1008500004, '').kind,
  'service_not_applied');
assert.equal(describeWearError('auth_query', 1008500005, '').kind,
  'not_authorized');
assert.equal(describeWearError('auth_request', 201, '').kind,
  'not_authorized');
assert.equal(describeWearError('auth_query', 1008500006, '').kind,
  'privacy_not_agreed');
assert.equal(describeWearError('auth_request', 401, '').kind,
  'param_invalid');
const unknown = describeWearError('device_query', 12345, 'boom');
assert.equal(unknown.kind, 'api_error');
assert.equal(unknown.code, 12345, 'unknown code must be preserved verbatim');
assert.ok(unknown.text.includes('12345'), 'raw code must surface in text');
assert.ok(unknown.text.includes('设备发现'), 'stage must surface in text');
const noCode = describeWearError('auth_query', undefined, '');
assert.equal(noCode.kind, 'api_error');
assert.equal(noCode.code, 0);
// 绝不退化成旧的兜底错误。
for (const c of [1008500004, 1008500005, 1008500006, 201, 401, 0, 12345]) {
  const r = describeWearError('device_query', c, 'x');
  assert.ok(!r.text.includes('E_PEER_UNAVAILABLE'));
  assert.ok(!r.text.includes('Wear Engine 不可用'),
    'must not collapse every failure into “Wear Engine 不可用”');
}

// ---- 消息截断（不把长随机串整段带出）----
assert.equal(shorten('  hi  '), 'hi');
assert.ok(shorten('a'.repeat(300)).length <= 121,
  'long messages must be truncated');

// ---- 授权状态提示 ----
assert.equal(authNotice({ ok: true, granted: true }).kind, 'ok');
assert.equal(authNotice({ ok: true, granted: false }).kind, 'not_authorized');
assert.equal(authNotice({ ok: false, stage: 'auth_query',
  code: 1008500006, message: '' }).kind, 'privacy_not_agreed');
assert.equal(authNotice({ ok: false, stage: 'auth_client',
  code: 0, message: 'boom' }).kind, 'api_error');
assert.equal(authNotice(null).kind, 'unknown');

// ---- 设备发现提示：空列表 ≠ 蓝牙/配对问题 ----
const found = deviceNotice({ ok: true,
  devices: [{ randomId: 'r1', name: 'GT 4' }] });
assert.equal(found.kind, 'ok');
assert.ok(found.text.includes('发现 1 台'));
const empty = deviceNotice({ ok: true, devices: [] });
assert.equal(empty.kind, 'empty');
assert.ok(empty.text.includes('未返回可用设备'));
assert.ok(!empty.text.includes('请确认配对与蓝牙'),
  'empty list must not be reported as a pairing/bluetooth problem');
assert.equal(deviceNotice({ ok: false, stage: 'device_query',
  code: 1008500004, message: '' }).kind, 'service_not_applied');
assert.equal(deviceNotice({ ok: false, stage: 'device_query',
  code: 1008500005, message: '' }).kind, 'not_authorized');

console.info('PASS: Wear Engine auth/discovery policy ' +
  '(code classification, empty != bluetooth, raw code preserved)');
