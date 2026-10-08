// SPDX-License-Identifier: GPL-3.0-only
// Wear Engine 适配层（保留）：版本检查、签名指纹门控、
// 消息订阅；协议消息路由到 IncomingBookReceiver。
// Based on Wear Engine receiver call patterns from
// Explore in HMOS Wearable (MIT).
// Does not vendor the upstream Huawei SDK wrapper (Apache-2.0).
import wearengine from '@system.wearengine';
import { PHONE_BUNDLE_NAME, PHONE_CERT_FINGERPRINT } from './PeerConfig';
import { IncomingBookReceiver } from './IncomingBookReceiver';

let subscribed = false;
let receiver = null;

export function beginReceive(onStatus, sendToPhone) {
  const notify = (message) => {
    if (typeof onStatus === 'function') onStatus(message);
  };
  if (!PHONE_CERT_FINGERPRINT) {
    notify('未配置手机签名，传书接收暂未开启');
    return;
  }
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
                receiver = new IncomingBookReceiver(notify);
                wearengine.subscribeMsg({
                  success: (data) => {
                    if (data && data.isRegister) {
                      subscribed = true;
                      notify('传书接收已开启');
                    } else if (data && data.isFileType) {
                      // 文件通道到达：路径由 Wear Engine 回调
                      // 给出，待真机确认回调字段后接入
                      // receiveFileChannel（当前不落盘、不入书架）。
                      notify('收到文件，待接入文件通道校验');
                    } else if (data && typeof data.message === 'string') {
                      routeMessage(data.message, sendToPhone);
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

function routeMessage(messageText, sendToPhone) {
  if (!receiver) return;
  receiver.onMessage(messageText, (response) => {
    // ACK/RESUME 回执：发送 API 以真机为准（待验证）。
    if (typeof sendToPhone === 'function') {
      sendToPhone(JSON.stringify(response));
    }
  });
}

export function stopReceive() {
  receiver = null;
  if (!subscribed) return;
  try {
    wearengine.unsubscribeMsg();
  } catch (error) {
    console.error('unsubscribeMsg failed: ' + error);
  }
  subscribed = false;
}
