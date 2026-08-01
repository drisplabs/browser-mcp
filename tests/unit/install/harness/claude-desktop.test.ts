import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ClaudeDesktopAdapter,
  getDesktopConfigPath,
} from '../../../../src/install/harness/claude-desktop.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'awi-claude-desktop-test-'));
}

async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

describe('getDesktopConfigPath()', () => {
  it('returns macOS path when platform is darwin', () => {
    const base = '/Users/test';
    const path = getDesktopConfigPath('darwin', base);
    expect(path).toBe(
      join(base, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    );
  });

  it('returns Windows path when platform is win32', () => {
    const base = 'C:\\Users\\test\\AppData\\Roaming';
    const path = getDesktopConfigPath('win32', base);
    expect(path).toBe(join(base, 'Claude', 'claude_desktop_config.json'));
  });

  it('returns Linux path when platform is linux', () => {
    const base = '/home/test';
    const path = getDesktopConfigPath('linux', base);
    expect(path).toBe(join(base, '.config', 'Claude', 'claude_desktop_config.json'));
  });
});

describe('ClaudeDesktopAdapter.apply()', () => {
  it('writes claude_desktop_config.json with mcpServers entry', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new ClaudeDesktopAdapter({ homeDir: dir, platform: 'darwin' });
      const result = await adapter.apply({ scope: 'global' });

      expect(result.changed).toBe(true);

      const configPath = join(
        dir,
        'Library',
        'Application Support',
        'Claude',
        'claude_desktop_config.json'
      );
      const config = JSON.parse(await readFile(configPath, 'utf-8')) as {
        mcpServers: Record<string, { command: string; args: string[] }>;
      };
      expect(config.mcpServers['drisp-browser']).toEqual({
        command: 'npx',
        args: ['-y', '@drisp/browser-mcp@latest'],
      });
    } finally {
      await cleanup(dir);
    }
  });

  it('preserves unrelated mcpServers entries', async () => {
    const dir = await makeTmpDir();
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const configDir = join(dir, 'Library', 'Application Support', 'Claude');
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, 'claude_desktop_config.json'),
        JSON.stringify({
          mcpServers: {
            'other-server': { command: 'node', args: ['other.js'] },
          },
        })
      );

      const adapter = new ClaudeDesktopAdapter({ homeDir: dir, platform: 'darwin' });
      await adapter.apply({ scope: 'global' });

      const config = JSON.parse(
        await readFile(join(configDir, 'claude_desktop_config.json'), 'utf-8')
      ) as { mcpServers: Record<string, unknown> };
      expect(config.mcpServers['other-server']).toEqual({
        command: 'node',
        args: ['other.js'],
      });
      expect(config.mcpServers['drisp-browser']).toBeDefined();
    } finally {
      await cleanup(dir);
    }
  });

  it('is idempotent — returns changed=false on second apply', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new ClaudeDesktopAdapter({ homeDir: dir, platform: 'darwin' });
      await adapter.apply({ scope: 'global' });
      const result2 = await adapter.apply({ scope: 'global' });
      expect(result2.changed).toBe(false);
    } finally {
      await cleanup(dir);
    }
  });

  it('dry-run returns changed=true without writing files', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new ClaudeDesktopAdapter({ homeDir: dir, platform: 'darwin' });
      const result = await adapter.apply({ scope: 'global', dryRun: true });

      expect(result.changed).toBe(true);
      expect(result.dryRun).toBe(true);

      const { access } = await import('node:fs/promises');
      await expect(
        access(join(dir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'))
      ).rejects.toThrow();
    } finally {
      await cleanup(dir);
    }
  });

  it('uses correct Linux path', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new ClaudeDesktopAdapter({ homeDir: dir, platform: 'linux' });
      const result = await adapter.apply({ scope: 'global' });

      expect(result.changed).toBe(true);

      const configPath = join(dir, '.config', 'Claude', 'claude_desktop_config.json');
      const config = JSON.parse(await readFile(configPath, 'utf-8')) as {
        mcpServers: Record<string, unknown>;
      };
      expect(config.mcpServers['drisp-browser']).toBeDefined();
    } finally {
      await cleanup(dir);
    }
  });
});

describe('ClaudeDesktopAdapter.status()', () => {
  it('returns configured=false when config does not exist', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new ClaudeDesktopAdapter({ homeDir: dir, platform: 'darwin' });
      const status = await adapter.status({ scope: 'global' });
      expect(status.configured).toBe(false);
    } finally {
      await cleanup(dir);
    }
  });

  it('returns configured=true after apply', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new ClaudeDesktopAdapter({ homeDir: dir, platform: 'darwin' });
      await adapter.apply({ scope: 'global' });
      const status = await adapter.status({ scope: 'global' });
      expect(status.configured).toBe(true);
    } finally {
      await cleanup(dir);
    }
  });
});

describe('ClaudeDesktopAdapter metadata', () => {
  it('has correct id and label', () => {
    const adapter = new ClaudeDesktopAdapter({ platform: 'darwin' });
    expect(adapter.id).toBe('claude-desktop');
    expect(adapter.label).toBe('Claude Desktop');
  });

  it('supportsSkill is false', () => {
    const adapter = new ClaudeDesktopAdapter({ platform: 'darwin' });
    expect(adapter.supportsSkill).toBe(false);
  });

  it('scopes is global only', () => {
    const adapter = new ClaudeDesktopAdapter({ platform: 'darwin' });
    expect(adapter.scopes).toEqual(['global']);
  });
});
