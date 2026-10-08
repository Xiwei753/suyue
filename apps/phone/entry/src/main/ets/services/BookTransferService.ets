// SPDX-License-Identifier: GPL-3.0-only
// 手机侧书籍发送：按 shared/protocol v0 序列
// HELLO → BOOK_META → 文件通道 transferFile →
// 等待手表 RESULT。
//
// 关键约束（协议 + 施工单）：
//   - 成功以手表回 RESULT ok=true 为准，
//     不以 transferFile 回调成功为准；
//   - 目标设备由用户选择，不默认第一台；
//   - 进度/取消/超时/重试齐备；成功后关闭
//     文件句柄并清理暂存；
//   - 重试只针对可恢复错误（超时/对端不可用），
//     摘要类错误不重试。
// API 形状以华为 wear-engine 示例为准，
// 当前未在真机验证（待验证）。
import { wearEngine } from '@kit.WearEngine';
import { fileIo as fs } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { common } from '@kit.AbilityKit';
import { BookMeta } from '../model/BookModels';
import { TransferProgress, TransferState,
  TargetDevice, MAX_RETRY, RESULT_TIMEOUT_MS,
  newTransferId } from '../model/TransferModels';
import { WearDeviceService } from './WearDeviceService';

const TAG = 'suyue/BookTransferService';
const HELLO_TIMEOUT_MS = 10000;

export interface TransferCallbacks {
  onProgress: (progress: TransferProgress) => void;
}

export class BookTransferService {
  private p2pClient: wearEngine.P2pClient;
  private deviceService: WearDeviceService;
  private context: Context;
  private encoder: util.TextEncoder;
  // transferId → 等待 RESULT 的解析器。
  private pending = new Map<string, {
    resolve: (ok: boolean, reason?: string) => void;
    timer: number;
  }>();
  private cancelled = new Set<string>();

  constructor(context: common.UIAbilityContext,
    deviceService: WearDeviceService) {
    this.context = context;
    this.p2pClient = wearEngine.getP2pClient(context);
    this.deviceService = deviceService;
    this.encoder = new util.TextEncoder();
  }

  // 手表回执入口：页面层把 Wear Engine 消息
  // 回调路由到这里。
  onMessageFromWatch(content: Uint8Array): void {
    const text = new util.TextDecoder()
      .decodeToString(content);
    let message;
    try {
      message = JSON.parse(text);
    } catch (e) {
      hilog.warn(0x0000, TAG, 'non-protocol message');
      return;
    }
    if (message.v !== 0 || message.type !== 'RESULT') {
      return;
    }
    const waiter = this.pending.get(message.transferId);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    this.pending.delete(message.transferId);
    waiter.resolve(message.ok === true, message.reason);
  }

  cancel(transferId: string): void {
    this.cancelled.add(transferId);
    const waiter = this.pending.get(transferId);
    if (waiter) {
      clearTimeout(waiter.timer);
      this.pending.delete(transferId);
      waiter.resolve(false, 'E_CANCELLED');
    }
  }

  private buildAppParam(bundleName: string,
    fingerprint: string): wearEngine.P2pAppParam {
    const appInfo: wearEngine.AppInfo = {
      bundleName: bundleName,
      fingerprint: fingerprint
    };
    return { remoteApp: appInfo };
  }

  private sendMessage(device: TargetDevice,
    appParam: wearEngine.P2pAppParam,
    payload: object): Promise<void> {
    const message: wearEngine.P2pMessage = {
      content: this.encoder.encodeInto(
        JSON.stringify(payload))
    };
    return new Promise<void>((resolve, reject) => {
      try {
        // 华为示例中 sendMessage 无回调（void）；
        // 抛错即失败。精确的异步语义待真机验证。
        this.p2pClient.sendMessage(device.randomId,
          appParam, message);
        resolve();
      } catch (error) {
        reject(new Error('send failed: ' +
          (error && error.code)));
      }
    });
  }

  // sendFile: transferFile 回调上报进度。
  private transferFile(device: TargetDevice,
    appParam: wearEngine.P2pAppParam,
    filePath: string,
    onPercent: (percent: number) => void):
  Promise<void> {
    const p2pFile: wearEngine.P2pFile = {
      file: fs.openSync(filePath, fs.OpenMode.READ_ONLY)
    };
    return new Promise<void>((resolve, reject) => {
      this.p2pClient.transferFile(device.randomId,
        appParam, p2pFile, (error, result) => {
          try {
            if (error) {
              reject(new Error('transfer failed: ' +
                error.code));
              return;
            }
            if (result && typeof result.progress === 'number') {
              onPercent(result.progress);
            }
            if (result && result.code === 0) {
              resolve();
            }
          } finally {
            try {
              fs.closeSync(p2pFile.file);
            } catch (closeError) {
              hilog.warn(0x0000, TAG, 'close failed');
            }
          }
        });
    });
  }

