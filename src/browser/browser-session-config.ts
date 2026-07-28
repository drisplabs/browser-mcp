/**
 * Browser Session Config
 *
 * Defines browser modes and loads configuration from environment variables.
 * Browser config is infrastructure — set once at startup, never per-tool-call.
 *
 * Env vars (legacy AWI_* names are still honored as deprecated fallbacks):
 *   DRISP_BROWSER_MODE        - user | persistent | isolated (default: unset = auto fallback)
 *   DRISP_BROWSER_CDP_URL     - Explicit CDP endpoint (overrides mode entirely)
 *   DRISP_BROWSER_HEADLESS    - true | false (default: false, only for persistent/isolated)
 *   DRISP_BROWSER_STEALTH     - true | false (default: true) fingerprint-only anti-detection
 *                               for launched browsers; no-op when connecting to user Chrome
 *   DRISP_BROWSER_DOWNLOAD_DIR - Absolute path for browser downloads (default: unset = browser
 *                               default behavior). When set, must be absolute; created if missing.
 *
 * @module browser/browser-session-config
 */

import { isAbsolute } from 'node:path';
import { mkdirSync } from 'node:fs';
import { readEnv } from '../shared/env-compat.js';

/**
 * Browser session modes.
 *
 * - `user`:       Connect to user's running Chrome via well-known profile directory.
 * - `persistent`: Launch Chrome with a dedicated persistent profile.
 * - `isolated`:   Launch Chrome with a temporary profile (deleted on close).
 */
export const BROWSER_MODES = ['user', 'persistent', 'isolated'] as const;

export type BrowserMode = (typeof BROWSER_MODES)[number];

/**
 * Browser session configuration loaded from environment variables.
 */
export interface BrowserSessionConfig {
  /** Browser mode. undefined = auto (fallback chain: user → persistent → isolated) */
  browserMode?: BrowserMode;

  /** Run browser in headless mode. Only relevant for persistent/isolated. */
  headless: boolean;

  /** Explicit CDP endpoint URL. Overrides browserMode entirely. */
  cdpUrl?: string;

  /**
   * Apply fingerprint-only anti-detection patches to launched browsers.
   * Default true. No-op when connecting to the user's real Chrome (it already
   * has a genuine fingerprint).
   */
  stealth?: boolean;

  /**
   * Absolute directory where browser downloads are routed.
   * undefined = unset → default browser download behavior (no routing).
   * When set, it is validated (must be absolute) and created if missing.
   */
  downloadDir?: string;
}

/**
 * Load browser configuration from environment variables.
 *
 * Called once at session creation. The returned config is immutable
 * for the lifetime of the session.
 */
export function loadBrowserConfig(): BrowserSessionConfig {
  const rawMode = readEnv('DRISP_BROWSER_MODE', 'AWI_BROWSER_MODE')?.trim().toLowerCase();
  const browserMode: BrowserMode | undefined = BROWSER_MODES.includes(rawMode as BrowserMode)
    ? (rawMode as BrowserMode)
    : undefined;

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string must be falsy
  const cdpUrl = readEnv('DRISP_BROWSER_CDP_URL', 'AWI_CDP_URL')?.trim() || undefined;

  // Stealth defaults ON; disabled only by an explicit falsy value.
  const stealthRaw = readEnv('DRISP_BROWSER_STEALTH', 'AWI_STEALTH')?.trim().toLowerCase();
  const stealth = !(stealthRaw !== undefined && ['false', '0', 'no', 'off'].includes(stealthRaw));

  const downloadDir = resolveDownloadDir();

  return {
    browserMode,
    headless: readEnv('DRISP_BROWSER_HEADLESS', 'AWI_HEADLESS')?.trim().toLowerCase() === 'true',
    cdpUrl,
    stealth,
    downloadDir,
  };
}

/**
 * Resolve and validate DRISP_BROWSER_DOWNLOAD_DIR.
 *
 * Opt-in: returns undefined when unset/empty (browser default behavior).
 * When set, the path must be absolute and is created (recursively) if missing.
 * Fails fast with a clear, actionable error so misconfiguration surfaces at
 * startup rather than silently dropping downloads later.
 */
function resolveDownloadDir(): string | undefined {
  const raw = readEnv('DRISP_BROWSER_DOWNLOAD_DIR', 'AWI_DOWNLOAD_DIR')?.trim();
  if (!raw) return undefined;

  if (!isAbsolute(raw)) {
    throw new Error(
      `DRISP_BROWSER_DOWNLOAD_DIR must be an absolute path, but got: "${raw}". ` +
        `Provide an absolute directory path (e.g. /tmp/agent-downloads).`
    );
  }

  try {
    mkdirSync(raw, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `DRISP_BROWSER_DOWNLOAD_DIR could not be created at "${raw}": ${message}. ` +
        `Ensure the path is writable.`
    );
  }

  return raw;
}
