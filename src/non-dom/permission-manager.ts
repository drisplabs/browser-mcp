/**
 * PermissionManager
 *
 * Per-context manager for browser permissions.
 * Wraps Browser.grantPermissions for the active origin.
 */

import type { CdpClient } from '../cdp/cdp-client.interface.js';

export type BrowserPermission =
  | 'geolocation'
  | 'notifications'
  | 'camera'
  | 'microphone'
  | 'audioCapture'
  | 'videoCapture'
  | 'clipboardRead'
  | 'clipboardWrite'
  | 'clipboardSanitizedWrite'
  | 'accessibilityEvents'
  | 'backgroundSync'
  | 'backgroundFetch'
  | 'payment'
  | 'flash'
  | 'midi'
  | 'midiSysex'
  | 'nfc'
  | 'sensors'
  | 'idleDetection'
  | 'wakeLock'
  | 'storageAccess';

/**
 * Map our semantic permission names to the CDP `Browser.PermissionType` enum
 * used by `Browser.grantPermissions`. The enum does NOT use the W3C Permissions
 * API names — e.g. camera/microphone must be sent as videoCapture/audioCapture,
 * and passing the raw name throws "Unknown permission type". Names already valid
 * in the enum (geolocation, notifications, …) pass through unchanged.
 */
const GRANT_PERMISSION_TYPE: Partial<Record<BrowserPermission, string>> = {
  camera: 'videoCapture',
  microphone: 'audioCapture',
  clipboardRead: 'clipboardReadWrite',
  clipboardWrite: 'clipboardSanitizedWrite',
  payment: 'paymentHandler',
  wakeLock: 'wakeLockScreen',
};

/**
 * Map our semantic permission names to the W3C `PermissionDescriptor.name` used
 * by `Browser.setPermission`. Unlike the grant enum, this uses the Permissions
 * API names — camera/microphone/geolocation/notifications are already valid, but
 * clipboard read/write use the hyphenated W3C spellings.
 */
const DENY_PERMISSION_NAME: Partial<Record<BrowserPermission, string>> = {
  clipboardRead: 'clipboard-read',
  clipboardWrite: 'clipboard-write',
  audioCapture: 'microphone',
  videoCapture: 'camera',
};

/**
 * Grant or deny permissions for an origin using the CDP Browser domain.
 *
 * When granted is false, resets to the browser default (effectively denying).
 */
export async function setPermissions(
  cdp: CdpClient,
  permissions: BrowserPermission[],
  origin: string,
  granted: boolean
): Promise<void> {
  if (granted) {
    await cdp.send('Browser.grantPermissions', {
      permissions: permissions.map((p) => GRANT_PERMISSION_TYPE[p] ?? p),
      origin,
    });
  } else {
    // Reset individual permissions by setting override to 'denied' via setPermission
    for (const permission of permissions) {
      await cdp.send('Browser.setPermission', {
        permission: { name: DENY_PERMISSION_NAME[permission] ?? permission },
        setting: 'denied',
        origin,
      });
    }
  }
}
