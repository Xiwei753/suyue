// SPDX-License-Identifier: GPL-3.0-only
// Wear Engine 适配层：版本检查、手机 APP ID 门控、
// 消息订阅；协议消息与文件通道路由到
// IncomingBookReceiver；旧式消息通道回执经
// wearengine.sendMsg 发回手机。
// Based on Wear Engine receiver call patterns from
// Explore in HMOS Wearable (MIT).
// Does not vendor the upstream Huawei SDK wrapper (Apache-2.0).
import wearengine from '@system.wearengine';
import { PHONE_BUNDLE_NAME, PHONE_APP_ID } from './PeerConfig';
import { IncomingBookReceiver } from './IncomingBookReceiver';
import { handleMessage as handleProgressMessage } from './ProgressSync';

let subscribed = false;
let receiveStarting = false;
let subscribeAttempted = false;
let receiveAttemptId = 0;
let hasShownPage = false;
let pageWasHidden = false;
let pageNavigationPending = false;
let pageNavigationTarget = '';
let appCreateSeen = false;
let receiver = null;
var receiveStatusHandler = null;
var latestReceiveStatus = '传书未配置';
var receiverStatusHandler = null;
var latestReceiverStatus = '接收器：尚未启动';
// 手表 → 手机的唯一回执通道（wearengine.sendMsg）。
var sendToPhoneImpl = null;
// 对端 deviceId。无回调字段时按 Lite Wear Engine 示例使用 'remote'；
// subscribeMsg 回调若提供 deviceId，则优先沿用该值。
var peerDeviceId = '';
var loggedRemoteDeviceDefault = false;

function notifyReceiveStatus(message) {
  latestReceiveStatus = message;
  if (typeof receiveStatusHandler === 'function') {
    receiveStatusHandler(message);
  } else {
    console.info('Wear receiver status: ' + message);
  }
}

function notifyReceiverStatus(message) {
  latestReceiverStatus = message;
  console.info('Wear receiver status: ' + message);
  if (typeof receiverStatusHandler === 'function') {
    receiverStatusHandler(message);
  }
}

export function getReceiveStatus() {
  try {
    const event = JSON.parse(latestReceiveStatus);
    if (event && event.type === 'RESULT') {
      return event.ok ? '接收成功，已加入书架' :
        '传书失败：' + (event.reason || '未知错误');
    }
  } catch (error) {}
  return latestReceiveStatus;
}

export function setReceiveStatusHandler(onStatus) {
  receiveStatusHandler = typeof onStatus === 'function' ? onStatus : null;
  if (receiveStatusHandler) receiveStatusHandler(getReceiveStatus());
}

export function getReceiverStatus() {
  return latestReceiverStatus;
}

export function setReceiverStatusHandler(onStatus) {
  receiverStatusHandler = typeof onStatus === 'function' ? onStatus : null;
  if (receiverStatusHandler) receiverStatusHandler(getReceiverStatus());
}

export function reportAppLifecycle(event) {
  if (event === 'app.onCreate 已执行') appCreateSeen = true;
  if (event === 'app.onDestroy 已执行') appCreateSeen = false;
  notifyReceiverStatus('应用生命周期：' + event);
}

// 页面切换由应用内路由主动标记，以免把书架↔阅读页误当成退后台。
export function markPageNavigation(target) {
  pageNavigationPending = true;
  pageNavigationTarget = target || '';
}

export function clearPageNavigation() {
  pageNavigationPending = false;
  pageNavigationTarget = '';
}

export function onReceiverPageHide() {
  pageWasHidden = true;
}

