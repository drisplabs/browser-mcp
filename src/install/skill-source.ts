import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface SkillMeta {
  name: string;
  description: string;
}

export interface SkillContent {
  meta: SkillMeta;
  rawContent: string;
  body: string;
}

const PACKAGE_NAME = '@drisp/browser-mcp';
const SKILL_DIR = 'drisp-browser';
const SKILL_REL_PATH = `skills/${SKILL_DIR}/SKILL.md`;

async function isPackageRoot(dir: string): Promise<boolean> {
  try {
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf-8')) as {
      name?: string;
    };
    return pkg.name === PACKAGE_NAME;
  } catch {
    return false;
  }
}

async function findPackageRoot(startDir: string): Promise<string> {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (await isPackageRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not find ${PACKAGE_NAME} package root from "${startDir}". ` +
      `Is the package installed correctly?`
  );
}

function stripFrontmatter(content: string): string {
  const match = /^---\n[\s\S]*?---\n/.exec(content);
  return match ? content.slice(match[0].length) : content;
}

function parseFrontmatter(content: string): SkillMeta {
  const match = /^---\n([\s\S]*?)---\n/.exec(content);
  if (!match) return { name: '', description: '' };

  const frontmatter = match[1];

  const nameMatch = /^name:\s*(.+)$/m.exec(frontmatter);
  const name = nameMatch?.[1]?.trim() ?? '';

  // Handle block scalar (description: >\n  ...)
  const descBlockMatch = /^description:\s*>\s*\n((?:[ \t]+.+\n?)+)/m.exec(frontmatter);
  if (descBlockMatch) {
    const description = descBlockMatch[1]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' ');
    return { name, description };
  }

  const descInlineMatch = /^description:\s*(.+)$/m.exec(frontmatter);
  const description = descInlineMatch?.[1]?.trim() ?? '';

  return { name, description };
}

export async function resolveSkill(fromDir?: string): Promise<SkillContent> {
  const startDir = fromDir ?? dirname(new URL(import.meta.url).pathname);
  const pkgRoot = await findPackageRoot(startDir);
  const skillPath = join(pkgRoot, SKILL_REL_PATH);
  const rawContent = await readFile(skillPath, 'utf-8');
  const meta = parseFrontmatter(rawContent);
  const body = stripFrontmatter(rawContent);
  return { meta, rawContent, body };
}
