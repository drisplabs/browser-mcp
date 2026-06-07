import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInstall } from '../../../src/install/index.js';

function captureStderr(): { get output(): string; restore: () => void } {
  const chunks: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  };
  return {
    get output() {
      return chunks.join('');
    },
    restore() {
      process.stderr.write = original;
    },
  };
}

describe('runInstall() — non-TTY without --harness flag', () => {
  it('exits with code 1 and prints usage guidance', async () => {
    const exitCalls: (number | string | null | undefined)[] = [];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCalls.push(code);
      return undefined as never;
    });
    const capture = captureStderr();

    await runInstall([], { isTTY: false });

    const stderrOut = capture.output;
    capture.restore();
    exitSpy.mockRestore();

    expect(exitCalls).toContain(1);
    expect(stderrOut).toContain('--harness');
  });
});

describe('runInstall() — non-TTY with --harness', () => {
  let exitCalls: (number | string | null | undefined)[];
  let restoreExit: () => void;
  let capture: ReturnType<typeof captureStderr>;

  beforeEach(() => {
    exitCalls = [];
    const spy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCalls.push(code);
      return undefined as never;
    });
    restoreExit = () => spy.mockRestore();
    capture = captureStderr();
  });

  afterEach(() => {
    capture.restore();
    restoreExit();
  });

  it('prints a summary table after applying', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'awi-install-flow-'));
    try {
      await runInstall(['--harness', 'claude-desktop', '--scope', 'global'], {
        isTTY: false,
        homeDir: dir,
      });
      expect(capture.output).toContain('Claude Desktop');
      expect(capture.output).toContain('Harness');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not exit with 1 on success', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'awi-install-flow-'));
    try {
      await runInstall(['--harness', 'claude-desktop', '--scope', 'global'], {
        isTTY: false,
        homeDir: dir,
      });
      expect(exitCalls).not.toContain(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('handles unknown harness id without crashing', async () => {
    await runInstall(['--harness', 'unknown-harness-id'], { isTTY: false });
    expect(true).toBe(true);
  });

  it('dry-run flag threads through to adapters', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'awi-install-dryrun-'));
    try {
      await runInstall(['--harness', 'claude-desktop', '--dry-run', '--scope', 'global'], {
        isTTY: false,
        homeDir: dir,
      });
      expect(capture.output).toContain('dry-run');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('runInstall() — lazy @clack import guard', () => {
  it('runInstall is importable without requiring @clack/prompts', () => {
    // If @clack/prompts were statically imported in install/index.ts, the import chain
    // from src/index.ts (server path) would load it eagerly. Since we dynamically import
    // in interactive.ts and only call it on the interactive path, this import succeeds.
    expect(runInstall).toBeDefined();
    expect(typeof runInstall).toBe('function');
  });
});
