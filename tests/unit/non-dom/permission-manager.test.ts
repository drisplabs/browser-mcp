/**
 * PermissionManager unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockCdpClient, MockCdpClient } from '../../mocks/cdp-client.mock.js';
import { setPermissions } from '../../../src/non-dom/permission-manager.js';

const ORIGIN = 'https://example.com';

describe('setPermissions — grant', () => {
  let mock: MockCdpClient;

  beforeEach(() => {
    mock = createMockCdpClient();
  });

  it('passes through permission names that are already valid CDP PermissionType enums', async () => {
    await setPermissions(mock, ['geolocation', 'notifications'], ORIGIN, true);

    expect(mock.sendSpy).toHaveBeenCalledWith('Browser.grantPermissions', {
      permissions: ['geolocation', 'notifications'],
      origin: ORIGIN,
    });
  });

  it('maps camera/microphone to the CDP videoCapture/audioCapture enum names', async () => {
    // Regression: Browser.grantPermissions rejects 'camera'/'microphone' with
    // "Unknown permission type" — they must be the PermissionType enum spellings.
    await setPermissions(mock, ['camera', 'microphone'], ORIGIN, true);

    expect(mock.sendSpy).toHaveBeenCalledWith('Browser.grantPermissions', {
      permissions: ['videoCapture', 'audioCapture'],
      origin: ORIGIN,
    });
  });

  it('maps clipboard read/write to the CDP clipboard enum names', async () => {
    await setPermissions(mock, ['clipboardRead', 'clipboardWrite'], ORIGIN, true);

    expect(mock.sendSpy).toHaveBeenCalledWith('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: ORIGIN,
    });
  });
});

describe('setPermissions — deny', () => {
  let mock: MockCdpClient;

  beforeEach(() => {
    mock = createMockCdpClient();
  });

  it('denies each permission individually via the W3C descriptor name', async () => {
    await setPermissions(mock, ['camera', 'geolocation'], ORIGIN, false);

    // camera/geolocation are already valid W3C PermissionDescriptor names.
    expect(mock.sendSpy).toHaveBeenCalledWith('Browser.setPermission', {
      permission: { name: 'camera' },
      setting: 'denied',
      origin: ORIGIN,
    });
    expect(mock.sendSpy).toHaveBeenCalledWith('Browser.setPermission', {
      permission: { name: 'geolocation' },
      setting: 'denied',
      origin: ORIGIN,
    });
  });

  it('maps clipboard read/write to the hyphenated W3C descriptor names on deny', async () => {
    await setPermissions(mock, ['clipboardRead', 'clipboardWrite'], ORIGIN, false);

    expect(mock.sendSpy).toHaveBeenCalledWith('Browser.setPermission', {
      permission: { name: 'clipboard-read' },
      setting: 'denied',
      origin: ORIGIN,
    });
    expect(mock.sendSpy).toHaveBeenCalledWith('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: 'denied',
      origin: ORIGIN,
    });
  });
});
