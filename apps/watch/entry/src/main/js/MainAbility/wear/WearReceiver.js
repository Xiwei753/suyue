// SPDX-License-Identifier: GPL-3.0-only
// Based on Wear Engine receiver call patterns from Explore in HMOS Wearable (MIT).
// Does not vendor the upstream Huawei SDK wrapper (Apache-2.0).
import wearengine from '@system.wearengine';
import { PHONE_BUNDLE_NAME, PHONE_CERT_FINGERPRINT } from './PeerConfig';

let subscribed = false;

export function beginReceive(onStatus) {
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
                wearengine.subscribeMsg({
                  success: (data) => {
                    if (data && data.isRegister) {
                      subscribed = true;
                      notify('传书接收已开启');
                    } else if (data && data.isFileType) {
                      // 不信任来自设备的文件名，等待协议校验后再将文件加入书库。
                      notify('收到文件，等待校验/导入实现');
                    } else if (data && typeof data.message === 'string') {
                      try {
                        const obj = JSON.parse(data.message);
                        notify(obj && obj.v === 0 ? '收到 ' + obj.type : '收到未知协议消息');
                      } catch (e) {
                        notify('收到非协议消息');
                      }
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

export function stopReceive() {
  if (!subscribed) return;
  try {
    wearengine.unsubscribeMsg();
  } catch (error) {
    console.error('unsubscribeMsg failed: ' + error);
  }
  subscribed = false;
}
