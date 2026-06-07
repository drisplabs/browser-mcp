import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VSCodeAdapter, type SkillResolver } from '../../../../src/install/harness/vscode.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'awi-vscode-adapter-test-'));
}

async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

const FAKE_SKILL_BODY = '# Agent Web Interface Guide\n\nFake skill body content.\n';

const FAKE_SKILL_META = {
  name: 'agent-web-interface',
  description: 'Drive a real browser against a live or staging website.',
};

function makeSkillResolver(): SkillResolver {
  return () =>
    Promise.resolve({
      meta: FAKE_SKILL_META,
      rawContent: `---\nname: agent-web-interface\ndescription: ${FAKE_SKILL_META.description}\n---\n${FAKE_SKILL_BODY}`,
      body: FAKE_SKILL_BODY,
    });
}

describe('VSCodeAdapter.apply() — MCP registration', () => {
  it('writes .vscode/mcp.json using the servers key (not mcpServers)', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new VSCodeAdapter({ skillResolver: makeSkillResolver() });
      const result = await adapter.apply({ scope: 'project', cwd: dir });

      expect(result.changed).toBe(true);

      const raw = JSON.parse(await readFile(join(dir, '.vscode', 'mcp.json'), 'utf-8')) as Record<
        string,
        unknown
      >;
      expect(raw.mcpServers).toBeUndefined();
      expect(raw.servers).toBeDefined();
    } finally {
      await cleanup(dir);
    }
  });

  it('server entry has type: "stdio"', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new VSCodeAdapter({ skillResolver: makeSkillResolver() });
      await adapter.apply({ scope: 'project', cwd: dir });

      const raw = JSON.parse(await readFile(join(dir, '.vscode', 'mcp.json'), 'utf-8')) as {
        servers: Record<string, { type: string; command: string; args: string[] }>;
      };
      const entry = raw.servers['agent-web-interface'];
      expect(entry).toBeDefined();
      expect(entry.type).toBe('stdio');
      expect(entry.command).toBe('npx');
      expect(entry.args).toEqual(['-y', 'agent-web-interface@latest']);
    } finally {
      await cleanup(dir);
    }
  });

  it('preserves unrelated servers entries', async () => {
    const dir = await makeTmpDir();
    try {
      await mkdir(join(dir, '.vscode'), { recursive: true });
      await writeFile(
        join(dir, '.vscode', 'mcp.json'),
        JSON.stringify({
          servers: {
            'other-server': { type: 'stdio', command: 'node', args: ['other.js'] },
          },
        })
      );

      const adapter = new VSCodeAdapter({ skillResolver: makeSkillResolver() });
      await adapter.apply({ scope: 'project', cwd: dir });

      const raw = JSON.parse(await readFile(join(dir, '.vscode', 'mcp.json'), 'utf-8')) as {
        servers: Record<string, unknown>;
      };
      expect(raw.servers['other-server']).toEqual({
        type: 'stdio',
        command: 'node',
        args: ['other.js'],
      });
      expect(raw.servers['agent-web-interface']).toBeDefined();
    } finally {
      await cleanup(dir);
    }
  });

  it('is idempotent — returns changed=false on second apply', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new VSCodeAdapter({ skillResolver: makeSkillResolver() });
      await adapter.apply({ scope: 'project', cwd: dir });
      const result2 = await adapter.apply({ scope: 'project', cwd: dir });
      expect(result2.changed).toBe(false);
    } finally {
      await cleanup(dir);
    }
  });

  it('dry-run returns changed=true without writing files', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new VSCodeAdapter({ skillResolver: makeSkillResolver() });
      const result = await adapter.apply({ scope: 'project', cwd: dir, dryRun: true });

      expect(result.changed).toBe(true);
      expect(result.dryRun).toBe(true);

      const { access } = await import('node:fs/promises');
      await expect(access(join(dir, '.vscode', 'mcp.json'))).rejects.toThrow();
    } finally {
      await cleanup(dir);
    }
  });
});

