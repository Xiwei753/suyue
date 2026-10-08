// SPDX-License-Identifier: GPL-3.0-only
// Wear Engine 设备发现与选择。
// 规则：
//   - 不默认选择第一台设备，必须由用户确认目标；
//   - 未配对/离线/不支持都有明确错误；
//   - 设备身份只用 Wear Engine 返回的 randomId。
// API 形状以华为 wear-engine-hmos-next-wearable-to-phone
// 示例为准；当前未在真机验证（待验证）。
import { wearEngine } from '@kit.WearEngine';
import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { TargetDevice } from '../model/TransferModels';

const TAG = 'suyue/WearDeviceService';

export class WearDeviceService {
  private deviceClient: wearEngine.DeviceClient;
  private p2pClient: wearEngine.P2pClient;
  private context: Context;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
    this.deviceClient = wearEngine.getDeviceClient(context);
    this.p2pClient = wearEngine.getP2pClient(context);
  }

  // 已连接设备列表。空列表 = 未配对或离线。
  async listDevices(): Promise<TargetDevice[]> {
    try {
      const devices = await this.deviceClient.getConnectedDevices();
      const out: TargetDevice[] = [];
      for (const d of devices) {
        out.push({
          randomId: d.randomId,
          name: d.name !== undefined ? d.name :
            'GT 4（' + d.randomId.substring(0, 6) + '…）'
        });
      }
      hilog.info(0x0000, TAG, 'connected devices: ' + out.length);
      return out;
    } catch (error) {
      hilog.error(0x0000, TAG, 'listDevices failed: ' +
        JSON.stringify(error));
      throw new Error('E_PEER_UNAVAILABLE');
    }
  }

  // 目标手表上本应用是否已安装（发送前提）。
  async isRemoteAppInstalled(device: TargetDevice,
    bundleName: string): Promise<boolean> {
    try {
      return await this.p2pClient.isRemoteAppInstalled(
        device.randomId, bundleName);
    } catch (error) {
      hilog.error(0x0000, TAG, 'isRemoteAppInstalled failed: ' +
        JSON.stringify(error));
      return false;
    }
  }

  // 注册手表 → 手机的消息接收（用于 RESULT 回执、
  // ACK、RESUME）。appParam 中的指纹必须与手表
  // supportLists 配置一致。
  async registerMessageReceiver(
    device: TargetDevice,
    bundleName: string,
    fingerprint: string,
    callback: Callback<wearEngine.P2pMessage>):
  Promise<void> {
    const appInfo: wearEngine.AppInfo = {
      bundleName: bundleName,
      fingerprint: fingerprint
    };
    const appParam: wearEngine.P2pAppParam = {
      remoteApp: appInfo
    };
    await this.p2pClient.registerMessageReceiver(
      device.randomId, appParam, callback);
  }

  async unregisterMessageReceiver(
    device: TargetDevice): Promise<void> {
    try {
      await this.p2pClient.unregisterMessageReceiver(
        device.randomId);
    } catch (error) {
      hilog.warn(0x0000, TAG, 'unregister failed');
    }
  }
}
