import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readJsonConfig, mergeAtPath, writeJsonAtomic } from '../../../src/install/config-io.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'awi-config-io-test-'));
}

async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

describe('mergeAtPath', () => {
  it('inserts a new nested key without clobbering siblings', () => {
    const existing = {
      mcpServers: { other: { command: 'other-cmd', args: [] } },
      unrelated: 'keep-me',
    };
    const { merged, changed } = mergeAtPath(existing, ['mcpServers', 'drisp-browser'], {
      command: 'npx',
      args: ['-y', '@drisp/browser-mcp@latest'],
    });

    expect(changed).toBe(true);
    expect(merged.unrelated).toBe('keep-me');
    expect((merged.mcpServers as Record<string, unknown>).other).toEqual({
      command: 'other-cmd',
      args: [],
    });
    expect((merged.mcpServers as Record<string, unknown>)['drisp-browser']).toEqual({
      command: 'npx',
      args: ['-y', '@drisp/browser-mcp@latest'],
    });
  });

  it('returns changed=false when the value is already present and identical', () => {
    const existing = {
      mcpServers: {
        'drisp-browser': { command: 'npx', args: ['-y', '@drisp/browser-mcp@latest'] },
      },
    };
    const { changed } = mergeAtPath(existing, ['mcpServers', 'drisp-browser'], {
      command: 'npx',
      args: ['-y', '@drisp/browser-mcp@latest'],
    });
    expect(changed).toBe(false);
  });

  it('creates intermediate keys when they are missing', () => {
    const { merged, changed } = mergeAtPath({}, ['mcpServers', 'drisp-browser'], {
      command: 'npx',
      args: [],
    });
    expect(changed).toBe(true);
    expect((merged.mcpServers as Record<string, unknown>)['drisp-browser']).toEqual({
      command: 'npx',
      args: [],
    });
  });
});

describe('readJsonConfig', () => {
  it('returns {} when file does not exist', async () => {
    const result = await readJsonConfig('/nonexistent/path/file.json');
    expect(result).toEqual({});
  });

  it('returns parsed JSON when file exists', async () => {
    const dir = await makeTmpDir();
    try {
      const path = join(dir, 'config.json');
      await writeFile(path, JSON.stringify({ foo: 'bar' }));
      const result = await readJsonConfig(path);
      expect(result).toEqual({ foo: 'bar' });
    } finally {
      await cleanup(dir);
    }
  });
});

describe('writeJsonAtomic', () => {
  it('writes new file correctly', async () => {
    const dir = await makeTmpDir();
    try {
      const path = join(dir, 'config.json');
      const result = await writeJsonAtomic(path, { foo: 'bar' });
      expect(result.changed).toBe(true);
      expect(result.dryRun).toBe(false);
      const content = JSON.parse(await readFile(path, 'utf-8')) as unknown;
      expect(content).toEqual({ foo: 'bar' });
    } finally {
      await cleanup(dir);
    }
  });

  it('creates a .bak of any pre-existing file before overwriting', async () => {
    const dir = await makeTmpDir();
    try {
      const path = join(dir, 'config.json');
      await writeFile(path, JSON.stringify({ original: true }));

      await writeJsonAtomic(path, { updated: true });

      const bakContent = JSON.parse(await readFile(path + '.bak', 'utf-8')) as unknown;
      expect(bakContent).toEqual({ original: true });
    } finally {
      await cleanup(dir);
    }
  });

  it('does not rewrite or back up identical file content', async () => {
    const dir = await makeTmpDir();
    try {
      const path = join(dir, 'config.json');
      await writeFile(path, JSON.stringify({ foo: 'bar' }, null, 2) + '\n');

      const result = await writeJsonAtomic(path, { foo: 'bar' });

      expect(result.changed).toBe(false);
      await expect(stat(path + '.bak')).rejects.toThrow();
    } finally {
      await cleanup(dir);
    }
  });

  it('dry-run reports the change but writes nothing', async () => {
    const dir = await makeTmpDir();
    try {
      const path = join(dir, 'config.json');
      const result = await writeJsonAtomic(path, { foo: 'bar' }, { dryRun: true });

      expect(result.changed).toBe(true);
      expect(result.dryRun).toBe(true);

      // File must NOT have been created
      await expect(stat(path)).rejects.toThrow();
    } finally {
      await cleanup(dir);
    }
  });

  it('is idempotent: mergeAtPath returns changed=false on re-run', async () => {
    const dir = await makeTmpDir();
    try {
      const path = join(dir, '.mcp.json');
      const entry = { command: 'npx', args: ['-y', '@drisp/browser-mcp@latest'] };

      // First run
      const existing1 = await readJsonConfig(path);
      const { merged: merged1, changed: changed1 } = mergeAtPath(
        existing1,
        ['mcpServers', 'drisp-browser'],
        entry
      );
      expect(changed1).toBe(true);
      await writeJsonAtomic(path, merged1);

      // Second run
      const existing2 = await readJsonConfig(path);
      const { changed: changed2 } = mergeAtPath(existing2, ['mcpServers', 'drisp-browser'], entry);
      expect(changed2).toBe(false);
    } finally {
      await cleanup(dir);
    }
  });
});
