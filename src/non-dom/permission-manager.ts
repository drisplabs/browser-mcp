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
      permissions,
      origin,
    });
  } else {
    // Reset individual permissions by setting override to 'denied' via setPermission
    for (const permission of permissions) {
      await cdp.send('Browser.setPermission', {
        permission: { name: permission },
        setting: 'denied',
        origin,
      });
    }
  }
}