  private waitForResult(transferId: string,
    timeoutMs: number): Promise<{ ok: boolean;
      reason?: string }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(transferId);
        resolve({ ok: false, reason: 'E_TIMEOUT' });
      }, timeoutMs);
      this.pending.set(transferId, {
        resolve: (ok, reason) =>
          resolve({ ok: ok, reason: reason }),
        timer: timer
      });
    });
  }

  private update(callbacks: TransferCallbacks,
    progress: TransferProgress): void {
    callbacks.onProgress(progress);
  }

  // 发送一本书。重试只包裹可恢复阶段（超时/对端不可用）。
  async sendBook(book: BookMeta, device: TargetDevice,
    bundleName: string, fingerprint: string,
    callbacks: TransferCallbacks,
    retry: number = MAX_RETRY): Promise<boolean> {
    const transferId = newTransferId();
    const progress: TransferProgress = {
      transferId: transferId,
      bookId: book.bookId,
      title: book.title,
      state: TransferState.CONNECTING,
      percent: 0,
      message: '正在连接 ' + device.name
    };
    this.update(callbacks, progress);

    // 目标前提：远端应用已安装。
    let installed = false;
    try {
      installed = await this.deviceService
        .isRemoteAppInstalled(device, bundleName);
    } catch (e) {
      installed = false;
    }
    if (!installed) {
      progress.state = TransferState.FAILED;
      progress.error = 'E_PEER_UNAVAILABLE';
      progress.message = '手表端未安装素阅或未配对';
      this.update(callbacks, progress);
      return false;
    }

    const appParam = this.buildAppParam(bundleName,
      fingerprint);

    let attempt = 0;
    while (attempt <= retry) {
      if (this.cancelled.has(transferId)) {
        progress.state = TransferState.CANCELLED;
        progress.message = '已取消';
        this.update(callbacks, progress);
        return false;
      }
      attempt += 1;
      try {
        // HELLO
        progress.state = TransferState.CONNECTING;
        progress.message = '握手（HELLO）';
        this.update(callbacks, progress);
        await this.sendMessage(device, appParam, {
          v: 0, type: 'HELLO',
          capabilities: {
            formats: ['utf8-text'], ack: true,
            chunkBytes: null, fileChannel: true
          }
        });

        // BOOK_META
        progress.state = TransferState.SENDING;
        progress.message = '发送书籍元数据';
        this.update(callbacks, progress);
        await this.sendMessage(device, appParam, {
          v: 0, type: 'BOOK_META',
          transferId: transferId,
          bookId: book.bookId,
          title: book.title,
          encoding: book.encoding,
          bytes: book.bytes,
          sha256: book.sha256,
          chunks: book.chunks,
          chunkBytes: book.chunkBytes,
          chapters: book.chapters
        });

        // 文件通道：整本规范化文件。
        progress.message = '通过文件通道传输正文';
        this.update(callbacks, progress);
        await this.transferFile(device, appParam,
          book.filePath, (percent) => {
            progress.percent = percent;
            this.update(callbacks, progress);
          });

        // 等待手表校验完成后的 RESULT。
        progress.state = TransferState.WAITING_RESULT;
        progress.message = '等待手表校验回执';
        progress.percent = 100;
        this.update(callbacks, progress);
        const result = await this.waitForResult(
          transferId, RESULT_TIMEOUT_MS);
        if (this.cancelled.has(transferId)) {
          progress.state = TransferState.CANCELLED;
          progress.message = '已取消';
          this.update(callbacks, progress);
          return false;
        }
        if (result.ok) {
          progress.state = TransferState.SUCCEEDED;
          progress.message = '手表已确认入库';
          this.update(callbacks, progress);
          return true;
        }
        // 摘要/缺块类错误不可重试。
        const reason = result.reason || 'E_PROTOCOL';
        if (reason === 'E_DIGEST_MISMATCH' ||
            reason === 'E_MISSING_CHUNKS' ||
            reason === 'E_UNSUPPORTED_FORMAT' ||
            reason === 'E_DECODE') {
          progress.state = TransferState.FAILED;
          progress.error = reason;
          progress.message = '手表拒绝：' + reason;
          this.update(callbacks, progress);
          return false;
        }
        // 可恢复错误（超时等）走重试。
        progress.message = '可恢复失败（' + reason +
          '），重试 ' + attempt + '/' + retry;
        this.update(callbacks, progress);
      } catch (error) {
        if (attempt > retry) {
          progress.state = TransferState.FAILED;
          progress.error = 'E_PEER_UNAVAILABLE';
          progress.message = '传输失败：' +
            (error && error.message);
          this.update(callbacks, progress);
          return false;
        }
        progress.message = '传输异常，重试 ' + attempt +
          '/' + retry;
        this.update(callbacks, progress);
      }
    }
    progress.state = TransferState.FAILED;
    progress.error = 'E_TIMEOUT';
    progress.message = '超过最大重试次数';
    this.update(callbacks, progress);
    return false;
  }
}
