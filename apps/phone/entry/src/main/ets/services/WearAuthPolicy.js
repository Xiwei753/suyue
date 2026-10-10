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
  device_client: 'Wear Engine 设备客户端创建',
  p2p_client: 'Wear Engine P2P 客户端创建',
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

// 官方依据：本机 SDK d.ts @hms.health.wearEngine.d.ts 的 BusinessError 列表
//   1008500001  网络不可用
//   1008500002  未绑定设备
//   1008500003  设备已断开
//   1008500004  未申请 Wear Engine 服务（AGC 申请 + 审批）
//   1008500005  HUAWEI ID 未授权（所需权限未由用户授予）
//   1008500006  未同意隐私声明
//   1008500007  设备不支持该能力
//   1008500008  未登录 HUAWEI ID
//   1008500009  获取账号信息失败
//   401         请求参数非法
// 关于 201：华为 request_user_authorization 文档示例里出现过 201，但本机 SDK
// d.ts 中 201 属于 P2pResultCode（REMOTE_APP_NOT_RUNNING，手表端应用未运行），
// 两者冲突、无法确证；因此不为 201 编造「未授权」结论，交由下方 api_error
// 原样保留 code（不丢失 (201) 信息）。
export function describeWearError(stage, code, message) {
  const n = typeof code === 'number' ? code : 0;
  if (n === 1008500001) {
    return { stage: stage, code: n, kind: 'network_error',
      text: '网络不可用（1008500001），请检查网络后重试' };
  }
  if (n === 1008500002) {
    return { stage: stage, code: n, kind: 'no_device_bound',
      text: '未绑定设备（1008500002），请先在运动健康里完成 GT 4 配对' };
  }
  if (n === 1008500003) {
    return { stage: stage, code: n, kind: 'device_disconnected',
      text: '设备已断开（1008500003），请确认手表与手机蓝牙已连接' };
  }
  if (n === 1008500004) {
    return { stage: stage, code: n, kind: 'service_not_applied',
      text: 'Wear Engine 服务未开通或未审批（1008500004），' +
        '请先在华为侧申请/审批后再试' };
  }
  if (n === 1008500005) {
    return { stage: stage, code: n, kind: 'not_authorized',
      text: '华为账号未授权该数据权限（1008500005）；本应用传书无需该权限，' +
        '如出现请检查华为侧授权' };
  }
  if (n === 1008500006) {
    return { stage: stage, code: n, kind: 'privacy_not_agreed',
      text: '未同意隐私声明（1008500006），请在授权页同意后重试' };
  }
  if (n === 1008500007) {
    return { stage: stage, code: n, kind: 'device_unsupported',
      text: '设备不支持该能力（1008500007）' };
  }
  if (n === 1008500008) {
    return { stage: stage, code: n, kind: 'account_not_logged_in',
      text: '未登录 HUAWEI ID（1008500008），请先在手机登录华为账号' };
  }
  if (n === 1008500009) {
    return { stage: stage, code: n, kind: 'account_error',
      text: '获取账号信息失败（1008500009），请稍后重试' };
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
      text: '尚未授权手表数据权限（本应用传书无需，如出现请检查华为侧授权）' };
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

// 一轮设备刷新的纯异步流程（issue #5 第二轮 P0-2b / P0-3）。
// 页面通过 deps 注入：start()（开启一轮并返回序号，同时置“进行中”）、
// isCurrent(seq)（该轮是否仍是最新）、listDevices()（可能 throw）、
// apply(result)（落地结果）、end()（复位“进行中”）。
// 保证：无论成功、异常还是被更新的一轮取代，只要该轮仍是当前轮次，
// “进行中”标志都一定会被复位（配合页面的 try/finally 语义）。
export async function runDeviceRefresh(deps) {
  const seq = deps.start();
  try {
    const result = await deps.listDevices();
    if (!deps.isCurrent(seq)) return { superseded: true };
    deps.apply(result);
    return { superseded: false, result: result };
  } finally {
    if (deps.isCurrent(seq)) deps.end();
  }
}