// Lite 页面 onShow 同时覆盖应用回到前台和路由切换。路由切换沿用
// app.js 建立的唯一订阅；只有页面此前隐藏且不是已标记的路由切换，
// 才清理可能过期的状态并做一次有界重注册，不使用计时器循环。
export function onReceiverPageShow(pageName) {
  if (!hasShownPage) {
    hasShownPage = true;
    pageWasHidden = false;
    clearPageNavigation();
    if (!appCreateSeen && !subscribed && !receiveStarting) {
      notifyReceiverStatus('首屏：未收到 app.onCreate，开始注册');
      beginReceive('page-show-fallback');
    } else {
      console.info('Wear receiver lifecycle: first page shown after app creation');
    }
    return;
  }
  if (pageNavigationPending &&
      (!pageNavigationTarget || pageNavigationTarget === pageName)) {
    clearPageNavigation();
    pageWasHidden = false;
    console.info('Wear receiver lifecycle: route changed; retain app-level subscription');
    return;
  }
  if (pageNavigationPending) {
    console.info('Wear receiver lifecycle: expected route was not shown');
    clearPageNavigation();
  }
  if (!pageWasHidden) {
    console.info('Wear receiver lifecycle: page shown without hide; keep subscription');
    return;
  }
  pageWasHidden = false;
  refreshReceiveOnForeground();
}

function refreshReceiveOnForeground() {
  notifyReceiverStatus('前台恢复：清理上次订阅并重新注册');
  // 让旧异步回调失效，避免迟到的成功把新一轮状态覆盖。
  receiveAttemptId++;
  receiveStarting = false;
  subscribed = false;
  receiver = null;
  sendToPhoneImpl = null;
  peerDeviceId = '';
  loggedRemoteDeviceDefault = false;
  if (subscribeAttempted) {
    try {
      wearengine.unsubscribeMsg();
      console.info('unsubscribeMsg requested before foreground re-register');
    } catch (error) {
      console.error('foreground unsubscribeMsg failed: ' + error);
    }
  }
  subscribeAttempted = false;
  beginReceive('foreground-resume');
}

// Local-only completion event. This does not use sendToPhone / Wear Engine;
// the file callback fires only after digest verification and LibraryIndex.addBook.
export function reportLocalReceiveOutcome(outcome) {
  const event = outcome && outcome.ok ?
    { type: 'RESULT', ok: true } : {
      type: 'RESULT', ok: false,
      reason: outcome && outcome.reason || 'E_RECEIVE_FAILED'
    };
  notifyReceiveStatus(JSON.stringify(event));
}

// 回调里可能携带 deviceId 的候选字段名（与文件引用一样逐一探测，
// 不合成、不猜测具体值）。真机抓到后应把命中的字段名固化下来。
var DEVICE_ID_FIELDS = ['deviceId', 'deviceID', 'srcDeviceId', 'srcDeviceID'];

export function capturePeerDevice(data) {
  if (!data) return '';
  for (var i = 0; i < DEVICE_ID_FIELDS.length; i++) {
    var value = data[DEVICE_ID_FIELDS[i]];
    if (typeof value === 'string' && value.length > 0) {
      peerDeviceId = value;
      return DEVICE_ID_FIELDS[i];
    }
  }
  return '';
}

