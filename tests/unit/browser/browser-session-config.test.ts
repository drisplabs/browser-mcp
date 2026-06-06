/**
 * Browser Session Config Tests
 *
 * Covers AWI_STEALTH parsing and its default-ON behavior — the most
 * user-facing surface of the stealth feature.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { loadBrowserConfig } from '../../../src/browser/browser-session-config.js';

describe('loadBrowserConfig — AWI_STEALTH', () => {
  const original = process.env.AWI_STEALTH;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AWI_STEALTH;
    } else {
      process.env.AWI_STEALTH = original;
    }
  });

  it('defaults stealth ON when unset', () => {
    delete process.env.AWI_STEALTH;
    expect(loadBrowserConfig().stealth).toBe(true);
  });

  it.each(['false', 'FALSE', '0', 'no', 'off', '  Off  '])(
    'disables stealth for falsy value %j',
    (value) => {
      process.env.AWI_STEALTH = value;
      expect(loadBrowserConfig().stealth).toBe(false);
    }
  );

  it.each(['true', '1', 'yes', ''])('keeps stealth ON for non-falsy value %j', (value) => {
    process.env.AWI_STEALTH = value;
    expect(loadBrowserConfig().stealth).toBe(true);
  });
});
