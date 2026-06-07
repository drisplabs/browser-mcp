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
import { readJsonConfig, mergeAtPath, writeJsonAtomic } from '../config-io.js';

export interface ClaudeDesktopAdapterDeps {
  homeDir?: string;
  platform?: NodeJS.Platform;
}

const SERVER_NAME = 'agent-web-interface';

const SERVER_COMMAND: ServerCommand = {
  command: 'npx',
  args: ['-y', 'agent-web-interface@latest'],
};

export function getDesktopConfigPath(platform: NodeJS.Platform, homeOrAppData: string): string {
  if (platform === 'win32') {
    return join(homeOrAppData, 'Claude', 'claude_desktop_config.json');
  }
  if (platform === 'linux') {
    return join(homeOrAppData, '.config', 'Claude', 'claude_desktop_config.json');
  }
  // macOS (darwin) and fallback
  return join(
    homeOrAppData,
    'Library',
    'Application Support',
    'Claude',
    'claude_desktop_config.json'
  );
}

export class ClaudeDesktopAdapter implements HarnessAdapter {
  readonly id = 'claude-desktop';
  readonly label = 'Claude Desktop';
  readonly supportsSkill = false;
  readonly scopes = ['global'] as const;
  readonly serverCommand = SERVER_COMMAND;

  private readonly homeDir: string;
  private readonly platform: NodeJS.Platform;

  constructor(deps?: ClaudeDesktopAdapterDeps) {
    this.platform = deps?.platform ?? process.platform;
    this.homeDir =
      deps?.homeDir ?? (this.platform === 'win32' ? (process.env.APPDATA ?? homedir()) : homedir());
  }

  async detect(): Promise<boolean> {
    try {
      const { access } = await import('node:fs/promises');
      const configPath = getDesktopConfigPath(this.platform, this.homeDir);
      await access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  async apply(opts: ApplyOpts): Promise<ApplyResult> {
    const { dryRun = false } = opts;

    const configPath = getDesktopConfigPath(this.platform, this.homeDir);
    const existing = await readJsonConfig(configPath);
    const { merged, changed } = mergeAtPath(existing, ['mcpServers', SERVER_NAME], {
      command: SERVER_COMMAND.command,
      args: SERVER_COMMAND.args,
    });

    if (!changed) {
      return {
        changed: false,
        dryRun,
        message: 'Already configured in claude_desktop_config.json (no changes needed)',
      };
    }

    const writeResult = await writeJsonAtomic(configPath, merged, { dryRun });

    return {
      changed: writeResult.changed,
      dryRun: writeResult.dryRun,
      message: dryRun
        ? 'Would write claude_desktop_config.json (--dry-run)'
        : '✓ Registered in Claude Desktop via claude_desktop_config.json\n  Note: skill placement not supported for Claude Desktop',
    };
  }

  async status(_opts: StatusOpts): Promise<HarnessStatus> {
    const configPath = getDesktopConfigPath(this.platform, this.homeDir);
    const existing = await readJsonConfig(configPath);
    const mcpServers = existing.mcpServers as Record<string, unknown> | undefined;
    const configured = mcpServers?.[SERVER_NAME] != null;
    return {
      configured,
      message: configured
        ? 'Configured in claude_desktop_config.json'
        : 'Not configured in claude_desktop_config.json',
    };
  }
}
