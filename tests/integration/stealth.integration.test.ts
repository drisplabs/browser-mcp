/**
 * Stealth Integration Tests
 *
 * Launches a real Chrome via SessionManager and verifies that fingerprint-only
 * stealth removes the automation tells (and that disabling it leaves them).
 *
 * Skipped in CI unless RUN_INTEGRATION=true (requires Chrome installed).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { SessionManager } from '../../src/browser/session-manager.js';

// Skip in CI unless RUN_INTEGRATION is set (matches other integration tests)
const skipIntegration = process.env.CI === 'true' && process.env.RUN_INTEGRATION !== 'true';

const ECHO_URL = 'data:text/html,<html><body>stealth-echo</body></html>';

interface Fingerprint {
  webdriver: boolean;
  plugins: number;
  ua: string;
  hasChrome: boolean;
}

// Evaluated in the page context — navigator/window are browser globals there.
// navigator.webdriver is typed boolean in lib.dom; `'chrome' in window` avoids `any`.
function readFingerprint(): Fingerprint {
  return {
    webdriver: navigator.webdriver,
    plugins: navigator.plugins.length,
    ua: navigator.userAgent,
    hasChrome: 'chrome' in window,
  };
}

describe.skipIf(skipIntegration)('Stealth Integration', () => {
  let session: SessionManager | undefined;

  afterEach(async () => {
    await session?.shutdown();
    session = undefined;
  });

  it('removes automation tells when stealth is on', async () => {
    session = new SessionManager();
    await session.launch({ headless: true, isolated: true, stealth: true });

    const handle = await session.createPage(ECHO_URL);
    const fp = await handle.page.evaluate(readFingerprint);

    expect(fp.webdriver).toBeFalsy();
    expect(fp.plugins).toBeGreaterThan(0);
    expect(fp.ua).not.toMatch(/Headless/);
    expect(fp.hasChrome).toBe(true);
  }, 30000);

  it('leaves navigator.webdriver set when stealth is off (toggle has teeth)', async () => {
    session = new SessionManager();
    await session.launch({ headless: true, isolated: true, stealth: false });

    const handle = await session.createPage(ECHO_URL);
    const webdriver = await handle.page.evaluate(() => navigator.webdriver);

    expect(webdriver).toBe(true);
  }, 30000);
});
