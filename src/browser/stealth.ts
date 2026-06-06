/**
 * Stealth — fingerprint-only anti-detection for launched browsers.
 *
 * Goal: avoid FALSE-POSITIVE bot blocking for legitimate use. A browser launched
 * by Puppeteer carries automation tells (navigator.webdriver === true, the
 * "controlled by automated test software" infobar, an empty plugins list,
 * a missing window.chrome, "HeadlessChrome" in the User-Agent) that some sites
 * use to block. These patches make a launched Chrome look like the user's normal
 * Chrome. No behavioral changes (clicks/typing are untouched).
 *
 * Only relevant for LAUNCHED browsers (persistent/isolated). When connecting to
 * the user's real Chrome the fingerprint is already genuine, so the caller skips
 * page injection entirely — see SessionManager.applyStealth().
 *
 * @module browser/stealth
 */

import type { CdpClient } from '../cdp/cdp-client.interface.js';

/** Launch-time flags that suppress Chrome's automation tells. */
export interface StealthLaunchOptions {
  /** Extra Chrome command-line args. */
  args: string[];
  /** Default Puppeteer args to omit. */
  ignoreDefaultArgs: string[];
}

/**
 * Build launch flags for stealth. Returns empty arrays when disabled so callers
 * preserve their current behavior exactly.
 */
export function buildStealthLaunchOptions(stealth: boolean): StealthLaunchOptions {
  if (!stealth) {
    return { args: [], ignoreDefaultArgs: [] };
  }
  return {
    // Stops Blink from setting navigator.webdriver at the engine level
    // (belt-and-braces with the JS patch in the evasion script).
    args: ['--disable-blink-features=AutomationControlled'],
    // Removes Puppeteer's default --enable-automation switch, which both shows the
    // automation infobar and is itself a high-signal tell.
    ignoreDefaultArgs: ['--enable-automation'],
  };
}

/**
 * Build the evasion script injected into every new document before page scripts.
 *
 * Kept MINIMAL and fully guarded: a throwing init script is itself a detectable
 * anomaly (and can corrupt page init), so everything is wrapped in try/catch and
 * only patches values that look automated (e.g. an empty plugins list).
 *
 * @param opts.headless - when true, also strips "HeadlessChrome" from
 *   navigator.userAgent so JS reads match the wire UA set via
 *   Network.setUserAgentOverride (identical output ⇒ no mismatch tell).
 */
export function buildStealthEvasionScript(opts: { headless: boolean }): string {
  return `(() => { try {
    // 1) navigator.webdriver — the canonical Selenium/Puppeteer flag. Launched
    //    Chrome sets it true; real user Chrome leaves it undefined/false.
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
    // 2) navigator.plugins / mimeTypes — an empty PluginArray is a common bot
    //    signal. Real Chrome ships the PDF viewer plugins. Only patch if empty.
    if (navigator.plugins.length === 0) {
      const mk = (name, filename, description) => ({ name, filename, description, length: 1 });
      const plugins = [
        mk('PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'),
        mk('Chrome PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'),
        mk('Chromium PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'),
      ];
      Object.defineProperty(navigator, 'plugins', { get: () => plugins, configurable: true });
      Object.defineProperty(navigator, 'mimeTypes', {
        get: () => [{ type: 'application/pdf', suffixes: 'pdf', description: '' }],
        configurable: true,
      });
    }
    // 3) navigator.languages — an empty array is anomalous for a real browser.
    if (!navigator.languages || navigator.languages.length === 0) {
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'], configurable: true });
    }
    // 4) window.chrome.runtime — present in real Chrome; its absence is a strong
    //    tell. Add a minimal stub only if missing; never clobber a genuine one.
    if (!window.chrome) {
      Object.defineProperty(window, 'chrome', { value: { runtime: {} }, writable: true, configurable: true });
    } else if (!window.chrome.runtime) {
      window.chrome.runtime = {};
    }
    // 5) permissions.query('notifications') — headless returns 'denied' while
    //    Notification.permission is 'default' (an impossible combo scanners
    //    check). Reconcile the two.
    const query = navigator.permissions && navigator.permissions.query;
    if (query) {
      navigator.permissions.query = (params) =>
        params && params.name === 'notifications'
          ? Promise.resolve({
              // Guard: window.Notification is undefined in insecure/sandboxed
              // contexts — deref'ing it here would reject the page's own query.
              state: typeof Notification !== 'undefined' ? Notification.permission : 'default',
              onchange: null,
            })
          : query.call(navigator.permissions, params);
    }${
      opts.headless
        ? `
    // 6) (headless only) strip "HeadlessChrome" from navigator.userAgent so JS
    //    reads match the wire UA set via Network.setUserAgentOverride.
    const ua = navigator.userAgent.replace(/HeadlessChrome/g, 'Chrome').replace(/Headless/g, '');
    Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => ua, configurable: true });`
        : ''
    }
  } catch (e) { /* swallow — an init script must never throw */ } })();`;
}

/** Options for applying stealth to a page's CDP session. */
export interface ApplyStealthOptions {
  /** Whether the browser was launched headless (enables UA normalization). */
  headless: boolean;
}

/**
 * Apply fingerprint-only stealth to a page via its CDP session.
 *
 * Uses raw CDP (not Puppeteer's page.evaluateOnNewDocument) so the behavior is
 * exercised through the CdpClient abstraction the rest of the codebase and tests
 * use. Page.addScriptToEvaluateOnNewDocument auto-reruns on every new document,
 * so the evasion persists across navigations with no per-nav re-injection.
 *
 * Caller is responsible for skipping this in connect/user mode (real Chrome
 * already has a genuine fingerprint).
 */
export async function applyStealthToPage(cdp: CdpClient, opts: ApplyStealthOptions): Promise<void> {
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: buildStealthEvasionScript({ headless: opts.headless }),
  });

  // UA normalization only matters for headless launches, where the UA carries
  // "HeadlessChrome". setUserAgentOverride is authoritative — it sets both the
  // wire User-Agent header and navigator.userAgent.
  if (opts.headless) {
    let userAgent: string | undefined;
    try {
      const version = await cdp.send<{ userAgent?: string }>('Browser.getVersion');
      userAgent = version?.userAgent;
    } catch {
      /* best-effort — Browser.getVersion may be unavailable */
    }
    if (userAgent?.includes('Headless')) {
      const cleanUA = userAgent.replace(/HeadlessChrome/g, 'Chrome').replace(/Headless/g, '');
      await cdp.send('Network.setUserAgentOverride', {
        userAgent: cleanUA,
        acceptLanguage: 'en-US,en;q=0.9',
      });
    }
  }
}
