import { spawn } from 'node:child_process';
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
import { resolveSkill } from '../skill-source.js';

export type CommandRunner = (cmd: string, args: string[]) => Promise<number>;
export type SkillResolver = () => Promise<{ rawContent: string }>;

export interface ClaudeCodeAdapterDeps {
  runner?: CommandRunner;
  skillResolver?: SkillResolver;
}

const SERVER_NAME = 'agent-web-interface';

const SERVER_COMMAND: ServerCommand = {
  command: 'npx',
  args: ['-y', 'agent-web-interface@latest'],
};

function makeDefaultRunner(): CommandRunner {
  return (cmd, args) =>
    new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: 'inherit' });
      child.on('close', (code) => resolve(code ?? 0));
      child.on('error', reject);
    });
}

function isNotFound(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException;
  return e.code === 'ENOENT' || /ENOENT|not found|command not found/i.test(e.message ?? '');
}

export class ClaudeCodeAdapter implements HarnessAdapter {
  readonly id = 'claude-code';
  readonly label = 'Claude Code';
  readonly supportsSkill = true;
  readonly scopes = ['project', 'user'] as const;
  readonly serverCommand = SERVER_COMMAND;

  private readonly run: CommandRunner;
  private readonly resolveSkillFn: SkillResolver;

  constructor(deps?: ClaudeCodeAdapterDeps) {
    this.run = deps?.runner ?? makeDefaultRunner();
    this.resolveSkillFn = deps?.skillResolver ?? (() => resolveSkill());
  }

  async detect(): Promise<boolean> {
    try {
      const exitCode = await this.run('claude', ['--version']);
      return exitCode === 0;
    } catch {
      return false;
    }
  }

  async apply(opts: ApplyOpts): Promise<ApplyResult> {
    const { dryRun = false, cwd = process.cwd(), resolvedCommand = SERVER_COMMAND } = opts;

    const mcpAddArgs = [
      'mcp',
      'add',
      SERVER_NAME,
      resolvedCommand.command,
      ...resolvedCommand.args,
    ];

    // Try claude mcp add first
    let claudeAbsent = false;
    try {
      const exitCode = await this.run('claude', mcpAddArgs);
      if (exitCode !== 0) {
        throw new Error(`claude mcp add exited with code ${exitCode}`);
      }
      await this.placeSkill(cwd, dryRun);
      return {
        changed: true,
        dryRun: false,
        message: '✓ Registered in Claude Code via `claude mcp add`',
      };
    } catch (err) {
      if (!isNotFound(err)) throw err;
      claudeAbsent = true;
    }

    if (!claudeAbsent) {
      // unreachable — satisfies type narrowing
      throw new Error('unexpected state');
    }

    // Fallback: write .mcp.json
    const mcpJsonPath = join(cwd, '.mcp.json');
    const existing = await readJsonConfig(mcpJsonPath);
    const { merged, changed } = mergeAtPath(existing, ['mcpServers', SERVER_NAME], {
      command: resolvedCommand.command,
      args: resolvedCommand.args,
    });

    if (!changed) {
      return {
        changed: false,
        dryRun,
        message: 'Already configured in .mcp.json (no changes needed)',
      };
    }

    const result = await writeJsonAtomic(mcpJsonPath, merged, { dryRun });
    await this.placeSkill(cwd, dryRun);
    return {
      changed: result.changed,
      dryRun: result.dryRun,
      message: dryRun
        ? 'Would write .mcp.json (--dry-run)'
        : '✓ Registered in Claude Code via .mcp.json',
    };
  }

  private async placeSkill(cwd: string, dryRun: boolean): Promise<void> {
    try {
      const skill = await this.resolveSkillFn();
      const skillPath = join(cwd, '.claude', 'skills', SERVER_NAME, 'SKILL.md');
      await writeFileAtomic(skillPath, skill.rawContent, { dryRun });
    } catch {
      // Skill placement is best-effort; never fails install
    }
  }

  async status(opts: StatusOpts): Promise<HarnessStatus> {
    const { cwd = process.cwd() } = opts;
    const mcpJsonPath = join(cwd, '.mcp.json');
    const existing = await readJsonConfig(mcpJsonPath);
    const mcpServers = existing.mcpServers as Record<string, unknown> | undefined;
    const configured = mcpServers?.[SERVER_NAME] != null;
    return {
      configured,
      message: configured ? 'Configured in .mcp.json' : 'Not configured',
    };
  }
}