export function beginReceive(trigger) {
  const notify = notifyReceiveStatus;
  if (!PHONE_APP_ID) {
    notifyReceiverStatus('接收器未配置：缺少手机 APP ID');
    return;
  }
  if (subscribed || receiveStarting) return;
  const attemptId = ++receiveAttemptId;
  const isCurrentAttempt = () => attemptId === receiveAttemptId;
  receiveStarting = true;
  notifyReceiverStatus('接收器启动：' + (trigger || '应用启动'));
  notifyReceiverStatus('阶段：读取 Wear Engine 版本');
  // 手表 → 手机：唯一回执通道。
  // 形状以华为 Lite 示例为准（待真机验证）：
  //   wearengine.sendMsg({deviceId, bundleName,
  //     abilityName, message, success, fail})
  const sendToPhone = (text) => {
    var deviceId = peerDeviceId;
    if (!deviceId) {
      // 记录回调没有提供 deviceId；按 Lite 示例使用 remote。
      if (!loggedRemoteDeviceDefault) {
        loggedRemoteDeviceDefault = true;
        console.info('subscribeMsg 未提供 deviceId，sendMsg 使用 Lite 示例值 remote');
      }
      deviceId = 'remote';
    }
    try {
      wearengine.sendMsg({
        deviceId: deviceId,
        bundleName: PHONE_BUNDLE_NAME,
        abilityName: '',
        message: text,
        success: () => {},
        fail: (data, code) => {
          console.error('sendMsg failed: ' + code);
        }
      });
    } catch (error) {
      console.error('sendMsg error: ' + error);
    }
  };
  sendToPhoneImpl = sendToPhone;
  try {
    wearengine.getWearEngineVersion({
      sdkVersion: '3',
      complete: (versionString) => {
        if (!isCurrentAttempt()) return;
        const raw = String(versionString || '').split('.');
        const version = Number(raw[raw.length - 1]) || 0;
        if (version < 401) {
          receiveStarting = false;
          notifyReceiverStatus('结果：Wear Engine 版本待适配 ' +
            String(versionString || version));
          return;
        }
        notifyReceiverStatus('阶段：Wear Engine 版本可用 ' +
          String(versionString || version));
        notifyReceiverStatus('阶段：设置手机包名');
        wearengine.setPackageName({
          appName: PHONE_BUNDLE_NAME,
          complete: () => {
            if (!isCurrentAttempt()) return;
            console.info('setPackageName ok: ' + PHONE_BUNDLE_NAME);
            notifyReceiverStatus('阶段：手机包名已设置；设置 APP ID');
            wearengine.setFingerprint({
              appName: PHONE_BUNDLE_NAME,
              appCert: PHONE_APP_ID,
              complete: () => {
                if (!isCurrentAttempt()) return;
                console.info('setFingerprint ok: peer=' +
                  PHONE_BUNDLE_NAME + ' appIdPrefix=' +
                  PHONE_APP_ID.substring(0, 4) + '…');
                notifyReceiverStatus('阶段：手机 APP ID 已设置；注册消息接收');
                receiver = new IncomingBookReceiver(
                  notify, sendToPhone);
                subscribeAttempted = true;
                wearengine.subscribeMsg({
                  success: (data) => {
                    if (!isCurrentAttempt()) return;
                    // 先尽力取真实 deviceId，供回执使用；
                    // 取到就记下命中的字段名，便于真机核对。
                    const idField = capturePeerDevice(data);
                    if (idField) {
                      console.info('peer deviceId via data.' + idField);
                    }
                    if (data && data.isRegister) {
                      subscribed = true;
                      receiveStarting = false;
                      console.info('subscribeMsg register ok: peer=' +
                        PHONE_BUNDLE_NAME);
                      notifyReceiverStatus('注册回调：isRegister=true（可达性待验）');
                    } else if (data && data.isFileType) {
                      // 文件通道到达（P0-2）：字段名
                      // 以 GT4 Lite SDK 实测为准。候选
                      // 字段逐一取值，取到后记录来源；
                      // 全部缺失则不落盘、只报状态。
                      const ref = extractFileRef(data);
                      if (!ref) {
                        notifyReceiveStatus('文件通道回调缺少文件路径字段');
                      } else {
                        receiveFile(ref.uri, ref.field);
                      }
                    } else if (data && typeof data.message === 'string') {
                      routeMessage(data.message);
                    }
                  },
                  fail: (reason, code) => {
                    if (!isCurrentAttempt()) return;
                    receiveStarting = false;
                    console.error('subscribeMsg failed code=' + code);
                    notifyReceiverStatus('订阅失败 code=' +
                      (code === undefined ? 'unknown' : code));
                  }
                });
              },
              fail: (reason, code) => {
                if (!isCurrentAttempt()) return;
                receiveStarting = false;
                console.error('setFingerprint failed code=' + code +
                  ' peer=' + PHONE_BUNDLE_NAME);
                notifyReceiverStatus('APP ID 设置失败 code=' +
                  (code === undefined ? 'unknown' : code));
              }
            });
          },
          fail: (reason, code) => {
            if (!isCurrentAttempt()) return;
            receiveStarting = false;
            console.error('setPackageName failed code=' + code +
              ' peer=' + PHONE_BUNDLE_NAME);
            notifyReceiverStatus('包名设置失败 code=' +
              (code === undefined ? 'unknown' : code));
          }
        });
      },
      fail: (reason, code) => {
        if (!isCurrentAttempt()) return;
        receiveStarting = false;
        console.error('getWearEngineVersion failed code=' + code);
        notifyReceiverStatus('读取版本失败 code=' +
          (code === undefined ? 'unknown' : code));
      }
    });
  } catch (error) {
    if (!isCurrentAttempt()) return;
    receiveStarting = false;
    const reason = error && error.message || 'unknown';
    console.error('Wear Engine initialization threw: ' + reason);
    notifyReceiverStatus('Wear Engine 初始化异常');
  }
}

