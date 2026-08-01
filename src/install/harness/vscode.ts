import { join } from 'node:path';
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

export interface VSCodeAdapterDeps {
  skillResolver?: SkillResolver;
}

const SERVER_NAME = 'drisp-browser';

// VS Code uses `servers` key + `type: "stdio"` (not `mcpServers`)
const SERVER_COMMAND: ServerCommand = {
  command: 'npx',
  args: ['-y', '@drisp/browser-mcp@latest'],
};

function buildInstructionsContent(body: string): string {
  return `---\napplyTo: "**"\n---\n${body}`;
}

export class VSCodeAdapter implements HarnessAdapter {
  readonly id = 'vscode';
  readonly label = 'VS Code';
  readonly supportsSkill = true;
  readonly scopes = ['project'] as const;
  readonly serverCommand = SERVER_COMMAND;

  private readonly resolveSkillFn: SkillResolver;

  constructor(deps?: VSCodeAdapterDeps) {
    this.resolveSkillFn = deps?.skillResolver ?? (() => resolveSkill());
  }

  async detect(): Promise<boolean> {
    try {
      const { access } = await import('node:fs/promises');
      await access(join(process.cwd(), '.vscode'));
      return true;
    } catch {
      return false;
    }
  }

  async apply(opts: ApplyOpts): Promise<ApplyResult> {
    const { dryRun = false, cwd = process.cwd(), resolvedCommand = SERVER_COMMAND } = opts;

    const serverEntry = {
      type: 'stdio',
      command: resolvedCommand.command,
      args: resolvedCommand.args,
    };

    const configPath = join(cwd, '.vscode', 'mcp.json');
    const existing = await readJsonConfig(configPath);
    const { merged, changed } = mergeAtPath(existing, ['servers', SERVER_NAME], serverEntry);

    if (!changed) {
      return {
        changed: false,
        dryRun,
        message: 'Already configured in .vscode/mcp.json (no changes needed)',
      };
    }

    const writeResult = await writeJsonAtomic(configPath, merged, { dryRun });
    await this.placeSkill(cwd, dryRun);

    return {
      changed: writeResult.changed,
      dryRun: writeResult.dryRun,
      message: dryRun
        ? 'Would write .vscode/mcp.json (--dry-run)'
        : '✓ Registered in VS Code via .vscode/mcp.json',
    };
  }

  private async placeSkill(cwd: string, dryRun: boolean): Promise<void> {
    try {
      const skill = await this.resolveSkillFn();
      const instrPath = join(cwd, '.github', 'instructions', `${SERVER_NAME}.instructions.md`);
      const content = buildInstructionsContent(skill.body);
      await writeFileAtomic(instrPath, content, { dryRun });
    } catch {
      // Skill placement is best-effort; never fails install
    }
  }

  async status(opts: StatusOpts): Promise<HarnessStatus> {
    const { cwd = process.cwd() } = opts;
    const configPath = join(cwd, '.vscode', 'mcp.json');
    const existing = await readJsonConfig(configPath);
    const servers = existing.servers as Record<string, unknown> | undefined;
    const configured = servers?.[SERVER_NAME] != null;
    return {
      configured,
      message: configured ? 'Configured in .vscode/mcp.json' : 'Not configured in .vscode/mcp.json',
    };
  }
}
