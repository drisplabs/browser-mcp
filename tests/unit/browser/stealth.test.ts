/**
 * Stealth Module Tests
 *
 * Unit tests for the fingerprint-only anti-detection builders and the
 * CDP-based page applier.
 */

import { describe, it, expect } from 'vitest';
import {
  buildStealthLaunchOptions,
  buildStealthEvasionScript,
  applyStealthToPage,
} from '../../../src/browser/stealth.js';
import { MockCdpClient } from '../../mocks/cdp-client.mock.js';

describe('buildStealthLaunchOptions', () => {
  it('returns automation-suppressing flags when enabled', () => {
    const opts = buildStealthLaunchOptions(true);

    expect(opts.args).toContain('--disable-blink-features=AutomationControlled');
    expect(opts.ignoreDefaultArgs).toContain('--enable-automation');
  });

  it('returns empty arrays when disabled (preserves default behavior)', () => {
    const opts = buildStealthLaunchOptions(false);

    expect(opts.args).toEqual([]);
    expect(opts.ignoreDefaultArgs).toEqual([]);
  });
});

describe('buildStealthEvasionScript', () => {
  it('patches the high-signal tells', () => {
    const script = buildStealthEvasionScript({ headless: false });

    expect(script).toMatch(/webdriver/);
    expect(script).toMatch(/plugins/);
    expect(script).toMatch(/window\.chrome/);
    expect(script).toMatch(/permissions/);
    expect(script).toMatch(/languages/);
  });

  it('includes the User-Agent strip only when headless', () => {
    const headless = buildStealthEvasionScript({ headless: true });
    const headful = buildStealthEvasionScript({ headless: false });

    expect(headless).toMatch(/HeadlessChrome/);
    expect(headful).not.toMatch(/HeadlessChrome/);
  });

  it('is wrapped so it can never throw', () => {
    const script = buildStealthEvasionScript({ headless: true });

    expect(script).toMatch(/try\s*\{/);
    expect(script).toMatch(/catch/);
  });
});

describe('applyStealthToPage', () => {
  it('injects the evasion script via addScriptToEvaluateOnNewDocument', async () => {
    const cdp = new MockCdpClient();

    await applyStealthToPage(cdp, { headless: false });

    const injectCall = cdp.sendSpy.mock.calls.find(
      ([method]) => method === 'Page.addScriptToEvaluateOnNewDocument'
    );
    expect(injectCall).toBeDefined();
    expect((injectCall![1] as { source: string }).source).toMatch(/webdriver/);
  });

  it('overrides the User-Agent when headless and UA contains Headless', async () => {
    const cdp = new MockCdpClient();
    cdp.setResponse('Browser.getVersion', {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36',
    });

    await applyStealthToPage(cdp, { headless: true });

    const uaCall = cdp.sendSpy.mock.calls.find(
      ([method]) => method === 'Network.setUserAgentOverride'
    );
    expect(uaCall).toBeDefined();
    const params = uaCall![1] as { userAgent: string; acceptLanguage: string };
    expect(params.userAgent).not.toMatch(/Headless/);
    expect(params.userAgent).toMatch(/Chrome\/120/);
    expect(params.acceptLanguage).toBe('en-US,en;q=0.9');
  });

  it('does not override the User-Agent when not headless', async () => {
    const cdp = new MockCdpClient();

    await applyStealthToPage(cdp, { headless: false });

    const uaCall = cdp.sendSpy.mock.calls.find(
      ([method]) => method === 'Network.setUserAgentOverride'
    );
    expect(uaCall).toBeUndefined();
  });

  it('skips UA override when a headless build already has a clean UA', async () => {
    const cdp = new MockCdpClient();
    cdp.setResponse('Browser.getVersion', {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0 Safari/537.36',
    });

    await applyStealthToPage(cdp, { headless: true });

    const uaCall = cdp.sendSpy.mock.calls.find(
      ([method]) => method === 'Network.setUserAgentOverride'
    );
    expect(uaCall).toBeUndefined();
  });
});