function routeMessage(messageText) {
  // 记录对端消息是否真正到达手表；类型解析失败也不阻断协议。
  var type = 'unknown';
  try {
    type = JSON.parse(messageText).type || 'unknown';
  } catch (e) {}
  console.info('Wear message received type=' + type);
  // 阅读进度是独立小消息，不进入传书状态机；仍复用同一次
  // subscribeMsg 和同一个 sendToPhone 通道。
  if (handleProgressMessage(messageText, sendToPhoneImpl)) return;
  if (!receiver) return;
  // 旧式消息通道 ACK/RESUME/RESULT 由接收器内部
  // 经统一响应通道（sendToPhone）回发；文件通道不等 RESULT。
  receiver.onMessage(messageText);
}

// 文件通道回调字段提取（P0-2）：
// 上游 Lite 示例在 isFileType 分支使用 data.file；
// 部分 SDK 版本可能使用 name/uri/filePath。
// 逐一探测，返回命中的字段名以便日志核对；
// 不猜测、不合成路径。
var FILE_REF_FIELDS = ['file', 'name', 'uri', 'filePath'];
export function extractFileRef(data) {
  if (!data) return null;
  for (var i = 0; i < FILE_REF_FIELDS.length; i++) {
    var field = FILE_REF_FIELDS[i];
    var value = data[field];
    if (typeof value === 'string' && value.length > 0) {
      return { uri: value, field: field };
    }
  }
  return null;
}

  // 文件通道：把 Wear Engine 送达的文件交给
  // IncomingBookReceiver 复制 → 校验 → 入库；
  // 手机不等待手表应用层 RESULT。
function receiveFile(filePath, field) {
  if (!receiver || !filePath) {
    return;
  }
  console.info('file channel ref via data.' + field);
  receiver.receiveFileChannel(filePath, null, (outcome) => {
    reportLocalReceiveOutcome(outcome);
    if (!outcome || !outcome.ok) {
      console.error('file channel failed: ' +
        (outcome && outcome.reason || 'E_RECEIVE_FAILED'));
    }
  });
}

export function stopReceive() {
  receiveAttemptId++;
  receiver = null;
  sendToPhoneImpl = null;
  peerDeviceId = '';
  loggedRemoteDeviceDefault = false;
  receiveStarting = false;
  appCreateSeen = false;
  const shouldUnsubscribe = subscribed || subscribeAttempted;
  subscribed = false;
  subscribeAttempted = false;
  receiveStatusHandler = null;
  receiverStatusHandler = null;
  hasShownPage = false;
  pageWasHidden = false;
  pageNavigationPending = false;
  pageNavigationTarget = '';
  if (!shouldUnsubscribe) return;
  try {
    wearengine.unsubscribeMsg();
  } catch (error) {
    console.error('unsubscribeMsg failed: ' + error);
  }
}