describe('VSCodeAdapter.apply() — skill placement', () => {
  it('writes .github/instructions/agent-web-interface.instructions.md', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new VSCodeAdapter({ skillResolver: makeSkillResolver() });
      await adapter.apply({ scope: 'project', cwd: dir });

      const instrContent = await readFile(
        join(dir, '.github', 'instructions', 'agent-web-interface.instructions.md'),
        'utf-8'
      );
      expect(instrContent).toContain('applyTo:');
      expect(instrContent).toContain('"**"');
      expect(instrContent).toContain(FAKE_SKILL_BODY);
    } finally {
      await cleanup(dir);
    }
  });

  it('instructions file does NOT clobber .github/copilot-instructions.md', async () => {
    const dir = await makeTmpDir();
    try {
      await mkdir(join(dir, '.github'), { recursive: true });
      const copilotContent = '# My existing copilot instructions\n\nDo not overwrite me.\n';
      await writeFile(join(dir, '.github', 'copilot-instructions.md'), copilotContent);

      const adapter = new VSCodeAdapter({ skillResolver: makeSkillResolver() });
      await adapter.apply({ scope: 'project', cwd: dir });

      // copilot-instructions.md should be unchanged
      const after = await readFile(join(dir, '.github', 'copilot-instructions.md'), 'utf-8');
      expect(after).toBe(copilotContent);
    } finally {
      await cleanup(dir);
    }
  });

  it('instructions frontmatter has exactly 2 --- delimiters', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new VSCodeAdapter({ skillResolver: makeSkillResolver() });
      await adapter.apply({ scope: 'project', cwd: dir });

      const instrContent = await readFile(
        join(dir, '.github', 'instructions', 'agent-web-interface.instructions.md'),
        'utf-8'
      );
      const frontmatterMatches = instrContent.match(/^---$/gm);
      expect(frontmatterMatches).toHaveLength(2);
    } finally {
      await cleanup(dir);
    }
  });

  it('skill placement failure does not prevent MCP registration', async () => {
    const dir = await makeTmpDir();
    try {
      const failingResolver: SkillResolver = () => Promise.reject(new Error('skill not found'));
      const adapter = new VSCodeAdapter({ skillResolver: failingResolver });
      const result = await adapter.apply({ scope: 'project', cwd: dir });

      expect(result.changed).toBe(true);
    } finally {
      await cleanup(dir);
    }
  });
});

describe('VSCodeAdapter.status()', () => {
  it('returns configured=false when .vscode/mcp.json does not exist', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new VSCodeAdapter({ skillResolver: makeSkillResolver() });
      const status = await adapter.status({ scope: 'project', cwd: dir });
      expect(status.configured).toBe(false);
    } finally {
      await cleanup(dir);
    }
  });

  it('returns configured=true when agent-web-interface is in .vscode/mcp.json', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new VSCodeAdapter({ skillResolver: makeSkillResolver() });
      await adapter.apply({ scope: 'project', cwd: dir });
      const status = await adapter.status({ scope: 'project', cwd: dir });
      expect(status.configured).toBe(true);
    } finally {
      await cleanup(dir);
    }
  });
});

describe('VSCodeAdapter metadata', () => {
  it('has correct id and label', () => {
    const adapter = new VSCodeAdapter({ skillResolver: makeSkillResolver() });
    expect(adapter.id).toBe('vscode');
    expect(adapter.label).toBe('VS Code');
  });

  it('supportsSkill is true', () => {
    const adapter = new VSCodeAdapter({ skillResolver: makeSkillResolver() });
    expect(adapter.supportsSkill).toBe(true);
  });

  it('scopes includes project', () => {
    const adapter = new VSCodeAdapter({ skillResolver: makeSkillResolver() });
    expect(adapter.scopes).toContain('project');
  });
});
