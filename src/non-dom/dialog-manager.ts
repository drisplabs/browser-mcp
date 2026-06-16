/**
 * DialogManager
 *
 * Per-page manager for JavaScript dialogs (alert/confirm/prompt/beforeunload)
 * and file chooser interception state.
 *
 * Subscribes to CDP events on attach; applies a safe auto-dismiss default
 * policy to prevent session deadlock on unhandled dialogs.
 */

import type { CdpClient, CdpEventHandler } from '../cdp/cdp-client.interface.js';
import type { Page } from 'puppeteer-core';

export type DialogType = 'alert' | 'confirm' | 'prompt' | 'beforeunload';

export interface PendingDialog {
  type: DialogType;
  message: string;
  defaultValue: string;
  url: string;
}

export interface FileChooserState {
  opened: boolean;
  timestamp: number;
  /** CDP backend node ID of the file input that triggered the chooser */
  backendNodeId?: number;
  mode?: string;
}

const dialogManagers = new WeakMap<object, DialogManager>();

/**
 * Get or create the DialogManager for a Puppeteer Page.
 */
export function getOrCreateDialogManager(page: Page): DialogManager {
  const existing = dialogManagers.get(page);
  if (existing) return existing;

  const manager = new DialogManager();
  dialogManagers.set(page, manager);
  return manager;
}

/**
 * Remove the DialogManager for a page (cleanup on close).
 */
export function removeDialogManager(page: Page): void {
  dialogManagers.delete(page);
}

export class DialogManager {
  private _pendingDialog: PendingDialog | null = null;
  private _fileChooser: FileChooserState = { opened: false, timestamp: 0 };
  private _cdp: CdpClient | null = null;
  private _dialogHandler: CdpEventHandler | null = null;
  private _dialogClosedHandler: CdpEventHandler | null = null;
  private _fileChooserHandler: CdpEventHandler | null = null;

  /**
   * Attach to a CDP session.
   *
   * Enables file chooser interception and subscribes to dialog/chooser events.
   * Called once per page during setupPageTracking.
   */
  async attach(cdp: CdpClient): Promise<void> {
    if (this._cdp === cdp && this._dialogHandler && this._dialogClosedHandler) {
      return;
    }

    if (this._cdp && this._cdp !== cdp) {
      this.detach();
    }

    this._cdp = cdp;

    // Subscribe to dialog events
    this._dialogHandler = (params: Record<string, unknown>) => {
      this._pendingDialog = {
        type: (params.type as DialogType) ?? 'alert',
        message: (params.message as string) ?? '',
        defaultValue: (params.defaultValue as string) ?? '',
        url: (params.url as string) ?? '',
      };
    };
    cdp.on('Page.javascriptDialogOpening', this._dialogHandler);

    // Clear pending dialog when it closes (stored so detach() can remove it)
    this._dialogClosedHandler = () => {
      this._pendingDialog = null;
    };
    cdp.on('Page.javascriptDialogClosed', this._dialogClosedHandler);

    // Subscribe to file chooser interception events
    this._fileChooserHandler = (params: Record<string, unknown>) => {
      this._fileChooser = {
        opened: true,
        timestamp: Date.now(),
        backendNodeId: params.backendNodeId as number | undefined,
        mode: params.mode as string | undefined,
      };
    };
    cdp.on('Page.fileChooserOpened', this._fileChooserHandler);

    // Enable file chooser interception so OS picker never opens
    try {
      await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true });
    } catch {
      // Non-fatal: some Chrome versions or headless modes may not support this
    }
  }

  /**
   * Detach from CDP (cleanup).
   */
  detach(): void {
    if (this._cdp && this._dialogHandler) {
      this._cdp.off('Page.javascriptDialogOpening', this._dialogHandler);
    }
    if (this._cdp && this._dialogClosedHandler) {
      this._cdp.off('Page.javascriptDialogClosed', this._dialogClosedHandler);
    }
    if (this._cdp && this._fileChooserHandler) {
      this._cdp.off('Page.fileChooserOpened', this._fileChooserHandler);
    }
    this._cdp = null;
    this._dialogHandler = null;
    this._dialogClosedHandler = null;
    this._fileChooserHandler = null;
  }

  /**
   * Return the currently pending JavaScript dialog, or null if none.
   */
  getPendingDialog(): PendingDialog | null {
    return this._pendingDialog;
  }

  /**
   * Resolve (accept or dismiss) the pending dialog.
   *
   * @throws Error if no CDP session is attached or no dialog is pending
   */
  async resolveDialog(action: 'accept' | 'dismiss', promptText?: string): Promise<void> {
    if (!this._cdp) {
      throw new Error('DialogManager is not attached to a CDP session.');
    }
    if (!this._pendingDialog) {
      throw new Error(
        'No dialog is currently pending. ' +
          'The dialog may have been auto-dismissed or already resolved.'
      );
    }
    try {
      await this._cdp.send('Page.handleJavaScriptDialog', {
        accept: action === 'accept',
        promptText,
      });
    } catch (err) {
      // Dialog may have auto-closed between our check and the CDP call; clear state either way.
      this._pendingDialog = null;
      throw err;
    }
    this._pendingDialog = null;
  }

  /**
   * Apply the default auto-dismiss policy for unhandled dialogs.
   * Dismisses the dialog to prevent session deadlock.
   *
   * No-op if no dialog is pending or no CDP session attached.
   */
  async applyDefaultPolicy(): Promise<void> {
    if (!this._pendingDialog || !this._cdp) return;
    try {
      await this._cdp.send('Page.handleJavaScriptDialog', { accept: false });
      this._pendingDialog = null;
    } catch {
      // Best-effort: dialog may have already closed
    }
  }

  /**
   * Return the current file chooser state.
   */
  getFileChooserState(): FileChooserState {
    return { ...this._fileChooser };
  }

  /**
   * Check if a file chooser was opened after the given timestamp.
   */
  wasFileChooserOpenedSince(timestamp: number): boolean {
    return this._fileChooser.opened && this._fileChooser.timestamp >= timestamp;
  }

  /**
   * Clear the file chooser state (after recording it in a response).
   */
  clearFileChooser(): void {
    this._fileChooser = { opened: false, timestamp: 0 };
  }
}
