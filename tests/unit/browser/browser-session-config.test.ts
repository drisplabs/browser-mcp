/**
 * Browser Session Config Tests
 *
 * Covers AWI_STEALTH parsing and its default-ON behavior — the most
 * user-facing surface of the stealth feature — plus AWI_DOWNLOAD_DIR
 * validation (absolute-path requirement, create-if-missing, fail-fast).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

describe('loadBrowserConfig — AWI_DOWNLOAD_DIR', () => {
  const original = process.env.AWI_DOWNLOAD_DIR;
  const createdDirs: string[] = [];

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AWI_DOWNLOAD_DIR;
    } else {
      process.env.AWI_DOWNLOAD_DIR = original;
    }
    for (const dir of createdDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined when unset', () => {
    delete process.env.AWI_DOWNLOAD_DIR;
    expect(loadBrowserConfig().downloadDir).toBeUndefined();
  });

  it('returns undefined for an empty/whitespace value', () => {
    process.env.AWI_DOWNLOAD_DIR = '   ';
    expect(loadBrowserConfig().downloadDir).toBeUndefined();
  });

  it('resolves and creates an absolute directory if missing', () => {
    const dir = join(tmpdir(), `awi-dl-test-${process.pid}`);
    rmSync(dir, { recursive: true, force: true });
    createdDirs.push(dir);

    process.env.AWI_DOWNLOAD_DIR = dir;
    expect(loadBrowserConfig().downloadDir).toBe(dir);
    expect(existsSync(dir)).toBe(true);
  });

  it('throws a clear error for a non-absolute path', () => {
    process.env.AWI_DOWNLOAD_DIR = 'relative/downloads';
    expect(() => loadBrowserConfig()).toThrow(/AWI_DOWNLOAD_DIR must be an absolute path/);
  });
});
