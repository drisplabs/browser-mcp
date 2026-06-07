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
import { readJsonConfig, mergeAtPath, writeJsonAtomic } from '../config-io.js';

export type CommandRunner = (cmd: string, args: string[]) => Promise<number>;

export interface ClaudeCodeAdapterDeps {
  runner?: CommandRunner;
}

const SERVER_NAME = 'agent-web-interface';

const SERVER_COMMAND: ServerCommand = {
  command: 'npx',
  args: ['-y', 'agent-web-interface@latest'],
};

const CLAUDE_MCP_ADD_ARGS = [
  'mcp',
  'add',
  SERVER_NAME,
  SERVER_COMMAND.command,
  ...SERVER_COMMAND.args,
];

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

  constructor(deps?: ClaudeCodeAdapterDeps) {
    this.run = deps?.runner ?? makeDefaultRunner();
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
    const { dryRun = false, cwd = process.cwd() } = opts;

    // Try claude mcp add first
    let claudeAbsent = false;
    try {
      const exitCode = await this.run('claude', CLAUDE_MCP_ADD_ARGS);
      if (exitCode !== 0) {
        throw new Error(`claude mcp add exited with code ${exitCode}`);
      }
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
      command: SERVER_COMMAND.command,
      args: SERVER_COMMAND.args,
    });

    if (!changed) {
      return {
        changed: false,
        dryRun,
        message: 'Already configured in .mcp.json (no changes needed)',
      };
    }

    const result = await writeJsonAtomic(mcpJsonPath, merged, { dryRun });
    return {
      changed: result.changed,
      dryRun: result.dryRun,
      message: dryRun
        ? 'Would write .mcp.json (--dry-run)'
        : '✓ Registered in Claude Code via .mcp.json',
    };
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
