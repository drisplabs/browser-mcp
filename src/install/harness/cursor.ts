import { join } from 'node:path';
import { homedir } from 'node:os';
import type {
  HarnessAdapter,
  ApplyOpts,
  ApplyResult,
  StatusOpts,
  HarnessStatus,
  ServerCommand,
} from '../harness-adapter.js';
import { readJsonConfig, mergeAtPath, writeJsonAtomic, writeFileAtomic } from '../config-io.js';
import type { SkillContent } from '../skill-source.js';
import { resolveSkill } from '../skill-source.js';

export type SkillResolver = () => Promise<SkillContent>;

export interface CursorAdapterDeps {
  skillResolver?: SkillResolver;
}

const SERVER_NAME = 'agent-web-interface';

const SERVER_COMMAND: ServerCommand = {
  command: 'npx',
  args: ['-y', 'agent-web-interface@latest'],
};

function mcpJsonPath(scope: 'project' | 'user' | 'global', cwd: string, homeDir: string): string {
  if (scope === 'user' || scope === 'global') {
    return join(homeDir, '.cursor', 'mcp.json');
  }
  return join(cwd, '.cursor', 'mcp.json');
}

function buildMdcContent(meta: SkillContent['meta'], body: string): string {
  return `---\ndescription: ${meta.description}\nalwaysApply: false\n---\n${body}`;
}

export class CursorAdapter implements HarnessAdapter {
  readonly id = 'cursor';
  readonly label = 'Cursor';
  readonly supportsSkill = true;
  readonly scopes = ['project', 'user'] as const;
  readonly serverCommand = SERVER_COMMAND;

  private readonly resolveSkillFn: SkillResolver;

  constructor(deps?: CursorAdapterDeps) {
    this.resolveSkillFn = deps?.skillResolver ?? (() => resolveSkill());
  }

  async detect(): Promise<boolean> {
    try {
      const { access } = await import('node:fs/promises');
      await access(join(homedir(), '.cursor'));
      return true;
    } catch {
      return false;
    }
  }

  async apply(opts: ApplyOpts): Promise<ApplyResult> {
    const {
      scope,
      dryRun = false,
      cwd = process.cwd(),
      homeDir = homedir(),
      resolvedCommand = SERVER_COMMAND,
    } = opts;

    const configPath = mcpJsonPath(scope, cwd, homeDir);
    const existing = await readJsonConfig(configPath);
    const { merged, changed } = mergeAtPath(existing, ['mcpServers', SERVER_NAME], {
      command: resolvedCommand.command,
      args: resolvedCommand.args,
    });

    if (!changed) {
      return {
        changed: false,
        dryRun,
        message: 'Already configured in .cursor/mcp.json (no changes needed)',
      };
    }

    const writeResult = await writeJsonAtomic(configPath, merged, { dryRun });
    await this.placeSkill(cwd, dryRun);

    return {
      changed: writeResult.changed,
      dryRun: writeResult.dryRun,
      message: dryRun
        ? 'Would write .cursor/mcp.json (--dry-run)'
        : '✓ Registered in Cursor via .cursor/mcp.json',
    };
  }

  private async placeSkill(cwd: string, dryRun: boolean): Promise<void> {
    try {
      const skill = await this.resolveSkillFn();
      const rulePath = join(cwd, '.cursor', 'rules', `${SERVER_NAME}.mdc`);
      const content = buildMdcContent(skill.meta, skill.body);
      await writeFileAtomic(rulePath, content, { dryRun });
    } catch {
      // Skill placement is best-effort; never fails install
    }
  }

  async status(opts: StatusOpts): Promise<HarnessStatus> {
    const { scope, cwd = process.cwd(), homeDir = homedir() } = opts;
    const configPath = mcpJsonPath(scope, cwd, homeDir);
    const existing = await readJsonConfig(configPath);
    const mcpServers = existing.mcpServers as Record<string, unknown> | undefined;
    const configured = mcpServers?.[SERVER_NAME] != null;
    return {
      configured,
      message: configured ? 'Configured in .cursor/mcp.json' : 'Not configured in .cursor/mcp.json',
    };
  }
}
