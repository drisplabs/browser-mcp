/**
 * PermissionDetector unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockCdpClient, MockCdpClient } from '../../mocks/cdp-client.mock.js';
import {
  PermissionDetector,
  getOrCreatePermissionDetector,
  removePermissionDetector,
  buildPermissionDetectorScript,
  PERMISSION_BINDING_NAME,
} from '../../../src/non-dom/permission-detector.js';

describe('PermissionDetector', () => {
  let mock: MockCdpClient;
  let detector: PermissionDetector;

  beforeEach(() => {
    mock = createMockCdpClient();
    mock.setResponse('Runtime.addBinding', {});
    mock.setResponse('Page.addScriptToEvaluateOnNewDocument', { identifier: '1' });
    mock.setResponse('Runtime.evaluate', { result: {} });
    detector = new PermissionDetector();
  });

  it('has no pending permission before attach', () => {
    expect(detector.getPendingPermission()).toBeNull();
  });

  it('installs the binding then injects the detector script on attach', async () => {
    await detector.attach(mock);

    expect(mock.sendSpy).toHaveBeenCalledWith('Runtime.addBinding', {
      name: PERMISSION_BINDING_NAME,
    });
    const addBindingOrder = mock.sendSpy.mock.calls.findIndex((c) => c[0] === 'Runtime.addBinding');
    const addScriptOrder = mock.sendSpy.mock.calls.findIndex(
      (c) => c[0] === 'Page.addScriptToEvaluateOnNewDocument'
    );
    expect(addBindingOrder).toBeGreaterThanOrEqual(0);
    expect(addScriptOrder).toBeGreaterThan(addBindingOrder);
    expect(mock.onSpy).toHaveBeenCalledWith('Runtime.bindingCalled', expect.any(Function));
  });

  it('also injects the detector script into the current document on attach', async () => {
    // Regression: addScriptToEvaluateOnNewDocument only patches FUTURE documents,
    // so the already-loaded page would never get the patch. attach() must also
    // evaluate the script in the current document.
    await detector.attach(mock);

    const exprOf = (c: unknown[] | undefined): string =>
      String((c?.[1] as { expression?: string } | undefined)?.expression ?? '');
    const sourceOf = (c: unknown[] | undefined): string =>
      String((c?.[1] as { source?: string } | undefined)?.source ?? '');

    const evalCall = mock.sendSpy.mock.calls.find(
      (c) => c[0] === 'Runtime.evaluate' && exprOf(c).includes('__awiPermInstalled')
    );
    expect(evalCall).toBeDefined();
    // The script injected into the new document and the current document must match.
    const addScriptCall = mock.sendSpy.mock.calls.find(
      (c) => c[0] === 'Page.addScriptToEvaluateOnNewDocument'
    );
    expect(exprOf(evalCall)).toContain(sourceOf(addScriptCall));
  });

  it('records a pending permission when the binding fires', async () => {
    await detector.attach(mock);

    mock.emitEvent('Runtime.bindingCalled', {
      name: PERMISSION_BINDING_NAME,
      payload: JSON.stringify({
        id: 'perm-1',
        permissions: ['geolocation'],
        origin: 'https://example.com',
      }),
    });

    const pending = detector.getPendingPermission();
    expect(pending).not.toBeNull();
    expect(pending?.id).toBe('perm-1');
    expect(pending?.permissions).toEqual(['geolocation']);
    expect(pending?.origin).toBe('https://example.com');
  });

  it('ignores bindingCalled events from other bindings', async () => {
    await detector.attach(mock);

    mock.emitEvent('Runtime.bindingCalled', {
      name: 'someOtherBinding',
      payload: JSON.stringify({ id: 'x', permissions: ['camera'], origin: 'https://x.com' }),
    });

    expect(detector.getPendingPermission()).toBeNull();
  });

  it('ignores malformed binding payloads without throwing', async () => {
    await detector.attach(mock);

    expect(() =>
      mock.emitEvent('Runtime.bindingCalled', {
        name: PERMISSION_BINDING_NAME,
        payload: 'not-json',
      })
    ).not.toThrow();
    expect(detector.getPendingPermission()).toBeNull();
  });

  it('resolvePermission replays the page-side call and clears pending', async () => {
    await detector.attach(mock);
    mock.emitEvent('Runtime.bindingCalled', {
      name: PERMISSION_BINDING_NAME,
      payload: JSON.stringify({
        id: 'perm-7',
        permissions: ['notifications'],
        origin: 'https://example.com',
      }),
    });

    await detector.resolvePermission('perm-7');

    expect(mock.sendSpy).toHaveBeenCalledWith(
      'Runtime.evaluate',
      expect.objectContaining({
        expression: 'window.__awiResolvePermission("perm-7")',
      })
    );
    expect(detector.getPendingPermission()).toBeNull();
  });

  it('resolvePermission throws when not attached', async () => {
    await expect(detector.resolvePermission('perm-1')).rejects.toThrow(/not attached/i);
  });

  it('does not clear a different pending request when resolving by id', async () => {
    await detector.attach(mock);
    mock.emitEvent('Runtime.bindingCalled', {
      name: PERMISSION_BINDING_NAME,
      payload: JSON.stringify({
        id: 'perm-A',
        permissions: ['camera', 'microphone'],
        origin: 'https://meet.example.com',
      }),
    });

    await detector.resolvePermission('perm-B');

    // The replay was attempted, but the live pending request (perm-A) is untouched.
    expect(detector.getPendingPermission()?.id).toBe('perm-A');
  });

  it('clearPending drops the pending request', async () => {
    await detector.attach(mock);
    mock.emitEvent('Runtime.bindingCalled', {
      name: PERMISSION_BINDING_NAME,
      payload: JSON.stringify({ id: 'p', permissions: ['geolocation'], origin: 'https://x.com' }),
    });
    detector.clearPending();
    expect(detector.getPendingPermission()).toBeNull();
  });

  it('detach unsubscribes the binding handler', async () => {
    await detector.attach(mock);
    detector.detach();
    expect(mock.offSpy).toHaveBeenCalledWith('Runtime.bindingCalled', expect.any(Function));
    await expect(detector.resolvePermission('x')).rejects.toThrow(/not attached/i);
  });
});

describe('buildPermissionDetectorScript', () => {
  const script = buildPermissionDetectorScript();

  it('is a guarded, idempotent IIFE that never throws', () => {
    expect(script).toContain('try {');
    expect(script).toContain('__awiPermInstalled');
    expect(script).toContain('init script must never throw');
  });

  it('references the host binding and resolve hook', () => {
    expect(script).toContain(`window.${PERMISSION_BINDING_NAME}`);
    expect(script).toContain('window.__awiResolvePermission');
  });

  it('patches the permission-triggering APIs', () => {
    expect(script).toContain('getCurrentPosition');
    expect(script).toContain('Notification.requestPermission');
    expect(script).toContain('getUserMedia');
    expect(script).toContain('readText');
    expect(script).toContain('writeText');
  });

  it('passes through already-decided permissions', () => {
    expect(script).toContain('granted');
    expect(script).toContain('denied');
  });
});

describe('permission detector registry', () => {
  it('returns the same detector for the same page', () => {
    const page = {};
    const a = getOrCreatePermissionDetector(page);
    const b = getOrCreatePermissionDetector(page);
    expect(a).toBe(b);
  });

  it('returns different detectors for different pages', () => {
    const a = getOrCreatePermissionDetector({});
    const b = getOrCreatePermissionDetector({});
    expect(a).not.toBe(b);
  });

  it('removePermissionDetector drops the cached instance', () => {
    const page = {};
    const a = getOrCreatePermissionDetector(page);
    removePermissionDetector(page);
    const b = getOrCreatePermissionDetector(page);
    expect(a).not.toBe(b);
  });
});
