import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ClaudeCodeAdapter,
  type CommandRunner,
  type SkillResolver,
} from '../../../../src/install/harness/claude-code.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'awi-cc-adapter-test-'));
}

async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

describe('ClaudeCodeAdapter.apply()', () => {
  it('invokes claude mcp add with the correct argv', async () => {
    const calls: [string, string[]][] = [];
    const runner: CommandRunner = (cmd, args) => {
      calls.push([cmd, args]);
      return Promise.resolve(0);
    };
    const adapter = new ClaudeCodeAdapter({ runner });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const result = await adapter.apply({ scope: 'project' });

    expect(calls).toHaveLength(1);
    const [cmd, args] = calls[0];
    expect(cmd).toBe('claude');
    expect(args).toEqual([
      'mcp',
      'add',
      '-s',
      'project',
      'agent-web-interface',
      '--',
      'npx',
      '-y',
      'agent-web-interface@latest',
    ]);
    expect(result.changed).toBe(true);
    stderrSpy.mockRestore();
  });

  it('falls back to .mcp.json when claude CLI returns non-zero exit code', async () => {
    const dir = await makeTmpDir();
    try {
      const runner: CommandRunner = () => Promise.resolve(1);
      const adapter = new ClaudeCodeAdapter({ runner });

      const result = await adapter.apply({ scope: 'project', cwd: dir });

      expect(result.changed).toBe(true);
      const mcpJson = JSON.parse(await readFile(join(dir, '.mcp.json'), 'utf-8')) as {
        mcpServers: Record<string, { command: string; args: string[] }>;
      };
      expect(mcpJson.mcpServers['agent-web-interface']).toEqual({
        command: 'npx',
        args: ['-y', 'agent-web-interface@latest'],
      });
    } finally {
      await cleanup(dir);
    }
  });

  it('falls back to .mcp.json when claude CLI is not found (ENOENT)', async () => {
    const dir = await makeTmpDir();
    try {
      const runner: CommandRunner = () => {
        const err = new Error('spawn claude ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        return Promise.reject(err);
      };
      const adapter = new ClaudeCodeAdapter({ runner });

      const result = await adapter.apply({ scope: 'project', cwd: dir });

      expect(result.changed).toBe(true);
      expect(result.dryRun).toBe(false);

      const mcpJson = JSON.parse(await readFile(join(dir, '.mcp.json'), 'utf-8')) as {
        mcpServers: Record<string, { command: string; args: string[] }>;
      };
      expect(mcpJson.mcpServers['agent-web-interface']).toEqual({
        command: 'npx',
        args: ['-y', 'agent-web-interface@latest'],
      });
    } finally {
      await cleanup(dir);
    }
  });

  it('fallback preserves unrelated keys in .mcp.json', async () => {
    const dir = await makeTmpDir();
    try {
      const runner: CommandRunner = () => {
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        return Promise.reject(err);
      };
      const adapter = new ClaudeCodeAdapter({ runner });

      // Pre-populate with another server
      const existing = { mcpServers: { other: { command: 'other', args: [] } } };
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(dir, '.mcp.json'), JSON.stringify(existing));

      await adapter.apply({ scope: 'project', cwd: dir });

      const mcpJson = JSON.parse(await readFile(join(dir, '.mcp.json'), 'utf-8')) as {
        mcpServers: Record<string, unknown>;
      };
      expect(mcpJson.mcpServers.other).toEqual({ command: 'other', args: [] });
      expect(mcpJson.mcpServers['agent-web-interface']).toBeTruthy();
    } finally {
      await cleanup(dir);
    }
  });

  it('fallback is idempotent: second apply returns changed=false', async () => {
    const dir = await makeTmpDir();
    try {
      const runner: CommandRunner = () => {
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        return Promise.reject(err);
      };
      const adapter = new ClaudeCodeAdapter({ runner });

      await adapter.apply({ scope: 'project', cwd: dir });
      const second = await adapter.apply({ scope: 'project', cwd: dir });

      expect(second.changed).toBe(false);
    } finally {
      await cleanup(dir);
    }
  });

  it('dry-run does not invoke claude mcp add', async () => {
    const calls: [string, string[]][] = [];
    const runner: CommandRunner = (cmd, args) => {
      calls.push([cmd, args]);
      return Promise.resolve(0);
    };
    const adapter = new ClaudeCodeAdapter({ runner });

    await adapter.apply({ scope: 'project', dryRun: true });

    expect(calls).toHaveLength(0);
  });

  it('fallback respects --dry-run: writes nothing', async () => {
    const dir = await makeTmpDir();
    try {
      const runner: CommandRunner = () => {
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        return Promise.reject(err);
      };
      const adapter = new ClaudeCodeAdapter({ runner });

      const result = await adapter.apply({ scope: 'project', cwd: dir, dryRun: true });

      expect(result.dryRun).toBe(true);
      const { stat } = await import('node:fs/promises');
      await expect(stat(join(dir, '.mcp.json'))).rejects.toThrow();
    } finally {
      await cleanup(dir);
    }
  });

  it('does not write to stdout', async () => {
    const runner: CommandRunner = () => Promise.resolve(0);
    const adapter = new ClaudeCodeAdapter({ runner });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await adapter.apply({ scope: 'project' });

    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});

describe('ClaudeCodeAdapter skill placement', () => {
  const FAKE_SKILL = `---\nname: agent-web-interface\ndescription: Test skill\n---\n\nBody here.\n`;
  const skillResolver: SkillResolver = () => Promise.resolve({ rawContent: FAKE_SKILL });

  it('places SKILL.md at .claude/skills/agent-web-interface/SKILL.md on claude mcp add success', async () => {
    const dir = await makeTmpDir();
    try {
      const runner: CommandRunner = () => Promise.resolve(0);
      const adapter = new ClaudeCodeAdapter({ runner, skillResolver });

      await adapter.apply({ scope: 'project', cwd: dir });

      const content = await readFile(
        join(dir, '.claude', 'skills', 'agent-web-interface', 'SKILL.md'),
        'utf-8'
      );
      expect(content).toBe(FAKE_SKILL);
    } finally {
      await cleanup(dir);
    }
  });

  it('places SKILL.md even when .mcp.json is already configured (repair path)', async () => {
    const dir = await makeTmpDir();
    try {
      const runner: CommandRunner = () => {
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        return Promise.reject(err);
      };
      const adapter = new ClaudeCodeAdapter({ runner, skillResolver });

      // First apply writes .mcp.json + skill
      await adapter.apply({ scope: 'project', cwd: dir });
      // Delete skill to simulate partial prior install
      const { rm } = await import('node:fs/promises');
      await rm(join(dir, '.claude', 'skills', 'agent-web-interface', 'SKILL.md'));

      // Second apply: .mcp.json unchanged (changed=false) but skill should be re-placed
      const second = await adapter.apply({ scope: 'project', cwd: dir });
      expect(second.changed).toBe(false);

      const content = await readFile(
        join(dir, '.claude', 'skills', 'agent-web-interface', 'SKILL.md'),
        'utf-8'
      );
      expect(content).toBe(FAKE_SKILL);
    } finally {
      await cleanup(dir);
    }
  });

  it('places SKILL.md on .mcp.json fallback path', async () => {
    const dir = await makeTmpDir();
    try {
      const runner: CommandRunner = () => {
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        return Promise.reject(err);
      };
      const adapter = new ClaudeCodeAdapter({ runner, skillResolver });

      await adapter.apply({ scope: 'project', cwd: dir });

      const content = await readFile(
        join(dir, '.claude', 'skills', 'agent-web-interface', 'SKILL.md'),
        'utf-8'
      );
      expect(content).toContain('name: agent-web-interface');
    } finally {
      await cleanup(dir);
    }
  });

  it('does not place skill on dry-run', async () => {
    const dir = await makeTmpDir();
    try {
      const runner: CommandRunner = () => {
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        return Promise.reject(err);
      };
      const adapter = new ClaudeCodeAdapter({ runner, skillResolver });

      await adapter.apply({ scope: 'project', cwd: dir, dryRun: true });

      const { stat } = await import('node:fs/promises');
      await expect(
        stat(join(dir, '.claude', 'skills', 'agent-web-interface', 'SKILL.md'))
      ).rejects.toThrow();
    } finally {
      await cleanup(dir);
    }
  });
});

describe('ClaudeCodeAdapter meta', () => {
  it('has correct id and label', () => {
    const adapter = new ClaudeCodeAdapter();
    expect(adapter.id).toBe('claude-code');
    expect(adapter.label).toBe('Claude Code');
    expect(adapter.supportsSkill).toBe(true);
    expect(adapter.scopes).toContain('project');
  });

  it('carries the resolved server command', () => {
    const adapter = new ClaudeCodeAdapter();
    expect(adapter.serverCommand.command).toBe('npx');
    expect(adapter.serverCommand.args).toContain('agent-web-interface@latest');
  });
});
