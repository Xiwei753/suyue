// SPDX-License-Identifier: GPL-3.0-only
// Wear Engine 适配层：版本检查、签名指纹门控、
// 消息订阅；协议消息与文件通道路由到
// IncomingBookReceiver；所有回执经
// wearengine.sendMsg 发回手机（P0-6）。
// Based on Wear Engine receiver call patterns from
// Explore in HMOS Wearable (MIT).
// Does not vendor the upstream Huawei SDK wrapper (Apache-2.0).
import wearengine from '@system.wearengine';
import { PHONE_BUNDLE_NAME, PHONE_CERT_FINGERPRINT } from './PeerConfig';
import { IncomingBookReceiver } from './IncomingBookReceiver';

let subscribed = false;
let receiver = null;
// 手表 → 手机的唯一回执通道（wearengine.sendMsg）。
var sendToPhoneImpl = null;

export function beginReceive(onStatus) {
  const notify = (message) => {
    if (typeof onStatus === 'function') onStatus(message);
  };
  if (!PHONE_CERT_FINGERPRINT) {
    notify('未配置手机签名，传书接收暂未开启');
    return;
  }
  // 手表 → 手机：唯一回执通道。
  // 形状以华为 Lite 示例为准（待真机验证）：
  //   wearengine.sendMsg({deviceId, bundleName,
  //     abilityName, message, success, fail})
  const sendToPhone = (text) => {
    try {
      wearengine.sendMsg({
        deviceId: 'remote',
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
        const raw = String(versionString || '').split('.');
        const version = Number(raw[raw.length - 1]) || 0;
        if (version < 401) {
          notify('Wear Engine 版本待适配：' + version);
          return;
        }
        wearengine.setPackageName({
          appName: PHONE_BUNDLE_NAME,
          complete: () => {
            wearengine.setFingerprint({
              appName: PHONE_BUNDLE_NAME,
              appCert: PHONE_CERT_FINGERPRINT,
              complete: () => {
                receiver = new IncomingBookReceiver(
                  notify, sendToPhone);
                wearengine.subscribeMsg({
                  success: (data) => {
                    if (data && data.isRegister) {
                      subscribed = true;
                      notify('传书接收已开启');
                    } else if (data && data.isFileType) {
                      // 文件通道到达：data.file 是
                      // Wear Engine 送达的文件路径
                      // （字段名以真机回调为准，待验证）。
                      receiveFile(data.file);
                    } else if (data && typeof data.message === 'string') {
                      routeMessage(data.message);
                    }
                  },
                  fail: (reason, code) => notify('接收注册失败：' + code)
                });
              },
              fail: (reason, code) => notify('手机指纹配置失败：' + code)
            });
          },
          fail: (reason, code) => notify('手机包名配置失败：' + code)
        });
      }
    });
  } catch (error) {
    notify('Wear Engine 不可用：' + (error && error.message || 'unknown'));
  }
}

function routeMessage(messageText) {
  if (!receiver) return;
  // ACK/RESUME/RESULT 全部由接收器内部
  // 经统一响应通道（sendToPhone）回发。
  receiver.onMessage(messageText);
}

// 文件通道：把 Wear Engine 送达的文件交给
// IncomingBookReceiver 复制 → 校验 → 入库。
// 结果（RESULT）由接收器统一经 sendToPhone 回发。
function receiveFile(filePath) {
  if (!receiver || !filePath) {
    return;
  }
  receiver.receiveFileChannel(filePath,
    /* fileApi */ null, (outcome) => {
      if (!outcome.ok) {
        console.error('file channel failed: ' +
          outcome.reason);
      }
    });
}

export function stopReceive() {
  receiver = null;
  sendToPhoneImpl = null;
  if (!subscribed) return;
  try {
    wearengine.unsubscribeMsg();
  } catch (error) {
    console.error('unsubscribeMsg failed: ' + error);
  }
  subscribed = false;
}
