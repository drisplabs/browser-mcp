import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveSkill } from '../../../src/install/skill-source.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'awi-skill-source-test-'));
}

async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

const FAKE_SKILL = `---
name: drisp-browser
description: >
  Test description for the drisp-browser skill.
user-invocable: true
---

# Drisp Browser Guide

Body content here.
`;

async function makePackageLayout(root: string, subdir?: string): Promise<string> {
  const pkgRoot = subdir ? join(root, subdir) : root;
  await mkdir(join(pkgRoot, 'skills', 'drisp-browser'), { recursive: true });
  await writeFile(
    join(pkgRoot, 'package.json'),
    JSON.stringify({ name: '@drisp/browser-mcp', version: '0.0.0' })
  );
  await writeFile(join(pkgRoot, 'skills', 'drisp-browser', 'SKILL.md'), FAKE_SKILL);
  return pkgRoot;
}

describe('resolveSkill', () => {
  it('resolves from the package root when given a dir inside it', async () => {
    const dir = await makeTmpDir();
    try {
      const pkgRoot = await makePackageLayout(dir);
      const skill = await resolveSkill(pkgRoot);

      expect(skill.meta.name).toBe('drisp-browser');
      expect(skill.meta.description).toContain('Test description');
      expect(skill.rawContent).toContain('Body content here');
    } finally {
      await cleanup(dir);
    }
  });

  it('resolves from a subdirectory (walk-up layout)', async () => {
    const dir = await makeTmpDir();
    try {
      await makePackageLayout(dir);
      const subDir = join(dir, 'src', 'install', 'harness');
      await mkdir(subDir, { recursive: true });

      const skill = await resolveSkill(subDir);

      expect(skill.meta.name).toBe('drisp-browser');
    } finally {
      await cleanup(dir);
    }
  });

  it('parsed skill has no allowed-tools in meta', async () => {
    const dir = await makeTmpDir();
    try {
      await makePackageLayout(dir);
      const skill = await resolveSkill(dir);

      expect(skill.meta).not.toHaveProperty('allowedTools');
      expect(JSON.stringify(skill.meta)).not.toContain('allowed-tools');
    } finally {
      await cleanup(dir);
    }
  });

  it('rawContent contains name + description frontmatter', async () => {
    const dir = await makeTmpDir();
    try {
      await makePackageLayout(dir);
      const skill = await resolveSkill(dir);

      expect(skill.rawContent).toContain('name: drisp-browser');
      expect(skill.rawContent).toContain('description:');
    } finally {
      await cleanup(dir);
    }
  });

  it('throws when no package root is found', async () => {
    const dir = await makeTmpDir();
    try {
      // dir has no package.json with the right name
      await expect(resolveSkill(dir)).rejects.toThrow(/not found|could not find|unable to locate/i);
    } finally {
      await cleanup(dir);
    }
  });
});
