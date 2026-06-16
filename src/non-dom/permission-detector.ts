/**
 * PermissionDetector
 *
 * Per-page detector for browser permission prompts (geolocation, notifications,
 * camera/microphone, clipboard).
 *
 * There is no native CDP event for "a page is asking for a permission", so we
 * inject a script (via Page.addScriptToEvaluateOnNewDocument, the same raw-CDP
 * mechanism as stealth.ts) that monkey-patches the permission-triggering APIs.
 * When the page calls one of them AND the permission is still UNDECIDED, the
 * patched function:
 *   1. captures a closure that replays the ORIGINAL native call,
 *   2. assigns a request id and notifies the host via the CDP binding
 *      `__awiPermissionRequest` (Runtime.addBinding + Runtime.bindingCalled),
 *   3. leaves the page-side promise/callback PENDING.
 *
 * When the permission is already decided, the patched function passes straight
 * through to native — no behavior change for already-granted/denied permissions
 * (a key safety property).
 *
 * The host surfaces the pending request as a non-DOM "permission" surface. When
 * the agent resolves it (allow/deny), the caller first sets the CDP permission
 * state, then calls resolvePermission(id) which runs the page-side
 * `window.__awiResolvePermission(id)` to replay the saved native call — now
 * deterministic because the CDP permission state is decided.
 */

import type { CdpClient, CdpEventHandler } from '../cdp/cdp-client.interface.js';
import type { BrowserPermission } from './permission-manager.js';

/** Name of the CDP binding the injected script calls to report a pending request. */
export const PERMISSION_BINDING_NAME = '__awiPermissionRequest';

export interface PendingPermission {
  /** Page-generated request id, used to replay the native call on resolution. */
  id: string;
  /** Requested browser permissions (e.g. ['geolocation'], ['camera','microphone']). */
  permissions: BrowserPermission[];
  /** Origin that requested the permission. */
  origin: string;
}

/**
 * Build the script injected into every new document.
 *
 * Fully guarded (never throws — a throwing init script is itself an anomaly and
 * can corrupt page init) and idempotent (guards against double-install).
 */
export function buildPermissionDetectorScript(): string {
  return `(() => { try {
    if (window.__awiPermInstalled) return;
    window.__awiPermInstalled = true;

    const reg = Object.create(null);
    let counter = 0;

    function register(permissions, replay) {
      const id = 'perm-' + (++counter);
      reg[id] = replay;
      try {
        window.${PERMISSION_BINDING_NAME}(JSON.stringify({
          id: id,
          permissions: permissions,
          origin: location.origin,
        }));
      } catch (e) { /* binding not yet installed — request will stay pending */ }
      return id;
    }

    // Host calls this (via Runtime.evaluate) after deciding allow/deny. Replays
    // the saved native call, which now resolves deterministically because the
    // CDP permission state has been set.
    window.__awiResolvePermission = function(id) {
      const replay = reg[id];
      if (!replay) return;
      delete reg[id];
      try { replay(); } catch (e) { /* swallow */ }
    };

    function queryState(name) {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          return navigator.permissions.query({ name: name })
            .then(function (s) { return s && s.state; })
            .catch(function () { return 'prompt'; });
        }
      } catch (e) { /* fallthrough */ }
      return Promise.resolve('prompt');
    }
    function isDecided(state) { return state === 'granted' || state === 'denied'; }

    // ── geolocation ──
    const geo = navigator.geolocation;
    if (geo && geo.getCurrentPosition) {
      const orig = geo.getCurrentPosition.bind(geo);
      geo.getCurrentPosition = function (success, error, options) {
        queryState('geolocation').then(function (state) {
          if (isDecided(state)) orig(success, error, options);
          else register(['geolocation'], function () { orig(success, error, options); });
        });
      };
      if (geo.watchPosition) {
        const origWatch = geo.watchPosition.bind(geo);
        geo.watchPosition = function (success, error, options) {
          queryState('geolocation').then(function (state) {
            if (isDecided(state)) origWatch(success, error, options);
            else register(['geolocation'], function () { origWatch(success, error, options); });
          });
          return 0; // sentinel watch id
        };
      }
    }

    // ── notifications ──
    if (typeof Notification !== 'undefined' && Notification.requestPermission) {
      const origNotif = Notification.requestPermission.bind(Notification);
      Notification.requestPermission = function (cb) {
        if (Notification.permission !== 'default') {
          const p = origNotif(cb);
          return p && p.then ? p : Promise.resolve(Notification.permission);
        }
        return new Promise(function (resolve) {
          register(['notifications'], function () {
            const p = origNotif(cb);
            if (p && p.then) p.then(resolve, function () { resolve(Notification.permission); });
            else resolve(Notification.permission);
          });
        });
      };
    }

    // ── camera / microphone ──
    const md = navigator.mediaDevices;
    if (md && md.getUserMedia) {
      const origGum = md.getUserMedia.bind(md);
      md.getUserMedia = function (constraints) {
        constraints = constraints || {};
        const perms = [];
        if (constraints.video) perms.push('camera');
        if (constraints.audio) perms.push('microphone');
        if (perms.length === 0) return origGum(constraints);
        return new Promise(function (resolve, reject) {
          register(perms, function () { origGum(constraints).then(resolve, reject); });
        });
      };
    }

    // ── clipboard ──
    const clip = navigator.clipboard;
    if (clip && clip.readText) {
      const origRead = clip.readText.bind(clip);
      clip.readText = function () {
        return new Promise(function (resolve, reject) {
          queryState('clipboard-read').then(function (state) {
            if (isDecided(state)) origRead().then(resolve, reject);
            else register(['clipboardRead'], function () { origRead().then(resolve, reject); });
          });
        });
      };
    }
    if (clip && clip.writeText) {
      const origWrite = clip.writeText.bind(clip);
      clip.writeText = function (text) {
        return new Promise(function (resolve, reject) {
          queryState('clipboard-write').then(function (state) {
            if (isDecided(state)) origWrite(text).then(resolve, reject);
            else register(['clipboardWrite'], function () { origWrite(text).then(resolve, reject); });
          });
        });
      };
    }
  } catch (e) { /* init script must never throw */ } })();`;
}

