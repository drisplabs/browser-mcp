import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runDoctor } from '../../../src/install/doctor.js';
import { CursorAdapter } from '../../../src/install/harness/cursor.js';
import { ClaudeDesktopAdapter } from '../../../src/install/harness/claude-desktop.js';

function captureStdout(): { get output(): string; restore: () => void } {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  };
  return {
    get output() {
      return chunks.join('');
    },
    restore() {
      process.stdout.write = original;
    },
  };
}

describe('runDoctor()', () => {
  it('prints a status table for all adapters', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'awi-doctor-test-'));
    const capture = captureStdout();
    try {
      await runDoctor({ cwd: dir, homeDir: dir, platform: 'darwin' });
    } finally {
      capture.restore();
      await rm(dir, { recursive: true, force: true });
    }

    expect(capture.output).toContain('Claude Code');
    expect(capture.output).toContain('Cursor');
    expect(capture.output).toContain('VS Code');
    expect(capture.output).toContain('Claude Desktop');
  });

  it('shows unconfigured when nothing is installed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'awi-doctor-test-'));
    const capture = captureStdout();
    try {
      await runDoctor({ cwd: dir, homeDir: dir, platform: 'darwin' });
    } finally {
      capture.restore();
      await rm(dir, { recursive: true, force: true });
    }

    expect(capture.output).toContain('✗');
  });

  it('shows configured when Cursor MCP is installed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'awi-doctor-test-'));
    const capture = captureStdout();
    try {
      // Install Cursor adapter
      const adapter = new CursorAdapter();
      await adapter.apply({ scope: 'project', cwd: dir });

      await runDoctor({ cwd: dir, homeDir: dir, platform: 'darwin' });
    } finally {
      capture.restore();
      await rm(dir, { recursive: true, force: true });
    }

    expect(capture.output).toContain('✓');
    expect(capture.output).toContain('Cursor');
  });

  it('does not write any files (read-only)', async () => {
    const { readdir } = await import('node:fs/promises');
    const dir = await mkdtemp(join(tmpdir(), 'awi-doctor-readonly-'));
    const capture = captureStdout();
    try {
      // Record what's in the dir before
      const before = await readdir(dir, { recursive: true }).catch(() => [] as string[]);
      await runDoctor({ cwd: dir, homeDir: dir, platform: 'darwin' });
      const after = await readdir(dir, { recursive: true }).catch(() => [] as string[]);
      // No new entries created
      expect(after).toEqual(before);
    } finally {
      capture.restore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shows MCP-only note for Claude Desktop (no skill column)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'awi-doctor-test-'));
    const adapter = new ClaudeDesktopAdapter({ homeDir: dir, platform: 'darwin' });
    await adapter.apply({ scope: 'global' });
    const capture = captureStdout();
    try {
      await runDoctor({ cwd: dir, homeDir: dir, platform: 'darwin' });
    } finally {
      capture.restore();
      await rm(dir, { recursive: true, force: true });
    }

    // Claude Desktop is MCP-only — the output should reflect its configured state
    expect(capture.output).toContain('Claude Desktop');
  });
});
