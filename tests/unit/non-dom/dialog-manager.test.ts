/**
 * DialogManager unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockCdpClient, MockCdpClient } from '../../mocks/cdp-client.mock.js';
import { DialogManager } from '../../../src/non-dom/dialog-manager.js';

describe('DialogManager', () => {
  let mock: MockCdpClient;
  let manager: DialogManager;

  beforeEach(() => {
    mock = createMockCdpClient();
    mock.setResponse('Page.setInterceptFileChooserDialog', {});
    mock.setResponse('Page.handleJavaScriptDialog', {});
    manager = new DialogManager();
  });

  it('has no pending dialog before attach', () => {
    expect(manager.getPendingDialog()).toBeNull();
  });

  it('sets pending dialog on Page.javascriptDialogOpening event', async () => {
    await manager.attach(mock);

    mock.emitEvent('Page.javascriptDialogOpening', {
      type: 'alert',
      message: 'Hello!',
      defaultValue: '',
      url: 'https://example.com',
    });

    const pending = manager.getPendingDialog();
    expect(pending).not.toBeNull();
    expect(pending?.type).toBe('alert');
    expect(pending?.message).toBe('Hello!');
    expect(pending?.url).toBe('https://example.com');
  });

  it('clears pending dialog on Page.javascriptDialogClosed event', async () => {
    await manager.attach(mock);

    mock.emitEvent('Page.javascriptDialogOpening', {
      type: 'confirm',
      message: 'Are you sure?',
      defaultValue: '',
      url: 'https://example.com',
    });

    expect(manager.getPendingDialog()).not.toBeNull();

    mock.emitEvent('Page.javascriptDialogClosed', { result: true, userInput: '' });

    expect(manager.getPendingDialog()).toBeNull();
  });

  it('resolveDialog accept sends correct CDP call', async () => {
    await manager.attach(mock);

    mock.emitEvent('Page.javascriptDialogOpening', {
      type: 'confirm',
      message: 'Proceed?',
      defaultValue: '',
      url: 'https://example.com',
    });

    await manager.resolveDialog('accept');

    expect(mock.sendSpy).toHaveBeenCalledWith('Page.handleJavaScriptDialog', {
      accept: true,
      promptText: undefined,
    });
    expect(manager.getPendingDialog()).toBeNull();
  });

  it('resolveDialog dismiss sends correct CDP call', async () => {
    await manager.attach(mock);

    mock.emitEvent('Page.javascriptDialogOpening', {
      type: 'confirm',
      message: 'Proceed?',
      defaultValue: '',
      url: 'https://example.com',
    });

    await manager.resolveDialog('dismiss');

    expect(mock.sendSpy).toHaveBeenCalledWith('Page.handleJavaScriptDialog', {
      accept: false,
      promptText: undefined,
    });
  });

  it('resolveDialog forwards prompt text for prompt dialogs', async () => {
    await manager.attach(mock);

    mock.emitEvent('Page.javascriptDialogOpening', {
      type: 'prompt',
      message: 'Enter your name:',
      defaultValue: '',
      url: 'https://example.com',
    });

    await manager.resolveDialog('accept', 'Alice');

    expect(mock.sendSpy).toHaveBeenCalledWith('Page.handleJavaScriptDialog', {
      accept: true,
      promptText: 'Alice',
    });
  });

  it('applyDefaultPolicy dismisses unhandled dialogs', async () => {
    await manager.attach(mock);

    mock.emitEvent('Page.javascriptDialogOpening', {
      type: 'alert',
      message: 'Auto-dismiss me',
      defaultValue: '',
      url: 'https://example.com',
    });

    expect(manager.getPendingDialog()).not.toBeNull();

    await manager.applyDefaultPolicy();

    expect(mock.sendSpy).toHaveBeenCalledWith('Page.handleJavaScriptDialog', {
      accept: false,
    });
    expect(manager.getPendingDialog()).toBeNull();
  });

  it('enables file chooser interception on attach', async () => {
    await manager.attach(mock);

    expect(mock.sendSpy).toHaveBeenCalledWith('Page.setInterceptFileChooserDialog', {
      enabled: true,
    });
  });

  it('does not duplicate event handlers when attaching the same CDP session twice', async () => {
    await manager.attach(mock);
    await manager.attach(mock);

    expect(mock.onSpy).toHaveBeenCalledTimes(3);
    expect(mock.sendSpy).toHaveBeenCalledWith('Page.setInterceptFileChooserDialog', {
      enabled: true,
    });
    expect(mock.sendSpy).toHaveBeenCalledTimes(1);
  });

  it('rebinds to a fresh CDP session while preserving a pending dialog', async () => {
    await manager.attach(mock);

    mock.emitEvent('Page.javascriptDialogOpening', {
      type: 'alert',
      message: 'Still open',
      defaultValue: '',
      url: 'https://example.com',
    });
    mock.setActive(false);

    const fresh = createMockCdpClient();
    fresh.setResponse('Page.setInterceptFileChooserDialog', {});
    fresh.setResponse('Page.handleJavaScriptDialog', {});

    await manager.attach(fresh);
    await manager.resolveDialog('accept');

    expect(mock.offSpy).toHaveBeenCalledWith('Page.javascriptDialogOpening', expect.any(Function));
    expect(fresh.sendSpy).toHaveBeenCalledWith('Page.handleJavaScriptDialog', {
      accept: true,
      promptText: undefined,
    });
    expect(manager.getPendingDialog()).toBeNull();
  });

  it('tracks file chooser opened events', async () => {
    await manager.attach(mock);

    expect(manager.wasFileChooserOpenedSince(0)).toBe(false);

    const before = Date.now();
    mock.emitEvent('Page.fileChooserOpened', {
      frameId: 'main',
      mode: 'selectSingle',
      backendNodeId: 99,
    });

    expect(manager.wasFileChooserOpenedSince(before)).toBe(true);
    expect(manager.getFileChooserState().opened).toBe(true);
    expect(manager.getFileChooserState().backendNodeId).toBe(99);
  });

  it('clearFileChooser resets state', async () => {
    await manager.attach(mock);

    mock.emitEvent('Page.fileChooserOpened', { mode: 'selectSingle', backendNodeId: 10 });
    expect(manager.getFileChooserState().opened).toBe(true);

    manager.clearFileChooser();
    expect(manager.getFileChooserState().opened).toBe(false);
  });

  it('throws when resolveDialog called without attach', async () => {
    await expect(manager.resolveDialog('accept')).rejects.toThrow('DialogManager is not attached');
  });
});
