/**
 * Browser Session Config Tests
 *
 * Covers DRISP_BROWSER_STEALTH parsing and its default-ON behavior — the most
 * user-facing surface of the stealth feature — plus DRISP_BROWSER_DOWNLOAD_DIR
 * validation (absolute-path requirement, create-if-missing, fail-fast), and the
 * legacy AWI_* back-compat fallback (see src/shared/env-compat.ts).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBrowserConfig } from '../../../src/browser/browser-session-config.js';

describe('loadBrowserConfig — DRISP_BROWSER_STEALTH', () => {
  const original = process.env.DRISP_BROWSER_STEALTH;
  const originalLegacy = process.env.AWI_STEALTH;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DRISP_BROWSER_STEALTH;
    } else {
      process.env.DRISP_BROWSER_STEALTH = original;
    }
    if (originalLegacy === undefined) {
      delete process.env.AWI_STEALTH;
    } else {
      process.env.AWI_STEALTH = originalLegacy;
    }
  });

  it('defaults stealth ON when unset', () => {
    delete process.env.DRISP_BROWSER_STEALTH;
    delete process.env.AWI_STEALTH;
    expect(loadBrowserConfig().stealth).toBe(true);
  });

  it.each(['false', 'FALSE', '0', 'no', 'off', '  Off  '])(
    'disables stealth for falsy value %j',
    (value) => {
      process.env.DRISP_BROWSER_STEALTH = value;
      expect(loadBrowserConfig().stealth).toBe(false);
    }
  );

  it.each(['true', '1', 'yes', ''])('keeps stealth ON for non-falsy value %j', (value) => {
    process.env.DRISP_BROWSER_STEALTH = value;
    expect(loadBrowserConfig().stealth).toBe(true);
  });
});

describe('loadBrowserConfig — DRISP_BROWSER_DOWNLOAD_DIR', () => {
  const original = process.env.DRISP_BROWSER_DOWNLOAD_DIR;
  const originalLegacy = process.env.AWI_DOWNLOAD_DIR;
  const createdDirs: string[] = [];

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DRISP_BROWSER_DOWNLOAD_DIR;
    } else {
      process.env.DRISP_BROWSER_DOWNLOAD_DIR = original;
    }
    if (originalLegacy === undefined) {
      delete process.env.AWI_DOWNLOAD_DIR;
    } else {
      process.env.AWI_DOWNLOAD_DIR = originalLegacy;
    }
    for (const dir of createdDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined when unset', () => {
    delete process.env.DRISP_BROWSER_DOWNLOAD_DIR;
    delete process.env.AWI_DOWNLOAD_DIR;
    expect(loadBrowserConfig().downloadDir).toBeUndefined();
  });

  it('returns undefined for an empty/whitespace value', () => {
    process.env.DRISP_BROWSER_DOWNLOAD_DIR = '   ';
    expect(loadBrowserConfig().downloadDir).toBeUndefined();
  });

  it('resolves and creates an absolute directory if missing', () => {
    const dir = join(tmpdir(), `drisp-dl-test-${process.pid}`);
    rmSync(dir, { recursive: true, force: true });
    createdDirs.push(dir);

    process.env.DRISP_BROWSER_DOWNLOAD_DIR = dir;
    expect(loadBrowserConfig().downloadDir).toBe(dir);
    expect(existsSync(dir)).toBe(true);
  });

  it('throws a clear error for a non-absolute path', () => {
    process.env.DRISP_BROWSER_DOWNLOAD_DIR = 'relative/downloads';
    expect(() => loadBrowserConfig()).toThrow(
      /DRISP_BROWSER_DOWNLOAD_DIR must be an absolute path/
    );
  });
});

describe('loadBrowserConfig — legacy AWI_* back-compat', () => {
  const keys = ['DRISP_BROWSER_STEALTH', 'AWI_STEALTH', 'DRISP_BROWSER_MODE', 'AWI_BROWSER_MODE'];
  const originals = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

  afterEach(() => {
    for (const k of keys) {
      if (originals[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = originals[k];
      }
    }
  });

  it('honors the legacy AWI_STEALTH variable when the new one is unset', () => {
    delete process.env.DRISP_BROWSER_STEALTH;
    process.env.AWI_STEALTH = 'false';
    expect(loadBrowserConfig().stealth).toBe(false);
  });

  it('honors the legacy AWI_BROWSER_MODE variable when the new one is unset', () => {
    delete process.env.DRISP_BROWSER_MODE;
    process.env.AWI_BROWSER_MODE = 'isolated';
    expect(loadBrowserConfig().browserMode).toBe('isolated');
  });

  it('prefers the new DRISP_BROWSER_* variable over the legacy AWI_* one', () => {
    process.env.DRISP_BROWSER_STEALTH = 'true';
    process.env.AWI_STEALTH = 'false';
    expect(loadBrowserConfig().stealth).toBe(true);
  });
});