export class PermissionDetector {
  private _pending: PendingPermission | null = null;
  private _cdp: CdpClient | null = null;
  private _bindingHandler: CdpEventHandler | null = null;

  /**
   * Attach to a CDP session: install the host binding and inject the detector
   * script on every new document. Called once per page during setupPageTracking.
   */
  async attach(cdp: CdpClient): Promise<void> {
    if (this._cdp === cdp && this._bindingHandler) {
      return;
    }
    if (this._cdp && this._cdp !== cdp) {
      this.detach();
    }
    this._cdp = cdp;

    this._bindingHandler = (params: Record<string, unknown>) => {
      if (params.name !== PERMISSION_BINDING_NAME) return;
      try {
        const payload = JSON.parse(params.payload as string) as PendingPermission;
        this._pending = {
          id: payload.id,
          permissions: payload.permissions,
          origin: payload.origin,
        };
      } catch {
        // Malformed payload — ignore.
      }
    };
    cdp.on('Runtime.bindingCalled', this._bindingHandler);

    // addBinding MUST precede the injected script so the binding exists by the
    // time a page script calls it.
    await cdp.send('Runtime.addBinding', { name: PERMISSION_BINDING_NAME });
    const source = buildPermissionDetectorScript();
    // Future documents (covers navigations within this page).
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
    // The CURRENT document — addScriptToEvaluateOnNewDocument only applies to
    // documents created after this call, so the already-loaded page would
    // otherwise never get the patch (and permission APIs would run unpatched).
    // The script is idempotent (guards on __awiPermInstalled), so running it
    // again in a freshly-created document is harmless.
    await cdp.send('Runtime.evaluate', { expression: source });
  }

  /** Detach from CDP (cleanup). */
  detach(): void {
    if (this._cdp && this._bindingHandler) {
      this._cdp.off('Runtime.bindingCalled', this._bindingHandler);
    }
    this._cdp = null;
    this._bindingHandler = null;
  }

  /** Return the currently pending permission request, or null if none. */
  getPendingPermission(): PendingPermission | null {
    return this._pending;
  }

  /**
   * Resolve a pending permission request by replaying the saved native call.
   *
   * The caller is responsible for having already set the CDP permission state
   * (and geolocation override, if applicable) so the replayed native call
   * resolves deterministically.
   *
   * @throws Error if no CDP session is attached.
   */
  async resolvePermission(id: string): Promise<void> {
    if (!this._cdp) {
      throw new Error('PermissionDetector is not attached to a CDP session.');
    }
    try {
      await this._cdp.send('Runtime.evaluate', {
        expression: `window.__awiResolvePermission(${JSON.stringify(id)})`,
        awaitPromise: false,
      });
    } finally {
      if (this._pending?.id === id) {
        this._pending = null;
      }
    }
  }

  /** Clear the pending permission state without replaying (e.g. on navigation). */
  clearPending(): void {
    this._pending = null;
  }
}

/**
 * Per-page permission detectors keyed by page object reference.
 * Mirrors the DialogManager registry so each page gets its own detector,
 * cleaned up when the page closes.
 */
const permissionDetectors = new WeakMap<object, PermissionDetector>();

/** Get the existing PermissionDetector for a page, or create one. */
export function getOrCreatePermissionDetector(page: object): PermissionDetector {
  let detector = permissionDetectors.get(page);
  if (!detector) {
    detector = new PermissionDetector();
    permissionDetectors.set(page, detector);
  }
  return detector;
}

/** Remove the PermissionDetector bound to a page (called on page close). */
export function removePermissionDetector(page: object): void {
  permissionDetectors.delete(page);
}
