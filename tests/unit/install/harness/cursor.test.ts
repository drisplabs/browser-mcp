import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CursorAdapter, type SkillResolver } from '../../../../src/install/harness/cursor.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'awi-cursor-adapter-test-'));
}

async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

const FAKE_SKILL_BODY = '# Drisp Browser Guide\n\nFake skill body content.\n';

const FAKE_SKILL_META = {
  name: 'drisp-browser',
  description: 'Drive a real browser against a live or staging website.',
};

function makeSkillResolver(): SkillResolver {
  return () =>
    Promise.resolve({
      meta: FAKE_SKILL_META,
      rawContent: `---\nname: drisp-browser\ndescription: Drive a real browser against a live or staging website.\n---\n${FAKE_SKILL_BODY}`,
      body: FAKE_SKILL_BODY,
    });
}

describe('CursorAdapter.apply() — project scope', () => {
  it('writes .cursor/mcp.json with mcpServers entry', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new CursorAdapter({ skillResolver: makeSkillResolver() });
      const result = await adapter.apply({ scope: 'project', cwd: dir });

      expect(result.changed).toBe(true);
      expect(result.dryRun).toBe(false);

      const mcpJson = JSON.parse(await readFile(join(dir, '.cursor', 'mcp.json'), 'utf-8')) as {
        mcpServers: Record<string, { command: string; args: string[] }>;
      };
      expect(mcpJson.mcpServers['drisp-browser']).toEqual({
        command: 'npx',
        args: ['-y', '@drisp/browser-mcp@latest'],
      });
    } finally {
      await cleanup(dir);
    }
  });

  it('preserves unrelated mcpServers entries in .cursor/mcp.json', async () => {
    const dir = await makeTmpDir();
    try {
      // Pre-seed the config
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(join(dir, '.cursor'), { recursive: true });
      await writeFile(
        join(dir, '.cursor', 'mcp.json'),
        JSON.stringify({
          mcpServers: {
            'other-server': { command: 'node', args: ['other.js'] },
          },
        })
      );

      const adapter = new CursorAdapter({ skillResolver: makeSkillResolver() });
      await adapter.apply({ scope: 'project', cwd: dir });

      const mcpJson = JSON.parse(await readFile(join(dir, '.cursor', 'mcp.json'), 'utf-8')) as {
        mcpServers: Record<string, unknown>;
      };
      expect(mcpJson.mcpServers['other-server']).toEqual({ command: 'node', args: ['other.js'] });
      expect(mcpJson.mcpServers['drisp-browser']).toBeDefined();
    } finally {
      await cleanup(dir);
    }
  });

  it('is idempotent — returns changed=false on second apply', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new CursorAdapter({ skillResolver: makeSkillResolver() });
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
      const adapter = new CursorAdapter({ skillResolver: makeSkillResolver() });
      const result = await adapter.apply({ scope: 'project', cwd: dir, dryRun: true });

      expect(result.changed).toBe(true);
      expect(result.dryRun).toBe(true);

      // File should NOT have been written
      const { access } = await import('node:fs/promises');
      await expect(access(join(dir, '.cursor', 'mcp.json'))).rejects.toThrow();
    } finally {
      await cleanup(dir);
    }
  });
});

describe('CursorAdapter.apply() — skill placement', () => {
  it('writes .cursor/rules/drisp-browser.mdc with correct frontmatter + body', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new CursorAdapter({ skillResolver: makeSkillResolver() });
      await adapter.apply({ scope: 'project', cwd: dir });

      const mdcContent = await readFile(
        join(dir, '.cursor', 'rules', 'drisp-browser.mdc'),
        'utf-8'
      );
      expect(mdcContent).toContain('---');
      expect(mdcContent).toContain('description:');
      expect(mdcContent).toContain(FAKE_SKILL_META.description);
      expect(mdcContent).toContain('alwaysApply: false');
      expect(mdcContent).toContain(FAKE_SKILL_BODY);
    } finally {
      await cleanup(dir);
    }
  });

  it('mdc frontmatter does NOT contain nested YAML from rawContent', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new CursorAdapter({ skillResolver: makeSkillResolver() });
      await adapter.apply({ scope: 'project', cwd: dir });

      const mdcContent = await readFile(
        join(dir, '.cursor', 'rules', 'drisp-browser.mdc'),
        'utf-8'
      );
      // The only frontmatter block should be the wrapper, not the skill's own frontmatter
      const frontmatterMatches = mdcContent.match(/^---$/gm);
      expect(frontmatterMatches).toHaveLength(2); // opening and closing ---
    } finally {
      await cleanup(dir);
    }
  });

  it('skill placement failure does not prevent MCP registration', async () => {
    const dir = await makeTmpDir();
    try {
      const failingResolver: SkillResolver = () => Promise.reject(new Error('skill not found'));
      const adapter = new CursorAdapter({ skillResolver: failingResolver });
      const result = await adapter.apply({ scope: 'project', cwd: dir });

      // MCP registration should still succeed
      expect(result.changed).toBe(true);
    } finally {
      await cleanup(dir);
    }
  });
});

describe('CursorAdapter.apply() — user scope', () => {
  it('writes to homeDir/.cursor/mcp.json for user scope', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new CursorAdapter({ skillResolver: makeSkillResolver() });
      const result = await adapter.apply({ scope: 'user', homeDir: dir, cwd: dir });

      expect(result.changed).toBe(true);

      const mcpJson = JSON.parse(await readFile(join(dir, '.cursor', 'mcp.json'), 'utf-8')) as {
        mcpServers: Record<string, unknown>;
      };
      expect(mcpJson.mcpServers['drisp-browser']).toBeDefined();
    } finally {
      await cleanup(dir);
    }
  });
});

describe('CursorAdapter.status()', () => {
  it('returns configured=false when .cursor/mcp.json does not exist', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new CursorAdapter({ skillResolver: makeSkillResolver() });
      const status = await adapter.status({ scope: 'project', cwd: dir });
      expect(status.configured).toBe(false);
    } finally {
      await cleanup(dir);
    }
  });

  it('returns configured=true when drisp-browser is in .cursor/mcp.json', async () => {
    const dir = await makeTmpDir();
    try {
      const adapter = new CursorAdapter({ skillResolver: makeSkillResolver() });
      await adapter.apply({ scope: 'project', cwd: dir });
      const status = await adapter.status({ scope: 'project', cwd: dir });
      expect(status.configured).toBe(true);
    } finally {
      await cleanup(dir);
    }
  });
});

describe('CursorAdapter metadata', () => {
  it('has correct id and label', () => {
    const adapter = new CursorAdapter({ skillResolver: makeSkillResolver() });
    expect(adapter.id).toBe('cursor');
    expect(adapter.label).toBe('Cursor');
  });

  it('supportsSkill is true', () => {
    const adapter = new CursorAdapter({ skillResolver: makeSkillResolver() });
    expect(adapter.supportsSkill).toBe(true);
  });

  it('scopes includes project and user', () => {
    const adapter = new CursorAdapter({ skillResolver: makeSkillResolver() });
    expect(adapter.scopes).toContain('project');
    expect(adapter.scopes).toContain('user');
  });
});
