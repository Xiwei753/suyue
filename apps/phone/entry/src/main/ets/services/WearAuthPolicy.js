// SPDX-License-Identifier: GPL-3.0-only
// Wear Engine 授权与设备发现的**纯逻辑**（issue #5 P0-A / P0-B）。
//
// 本模块不 import 任何 SDK，只根据 (stage, code, message) 与授权/发现
// 结果给出结构化分类和中文提示，因此 Node 可直接测试
//   node tests/wear_auth_policy.test.mjs
// 真实错误码由 WearDeviceService.ts 采集，UI 交互在 Index.ets。
//
// 原则：
//   - 只有官方文档 / SDK d.ts 里能确证的错误码才给专门解释；
//   - 其余一律保留原始 code，归入 api_error，绝不臆造原因；
//   - 不再把任何失败都压成 “Wear Engine 不可用 / E_PEER_UNAVAILABLE”；
//   - 「空列表」≠「未配对/蓝牙没连」，「运动健康在线」≠「Wear Engine 会返回」。

export const STAGE_TEXT = {
  auth_client: 'Wear Engine 客户端创建',
  auth_query: '授权状态查询',
  auth_request: '授权申请',
  device_query: '设备发现'
};

export function stageText(stage) {
  return STAGE_TEXT[stage] || 'Wear Engine 调用';
}

// 原始 message 只截断、不改写，避免把长随机串/隐私整段带进 UI 与日志。
export function shorten(message) {
  if (typeof message !== 'string') return '';
  const t = message.trim();
  return t.length > 120 ? t.substring(0, 120) + '…' : t;
}

// 官方依据（Huawei Wear Engine ArkTS 文档 / SDK d.ts）：
//   1008500004  未申请 Wear Engine 服务（AGC 申请 + 审批）
//   1008500005  HUAWEI ID 未授权（所需权限未由用户授予）
//   1008500006  未同意隐私声明
//   401         请求参数非法
//   201         华为文档标注为「未授权」（真机尚未观察到，仅原样保留 code）
export function describeWearError(stage, code, message) {
  const n = typeof code === 'number' ? code : 0;
  if (n === 1008500004) {
    return { stage: stage, code: n, kind: 'service_not_applied',
      text: 'Wear Engine 服务未开通或未审批（1008500004），' +
        '请先在华为侧申请/审批后再试' };
  }
  if (n === 1008500005) {
    return { stage: stage, code: n, kind: 'not_authorized',
      text: '尚未授权手表访问（1008500005），请点击「授权手表访问」' };
  }
  if (n === 1008500006) {
    return { stage: stage, code: n, kind: 'privacy_not_agreed',
      text: '未同意隐私声明（1008500006），请在授权页同意后重试' };
  }
  if (n === 201) {
    return { stage: stage, code: n, kind: 'not_authorized',
      text: '尚未授权手表访问（201），请点击「授权手表访问」' };
  }
  if (n === 401) {
    return { stage: stage, code: n, kind: 'param_invalid',
      text: '请求参数非法（401）' };
  }
  const tail = shorten(message);
  return { stage: stage, code: n, kind: 'api_error',
    text: stageText(stage) + '失败（' + n + '）' + (tail ? '：' + tail : '') };
}

// 授权状态提示。auth: { ok, granted, stage, code, message }。
export function authNotice(auth) {
  if (!auth) {
    return { kind: 'unknown', code: 0,
      text: '尚未检查 Wear Engine 授权状态' };
  }
  if (auth.ok === true && auth.granted === true) {
    return { kind: 'ok', code: 0, text: 'Wear Engine 已授权' };
  }
  if (auth.ok === true && auth.granted !== true) {
    return { kind: 'not_authorized', code: 0,
      text: '尚未授权手表访问，请点击「授权手表访问」' };
  }
  return describeWearError(auth.stage, auth.code, auth.message);
}

// 设备发现提示。result: { ok, devices, stage, code, message }。
export function deviceNotice(result) {
  if (!result) {
    return { kind: 'unknown', code: 0, text: '尚未发现设备' };
  }
  if (result.ok === true && result.devices && result.devices.length > 0) {
    return { kind: 'ok', code: 0,
      text: '发现 ' + result.devices.length + ' 台已连接设备，请选择目标' };
  }
  if (result.ok === true) {
    return { kind: 'empty', code: 0,
      text: 'Wear Engine 未返回可用设备（请确认手表已配对、蓝牙在线，' +
        '且运动健康已连接；空列表不等于未配对）' };
  }
  return describeWearError(result.stage, result.code, result.message);
}
