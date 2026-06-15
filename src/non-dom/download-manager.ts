/**
 * DownloadManager
 *
 * Per-session manager for browser downloads.
 * Configures Chrome to route downloads to a known directory and tracks
 * download lifecycle events (willBegin / progress / complete).
 */

import type { CdpClient } from '../cdp/cdp-client.interface.js';

export type DownloadStatus = 'inProgress' | 'completed' | 'canceled';

export interface DownloadEntry {
  guid: string;
  url: string;
  suggestedFilename: string;
  downloadPath: string;
  status: DownloadStatus;
  receivedBytes: number;
  totalBytes: number;
  startTimestamp: number;
}

export class DownloadManager {
  private _entries = new Map<string, DownloadEntry>();
  private _downloadDir: string;

  constructor(downloadDir: string) {
    this._downloadDir = downloadDir;
  }

  get downloadDir(): string {
    return this._downloadDir;
  }

  /**
   * Configure the browser session to route downloads to the configured directory
   * and subscribe to download events.
   */
  async attach(cdp: CdpClient): Promise<void> {
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: this._downloadDir,
      eventsEnabled: true,
    });

    cdp.on('Browser.downloadWillBegin', (params: Record<string, unknown>) => {
      const guid = params.guid as string;
      const url = params.url as string;
      const suggestedFilename = (params.suggestedFilename as string) ?? '';
      this._entries.set(guid, {
        guid,
        url,
        suggestedFilename,
        downloadPath: `${this._downloadDir}/${suggestedFilename}`,
        status: 'inProgress',
        receivedBytes: 0,
        totalBytes: 0,
        startTimestamp: Date.now(),
      });
    });

    cdp.on('Browser.downloadProgress', (params: Record<string, unknown>) => {
      const guid = params.guid as string;
      const entry = this._entries.get(guid);
      if (!entry) return;

      entry.receivedBytes = (params.receivedBytes as number) ?? 0;
      entry.totalBytes = (params.totalBytes as number) ?? 0;
      const state = params.state as string;
      if (state === 'completed') entry.status = 'completed';
      else if (state === 'canceled') entry.status = 'canceled';
    });
  }

  /**
   * List all tracked downloads.
   */
  listDownloads(): DownloadEntry[] {
    return Array.from(this._entries.values());
  }

  /**
   * Clear all tracked downloads.
   */
  clearDownloads(): void {
    this._entries.clear();
  }
}
